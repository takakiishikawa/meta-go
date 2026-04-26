/**
 * performance SCAN
 *
 * Lighthouse でURLを計測 → metrics保存 + score保存 + 違反item UPSERT
 * 修正PRは作らない（fix-cron に委譲）
 *
 * 環境変数:
 *   TARGET_REPO  — 対象リポジトリ名
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  GO_REPOS,
  REPO_TO_SLUG,
  getSupabase,
  saveScore,
  upsertItem,
  markStaleItemsResolved,
} from "../../lib/metago/items";

const supabase = getSupabase();

const THRESHOLDS = {
  lcp: 2500,
  fid: 100,
  cls: 0.1,
  score: 70,
};

function findChrome(): string {
  const candidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium-browser",
    "chromium",
  ];
  for (const bin of candidates) {
    try {
      execSync(`which ${bin}`, { stdio: "pipe" });
      return bin;
    } catch {}
  }
  return "google-chrome";
}

function runLighthouse(
  url: string,
): { score: number; lcp: number; fid: number; cls: number } | null {
  const reportPath = path.join(os.tmpdir(), `lh-${Date.now()}.json`);
  const chrome = findChrome();
  try {
    execSync(
      [
        `npx lighthouse "${url}"`,
        `--output=json`,
        `--output-path="${reportPath}"`,
        `--chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage"`,
        `--chrome-path=$(which ${chrome} 2>/dev/null || echo "google-chrome")`,
        `--only-categories=performance`,
        `--quiet`,
      ].join(" "),
      { stdio: "pipe", timeout: 120_000 },
    );
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    const perfScore = report.categories?.performance?.score;
    if (perfScore == null) {
      console.warn(`  Lighthouse: performanceスコア取得不可`);
      return null;
    }
    return {
      score: Math.round(perfScore * 100),
      lcp: Math.round(
        report.audits?.["largest-contentful-paint"]?.numericValue ?? 0,
      ),
      fid: Math.round(
        report.audits?.["total-blocking-time"]?.numericValue ?? 0,
      ),
      cls: parseFloat(
        (report.audits?.["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(
          3,
        ),
      ),
    };
  } catch (e: any) {
    console.warn(
      `  Lighthouse failed for ${url}:`,
      e.stderr?.toString().slice(0, 200),
    );
    return null;
  } finally {
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  }
}

async function scanProduct(product: any) {
  const url = product.vercel_url;
  if (!url) {
    console.log(`  ${product.display_name}: vercel_url 未設定、スキップ`);
    return;
  }

  console.log(`\n⚡ [SCAN] performance: ${product.display_name} → ${url}`);

  const scanStartedAt = new Date();
  const metrics = runLighthouse(url);
  if (!metrics) {
    console.log(`  計測不能、スキップ`);
    return;
  }

  console.log(
    `  score: ${metrics.score}, LCP: ${metrics.lcp}ms, TBT: ${metrics.fid}ms, CLS: ${metrics.cls}`,
  );

  await supabase.schema("metago").from("performance_metrics").insert({
    product_id: product.id,
    lcp: metrics.lcp,
    fid: metrics.fid,
    cls: metrics.cls,
    score: metrics.score,
  });

  await saveScore(supabase, product.id, "performance", metrics.score);

  const issues: string[] = [];
  if (metrics.lcp > THRESHOLDS.lcp)
    issues.push(`LCP ${metrics.lcp}ms > ${THRESHOLDS.lcp}ms`);
  if (metrics.fid > THRESHOLDS.fid)
    issues.push(`TBT ${metrics.fid}ms > ${THRESHOLDS.fid}ms`);
  if (metrics.cls > THRESHOLDS.cls)
    issues.push(`CLS ${metrics.cls} > ${THRESHOLDS.cls}`);
  if (metrics.score < THRESHOLDS.score)
    issues.push(`score ${metrics.score} < ${THRESHOLDS.score}`);

  for (const issue of issues) {
    await upsertItem(supabase, "quality_items", {
      product_id: product.id,
      category: "Performance",
      title: `パフォーマンス: ${issue}`,
      description: `Lighthouse計測結果: ${issue}`,
      level: "L1",
    });
  }

  const resolved = await markStaleItemsResolved(
    supabase,
    "quality_items",
    product.id,
    scanStartedAt,
    ["Performance"],
  );

  console.log(
    `  ${issues.length} issues found${resolved > 0 ? `, ${resolved} resolved` : ""}`,
  );
}

// designsystem は public な showcase のみで計測ターゲットが薄い。
// metago は login wall 内なので Lighthouse がランディング相当しか取れず数値が
// 全社プロダクトと比較不能なので除外。
const SKIP_PRODUCTS = new Set(["designsystem", "metago"]);

async function main() {
  console.log("🚀 [SCAN] performance (Lighthouse)");

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
    await scanProduct(product);
  }

  console.log("\n✅ [SCAN] performance complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
