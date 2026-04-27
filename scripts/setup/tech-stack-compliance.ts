/**
 * 各goリポジトリを技術スタック方針書v2.0に準拠させる
 *
 * 環境変数:
 *   TARGET_REPO    — 対象リポジトリ名 (matrix で注入)
 *   TARGET_REPOS   — "all" または カンマ区切り (例: "native-go,care-go")
 *   TARGET_FIXES   — "all" または カンマ区切り
 *                    Phase 1: recharts-dynamic, vercel-analytics, remove-unused, layer2-missing
 *                    Phase 2a: layer1-violations
 *
 *  ※ openai は許可（Whisper STT 用途）。テキスト生成は @anthropic-ai/sdk を使用する
 *   DRY_RUN        — "true" の場合、PR を作成せずログのみ
 *
 * PR は L1 として createAndMergePR で即マージされる。
 *
 * 認証: CLAUDE_CODE_OAUTH_TOKEN (Max プラン内、Anthropic API 課金なし)
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
  PullRequest,
} from "../../lib/github/git-operations";

const TARGET_REPO = process.env.TARGET_REPO!;
const TARGET_REPOS = process.env.TARGET_REPOS || "all";
const TARGET_FIXES = process.env.TARGET_FIXES || "all";
const DRY_RUN = process.env.DRY_RUN === "true";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa";
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID || "";

// ── ユーティリティ ────────────────────────────────────────────

function shouldProcess(repo: string): boolean {
  if (TARGET_REPOS === "all") return true;
  return TARGET_REPOS.split(",")
    .map((r) => r.trim())
    .includes(repo);
}

function shouldFix(fix: string): boolean {
  if (TARGET_FIXES === "all") return true;
  return TARGET_FIXES.split(",")
    .map((f) => f.trim())
    .includes(fix);
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath: string, data: any) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function findFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  const walk = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      if (["node_modules", ".git", ".next", "dist", "out"].includes(e.name))
        continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (exts.some((ext) => e.name.endsWith(ext))) results.push(full);
    }
  };
  walk(dir);
  return results;
}

function hasImport(content: string, pkg: string): boolean {
  const escaped = pkg.replace(/\//g, "\\/").replace(/@/g, "\\@");
  return (
    new RegExp(`from\\s+['"]${escaped}['"]`).test(content) ||
    new RegExp(`require\\s*\\(\\s*['"]${escaped}['"]`).test(content)
  );
}

// ── Claude CLI 呼び出し ────────────────────────────────────────

function runClaude(repoDir: string, prompt: string): boolean {
  console.log(`  🤖 Claude CLI を実行中...`);
  const result = spawnSync(
    "claude",
    ["--dangerously-skip-permissions", "-p", prompt],
    {
      cwd: repoDir,
      env: { ...process.env },
      stdio: "inherit",
      timeout: 180_000,
    },
  );
  if (result.status !== 0) {
    console.warn(`  ⚠️  Claude CLI 終了コード: ${result.status}`);
    return false;
  }
  return true;
}

// ── Fix 1: recharts dynamic import化 ──────────────────────────

function detectRechartsFiles(repoDir: string): string[] {
  const tsFiles = findFiles(repoDir, [".tsx", ".ts"]);
  return tsFiles.filter((f) => {
    const content = fs.readFileSync(f, "utf-8");
    if (!hasImport(content, "recharts")) return false;
    // 既にdynamic import済みか確認
    const lines = content.split("\n");
    return lines.some((l) =>
      /^import\s+\{[^}]+\}\s+from\s+['"]recharts['"]/.test(l),
    );
  });
}

async function fixRechartsImports(
  repoDir: string,
): Promise<{ changed: boolean; files: string[] }> {
  // go-design-system はフレームワーク非依存。next/dynamic も "use client" も持ち込まない。
  if (TARGET_REPO === "go-design-system") {
    console.log(`  ⏭  go-design-system: recharts 修正対象外`);
    return { changed: false, files: [] };
  }

  const rechartsFiles = detectRechartsFiles(repoDir);
  if (rechartsFiles.length === 0) return { changed: false, files: [] };

  // 既に "use client" がある or Server Component で recharts を使っている
  // ファイルだけが対象。"use client" があれば既に正しい状態なので何もしない。
  const targets = rechartsFiles.filter((f) => {
    const content = fs.readFileSync(f, "utf-8");
    const firstLine =
      content.split("\n").find((l) => l.trim().length > 0) || "";
    return !/^["']use client["']/.test(firstLine.trim());
  });

  if (targets.length === 0) {
    console.log(`  ⏭  recharts: 全ファイルに "use client" 既設 — 変換不要`);
    return { changed: false, files: [] };
  }

  const relFiles = targets.map((f) => path.relative(repoDir, f));
  console.log(`  🔍 recharts × Server Component 発見: ${relFiles.join(", ")}`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] "use client" を付与予定: ${relFiles.join(", ")}`);
    return { changed: true, files: relFiles };
  }

  const prompt = `以下のファイルは recharts を import していますが、ファイル先頭に "use client" ディレクティブが付いていません。

対象ファイル:
${relFiles.map((f) => `- ${f}`).join("\n")}

実施ルール:
1. ファイルの **先頭行** に \`"use client"\` を追加する（既存の import より上）。
2. 既存の import や JSX、ロジックは **一切変更しない**（dynamic import 化は不要）。
3. ファイルが既に \`"use client"\` で始まっていたら何もしない。

**重要**: \`next/dynamic\` を使った dynamic import への変換は行わないでください。
\`"use client"\` 付与だけで recharts の SSR 問題は解決します。\`next/dynamic\` で
ラップすると複雑性とフレームワーク依存だけが増え、ビルドの脆弱性源となります
（実例: 2026-04-24 PR #7 で go-design-system に next/dynamic が混入し、依存する
全 Go の Vercel デプロイが破綻）。

各ファイルに "use client" を追加してください。`;

  const ok = runClaude(repoDir, prompt);
  if (!ok) return { changed: false, files: [] };

  // 変換後に "use client" が無いファイルが残っていないか確認
  const stillNeedingClient = targets.filter((f) => {
    if (!fs.existsSync(f)) return false;
    const content = fs.readFileSync(f, "utf-8");
    const firstLine =
      content.split("\n").find((l) => l.trim().length > 0) || "";
    return !/^["']use client["']/.test(firstLine.trim());
  });
  const converted = relFiles.filter(
    (f) =>
      !stillNeedingClient.map((s) => path.relative(repoDir, s)).includes(f),
  );
  return { changed: converted.length > 0, files: converted };
}

// ── Fix 2: @vercel/analytics 導入 ─────────────────────────────

async function addVercelAnalytics(repoDir: string): Promise<boolean> {
  if (TARGET_REPO === "go-design-system") {
    console.log(`  ⏭  go-design-system: @vercel/analytics 対象外`);
    return false;
  }
  const pkgPath = path.join(repoDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = readJson(pkgPath);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["@vercel/analytics"]) {
    console.log(`  ⏭  @vercel/analytics: 既に追加済み`);
    return false;
  }

  console.log(`  🔧 @vercel/analytics を追加`);
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies["@vercel/analytics"] = "^1.5.0";
  writeJson(pkgPath, pkg);

  // layout.tsx に Analytics コンポーネントを追加
  const layoutPath = path.join(repoDir, "app", "layout.tsx");
  if (!fs.existsSync(layoutPath)) {
    console.log(
      `  ⚠️  app/layout.tsx が見つからないため Analytics 追加をスキップ`,
    );
    return true;
  }

  const layoutContent = fs.readFileSync(layoutPath, "utf-8");
  if (layoutContent.includes("@vercel/analytics")) {
    console.log(`  ⏭  app/layout.tsx: Analytics 既に追加済み`);
    return true;
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] app/layout.tsx に Analytics を追加予定`);
    return true;
  }

  const prompt = `app/layout.tsx に @vercel/analytics の Analytics コンポーネントを追加してください。

実施内容:
1. ファイル先頭のインポート群に \`import { Analytics } from '@vercel/analytics/react'\` を追加
2. RootLayout の return 内の </body> 直前に <Analytics /> を追加
3. 既存のコードは変更しない（追加のみ）

ファイルパス: app/layout.tsx`;

  runClaude(repoDir, prompt);
  return true;
}

// ── Fix 3: 未使用recharts削除 ─────────────────────────────────

function removeUnusedRecharts(repoDir: string): boolean {
  if (TARGET_REPO === "go-design-system") {
    console.log(`  ⏭  go-design-system: recharts 削除対象外`);
    return false;
  }
  const pkgPath = path.join(repoDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = readJson(pkgPath);
  const hasDep =
    pkg.dependencies?.["recharts"] || pkg.devDependencies?.["recharts"];
  if (!hasDep) {
    console.log(`  ⏭  recharts: package.json に存在しない`);
    return false;
  }

  // go-design-system を依存に持つプロジェクトでは削除しない。
  // DSバンドルが recharts を直 import するため、アプリコードで未使用でも
  // モジュール解決のために必要（実例: 2026-04-24 task-go / kenyaku-go で
  // recharts 削除によりビルド失敗）。
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (allDeps["@takaki/go-design-system"]) {
    console.log(
      `  ⏭  recharts: @takaki/go-design-system 依存のため保持（DSバンドルが直importするpeer要件）`,
    );
    return false;
  }

  const tsFiles = findFiles(repoDir, [".tsx", ".ts"]);
  const isUsed = tsFiles.some((f) =>
    hasImport(fs.readFileSync(f, "utf-8"), "recharts"),
  );
  if (isUsed) {
    console.log(`  ⏭  recharts: コードで使用されているため削除しない`);
    return false;
  }

  console.log(`  🔧 recharts を削除（未使用）`);
  if (pkg.dependencies?.["recharts"]) delete pkg.dependencies["recharts"];
  if (pkg.devDependencies?.["recharts"]) delete pkg.devDependencies["recharts"];
  writeJson(pkgPath, pkg);
  return true;
}

// ── Fix 4: Layer 2 欠損補充 ───────────────────────────────────

const LAYER2_PACKAGES: Record<string, string> = {
  zod: "^3.24.0",
  "date-fns": "^4.1.0",
  "react-hook-form": "^7.54.2",
  "@hookform/resolvers": "^3.9.1",
};

function addLayer2Missing(repoDir: string): {
  changed: boolean;
  added: string[];
} {
  if (TARGET_REPO === "go-design-system") {
    console.log(
      `  ⏭  go-design-system: Layer 2 補充対象外（peerDeps として既に列挙済み）`,
    );
    return { changed: false, added: [] };
  }
  const pkgPath = path.join(repoDir, "package.json");
  if (!fs.existsSync(pkgPath)) return { changed: false, added: [] };

  const pkg = readJson(pkgPath);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const added: string[] = [];

  for (const [name, version] of Object.entries(LAYER2_PACKAGES)) {
    if (!deps[name]) {
      console.log(`  🔧 Layer 2 追加: ${name}@${version}`);
      pkg.dependencies = pkg.dependencies || {};
      pkg.dependencies[name] = version;
      added.push(name);
    }
  }

  if (added.length > 0) writeJson(pkgPath, pkg);
  return { changed: added.length > 0, added };
}

// ── Fix 5 (Phase 2a): Layer 1 違反解消 ───────────────────────

const LAYER1_PACKAGES_TO_REMOVE = [
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "sonner",
  "next-themes",
  "react-day-picker",
  "@radix-ui/react-label",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
  "@radix-ui/react-tabs",
];

async function fixLayer1Violations(
  repoDir: string,
): Promise<{ changed: boolean; details: string[] }> {
  // go-design-system は DS自身なので Layer 1パッケージを直接使うのが正しい
  if (TARGET_REPO === "go-design-system") {
    console.log(
      `  ⏭  go-design-system: Layer 1 パッケージはDS自身の実装のため除外`,
    );
    return { changed: false, details: [] };
  }

  const details: string[] = [];
  let changed = false;

  const pkgPath = path.join(repoDir, "package.json");
  const pkg = readJson(pkgPath);

  // A. lib/utils.ts の cn() → go-design-system re-export
  for (const relPath of ["lib/utils.ts", "src/lib/utils.ts"]) {
    const utilsPath = path.join(repoDir, relPath);
    if (!fs.existsSync(utilsPath)) continue;
    const content = fs.readFileSync(utilsPath, "utf-8");
    if (!hasImport(content, "clsx")) continue;

    const newContent = `export { cn } from "@takaki/go-design-system";\n`;
    if (!DRY_RUN) {
      fs.writeFileSync(utilsPath, newContent, "utf-8");
      console.log(`  🔧 ${relPath}: cn() を DS re-export に置き換え`);
    } else {
      console.log(
        `  [DRY RUN] ${relPath}: cn() を DS re-export に置き換え予定`,
      );
    }
    details.push(
      `\`${relPath}\` を go-design-system の cn() re-export に置き換え`,
    );
    changed = true;
  }

  // B. toast/Toaster import: sonner → @takaki/go-design-system
  const allTsFiles = findFiles(repoDir, [".tsx", ".ts"]);
  const sonnerFiles = allTsFiles.filter((f) =>
    hasImport(fs.readFileSync(f, "utf-8"), "sonner"),
  );

  if (sonnerFiles.length > 0) {
    const relFiles = sonnerFiles.map((f) => path.relative(repoDir, f));
    console.log(`  🔍 sonner 直接 import 発見: ${relFiles.join(", ")}`);
    details.push(
      `toast/Toaster import を sonner → @takaki/go-design-system に変更 (${relFiles.length}ファイル)`,
    );
    changed = true;

    if (!DRY_RUN) {
      const prompt = `以下のファイルで sonner パッケージからの import を @takaki/go-design-system に書き換えてください。

対象ファイル:
${relFiles.map((f) => `- ${f}`).join("\n")}

変換ルール:
- \`import { toast } from "sonner"\` → \`import { toast } from "@takaki/go-design-system"\`
- \`import { Toaster } from "sonner"\` → \`import { Toaster } from "@takaki/go-design-system"\`
- \`import { toast, Toaster } from "sonner"\` → \`import { toast, Toaster } from "@takaki/go-design-system"\`
- import 元の文字列だけを変更する（他のコードは一切変更しない）
- TypeScript エラーが出ないことを確認する`;

      runClaude(repoDir, prompt);
    }
  }

  // C. Layer 1 パッケージを package.json から削除（コードで使用されていないもの）
  const removedPkgs: string[] = [];
  for (const l1pkg of LAYER1_PACKAGES_TO_REMOVE) {
    const inDeps = pkg.dependencies?.[l1pkg] || pkg.devDependencies?.[l1pkg];
    if (!inDeps) continue;

    // Claude 実行後にファイルを再スキャン
    const stillUsed = findFiles(repoDir, [".tsx", ".ts"]).some((f) =>
      hasImport(fs.readFileSync(f, "utf-8"), l1pkg),
    );

    if (!stillUsed) {
      if (!DRY_RUN) {
        if (pkg.dependencies?.[l1pkg]) delete pkg.dependencies[l1pkg];
        if (pkg.devDependencies?.[l1pkg]) delete pkg.devDependencies[l1pkg];
      }
      removedPkgs.push(l1pkg);
      changed = true;
    } else {
      console.log(`  ⚠️  ${l1pkg}: コードで使用中のため削除せず残す`);
    }
  }

  if (removedPkgs.length > 0) {
    if (!DRY_RUN) writeJson(pkgPath, pkg);
    details.push(`Layer 1パッケージ削除: ${removedPkgs.join(", ")}`);
    console.log(`  🔧 package.json から削除: ${removedPkgs.join(", ")}`);
  }

  if (details.length === 0) {
    console.log(`  ⏭  Layer 1違反なし`);
  }

  return { changed, details };
}

// ── package-lock.json 更新 ────────────────────────────────────

function updatePackageLock(repoDir: string) {
  try {
    console.log(`  📦 package-lock.json を更新中...`);
    execSync("npm install --package-lock-only --ignore-scripts", {
      cwd: repoDir,
      stdio: "pipe",
      timeout: 120_000,
    });
    console.log(`  ✓ package-lock.json 更新完了`);
  } catch (e: any) {
    console.warn(
      `  ⚠️  package-lock.json 更新失敗:`,
      e?.message?.slice(0, 200),
    );
  }
}

// ── GitHub: 既存PR取得 ────────────────────────────────────────

async function findExistingPR(
  repo: string,
  branch: string,
): Promise<{ url: string; number: number; nodeId: string } | null> {
  const GH_PAT = process.env.GH_PAT || process.env.GITHUB_TOKEN!;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/pulls?head=${GITHUB_OWNER}:${branch}&state=open`,
    {
      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!res.ok) return null;
  const prs = await res.json();
  if (!Array.isArray(prs) || prs.length === 0) return null;
  const pr = prs[0];
  return { url: pr.html_url, number: pr.number, nodeId: pr.node_id };
}

// ── メイン ───────────────────────────────────────────────────

async function run() {
  if (!TARGET_REPO) {
    console.error("❌ TARGET_REPO is not set");
    process.exit(1);
  }

  if (!shouldProcess(TARGET_REPO)) {
    console.log(
      `⏭  ${TARGET_REPO}: TARGET_REPOS="${TARGET_REPOS}" に含まれないためスキップ`,
    );
    return;
  }

  console.log(`\n🔍 ${TARGET_REPO}: tech-stack compliance チェック開始`);
  console.log(`   fixes: ${TARGET_FIXES} | dry_run: ${DRY_RUN}`);

  let tmpDir: string | null = null;
  try {
    tmpDir = cloneRepo(TARGET_REPO);
    console.log(`  ✓ Cloned ${TARGET_REPO}`);

    const pkgPath = path.join(tmpDir, "package.json");
    if (!fs.existsSync(pkgPath)) {
      console.log(`  ⏭  package.json が見つからないためスキップ`);
      return;
    }

    const appliedFixes: string[] = [];
    let packageJsonChanged = false;

    // Fix 1: recharts dynamic import (Claude CLI)
    if (shouldFix("recharts-dynamic")) {
      const result = await fixRechartsImports(tmpDir);
      if (result.changed)
        appliedFixes.push(
          `✅ rechartsのdynamic import化 (${result.files.join(", ")})`,
        );
    }

    // Fix 2: @vercel/analytics (package.json + Claude CLI for layout.tsx)
    if (shouldFix("vercel-analytics")) {
      const changed = await addVercelAnalytics(tmpDir);
      if (changed) {
        appliedFixes.push("✅ @vercel/analytics 導入");
        packageJsonChanged = true;
      }
    }

    // Fix 3: 未使用recharts削除 (TypeScript)
    if (shouldFix("remove-unused")) {
      const changed = removeUnusedRecharts(tmpDir);
      if (changed) {
        appliedFixes.push("✅ 未使用recharts削除");
        packageJsonChanged = true;
      }
    }

    // Fix 4: Layer 2 欠損補充 (TypeScript)
    if (shouldFix("layer2-missing")) {
      const result = addLayer2Missing(tmpDir);
      if (result.changed) {
        appliedFixes.push(`✅ Layer 2 欠損補充: ${result.added.join(", ")}`);
        packageJsonChanged = true;
      }
    }

    // Fix 5 (Phase 2a): Layer 1 違反解消 (TypeScript + Claude CLI)
    if (shouldFix("layer1-violations")) {
      const result = await fixLayer1Violations(tmpDir);
      if (result.changed) {
        result.details.forEach((d) => appliedFixes.push(`✅ ${d}`));
        packageJsonChanged = true;
      }
    }

    if (appliedFixes.length === 0) {
      console.log(`  ℹ️  ${TARGET_REPO}: 修正対象なし — PRは作成しません`);
      return;
    }

    console.log(`\n  📋 適用した修正:`);
    appliedFixes.forEach((f) => console.log(`     ${f}`));

    if (DRY_RUN) {
      console.log(
        `\n  [DRY RUN] 以上の変更を適用予定。コミット・PR作成はしません。`,
      );
      return;
    }

    // package-lock.json 更新
    if (packageJsonChanged) updatePackageLock(tmpDir);

    const isLayer1Only =
      shouldFix("layer1-violations") &&
      !shouldFix("recharts-dynamic") &&
      !shouldFix("vercel-analytics") &&
      !shouldFix("remove-unused") &&
      !shouldFix("layer2-missing") &&
      TARGET_FIXES !== "all";

    const branch = isLayer1Only
      ? "metago/layer1-violations"
      : "metago/tech-stack-compliance-v2";

    const commitMsg = isLayer1Only
      ? `refactor: Eliminate Layer 1 direct imports (Phase 2a MetaGo)`
      : `chore: Tech stack compliance to v2.0 policy (MetaGo自動修正)`;

    const committed = createBranchAndCommit(tmpDir, branch, commitMsg);

    if (!committed) {
      console.log(`  ℹ️  変更なし（git diff が空）— PRは作成しません`);
      return;
    }

    const runUrl = GITHUB_RUN_ID
      ? `https://github.com/${GITHUB_OWNER}/meta-go/actions/runs/${GITHUB_RUN_ID}`
      : `https://github.com/${GITHUB_OWNER}/meta-go/actions`;

    const fixesChecklist = [
      ["recharts-dynamic", "rechartsのdynamic import化"],
      ["vercel-analytics", "@vercel/analytics 導入"],
      ["remove-unused", "未使用依存削除"],
      ["layer2-missing", "Layer 2 欠損補充"],
      ["layer1-violations", "Layer 1直接importの解消"],
    ]
      .map(([, label]) => {
        const done = appliedFixes.some((f) => f.includes(label.split(" ")[0]));
        return `- [${done ? "x" : " "}] ${label}`;
      })
      .join("\n");

    const prTitle = isLayer1Only
      ? "refactor: Phase 2a — Eliminate Layer 1 direct imports"
      : "chore: Tech stack compliance to v2.0 policy";

    let pr: PullRequest;
    try {
      pr = await createAndMergePR(TARGET_REPO, {
        title: prTitle,
        body: `## MetaGoが自動生成した技術スタック刷新PRです。

## 実施した修正
${fixesChecklist}

## 詳細
${appliedFixes.map((f) => `- ${f}`).join("\n")}

## 参考
- 方針書: https://github.com/${GITHUB_OWNER}/meta-go/blob/main/docs/tech-stack-policy-v2.md
- 実行workflow: ${runUrl}

---
*このPRはMetaGoが自動作成しました（L1: auto-merge）*`,
        head: branch,
        labels: ["tech-stack-compliance", "metago-auto-merge"],
      });
      console.log(`  ✓ PR作成 & マージ: ${pr.url}`);
    } catch (e: any) {
      if (e?.message?.includes("already exists")) {
        const existing = await findExistingPR(TARGET_REPO, branch);
        if (existing) {
          pr = existing;
          console.log(`  📋 既存PR使用: ${pr.url}`);
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }
  } finally {
    if (tmpDir) cleanup(tmpDir);
  }
}

run().catch((err) => {
  console.error(`❌ ${TARGET_REPO}:`, err.message || err);
  process.exit(1);
});
