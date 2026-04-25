/**
 * code-quality FIX
 *
 * ESLint/Prettier/TSC 自動修正を実行 → 変更があればL1 PRを作成・即マージ
 *
 * このjobはitemsのstateを直接管理するわけではない（ESLint/Prettierはitem単位
 * ではなくリポ全体の修正のため）。修正が走った事実は execution_logs に記録する。
 *
 * Claude による軸評価ベースのfindings修正は scope が大きすぎるため一旦見送り。
 * 必要なら後続タスクで個別軸ごとに細かいfix を追加する。
 *
 * 環境変数:
 *   TARGET_REPO        — 対象リポジトリ名
 *   ANTHROPIC_API_KEY  — Claude API キー（TSCエラー修正用）
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations";
import { GO_REPOS, REPO_TO_SLUG, getSupabase } from "../../lib/metago/items";

const supabase = getSupabase();

async function fixTscErrors(
  repoDir: string,
  anthropic: Anthropic,
): Promise<void> {
  let tscOutput = "";
  try {
    execSync("npx tsc --noEmit", {
      cwd: repoDir,
      stdio: "pipe",
      timeout: 120_000,
    });
    return;
  } catch (e: any) {
    tscOutput = e.stdout?.toString() ?? "";
  }

  const errorLines = tscOutput
    .split("\n")
    .filter((l) => l.includes(": error TS"));
  if (errorLines.length === 0) return;
  console.log(`  TSC: ${errorLines.length}件のエラー → Claude修正開始`);

  const fileErrors = new Map<string, string[]>();
  for (const line of errorLines) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error /);
    if (!m) continue;
    const file = m[1].trim();
    if (!fileErrors.has(file)) fileErrors.set(file, []);
    fileErrors.get(file)!.push(line);
  }

  for (const [file, errors] of fileErrors) {
    const filePath = path.join(repoDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    if (content.length > 80_000) continue;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `Fix the TypeScript compiler errors listed below. Return ONLY the complete fixed file content — no explanation, no markdown fences.

File: ${file}

Errors:
${errors.join("\n")}

Current content:
\`\`\`tsx
${content}
\`\`\``,
            },
          ],
        });
        const raw =
          message.content[0]?.type === "text" ? message.content[0].text : "";
        const fixed = raw
          .replace(/^```[^\n]*\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
        if (fixed && fixed !== content) {
          fs.writeFileSync(filePath, fixed, "utf-8");
          console.log(`  ✓ TSC修正: ${file}`);
        }
        break;
      } catch (e: any) {
        if (e?.status === 429 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 60_000 * attempt));
          continue;
        }
        break;
      }
    }
  }
}

async function fixForRepo(product: any, repo: string) {
  console.log(`\n🔧 [FIX] code-quality: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    repoDir = cloneRepo(repo);

    // deps
    try {
      execSync("npm ci", { cwd: repoDir, stdio: "pipe", timeout: 300_000 });
    } catch {
      try {
        execSync("npm install --legacy-peer-deps", {
          cwd: repoDir,
          stdio: "pipe",
          timeout: 300_000,
        });
      } catch {}
    }

    // ESLint
    try {
      execSync(
        `npx eslint . --ext .ts,.tsx --fix --ignore-pattern '.next' --ignore-pattern 'node_modules'`,
        { cwd: repoDir, stdio: "pipe", timeout: 120_000 },
      );
    } catch {}

    // Prettier
    try {
      execSync(`npx prettier --write "**/*.{ts,tsx,js,json,css}"`, {
        cwd: repoDir,
        stdio: "pipe",
        timeout: 60_000,
      });
    } catch {}

    // TSC
    await fixTscErrors(repoDir, anthropic);

    if (!hasChanges(repoDir)) {
      console.log("  修正なし");
      return;
    }

    const branch = `metago/code-quality-${Date.now()}`;
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `fix(code-quality): ESLint/Prettier/TSC 自動修正 [L1 MetaGo]`,
    );
    if (!pushed) return;

    const pr = await createAndMergePR(repo, {
      title: `🤖 [MetaGo L1] コード品質自動修正 — ${product.display_name}`,
      body: `MetaGo による ESLint 自動修正・Prettier 整形・TypeScript エラー修正です。

> L1: 自動マージ対象。コードロジックへの変更はありません。`,
      head: branch,
      labels: ["metago-auto-merge"],
    });

    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "code-quality-fix",
        title: `ESLint/Prettier/TSC 修正PR: ${product.display_name}`,
        description: `Auto-merged: ${pr.url}`,
        level: "L1",
        state: "merged",
        pr_url: pr.url,
      });

    console.log(`  ✅ ${pr.url}`);
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "code-quality-fix",
        title: `code-quality fix失敗: ${repo}`,
        description: String(e).slice(0, 500),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [FIX] code-quality (ESLint/Prettier/TSC)");

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products?.length) return;

  const targetRepo = process.env.TARGET_REPO;
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null;

  for (const product of products) {
    if (targetSlug && product.name !== targetSlug) continue;
    const repo = GO_REPOS[product.name];
    if (!repo) continue;
    await fixForRepo(product, repo);
  }

  console.log("\n✅ [FIX] code-quality complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
