/**
 * tech-stack SCAN
 *
 * 技術スタック2.0 policy 準拠チェック → quality_items に category='tech-stack' でUPSERT
 *
 * 検出対象:
 *  - 禁止package (openai, ai, @ai-sdk/*) を依存に含む
 *  - Layer 1 (Radix UI / sonner / next-themes / clsx / tailwind-merge) を直接import
 *    （DS経由で使うべき）
 *  - shadcn/ui の素ファイルがコピーされている (components/ui/*.tsx)
 *
 * 環境変数:
 *   TARGET_REPO  — 対象リポジトリ名
 */

import * as fs from "fs";
import * as path from "path";
import { cloneRepo, cleanup } from "../../lib/github/git-operations";
import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  saveScore,
  upsertItem,
  markStaleItemsResolved,
} from "../../lib/metago/items";

const supabase = getSupabase();

const SKIP_PRODUCTS = new Set(["designsystem"]);

// ── policy 定義 ─────────────────────────────────────

const FORBIDDEN_PACKAGES = [
  "openai",
  "ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
];

const LAYER1_DIRECT_IMPORT_FORBIDDEN = [
  "@radix-ui/",
  "sonner",
  "next-themes",
  "clsx",
  "tailwind-merge",
];

// ── helpers ─────────────────────────────────────────

function findFiles(
  dir: string,
  exts: string[],
  skip = new Set<string>(),
): string[] {
  const result: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.name.startsWith(".") ||
        skip.has(entry.name) ||
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "dist"
      )
        continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) result.push(...findFiles(full, exts, skip));
      else if (exts.some((e) => entry.name.endsWith(e))) result.push(full);
    }
  } catch {}
  return result;
}

function readPkgJson(repoDir: string): Record<string, any> | null {
  const p = path.join(repoDir, "package.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// ── スキャン処理 ────────────────────────────────────

interface Violation {
  category: string;
  title: string;
  description: string;
  level: "L1" | "L2" | "L3";
  penalty: number;
}

async function scanRepo(product: any, repo: string) {
  console.log(`\n📦 [SCAN] tech-stack: ${product.display_name} (${repo})`);
  let repoDir: string | null = null;
  const scanStartedAt = new Date();

  try {
    repoDir = cloneRepo(repo);

    const violations: Violation[] = [];

    // 1. 禁止package
    const pkg = readPkgJson(repoDir);
    if (pkg) {
      const allDeps: Record<string, string> = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };

      for (const forbidden of FORBIDDEN_PACKAGES) {
        for (const dep of Object.keys(allDeps)) {
          if (
            dep === forbidden ||
            (forbidden.endsWith("/") && dep.startsWith(forbidden))
          ) {
            violations.push({
              category: "tech-stack",
              title: `禁止package依存: ${dep}`,
              description: `package.json に技術スタック policy で禁止されている '${dep}' が含まれています。@anthropic-ai/sdk のみ使用してください。`,
              level: "L1",
              penalty: 15,
            });
          }
        }
      }
    }

    // 2. Layer 1 直import検出
    const tsxFiles = findFiles(repoDir, [".ts", ".tsx"]);
    const layer1ViolationsByPkg = new Map<
      string,
      { count: number; files: Set<string> }
    >();

    for (const file of tsxFiles) {
      let content: string;
      try {
        content = fs.readFileSync(file, "utf-8");
      } catch {
        continue;
      }
      const relPath = path.relative(repoDir, file);

      // import 'X' or import {} from 'X' or import X from 'X'
      const importPattern = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(content)) !== null) {
        const importPath = match[1];
        for (const forbidden of LAYER1_DIRECT_IMPORT_FORBIDDEN) {
          if (
            importPath === forbidden ||
            (forbidden.endsWith("/") && importPath.startsWith(forbidden)) ||
            importPath.startsWith(forbidden)
          ) {
            const existing = layer1ViolationsByPkg.get(forbidden);
            if (existing) {
              existing.count++;
              existing.files.add(relPath);
            } else {
              layer1ViolationsByPkg.set(forbidden, {
                count: 1,
                files: new Set([relPath]),
              });
            }
            break;
          }
        }
      }
    }

    for (const [pkgName, info] of layer1ViolationsByPkg) {
      const filesList = [...info.files].slice(0, 5).join(", ");
      violations.push({
        category: "tech-stack",
        title: `Layer1直import: ${pkgName}`,
        description: `'${pkgName}' を直接importしています (${info.count}箇所、${info.files.size}ファイル)。@takaki/go-design-system 経由で使用してください。例: ${filesList}${info.files.size > 5 ? "..." : ""}`,
        level: "L1",
        penalty: Math.min(20, info.count * 2),
      });
    }

    // 3. components/ui/ の shadcn 素ファイル検出
    const shadcnUiPaths = [
      path.join(repoDir, "components", "ui"),
      path.join(repoDir, "src", "components", "ui"),
      path.join(repoDir, "app", "components", "ui"),
    ];
    for (const uiDir of shadcnUiPaths) {
      if (!fs.existsSync(uiDir)) continue;
      const uiFiles = fs
        .readdirSync(uiDir)
        .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
      if (uiFiles.length > 0) {
        violations.push({
          category: "tech-stack",
          title: `shadcn/ui 素ファイル残存: ${path.relative(repoDir, uiDir)}`,
          description: `shadcn/ui の素ファイルが ${uiFiles.length}件残っています (${uiFiles.slice(0, 5).join(", ")}${uiFiles.length > 5 ? "..." : ""})。@takaki/go-design-system に移行してください。`,
          level: "L1",
          penalty: Math.min(30, uiFiles.length * 3),
        });
      }
    }

    // DB UPSERT
    let totalPenalty = 0;
    for (const v of violations) {
      totalPenalty += v.penalty;
      await upsertItem(supabase, "quality_items", {
        product_id: product.id,
        category: v.category,
        title: v.title,
        description: v.description,
        level: v.level,
      });
    }

    const score = Math.max(0, 100 - totalPenalty);
    await saveScore(supabase, product.id, "tech_stack", score);

    const resolved = await markStaleItemsResolved(
      supabase,
      "quality_items",
      product.id,
      scanStartedAt,
      ["tech-stack"],
    );

    console.log(
      `  ✓ ${violations.length} violations, score: ${score}${resolved > 0 ? `, ${resolved} resolved` : ""}`,
    );
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e);
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "tech-stack-scan",
        title: `tech-stack scan失敗: ${repo}`,
        description: String(e).slice(0, 500),
        state: "failed",
      });
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  console.log("🚀 [SCAN] tech-stack (技術スタック policy 準拠チェック)");

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
    await scanRepo(product, repo);
  }

  console.log("\n✅ [SCAN] tech-stack complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
