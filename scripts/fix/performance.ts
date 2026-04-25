/**
 * performance FIX
 *
 * quality_items の category="Performance" / state='new' から N 件取り出し、
 * Claude にソースを分析させて L1 PR を即マージし approval_queue に履歴を残す
 *
 * 認証: CLAUDE_CODE_OAUTH_TOKEN (Claude Code Max プラン)
 *
 * 環境変数:
 *   TARGET_REPO     — 対象リポジトリ名
 *   FIX_BATCH_SIZE  — productごとの処理上限
 */

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
import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  pickAndLockItems,
  markItemFixed,
  markItemFailed,
  PendingItem,
  DEFAULT_BATCH_SIZE,
} from "../../lib/metago/items";
import { runClaudeForJSON } from "../../lib/metago/claude-cli";

const supabase = getSupabase();

async function analyzeAndFix(
  repoDir: string,
  productName: string,
  issues: string[],
): Promise<{ patchCount: number; summary: string }> {
  let files: string[] = [];
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" | head -30`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return { patchCount: 0, summary: "" };
  }

  const sections: string[] = [];
  let totalChars = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), "utf-8");
      if (totalChars + content.length > 60_000) break;
      sections.push(`=== ${f} ===\n${content}`);
      totalChars += content.length;
    } catch {}
  }
  if (sections.length === 0) return { patchCount: 0, summary: "" };

  const prompt = `You are a Next.js performance expert. The app "${productName}" has these Lighthouse issues:
${issues.map((i) => `- ${i}`).join("\n")}

Analyze the source code and apply the most impactful fixes. Common fixes:
- Replace <img> with <Image> from next/image
- Add loading="lazy" to images below the fold
- Convert heavy Client Components to Server Components
- Add dynamic(() => import("..."), { ssr: false }) for large client-only libraries
- Remove unused imports

Source files:
${sections.join("\n\n")}

Return JSON:
{
  "patches": [{ "file": "relative/path.tsx", "newContent": "..." }],
  "summary": "日本語で変更内容の要約（200文字以内）"
}

Only include changed files. Return ONLY the JSON.`;

  try {
    console.log(`  🤖 パフォーマンス改善分析...`);
    const result = await runClaudeForJSON<{
      patches: Array<{ file: string; newContent: string }>;
      summary: string;
    }>(prompt);

    let patchCount = 0;
    for (const patch of result.patches ?? []) {
      const fullPath = path.join(repoDir, patch.file);
      if (!fs.existsSync(fullPath)) continue;
      fs.writeFileSync(fullPath, patch.newContent, "utf-8");
      patchCount++;
    }
    return { patchCount, summary: result.summary ?? "" };
  } catch (e) {
    console.warn("  Claude分析失敗:", String(e).slice(0, 150));
    return { patchCount: 0, summary: "" };
  }
}

async function fixForProduct(product: any, repo: string) {
  const batchSize = parseInt(
    process.env.FIX_BATCH_SIZE ?? String(DEFAULT_BATCH_SIZE),
    10,
  );

  // category='Performance' のpending items のみ
  const { data: rawItems } = await supabase
    .schema("metago")
    .from("quality_items")
    .select(
      `id, product_id, category, title, description, attempt_count, level`,
    )
    .eq("product_id", product.id)
    .eq("category", "Performance")
    .eq("state", "new")
    .lt("attempt_count", 3)
    .limit(batchSize);

  const items = (rawItems ?? []) as PendingItem[];
  if (items.length === 0) {
    console.log(`  ${product.display_name}: pending performance items なし`);
    return;
  }

  // ロック取得
  await supabase
    .schema("metago")
    .from("quality_items")
    .update({
      state: "fixing",
      last_attempted_at: new Date().toISOString(),
    })
    .in(
      "id",
      items.map((i) => i.id),
    );

  console.log(
    `\n🔧 [FIX] performance: ${product.display_name} (${repo}) — ${items.length}件処理`,
  );

  let repoDir: string | null = null;

  try {
    repoDir = cloneRepo(repo);
    const issues = items.map((i) => i.title);
    const { patchCount, summary } = await analyzeAndFix(
      repoDir,
      product.display_name,
      issues,
    );

    if (patchCount === 0 || !hasChanges(repoDir)) {
      console.warn("  Claudeが有効な修正を返しませんでした");
      await markItemFailed(
        supabase,
        "quality_items",
        items.map((i) => i.id),
        "Claude returned no actionable patches",
      );
      return;
    }

    const branch = `metago/perf-${Date.now()}`;
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `perf: Lighthouse指摘パフォーマンス改善 [MetaGo L1]`,
    );
    if (!pushed) {
      await markItemFailed(
        supabase,
        "quality_items",
        items.map((i) => i.id),
        "branch push failed",
      );
      return;
    }

    const itemIdRefs = items.map((i) => `metago-issue:${i.id}`).join(", ");
    const pr = await createAndMergePR(repo, {
      title: `🤖 [MetaGo L1] パフォーマンス改善 — ${product.display_name}`,
      body: [
        `MetaGo + Claude によるパフォーマンス改善です。`,
        ``,
        `**Lighthouse計測結果**`,
        ...issues.map((i) => `- ${i}`),
        ``,
        `**変更内容**`,
        summary,
        ``,
        `修正ファイル数: ${patchCount} 件`,
        ``,
        `Fixes: ${itemIdRefs}`,
      ].join("\n"),
      head: branch,
      labels: ["metago-auto-merge"],
    });

    await supabase
      .schema("metago")
      .from("approval_queue")
      .insert({
        product_id: product.id,
        title: `パフォーマンス改善PR: ${product.display_name}`,
        description: `${issues.join(", ")} → ${summary}`,
        category: "performance",
        state: "merged",
        meta: {
          pr_url: pr.url,
          level: "L1",
          repo,
          item_ids: items.map((i) => i.id),
        },
      });

    // L1: PRは即マージ済みなので items を fixed に遷移
    await markItemFixed(
      supabase,
      "quality_items",
      items.map((i) => i.id),
      pr.url,
    );

    console.log(`  ✓ L1 PR merged: ${pr.url}`);
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await markItemFailed(
      supabase,
      "quality_items",
      items.map((i) => i.id),
      String(e).slice(0, 500),
    );
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [FIX] performance (L1)");

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
    await fixForProduct(product, repo);
  }

  console.log("\n✅ [FIX] performance complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
