/**
 * security FIX
 *
 * security_items の state='new' から critical/high を N 件取り出し、
 * Claude にソースを修正させて L2 PR を作成 + approval_queue に追加
 *
 * 環境変数:
 *   TARGET_REPO        — 対象リポジトリ名
 *   ANTHROPIC_API_KEY  — Claude API キー
 *   FIX_BATCH_SIZE     — productごとの処理上限
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createReviewPR,
  cleanup,
} from "../../lib/github/git-operations";
import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  markItemFailed,
  PendingItem,
  DEFAULT_BATCH_SIZE,
} from "../../lib/metago/items";

const supabase = getSupabase();

async function fixSecurityIssues(
  repoDir: string,
  items: PendingItem[],
  productName: string,
  anthropic: Anthropic,
): Promise<{ patchCount: number; summary: string }> {
  let files: string[] = [];
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" | head -25`,
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
      if (totalChars + content.length > 50_000) break;
      sections.push(`=== ${f} ===\n${content}`);
      totalChars += content.length;
    } catch {}
  }
  if (sections.length === 0) return { patchCount: 0, summary: "" };

  const prompt = `You are a security engineer. The app "${productName}" has these security issues:
${items.map((f) => `- [${f.severity}] ${f.title}: ${f.description}`).join("\n")}

Fix these security issues in the source code:
- Remove dangerouslySetInnerHTML where safe, or add a comment explaining why it's safe
- Remove console.log statements that output sensitive data
- Replace innerHTML assignments with textContent where content is not HTML
- Do NOT change application logic or remove functionality
- Do NOT fix issues if you're uncertain — skip rather than break

Source files:
${sections.join("\n\n")}

Return JSON:
{
  "patches": [{ "file": "relative/path.tsx", "newContent": "..." }],
  "summary": "日本語で変更内容の要約（200文字以内）"
}

Only include actually changed files. Return ONLY the JSON.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  🔧 セキュリティ修正中... (試行 ${attempt})`);
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const raw =
        message.content[0]?.type === "text" ? message.content[0].text : "";
      const cleaned = raw
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found");

      const result = JSON.parse(jsonMatch[0]) as {
        patches: Array<{ file: string; newContent: string }>;
        summary: string;
      };

      let patchCount = 0;
      for (const patch of result.patches ?? []) {
        const fullPath = path.join(repoDir, patch.file);
        if (!fs.existsSync(fullPath)) continue;
        fs.writeFileSync(fullPath, patch.newContent, "utf-8");
        patchCount++;
      }
      return { patchCount, summary: result.summary ?? "" };
    } catch (e: any) {
      if (e?.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 60_000 * attempt));
        continue;
      }
      console.warn("  セキュリティ修正失敗:", String(e).slice(0, 150));
      return { patchCount: 0, summary: "" };
    }
  }
  return { patchCount: 0, summary: "" };
}

async function fixForProduct(product: any, repo: string) {
  const batchSize = parseInt(
    process.env.FIX_BATCH_SIZE ?? String(DEFAULT_BATCH_SIZE),
    10,
  );

  // critical/high の new items のみ
  const { data: rawItems } = await supabase
    .schema("metago")
    .from("security_items")
    .select(
      `id, product_id, severity, category, title, description, attempt_count, level`,
    )
    .eq("product_id", product.id)
    .in("severity", ["critical", "high"])
    .eq("state", "new")
    .lt("attempt_count", 3)
    .limit(batchSize);

  const items = (rawItems ?? []) as PendingItem[];
  if (items.length === 0) {
    console.log(`  ${product.display_name}: pending security items なし`);
    return;
  }

  // ロック取得
  await supabase
    .schema("metago")
    .from("security_items")
    .update({
      state: "fixing",
      last_attempted_at: new Date().toISOString(),
    })
    .in(
      "id",
      items.map((i) => i.id),
    );

  console.log(
    `\n🔧 [FIX] security: ${product.display_name} (${repo}) — ${items.length}件処理`,
  );

  let repoDir: string | null = null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    repoDir = cloneRepo(repo);

    const { patchCount, summary } = await fixSecurityIssues(
      repoDir,
      items,
      product.display_name,
      anthropic,
    );

    if (patchCount === 0 || !hasChanges(repoDir)) {
      await markItemFailed(
        supabase,
        "security_items",
        items.map((i) => i.id),
        "Claudeが有効な修正を返さなかった",
      );
      return;
    }

    const branch = `metago/security-${Date.now()}`;
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `fix(security): ${items.length}件のセキュリティ問題修正 [MetaGo L2]`,
    );
    if (!pushed) {
      await markItemFailed(
        supabase,
        "security_items",
        items.map((i) => i.id),
        "branch push failed",
      );
      return;
    }

    const itemIdRefs = items.map((i) => `metago-issue:${i.id}`).join(", ");
    const pr = await createReviewPR(repo, {
      title: `🤖 [MetaGo L2] セキュリティ修正 — ${product.display_name} (${items.length}件)`,
      body: [
        `MetaGo + Claude によるセキュリティ問題の修正提案です。`,
        ``,
        `**検出された問題 (${items.length}件)**`,
        ...items.map((f) => `- [${f.severity}] ${f.title}`),
        ``,
        `**変更内容**`,
        summary,
        ``,
        `修正ファイル数: ${patchCount} 件`,
        ``,
        `> ⚠️ L2: 動作確認後に承認してください。セキュリティ修正は機能に影響する可能性があります。`,
        ``,
        `Fixes: ${itemIdRefs}`,
      ].join("\n"),
      head: branch,
      labels: ["metago-needs-review"],
    });

    await supabase
      .schema("metago")
      .from("approval_queue")
      .insert({
        product_id: product.id,
        title: `セキュリティ修正PR: ${product.display_name}`,
        description: items.map((f) => `[${f.severity}] ${f.title}`).join("\n"),
        category: "security",
        state: "pending",
        meta: {
          pr_url: pr.url,
          level: "L2",
          repo,
          item_ids: items.map((i) => i.id),
        },
      });

    // L2 は承認待ちなので fixing のまま (PRマージで approval flow が fixed に遷移)
    await supabase
      .schema("metago")
      .from("security_items")
      .update({
        pr_url: pr.url,
      })
      .in(
        "id",
        items.map((i) => i.id),
      );

    console.log(`  📋 L2 PR: ${pr.url}`);
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await markItemFailed(
      supabase,
      "security_items",
      items.map((i) => i.id),
      String(e).slice(0, 500),
    );
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [FIX] security (L2)");

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

  console.log("\n✅ [FIX] security complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
