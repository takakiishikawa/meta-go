/**
 * design-system SCAN
 *
 * go-design-system 準拠チェック → DBに違反item を UPSERT + score 保存
 * 修正PRは作らない（fix-cron に委譲）
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import * as fs from "fs";
import * as path from "path";
import { cloneRepo, cleanup } from "../../lib/github/git-operations";
import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  saveScore,
  reviveResolvedItems,
  upsertItem,
  markStaleItemsResolved,
} from "../../lib/metago/items";

const supabase = getSupabase();

// designsystem は src/ がDS本体 (=計測対象外。<button> や生 Tailwind カラーが
// 定義として大量にあるため自分自身を測ると false positive だらけになる)。
// showcase/ は @takaki/go-design-system を消費する Next.js 製プロダクトなので
// 他goと同じ基準で計測する。
const SCAN_SUBDIRS: Record<string, string[]> = {
  designsystem: ["showcase"],
};

// ── 違反ルール定義 ──────────────────────────────────────

const TW_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
].join("|");

const TW_COLOR_PREFIXES = [
  "text",
  "bg",
  "border",
  "ring",
  "fill",
  "stroke",
  "shadow",
  "outline",
  "from",
  "to",
  "via",
  "decoration",
  "divide",
  "placeholder",
  "caret",
  "accent",
].join("|");

interface ViolationRule {
  category: string;
  severity: "high" | "medium" | "low";
  pattern: RegExp;
  description: string;
  rule: string;
  penaltyPerHit: number;
}

const VIOLATION_RULES: ViolationRule[] = [
  {
    category: "カラー/Tailwindパレット直書き",
    severity: "high",
    pattern: new RegExp(
      `(?:${TW_COLOR_PREFIXES})-(${TW_COLORS})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\\w-])`,
      "g",
    ),
    description:
      "Tailwindパレットカラー直書き。go-design-systemのCSS変数(var(--color-*))を使用してください",
    rule: "className内のTailwindパレットカラー(text-blue-500等)はDS CSS変数(var(--color-*))またはDSコンポーネントpropsに置き換えてください",
    penaltyPerHit: 3,
  },
  {
    category: "カラー/任意カラー値直書き",
    severity: "high",
    pattern:
      /(?:text|bg|border|ring|fill|stroke|from|to|via)-\[(?:#[0-9a-fA-F]{3,8}|rgb[a]?\()/g,
    description:
      "Tailwind arbitrary値でカラーを直接指定。var(--color-*)トークンを使用してください",
    rule: "className内のarbitrary color([#xxx]等)はvar(--color-*)に置き換えてください",
    penaltyPerHit: 5,
  },
  {
    category: "カラー/style属性hex直書き",
    severity: "high",
    pattern:
      /style=\{[^}]*(?:color|background(?:Color)?|borderColor|fill|stroke):\s*['"](?:#[0-9a-fA-F]{3,8}|rgb[a]?\()/g,
    description:
      "style属性に直接カラーコード。var(--color-*)トークンを使用してください",
    rule: "style属性のcolor系プロパティはvar(--color-*)に置き換えてください",
    penaltyPerHit: 5,
  },
  {
    category: "コンポーネント/素のbutton使用",
    severity: "high",
    pattern: /<button\s+(?:class|onClick|type|disabled)/g,
    description: "DSの<Button>コンポーネントではなく素の<button>を使用",
    rule: "<button>→go-design-systemの<Button>コンポーネントを使用してください",
    penaltyPerHit: 4,
  },
  {
    category: "コンポーネント/素のinput使用",
    severity: "high",
    pattern: /<input\s+(?:type|class|onChange|value|placeholder)/g,
    description:
      "DSの<Input>/<SearchInput>/<NumberInput>ではなく素の<input>を使用",
    rule: "<input>→go-design-systemの<Input>コンポーネントを使用してください",
    penaltyPerHit: 4,
  },
  {
    category: "コンポーネント/素のselect使用",
    severity: "high",
    pattern: /<select\s+(?:class|onChange|value|name)/g,
    description: "DSの<Select>/<Combobox>ではなく素の<select>を使用",
    rule: "<select>→go-design-systemの<Select>コンポーネントを使用してください",
    penaltyPerHit: 4,
  },
  {
    category: "コンポーネント/素のtextarea使用",
    severity: "medium",
    pattern: /<textarea\s+(?:class|onChange|value|rows|placeholder)/g,
    description: "DSの<Textarea>ではなく素の<textarea>を使用",
    rule: "<textarea>→go-design-systemの<Textarea>コンポーネントを使用してください",
    penaltyPerHit: 3,
  },
  {
    category: "スタイル/角丸超過",
    severity: "medium",
    pattern: /rounded-(?:xl|2xl|3xl)\b/g,
    description:
      "go-design-system の角丸上限(--radius-lg=6px)を超えている。rounded-lg以上は禁止",
    rule: "rounded-lg以上はrounded-md(4px)またはrounded-lg(6px)に変更してください",
    penaltyPerHit: 2,
  },
  {
    category: "スタイル/shadow使用",
    severity: "medium",
    pattern: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    description: "DSの設計指針では shadowより border+borderColor を優先する",
    rule: "shadow-*はborder + var(--color-border)に置き換えることを検討してください",
    penaltyPerHit: 1,
  },
  {
    category: "スタイル/フォントサイズpx直書き",
    severity: "medium",
    pattern: /style=\{[^}]*fontSize:\s*['"]?(?:\d+px|\d*\.\d+rem)/g,
    description:
      "style属性のfontSizeにpx/rem直書き。var(--text-*)トークンを使用してください",
    rule: "style属性のfontSizeはvar(--text-xs|sm|base|lg|xl...)に置き換えてください",
    penaltyPerHit: 3,
  },
  {
    category: "スタイル/任意フォントサイズ",
    severity: "medium",
    pattern: /text-\[(?:\d+px|\d*\.\d+rem)\]/g,
    description:
      "Tailwind arbitrary値でフォントサイズ直書き。var(--text-*)を使用してください",
    rule: "text-[12px]等はvar(--text-*)またはDSのtext-xs等に置き換えてください",
    penaltyPerHit: 3,
  },
  {
    category: "スタイル/font-bold使用",
    severity: "low",
    pattern: /\bfont-bold\b/g,
    description:
      "go-design-systemの設計指針ではfont-bold(700)よりfont-semibold(600)を優先",
    rule: "font-bold→font-semiboldに変更することを検討してください",
    penaltyPerHit: 1,
  },
];

// ── ファイルスキャン ──────────────────────────────────────

function findTsxFiles(dir: string): string[] {
  const result: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", "dist"].includes(entry.name))
        continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) result.push(...findTsxFiles(fullPath));
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) result.push(fullPath);
    }
  } catch {}
  return result;
}

function checkDesignTokensUsage(scanRoots: string[]): boolean {
  for (const root of scanRoots) {
    const layoutPaths = [
      path.join(root, "app", "layout.tsx"),
      path.join(root, "app", "layout.ts"),
      path.join(root, "src", "app", "layout.tsx"),
    ];
    for (const p of layoutPaths) {
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, "utf-8");
      if (
        content.includes("DesignTokens") ||
        content.includes("go-design-system")
      )
        return true;
    }
  }
  return false;
}

function getScanRoots(productName: string, repoDir: string): string[] {
  const subs = SCAN_SUBDIRS[productName];
  if (!subs?.length) return [repoDir];
  const roots = subs
    .map((s) => path.join(repoDir, s))
    .filter((p) => fs.existsSync(p));
  return roots.length > 0 ? roots : [repoDir];
}

// ── メイン ────────────────────────────────────────────────

async function scanRepo(product: any, repo: string) {
  console.log(`\n🎨 [SCAN] design-system: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;
  const scanStartedAt = new Date();

  try {
    repoDir = cloneRepo(repo);
    const root = repoDir;

    const scanRoots = getScanRoots(product.name, root);
    const files = scanRoots.flatMap(findTsxFiles);
    if (scanRoots.length === 1 && scanRoots[0] === root) {
      console.log(`  📂 ${files.length} files`);
    } else {
      const rels = scanRoots.map((r) => path.relative(root, r) || ".");
      console.log(`  📂 ${files.length} files (scoped: ${rels.join(", ")})`);
    }

    const usesDesignTokens = checkDesignTokensUsage(scanRoots);

    // 違反集計
    const violationsByKey = new Map<
      string, // `${category}|${file}`
      {
        category: string;
        file: string;
        rule: ViolationRule;
        count: number;
        examples: string[];
      }
    >();

    for (const filePath of files) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const relPath = path.relative(repoDir, filePath);

      for (const rule of VIOLATION_RULES) {
        const matches = [
          ...content.matchAll(new RegExp(rule.pattern.source, "g")),
        ];
        if (matches.length === 0) continue;

        const key = `${rule.category}|${relPath}`;
        const entry = violationsByKey.get(key);
        if (entry) {
          entry.count += matches.length;
        } else {
          violationsByKey.set(key, {
            category: rule.category,
            file: relPath,
            rule,
            count: matches.length,
            examples: matches.slice(0, 3).map((m) => m[0].substring(0, 80)),
          });
        }
      }
    }

    // DB UPSERT
    let totalPenalty = 0;
    let totalCount = 0;
    for (const v of violationsByKey.values()) {
      totalPenalty += v.rule.penaltyPerHit * v.count;
      totalCount += v.count;
      await upsertItem(supabase, "design_system_items", {
        product_id: product.id,
        category: v.category,
        title: `${v.category}: ${v.file}`,
        description: `${v.rule.description} (${v.count}箇所) | ${v.examples.join(", ")}`,
        level: "L1",
      });
    }

    // DesignTokens未使用
    if (!usesDesignTokens) {
      totalPenalty += 10;
      const scopePrefix =
        scanRoots.length === 1 && scanRoots[0] === repoDir
          ? ""
          : `${path.relative(repoDir, scanRoots[0])}/`;
      const layoutRel = `${scopePrefix}app/layout.tsx`;
      await upsertItem(supabase, "design_system_items", {
        product_id: product.id,
        category: "設定/DesignTokens未使用",
        title: `設定/DesignTokens未使用: ${layoutRel}`,
        description: `${layoutRel} で<DesignTokens>コンポーネントが見つかりません`,
        level: "L1",
      });
    }

    const score = Math.max(0, 100 - totalPenalty);
    await saveScore(supabase, product.id, "design_system", score);

    const revived = await reviveResolvedItems(
      supabase,
      "design_system_items",
      product.id,
      scanStartedAt,
    );

    const resolved = await markStaleItemsResolved(
      supabase,
      "design_system_items",
      product.id,
      scanStartedAt,
    );

    console.log(
      `  ✓ ${violationsByKey.size} 種類の違反 (合計 ${totalCount} 箇所), score: ${score}${resolved > 0 ? `, ${resolved} resolved` : ""}${revived > 0 ? `, ${revived} revived` : ""}`,
    );
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "design-system-scan",
        title: `デザインシステムscan失敗: ${repo}`,
        description: String(e).slice(0, 500),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [SCAN] design-system compliance check");

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
    await scanRepo(product, repo);
  }

  console.log("\n✅ [SCAN] design-system complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
