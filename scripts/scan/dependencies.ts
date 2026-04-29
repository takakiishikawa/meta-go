/**
 * dependencies SCAN (DB only, clone不要)
 *
 * goseries 全体の tech_stack_items / dependency_items を読んで、
 * 各プロダクトの「依存関係スコア」を 0-100 で算出して scores_history に保存する。
 *
 * 評価軸 (50:50 で合算):
 *
 *   1) 更新性 (Update Currency) — 最新技術への追従度
 *      open な dependency_items を update_type 別に減点:
 *        framework: 15  major: 10  minor: 3  patch: 1
 *      critical framework (next/react/typescript/tailwindcss/@supabase/...)
 *      は 2 倍 で重く扱う (核となる技術が古いと goseries 全体が引きずられるため)。
 *
 *   2) 共通化 (Standardization) — goseries 推奨スタックの利用度
 *      a) Coverage: CORE_STACK のうち何個を使っているか (重み付き)
 *      b) Alignment: 使っている分について、goseries 内で最頻 major version と
 *         一致しているか (重み付き)
 *      合計 100 点を coverage 50 + alignment 50 で配分。
 *
 *   final_score = round(0.5 * update_currency + 0.5 * standardization)
 *
 * 副作用:
 *   - scores_history に category='dependencies' で 1日1行 upsert
 *   - quality_items に category='dependency-standardization' で
 *     coverage / alignment の違反を可視化用にUPSERT
 *
 * 環境変数:
 *   TARGET_REPO  — 指定があればそのプロダクトだけ score を保存する
 *                  (modal 計算は常に goseries 全体を使う)
 */

import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  saveScore,
  upsertItem,
  markStaleItemsResolved,
  isResolved,
} from "../../lib/metago/items";

const supabase = getSupabase();

// designsystem は @takaki/go-design-system の発行元なので
// 「DS を使っているか」軸は対象外。それ以外の core stack は評価する。
const SKIP_PRODUCTS = new Set<string>();

// goseries 推奨スタック。weight が大きいほど評価へのインパクトが大きい。
// "次世代goが必ず採用すべき" 中核を 3、副次的なものを 1 と段階付け。
const CORE_STACK: Record<string, number> = {
  next: 3,
  react: 3,
  "react-dom": 2,
  typescript: 2,
  tailwindcss: 2,
  "@supabase/supabase-js": 2,
  "@takaki/go-design-system": 2,
  eslint: 1,
  prettier: 1,
};

// designsystem 自身は @takaki/go-design-system に依存しない (それ自体)。
// metago と同じく Supabase は使うが、構成上 next/react/ts は持つ前提。
const STACK_EXEMPT_BY_PRODUCT: Record<string, Set<string>> = {
  designsystem: new Set(["@takaki/go-design-system"]),
};

const CRITICAL_FRAMEWORKS = new Set<string>([
  "next",
  "react",
  "react-dom",
  "typescript",
  "tailwindcss",
  "@supabase/supabase-js",
]);

// dependency_items.update_type → 減点
const UPDATE_PENALTY: Record<string, number> = {
  patch: 1,
  minor: 3,
  major: 10,
  framework: 15,
};

interface TechStackRow {
  product_id: string;
  package_name: string;
  version: string | null;
  is_dev: boolean;
}

interface DependencyItemRow {
  product_id: string;
  package_name: string;
  update_type: string;
  state: string;
}

interface ProductRow {
  id: string;
  name: string;
  display_name: string;
}

// ── helpers ─────────────────────────────────────────────

function majorOf(v: string | null | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.]/g, "");
  const head = cleaned.split(".")[0];
  if (!head) return null;
  const n = Number(head);
  return Number.isFinite(n) ? n : null;
}

// goseries 全体で「最も多い major version」を package 別に算出
function computeModalMajors(
  techStack: TechStackRow[],
  productById: Map<string, ProductRow>,
): Map<string, number> {
  const counts = new Map<string, Map<number, number>>();
  for (const row of techStack) {
    if (!CORE_STACK[row.package_name]) continue;
    if (row.is_dev) continue;
    const product = productById.get(row.product_id);
    if (!product) continue;
    const exempt = STACK_EXEMPT_BY_PRODUCT[product.name];
    if (exempt?.has(row.package_name)) continue;

    const m = majorOf(row.version);
    if (m == null) continue;
    if (!counts.has(row.package_name)) counts.set(row.package_name, new Map());
    const inner = counts.get(row.package_name)!;
    inner.set(m, (inner.get(m) ?? 0) + 1);
  }

  const modal = new Map<string, number>();
  for (const [pkg, inner] of counts) {
    const sorted = [...inner.entries()].sort(
      // 最頻 → 同数なら新しい (大きい) major を優先
      (a, b) => b[1] - a[1] || b[0] - a[0],
    );
    if (sorted.length > 0) modal.set(pkg, sorted[0][0]);
  }
  return modal;
}

interface ScoreBreakdown {
  updateCurrency: number;
  standardization: number;
  coverage: { have: number; total: number };
  alignment: { have: number; total: number };
  outdated: { framework: number; major: number; minor: number; patch: number };
  missing: string[]; // CORE_STACK で未使用だった package 名
  misaligned: { pkg: string; productMajor: number; modalMajor: number }[];
  finalScore: number;
}

function computeScore(
  product: ProductRow,
  productTech: TechStackRow[],
  productDeps: DependencyItemRow[],
  modalMajors: Map<string, number>,
): ScoreBreakdown {
  // ── 1) 更新性 ────────────────────────────────────────
  const outdated = { framework: 0, major: 0, minor: 0, patch: 0 };
  let updatePenalty = 0;
  for (const d of productDeps) {
    if (isResolved(d.state)) continue;
    const base = UPDATE_PENALTY[d.update_type] ?? 0;
    const mult = CRITICAL_FRAMEWORKS.has(d.package_name) ? 2 : 1;
    updatePenalty += base * mult;
    if (d.update_type in outdated) {
      outdated[d.update_type as keyof typeof outdated]++;
    }
  }
  const updateCurrency = Math.max(0, Math.min(100, 100 - updatePenalty));

  // ── 2) 共通化 ────────────────────────────────────────
  const exempt = STACK_EXEMPT_BY_PRODUCT[product.name] ?? new Set<string>();
  const presentVersions = new Map<string, string | null>();
  for (const row of productTech) {
    if (CORE_STACK[row.package_name] && !row.is_dev) {
      // dependencies > peerDependencies > devDependencies で既にマージ済み(github-data.ts)
      presentVersions.set(row.package_name, row.version);
    } else if (CORE_STACK[row.package_name] && row.is_dev) {
      // dev だけにあるケース (typescript / eslint / prettier)。dev 用 stack も
      // coverage に含める。
      if (!presentVersions.has(row.package_name)) {
        presentVersions.set(row.package_name, row.version);
      }
    }
  }

  const coverage = { have: 0, total: 0 };
  const alignment = { have: 0, total: 0 };
  const missing: string[] = [];
  const misaligned: ScoreBreakdown["misaligned"] = [];

  for (const [pkg, weight] of Object.entries(CORE_STACK)) {
    if (exempt.has(pkg)) continue;
    coverage.total += weight;
    const v = presentVersions.get(pkg);
    if (v == null) {
      missing.push(pkg);
      continue;
    }
    coverage.have += weight;

    const modal = modalMajors.get(pkg);
    if (modal == null) continue;
    alignment.total += weight;
    const productMajor = majorOf(v);
    if (productMajor == null) continue;
    if (productMajor === modal) {
      alignment.have += weight;
    } else {
      misaligned.push({ pkg, productMajor, modalMajor: modal });
    }
  }

  const coverageRatio = coverage.total > 0 ? coverage.have / coverage.total : 1;
  const alignmentRatio =
    alignment.total > 0 ? alignment.have / alignment.total : 1;
  const standardization = Math.round(coverageRatio * 50 + alignmentRatio * 50);

  const finalScore = Math.round(0.5 * updateCurrency + 0.5 * standardization);

  return {
    updateCurrency,
    standardization,
    coverage,
    alignment,
    outdated,
    missing,
    misaligned,
    finalScore,
  };
}

// ── DB load ─────────────────────────────────────────────

async function loadAll() {
  const [{ data: products }, { data: techStack }, { data: depItems }] =
    await Promise.all([
      supabase
        .schema("metago")
        .from("products")
        .select("id, name, display_name"),
      supabase
        .schema("metago")
        .from("tech_stack_items")
        .select("product_id, package_name, version, is_dev"),
      supabase
        .schema("metago")
        .from("dependency_items")
        .select("product_id, package_name, update_type, state"),
    ]);

  return {
    products: (products ?? []) as ProductRow[],
    techStack: (techStack ?? []) as TechStackRow[],
    depItems: (depItems ?? []) as DependencyItemRow[],
  };
}

// ── per-product 処理 ─────────────────────────────────────

async function scoreProduct(
  product: ProductRow,
  productTech: TechStackRow[],
  productDeps: DependencyItemRow[],
  modalMajors: Map<string, number>,
) {
  console.log(`\n📦 [SCAN] dependencies: ${product.display_name}`);
  const scanStartedAt = new Date();

  const breakdown = computeScore(
    product,
    productTech,
    productDeps,
    modalMajors,
  );

  // 共通化違反を quality_items に可視化 (category='dependency-standardization')
  // — ダッシュボード/issue trend と統合される。dependency_items は
  // outdated package を扱うため、共通化違反は別カテゴリで扱う。
  for (const pkg of breakdown.missing) {
    await upsertItem(supabase, "quality_items", {
      product_id: product.id,
      category: "dependency-standardization",
      title: `共通スタック未使用: ${pkg}`,
      description: `goseries 推奨スタック '${pkg}' が package.json に含まれていません。共通化観点で導入を検討してください。`,
      level: "L2",
    });
  }
  for (const m of breakdown.misaligned) {
    await upsertItem(supabase, "quality_items", {
      product_id: product.id,
      category: "dependency-standardization",
      title: `major バージョン乖離: ${m.pkg}`,
      description: `'${m.pkg}' の major version が ${m.productMajor} ですが、goseries 全体の最頻は ${m.modalMajor} です。揃えることで運用コストを下げられます。`,
      level: "L1",
    });
  }

  await saveScore(supabase, product.id, "dependencies", breakdown.finalScore);

  const resolved = await markStaleItemsResolved(
    supabase,
    "quality_items",
    product.id,
    scanStartedAt,
    ["dependency-standardization"],
  );

  console.log(
    `  ✓ score: ${breakdown.finalScore} ` +
      `(update=${breakdown.updateCurrency}, std=${breakdown.standardization}) ` +
      `outdated[fw=${breakdown.outdated.framework} maj=${breakdown.outdated.major} min=${breakdown.outdated.minor} pat=${breakdown.outdated.patch}] ` +
      `coverage=${breakdown.coverage.have}/${breakdown.coverage.total} ` +
      `alignment=${breakdown.alignment.have}/${breakdown.alignment.total}` +
      (resolved > 0 ? ` (${resolved} std issues resolved)` : ""),
  );
}

// ── main ────────────────────────────────────────────────

async function main() {
  console.log("🚀 [SCAN] dependencies (更新性 + 共通化)");

  const { products, techStack, depItems } = await loadAll();
  if (!products.length) {
    console.log("  products 未登録、スキップ");
    return;
  }

  const productById = new Map<string, ProductRow>();
  for (const p of products) productById.set(p.id, p);

  const modalMajors = computeModalMajors(techStack, productById);
  if (modalMajors.size > 0) {
    const summary = [...modalMajors.entries()]
      .map(([pkg, m]) => `${pkg}=v${m}`)
      .join(", ");
    console.log(`  modal majors: ${summary}`);
  } else {
    console.log("  modal majors: (tech_stack_items 未収集)");
  }

  const targetRepo = process.env.TARGET_REPO;
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null;

  const techByProduct = new Map<string, TechStackRow[]>();
  for (const row of techStack) {
    if (!techByProduct.has(row.product_id))
      techByProduct.set(row.product_id, []);
    techByProduct.get(row.product_id)!.push(row);
  }
  const depsByProduct = new Map<string, DependencyItemRow[]>();
  for (const row of depItems) {
    if (!depsByProduct.has(row.product_id))
      depsByProduct.set(row.product_id, []);
    depsByProduct.get(row.product_id)!.push(row);
  }

  for (const product of products) {
    if (SKIP_PRODUCTS.has(product.name)) continue;
    if (targetSlug && product.name !== targetSlug) continue;
    // GO_REPOS にマッピングがあるプロダクトだけ評価対象 (seed の整合性確保)
    if (!GO_REPOS[product.name]) continue;

    try {
      await scoreProduct(
        product,
        techByProduct.get(product.id) ?? [],
        depsByProduct.get(product.id) ?? [],
        modalMajors,
      );
    } catch (e) {
      console.error(`  ❌ Failed: ${product.name}`, e);
      await supabase
        .schema("metago")
        .from("execution_logs")
        .insert({
          product_id: product.id,
          category: "dependencies-scan",
          title: `dependencies scan失敗: ${product.name}`,
          description: String(e).slice(0, 500),
          state: "failed",
        });
    }
  }

  console.log("\n✅ [SCAN] dependencies complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
