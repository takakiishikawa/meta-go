/**
 * 週次: 各goの依存パッケージを精査し、自動更新PRを作成する
 *
 * - patch/minor: L1 自動マージ（バージョン更新のみ）
 * - major:       L1 自動マージ（バージョン更新 + Claude による破壊的変更修正）
 *
 * L2 は技術スタック自体の変更（FW移行・DB移行等）など人間の判断が必要な場合のみ。
 * major 依存更新はコードも一緒に修正して自動マージする。
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  GITHUB_OWNER,
  GITHUB_TOKEN,
  REPO_TO_SLUG,
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GO_REPOS: Record<string, string> = {
  nativego:     "native-go",
  carego:       "care-go",
  kenyakugo:    "kenyaku-go",
  cookgo:       "cook-go",
  physicalgo:   "physical-go",
  taskgo:       "task-go",
  designsystem: "go-design-system",
  metago:       "meta-go",
};

interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  updateType: "patch" | "minor" | "major";
}

// ── 依存バージョン調査 ───────────────────────────────────────

async function getOutdated(repoDir: string): Promise<OutdatedPackage[]> {
  let raw = "";
  try {
    raw = execSync("npm outdated --json", { cwd: repoDir, stdio: "pipe" }).toString();
  } catch (e: any) {
    raw = e.stdout?.toString() ?? "{}";
  }

  const data: Record<string, any> = JSON.parse(raw || "{}");
  const results: OutdatedPackage[] = [];

  for (const [name, info] of Object.entries(data)) {
    if (!info.current || !info.latest) continue;

    const cur = info.current.replace(/[^0-9.]/g, "").split(".").map(Number);
    const lat = info.latest.replace(/[^0-9.]/g, "").split(".").map(Number);

    let updateType: "patch" | "minor" | "major";
    if (lat[0] > cur[0])      updateType = "major";
    else if (lat[1] > cur[1]) updateType = "minor";
    else                      updateType = "patch";

    results.push({ name, current: info.current, wanted: info.wanted ?? info.current, latest: info.latest, updateType });
  }

  return results;
}

// ── Claude による破壊的変更修正 ──────────────────────────────

interface FixReport {
  filesFixed: string[];
  remainingErrors: number;
}

async function fixBreakingChanges(
  repoDir: string,
  majorUpdates: OutdatedPackage[],
  anthropic: Anthropic,
): Promise<FixReport> {
  const report: FixReport = { filesFixed: [], remainingErrors: 0 };
  const majorContext = majorUpdates
    .map((p) => `${p.name} ${p.current} → ${p.latest}`)
    .join(", ");

  // TypeScript エラーを収集（2ラウンド: 修正前 → 修正後の確認）
  for (let round = 1; round <= 2; round++) {
    let tscOutput = "";
    try {
      execSync("npx tsc --noEmit", { cwd: repoDir, stdio: "pipe", timeout: 120_000 });
      console.log(`  TSC (round ${round}): エラーなし`);
      return report;
    } catch (e: any) {
      tscOutput = e.stdout?.toString() ?? "";
    }

    if (!tscOutput.trim()) break;

    // エラーをファイル別にグループ化
    const errorsByFile: Record<string, string[]> = {};
    for (const line of tscOutput.split("\n")) {
      const match = line.match(/^(.+?)\((\d+),\d+\): error TS\d+: (.+)$/);
      if (!match) continue;
      const [, rawPath, , message] = match;
      const relPath = rawPath.trim();
      // node_modules / .next は除外
      if (relPath.includes("node_modules") || relPath.includes(".next")) continue;
      if (!errorsByFile[relPath]) errorsByFile[relPath] = [];
      errorsByFile[relPath].push(message);
    }

    const fileCount = Object.keys(errorsByFile).length;
    const totalErrors = Object.values(errorsByFile).flat().length;
    console.log(`  TSC (round ${round}): ${totalErrors}件のエラー (${fileCount}ファイル)`);

    if (fileCount === 0) break;

    // ファイルごとに Claude で修正
    for (const [relPath, errors] of Object.entries(errorsByFile)) {
      // 絶対パス解決（TSCは実行時のcwdからの相対パスを返す）
      const candidates = [
        path.join(repoDir, relPath),
        path.resolve(relPath),
      ];
      const fullPath = candidates.find((p) => fs.existsSync(p));
      if (!fullPath) {
        console.warn(`  ファイル未発見: ${relPath}`);
        continue;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.length > 80_000) {
        console.warn(`  スキップ(大きすぎ): ${relPath}`);
        continue;
      }

      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`  🤖 修正中: ${relPath} (${errors.length}件のエラー)`);
          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 8096,
            messages: [
              {
                role: "user",
                content: `You are fixing TypeScript breaking changes caused by major dependency updates.

**Updated packages:** ${majorContext}

**File:** ${relPath}

**TypeScript errors to fix:**
${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

**Current file content:**
\`\`\`tsx
${content}
\`\`\`

Fix all TypeScript errors by updating the code to match the new API of the updated packages.
- Preserve all existing functionality and logic
- Only change what is necessary to fix the TypeScript errors
- Return ONLY the complete fixed file content with no explanation, no markdown code fences, no prefix text.`,
              },
            ],
          });

          const fixed = message.content[0];
          if (fixed.type !== "text") break;

          const fixedContent = fixed.text
            .replace(/^```[^\n]*\n/, "")
            .replace(/\n```$/, "")
            .trim();

          fs.writeFileSync(fullPath, fixedContent, "utf-8");
          report.filesFixed.push(relPath);
          console.log(`  ✓ 修正完了: ${relPath}`);
          break;
        } catch (e: any) {
          const isRateLimit = e?.status === 429 || e?.error?.error?.type === "rate_limit_error";
          if (isRateLimit && attempt < MAX_RETRIES) {
            const wait = 60_000 * attempt;
            console.warn(`  レート制限 (${attempt}/${MAX_RETRIES}回目)、${wait / 1000}秒待機...`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          console.warn(`  修正失敗: ${relPath}`, String(e).slice(0, 200));
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    if (round === 2) {
      // 2ラウンド後も残っているエラー数をカウント
      try {
        execSync("npx tsc --noEmit", { cwd: repoDir, stdio: "pipe", timeout: 120_000 });
      } catch (e: any) {
        const remaining = (e.stdout?.toString() ?? "").split("\n")
          .filter((l: string) => l.includes(": error TS")).length;
        report.remainingErrors = remaining;
        if (remaining > 0) {
          console.warn(`  ⚠️ ${remaining}件のTSエラーが残っています（PRに記載）`);
        }
      }
    }
  }

  return report;
}

// ── メイン処理 ───────────────────────────────────────────────

async function processRepo(product: any, repo: string) {
  console.log(`\n📦 Dependency check: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    repoDir = cloneRepo(repo);

    try {
      execSync("npm ci --prefer-offline", { cwd: repoDir, stdio: "pipe" });
    } catch {
      execSync("npm install --legacy-peer-deps", { cwd: repoDir, stdio: "pipe" });
    }

    const outdated = await getOutdated(repoDir);

    // DB に全件記録
    for (const pkg of outdated) {
      await supabase.schema("metago").from("dependency_items").upsert(
        {
          product_id:      product.id,
          package_name:    pkg.name,
          current_version: pkg.current,
          latest_version:  pkg.latest,
          update_type:     pkg.updateType,
          state:           "new",
        },
        { onConflict: "product_id,package_name", ignoreDuplicates: false },
      );
    }

    const patchMinor   = outdated.filter((p) => p.updateType === "patch" || p.updateType === "minor");
    const majorUpdates = outdated.filter((p) => p.updateType === "major");

    // ── L1: patch/minor 自動更新 ──────────────────────────
    if (patchMinor.length > 0) {
      const packages = patchMinor.map((p) => `${p.name}@${p.latest}`).join(" ");
      try {
        execSync(`npm install ${packages} --save`, { cwd: repoDir, stdio: "pipe" });
      } catch (e) {
        console.warn(`  npm install failed for patch/minor:`, e);
      }

      if (hasChanges(repoDir)) {
        const branch = `metago/deps-patch-minor-${new Date().toISOString().slice(0, 10)}`;
        const pushed = createBranchAndCommit(
          repoDir,
          branch,
          `chore(deps): patch/minor 依存更新 [L1 MetaGo]`,
        );
        if (pushed) {
          await createAndMergePR(repo, {
            title: `🤖 [MetaGo L1] patch/minor 依存更新 — ${product.display_name}`,
            body: `MetaGo による patch/minor 依存更新です。

**更新パッケージ (${patchMinor.length}件)**
${patchMinor.map((p) => `- \`${p.name}\`: ${p.current} → ${p.latest} (${p.updateType})`).join("\n")}

> L1: 自動マージ対象。コードロジックへの変更はありません。`,
            head:   branch,
            labels: ["metago-auto-merge"],
          });

          for (const pkg of patchMinor) {
            await supabase.schema("metago").from("dependency_items")
              .update({ state: "done" })
              .eq("product_id", product.id)
              .eq("package_name", pkg.name);
          }
        }
      }
    }

    // ── L1: major 自動更新（Claude による破壊的変更修正付き）──
    if (majorUpdates.length > 0) {
      let majorDir: string | null = null;
      try {
        majorDir = cloneRepo(repo);

        try {
          execSync("npm ci --prefer-offline", { cwd: majorDir, stdio: "pipe" });
        } catch {
          execSync("npm install --legacy-peer-deps", { cwd: majorDir, stdio: "pipe" });
        }

        const packages = majorUpdates.map((p) => `${p.name}@${p.latest}`).join(" ");
        console.log(`  major 更新インストール: ${packages}`);
        try {
          execSync(`npm install ${packages} --save`, { cwd: majorDir, stdio: "pipe" });
        } catch (e) {
          console.warn(`  npm install failed for major:`, e);
        }

        // Claude で破壊的変更を修正
        const fixReport = await fixBreakingChanges(majorDir, majorUpdates, anthropic);

        // ESLint + Prettier で仕上げ
        try {
          execSync(
            `npx eslint . --ext .ts,.tsx --fix --ignore-pattern '.next' --ignore-pattern 'node_modules'`,
            { cwd: majorDir, stdio: "pipe", timeout: 120_000 },
          );
        } catch {}
        try {
          execSync(`npx prettier --write "**/*.{ts,tsx,js,json,css}"`, { cwd: majorDir, stdio: "pipe", timeout: 60_000 });
        } catch {}

        if (hasChanges(majorDir)) {
          const branch = `metago/deps-major-${new Date().toISOString().slice(0, 10)}`;
          const pushed = createBranchAndCommit(
            majorDir,
            branch,
            `chore(deps): major 依存更新 + 破壊的変更修正 [L1 MetaGo]`,
          );

          if (pushed) {
            const fixedSection = fixReport.filesFixed.length > 0
              ? `\n**Claude による自動修正ファイル (${fixReport.filesFixed.length}件)**\n${fixReport.filesFixed.map((f) => `- \`${f}\``).join("\n")}`
              : "";

            const warningSection = fixReport.remainingErrors > 0
              ? `\n\n> ⚠️ ${fixReport.remainingErrors}件のTypeScriptエラーが残っています。CIで確認してください。`
              : "";

            await createAndMergePR(repo, {
              title: `🤖 [MetaGo L1] major 依存更新 + コード修正 — ${product.display_name}`,
              body: `MetaGo による major 依存更新です。破壊的変更はClaudeが自動修正しました。

**更新パッケージ (${majorUpdates.length}件)**
${majorUpdates.map((p) => `- \`${p.name}\`: ${p.current} → ${p.latest} ⬆️ major`).join("\n")}
${fixedSection}${warningSection}

> L1: 自動マージ対象。破壊的変更をコード修正込みで適用しています。`,
              head:   branch,
              labels: ["metago-auto-merge"],
            });

            for (const pkg of majorUpdates) {
              await supabase.schema("metago").from("dependency_items")
                .update({ state: "done" })
                .eq("product_id", product.id)
                .eq("package_name", pkg.name);
            }
          }
        } else {
          console.log("  major 更新後の変更なし（既に最新か適用済み）");
        }
      } finally {
        if (majorDir) cleanup(majorDir);
      }
    }

    console.log(`  ✓ patch/minor: ${patchMinor.length}, major: ${majorUpdates.length}`);
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase.schema("metago").from("execution_logs").insert({
      product_id:  product.id,
      category:    "dependency",
      title:       `依存チェック失敗: ${repo}`,
      description: String(e),
      state:       "failed",
    });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 Starting dependency check...");

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products?.length) return;

  for (const product of products) {
    const repo = GO_REPOS[product.name];
    if (!repo) continue;
    await processRepo(product, repo);
  }

  console.log("\n✅ Dependency check complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
