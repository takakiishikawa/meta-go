/**
 * tech-stack FIX
 *
 * quality_items の category='tech-stack' / state='new' から N件取り出し、
 * Claudeにソース修正させてL1 PRを作成・即マージ
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
  createAndMergePR,
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

const SKIP_PRODUCTS = new Set(["designsystem"]);

async function fixTechStack(
  repoDir: string,
  items: PendingItem[],
  productName: string,
  anthropic: Anthropic,
): Promise<{ patchCount: number; summary: string }> {
  let files: string[] = [];
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "package.json" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" -not -path "./dist/*" | head -40`,
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
  // package.json は必ず先頭に含める
  const pkgIdx = files.findIndex((f) => f.endsWith("package.json"));
  if (pkgIdx >= 0) {
    files = [files[pkgIdx], ...files.filter((_, i) => i !== pkgIdx)];
  }

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), "utf-8");
      if (totalChars + content.length > 60_000) break;
      sections.push(`=== ${f} ===\n${content}`);
      totalChars += content.length;
    } catch {}
  }
  if (sections.length === 0) return { patchCount: 0, summary: "" };

  const prompt = `You are refactoring "${productName}" to comply with the Go-series tech stack policy v2.0.

## Tech stack policy
| Layer | Allowed |
|---|---|
| Foundation | next, react, typescript, tailwindcss, @takaki/go-design-system |
| Layer 1 (DS吸収) | Radix UI / sonner / next-themes / clsx / tailwind-merge — **must NOT be imported directly**; use them via @takaki/go-design-system |
| Layer 2 (全go共通) | @supabase/*, zod, date-fns, react-hook-form, @vercel/analytics |
| Layer 3 (機能) | @dnd-kit/*, react-dropzone etc. (per-feature) |
| Layer 4 (固有) | product-specific only |
| **禁止** | openai, ai, @ai-sdk/* — use @anthropic-ai/sdk only |

## Violations to fix
${items.map((i) => `- ${i.title}: ${i.description}`).join("\n")}

## Fix strategy
1. **禁止package**: Remove from package.json dependencies. If used in code, rewrite to use @anthropic-ai/sdk. If you can't safely rewrite, skip the file.
2. **Layer1直import**: Replace direct imports of @radix-ui/*, sonner, next-themes, clsx, tailwind-merge with imports from "@takaki/go-design-system". The DS exports equivalents (e.g., Button, Toaster, useTheme, cn).
3. **shadcn/ui素ファイル**: Delete components/ui/*.tsx files that are shadcn copies. Update imports across the codebase to import from "@takaki/go-design-system" instead.

Source files:
${sections.join("\n\n")}

Return JSON:
{
  "patches": [{ "file": "relative/path", "newContent": "complete file content" }],
  "deletions": ["relative/path/to/delete.tsx"],
  "summary": "日本語で変更内容の要約（200文字以内）"
}

- For deletions, list paths to remove (e.g., "components/ui/button.tsx")
- Return ONLY the JSON, no markdown fences
- If you can't safely fix something, skip it`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  🤖 tech-stack修正中... (試行 ${attempt})`);
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
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
        deletions?: string[];
        summary: string;
      };

      let patchCount = 0;
      for (const patch of result.patches ?? []) {
        const fullPath = path.join(repoDir, patch.file);
        // package.json以外は既存ファイルに対する修正のみ
        if (!fs.existsSync(fullPath) && !patch.file.endsWith("package.json"))
          continue;
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, patch.newContent, "utf-8");
        patchCount++;
      }
      for (const del of result.deletions ?? []) {
        const fullPath = path.join(repoDir, del);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
          patchCount++;
        }
      }
      return { patchCount, summary: result.summary ?? "" };
    } catch (e: any) {
      if (e?.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 60_000 * attempt));
        continue;
      }
      console.warn("  tech-stack修正失敗:", String(e).slice(0, 150));
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

  const { data: rawItems } = await supabase
    .schema("metago")
    .from("quality_items")
    .select(
      `id, product_id, category, title, description, attempt_count, level`,
    )
    .eq("product_id", product.id)
    .eq("category", "tech-stack")
    .eq("state", "new")
    .lt("attempt_count", 3)
    .limit(batchSize);

  const items = (rawItems ?? []) as PendingItem[];
  if (items.length === 0) {
    console.log(`  ${product.display_name}: pending tech-stack items なし`);
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
    `\n🔧 [FIX] tech-stack: ${product.display_name} (${repo}) — ${items.length}件処理`,
  );

  let repoDir: string | null = null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    repoDir = cloneRepo(repo);

    const { patchCount, summary } = await fixTechStack(
      repoDir,
      items,
      product.display_name,
      anthropic,
    );

    if (patchCount === 0 || !hasChanges(repoDir)) {
      await markItemFailed(
        supabase,
        "quality_items",
        items.map((i) => i.id),
        "Claudeが有効な修正を返さなかった",
      );
      return;
    }

    const branch = `metago/tech-stack-${Date.now()}`;
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `chore(tech-stack): ${items.length}件のpolicy違反修正 [L1 MetaGo]`,
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
      title: `🤖 [MetaGo L1] 技術スタック準拠修正 — ${product.display_name} (${items.length}件)`,
      body: [
        `MetaGo + Claude による技術スタック policy v2.0 準拠修正です。`,
        ``,
        `**修正対象 (${items.length}件)**`,
        ...items.map((i) => `- ${i.title}`),
        ``,
        `**変更内容**`,
        summary,
        ``,
        `**修正ファイル数**: ${patchCount}`,
        ``,
        `> L1: 自動マージ対象。技術スタック policy への準拠のみ。`,
        ``,
        `Fixes: ${itemIdRefs}`,
      ].join("\n"),
      head: branch,
      labels: ["metago-auto-merge"],
    });

    await supabase
      .schema("metago")
      .from("quality_items")
      .update({
        state: "fixed",
        pr_url: pr.url,
        resolved_at: new Date().toISOString(),
        error_message: null,
      })
      .in(
        "id",
        items.map((i) => i.id),
      );

    console.log(`  ✅ ${pr.url}`);
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
  console.log("🚀 [FIX] tech-stack queue processor");

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products?.length) return;

  const targetRepo = process.env.TARGET_REPO;
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null;

  for (const product of products) {
    if (SKIP_PRODUCTS.has(product.name)) continue;
    if (targetSlug && product.name !== targetSlug) continue;
    const repo = GO_REPOS[product.name];
    if (!repo) continue;
    await fixForProduct(product, repo);
  }

  console.log("\n✅ [FIX] tech-stack complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
