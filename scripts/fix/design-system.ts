/**
 * design-system FIX
 *
 * design_system_items の state='new' から N 件取り出し、Claudeで修正してL1 PRを作成・即マージ
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")
 *   FIX_BATCH_SIZE — 1実行で処理する違反item数（productごと）。デフォルト10
 */

import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations";
import { fixViolationsWithClaude } from "../../lib/github/claude-api";
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

const supabase = getSupabase();

const SKIP_PRODUCTS = new Set(["designsystem"]);

interface FilePatchTarget {
  file: string;
  content: string;
  itemIds: string[];
  issues: string[];
}

// titleが "category: file" 形式なのでパース
function parseFileFromTitle(title: string): string | null {
  const m = title.match(/^[^:]+:\s*(.+)$/);
  return m ? m[1].trim() : null;
}

async function fixForProduct(product: any, repo: string) {
  const batchSize = parseInt(
    process.env.FIX_BATCH_SIZE ?? String(DEFAULT_BATCH_SIZE),
    10,
  );

  const items = await pickAndLockItems(supabase, "design_system_items", {
    productId: product.id,
    limit: batchSize,
  });

  if (items.length === 0) {
    console.log(`  ${product.display_name}: pending items なし`);
    return;
  }

  console.log(
    `\n🔧 [FIX] design-system: ${product.display_name} (${repo}) — ${items.length}件処理`,
  );

  let repoDir: string | null = null;

  try {
    repoDir = cloneRepo(repo);

    // ファイル単位にまとめる
    const fileMap = new Map<string, FilePatchTarget>();
    for (const item of items) {
      const file = parseFileFromTitle(item.title);
      if (!file) continue;
      const fullPath = path.join(repoDir, file);
      if (!fs.existsSync(fullPath)) continue;

      const existing = fileMap.get(file);
      if (existing) {
        existing.itemIds.push(item.id);
        existing.issues.push(item.title);
      } else {
        let content = "";
        try {
          content = fs.readFileSync(fullPath, "utf-8");
        } catch {
          continue;
        }
        fileMap.set(file, {
          file,
          content,
          itemIds: [item.id],
          issues: [item.title],
        });
      }
    }

    if (fileMap.size === 0) {
      console.warn("  対象ファイルが見つかりません");
      await markItemFailed(
        supabase,
        "design_system_items",
        items.map((i: PendingItem) => i.id),
        "ファイルが見つからない（リネームor削除済みの可能性）",
      );
      return;
    }

    const rule = [
      "go-design-systemの仕様に従って違反をすべて修正してください:",
      "1. Tailwindパレットカラー(text-blue-500等) → var(--color-*)に変換",
      "2. style属性の#xxxxxx → var(--color-*)に変換",
      "3. <button>/<input>/<select>/<textarea> → DSの<Button>/<Input>/<Select>/<Textarea>に変換 (import追加も)",
      "4. rounded-xl/2xl/3xl → rounded-lg",
      "5. shadow-sm/md/lg/xl/2xl → border + var(--color-border)",
      "6. text-[12px]等 → var(--text-*)",
      "7. style属性のfontSize px/rem → var(--text-*)",
      "8. font-bold → font-semibold",
      "import元: @takaki/go-design-system",
    ].join("\n");

    const targets = [...fileMap.values()].map((t) => ({
      file: t.file,
      content: t.content,
      issues: t.issues,
    }));

    console.log(`  🤖 Claude修正中... (${targets.length}ファイル)`);
    const patches = await fixViolationsWithClaude(targets, rule);

    for (const patch of patches) {
      const fullPath = path.join(repoDir, patch.filePath);
      if (fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, patch.newContent, "utf-8");
      }
    }

    if (!hasChanges(repoDir)) {
      console.warn("  Claude修正で変更が生成されませんでした");
      await markItemFailed(
        supabase,
        "design_system_items",
        items.map((i: PendingItem) => i.id),
        "Claudeが有効な修正を返さなかった",
      );
      return;
    }

    const branch = `metago/ds-fix-${Date.now()}`;
    const itemIdRefs = items
      .map((i: PendingItem) => `metago-issue:${i.id}`)
      .join(", ");
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `fix(design-system): ${items.length}件のDS違反修正 [L1 MetaGo]`,
    );

    if (!pushed) {
      console.warn("  push失敗");
      await markItemFailed(
        supabase,
        "design_system_items",
        items.map((i: PendingItem) => i.id),
        "branch push failed",
      );
      return;
    }

    const pr = await createAndMergePR(repo, {
      title: `🤖 [MetaGo L1] DS違反修正 — ${product.display_name} (${items.length}件)`,
      body: [
        `MetaGo + Claude による go-design-system 準拠修正です。`,
        ``,
        `**修正対象 (${items.length}件)**`,
        ...items
          .slice(0, 30)
          .map((i: PendingItem) => `- [${i.category}] ${i.title}`),
        items.length > 30 ? `- ...他 ${items.length - 30} 件` : "",
        ``,
        `**修正ファイル数**: ${patches.length}`,
        ``,
        `> L1: 自動マージ対象。スタイルトークンとDSコンポーネントへの置き換えのみです。`,
        ``,
        `Fixes: ${itemIdRefs}`,
      ]
        .filter(Boolean)
        .join("\n"),
      head: branch,
      labels: ["metago-auto-merge"],
    });

    // 全itemをfixed状態に
    await markItemFixed(
      supabase,
      "design_system_items",
      items.map((i: PendingItem) => i.id),
      pr.url,
    );
    console.log(`  ✅ ${items.length}件 fixed → ${pr.url}`);
  } catch (e) {
    console.error(`  ❌ Fix failed: ${repo}`, e);
    await markItemFailed(
      supabase,
      "design_system_items",
      items.map((i: PendingItem) => i.id),
      String(e).slice(0, 500),
    );
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [FIX] design-system queue processor");

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

  console.log("\n✅ [FIX] design-system complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
