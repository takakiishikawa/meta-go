/**
 * 各goリポジトリを技術スタック方針書v2.0に準拠させる
 *
 * 環境変数:
 *   TARGET_REPO    — 対象リポジトリ名 (matrix で注入)
 *   TARGET_REPOS   — "all" または カンマ区切り (例: "native-go,care-go")
 *   TARGET_FIXES   — "all" または カンマ区切り (recharts-dynamic, vercel-analytics, remove-unused, layer2-missing, remove-openai)
 *   DRY_RUN        — "true" の場合、PR を作成せずログのみ
 *   AUTO_MERGE     — "true" の場合、PR に auto-merge を設定
 *
 * 認証: CLAUDE_CODE_OAUTH_TOKEN (Max プラン内、Anthropic API 課金なし)
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  createBranchAndCommit,
  createPR,
  cleanup,
} from "../../lib/github/git-operations";

const TARGET_REPO = process.env.TARGET_REPO!;
const TARGET_REPOS = process.env.TARGET_REPOS || "all";
const TARGET_FIXES = process.env.TARGET_FIXES || "all";
const DRY_RUN = process.env.DRY_RUN === "true";
const AUTO_MERGE = process.env.AUTO_MERGE === "true";
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
  const staticImportFiles = detectRechartsFiles(repoDir);
  if (staticImportFiles.length === 0) return { changed: false, files: [] };

  const relFiles = staticImportFiles.map((f) => path.relative(repoDir, f));
  console.log(`  🔍 recharts static import 発見: ${relFiles.join(", ")}`);

  if (DRY_RUN) {
    console.log(
      `  [DRY RUN] recharts dynamic import 変換予定: ${relFiles.join(", ")}`,
    );
    return { changed: true, files: relFiles };
  }

  const prompt = `以下のファイルの recharts の static import を next/dynamic を使った dynamic import に変換してください。

対象ファイル:
${relFiles.map((f) => `- ${f}`).join("\n")}

変換ルール:
1. \`import { ComponentA, ComponentB } from "recharts"\` のような static import 行を削除
2. 各コンポーネントを個別の dynamic import に変換:
   \`\`\`tsx
   import dynamic from 'next/dynamic'
   const LineChart = dynamic(
     () => import("recharts").then(m => ({ default: m.LineChart })),
     { ssr: false, loading: () => <div className="animate-pulse h-40 bg-muted rounded" /> }
   )
   \`\`\`
3. XAxis / YAxis / CartesianGrid / Tooltip / Legend / ResponsiveContainer 等のヘルパーは loading 不要:
   \`\`\`tsx
   const XAxis = dynamic(() => import("recharts").then(m => ({ default: m.XAxis })), { ssr: false })
   \`\`\`
4. ファイルの先頭に 'use client' がなければ追加（recharts は CSR 専用）
5. TypeScript の型エラーが出ないようにする
6. ファイルの他の部分は変更しない

各ファイルをすべて変換してください。`;

  const ok = runClaude(repoDir, prompt);
  if (!ok) return { changed: false, files: [] };

  // 変換後に static import が残っていないか確認
  const stillStatic = detectRechartsFiles(repoDir);
  const converted = relFiles.filter(
    (f) => !stillStatic.map((s) => path.relative(repoDir, s)).includes(f),
  );
  return { changed: converted.length > 0, files: converted };
}

// ── Fix 2: @vercel/analytics 導入 ─────────────────────────────

async function addVercelAnalytics(repoDir: string): Promise<boolean> {
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
  const pkgPath = path.join(repoDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = readJson(pkgPath);
  const hasDep =
    pkg.dependencies?.["recharts"] || pkg.devDependencies?.["recharts"];
  if (!hasDep) {
    console.log(`  ⏭  recharts: package.json に存在しない`);
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

// ── Fix 5: openai 削除 ────────────────────────────────────────

async function removeOpenAI(repoDir: string): Promise<boolean> {
  const pkgPath = path.join(repoDir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;

  const pkg = readJson(pkgPath);
  const hasOpenAI =
    pkg.dependencies?.["openai"] || pkg.devDependencies?.["openai"];
  if (!hasOpenAI) {
    console.log(`  ⏭  openai: package.json に存在しない`);
    return false;
  }

  console.log(`  🔧 openai を削除`);
  if (pkg.dependencies?.["openai"]) delete pkg.dependencies["openai"];
  if (pkg.devDependencies?.["openai"]) delete pkg.devDependencies["openai"];
  writeJson(pkgPath, pkg);

  // openai を使っているファイルを @anthropic-ai/sdk に書き換え
  const tsFiles = findFiles(repoDir, [".tsx", ".ts"]);
  const openaiFiles = tsFiles.filter((f) =>
    hasImport(fs.readFileSync(f, "utf-8"), "openai"),
  );

  if (openaiFiles.length === 0) return true;

  const relFiles = openaiFiles.map((f) => path.relative(repoDir, f));
  console.log(`  🔧 openai → @anthropic-ai/sdk: ${relFiles.join(", ")}`);

  if (DRY_RUN) {
    console.log(
      `  [DRY RUN] openai コード書き換え予定: ${relFiles.join(", ")}`,
    );
    return true;
  }

  const prompt = `以下のファイルの openai SDK の使用を @anthropic-ai/sdk に書き換えてください。

対象ファイル:
${relFiles.map((f) => `- ${f}`).join("\n")}

変換ルール:
1. \`import OpenAI from 'openai'\` → \`import Anthropic from '@anthropic-ai/sdk'\`
2. \`new OpenAI({ apiKey: ... })\` → \`new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })\`
3. \`openai.chat.completions.create(...)\` → \`anthropic.messages.create(...)\`
4. モデル名は claude-sonnet-4-6 を使用
5. messages 構造を Anthropic のフォーマット（role/content の配列）に変換
6. 書き換えが困難な箇所は \`// TODO: openai → anthropic 移行が必要\` コメントを残して import のみ削除

各ファイルをすべて変換してください。`;

  runClaude(repoDir, prompt);
  return true;
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

// ── GitHub: auto-merge 有効化 ─────────────────────────────────

async function enableAutoMerge(prNodeId: string) {
  const query = `
    mutation($id: ID!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) {
        pullRequest { id }
      }
    }
  `;
  const GH_PAT = process.env.GH_PAT || process.env.GITHUB_TOKEN!;
  await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: prNodeId } }),
  });
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
  console.log(
    `   fixes: ${TARGET_FIXES} | dry_run: ${DRY_RUN} | auto_merge: ${AUTO_MERGE}`,
  );

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

    // Fix 5: openai 削除 (TypeScript + Claude CLI for code rewrite)
    if (shouldFix("remove-openai")) {
      const changed = await removeOpenAI(tmpDir);
      if (changed) {
        appliedFixes.push("✅ openai 削除");
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

    const branch = "metago/tech-stack-compliance-v2";
    const committed = createBranchAndCommit(
      tmpDir,
      branch,
      `chore: Tech stack compliance to v2.0 policy (MetaGo自動修正)`,
    );

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
      ["remove-openai", "openai 削除"],
    ]
      .map(([, label]) => {
        const done = appliedFixes.some((f) => f.includes(label.split(" ")[0]));
        return `- [${done ? "x" : " "}] ${label}`;
      })
      .join("\n");

    let pr: { url: string; number: number; nodeId: string };
    try {
      pr = await createPR(TARGET_REPO, {
        title: "chore: Tech stack compliance to v2.0 policy",
        body: `## MetaGoが自動生成した技術スタック刷新PRです。

## 実施した修正
${fixesChecklist}

## 詳細
${appliedFixes.map((f) => `- ${f}`).join("\n")}

## 参考
- 方針書: https://github.com/${GITHUB_OWNER}/meta-go/blob/main/docs/tech-stack-policy-v2.md
- 実行workflow: ${runUrl}

---
*このPRはMetaGoが自動作成しました*`,
        head: branch,
        labels: ["tech-stack-compliance", "metago-auto"],
      });
      console.log(`  📋 PR作成: ${pr.url}`);
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

    if (AUTO_MERGE) {
      await enableAutoMerge(pr.nodeId);
      console.log(`  ✓ auto-merge 有効化`);
    }
  } finally {
    if (tmpDir) cleanup(tmpDir);
  }
}

run().catch((err) => {
  console.error(`❌ ${TARGET_REPO}:`, err.message || err);
  process.exit(1);
});
