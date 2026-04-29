import { createClient } from "@/lib/supabase/server";
import { DashboardClient, type TrendByProduct } from "./dashboard-client";
import { isResolved } from "@/lib/metago/items";
import { fetchAllDeployments } from "@/lib/metago/github-deployments";
import type { LineCountsPoint } from "@/components/charts/line-counts-chart";

const ISSUE_TREND_DAYS = 7;
const DEPLOY_TREND_DAYS = 7;
const DEPLOY_WINDOW_HOURS = DEPLOY_TREND_DAYS * 24;
const TZ = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * DAY_MS).toISOString();
  const trendStartMs = now - ISSUE_TREND_DAYS * DAY_MS;

  const [
    { data: products },
    { data: scoresHistory },
    { data: pendingApprovals },
    { data: qualityItems },
    { data: securityItems },
    { data: designItems },
    { data: depItems },
  ] = await Promise.all([
    supabase.schema("metago").from("products").select("*").order("priority"),
    supabase
      .schema("metago")
      .from("scores_history")
      .select("product_id, category, score, collected_at")
      .order("collected_at", { ascending: true }),
    supabase
      .schema("metago")
      .from("approval_queue")
      .select("*")
      .eq("state", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("quality_items")
      .select("id, state, created_at, resolved_at, pr_url")
      .limit(10000),
    supabase
      .schema("metago")
      .from("security_items")
      .select("id, state, created_at, resolved_at, pr_url")
      .limit(10000),
    supabase
      .schema("metago")
      .from("design_system_items")
      .select("id, state, created_at, resolved_at, pr_url")
      .limit(10000),
    supabase
      .schema("metago")
      .from("dependency_items")
      .select("id, state, created_at, resolved_at, pr_url")
      .limit(10000),
  ]);

  const allScores = scoresHistory ?? [];

  type Cat =
    | "quality"
    | "security"
    | "design_system"
    | "performance"
    | "dependencies";

  // 過去全期間のトレンド: product_id × date(YYYY-MM-DD) → カテゴリ毎に最新値
  const trendByProduct: TrendByProduct = {};
  for (const row of allScores) {
    const date = row.collected_at.slice(0, 10);
    if (!trendByProduct[row.product_id]) trendByProduct[row.product_id] = {};
    if (!trendByProduct[row.product_id][date])
      trendByProduct[row.product_id][date] = {};
    trendByProduct[row.product_id][date][row.category as Cat] = row.score;
  }

  const allDetectionItems = [
    ...(qualityItems ?? []),
    ...(securityItems ?? []),
    ...(designItems ?? []),
    ...(depItems ?? []),
  ];

  // 「本物の解決」= PR がマージされたもの (markItemFixed が pr_url を埋める)。
  // markStaleItemsResolved 経由の fixed (pr_url=NULL) は「scan が検出しなかった」
  // だけで実際にコードが直っているとは限らないため、KPI からは除外する。
  // (背景: 2026-04-26〜29 に Claude の出力ゆらぎで code-quality items が
  //  1153 件 stale 化し KPI が大幅に水増しされた。b958a8c で根治済み)
  const isReallyResolved = (i: { state: string; pr_url?: string | null }) =>
    isResolved(i.state) && !!i.pr_url;

  // 直近7日 / 前7日の検知・解決
  const detectedLast7Days = allDetectionItems.filter(
    (i) => i.created_at >= sevenDaysAgo,
  ).length;
  const detectedPrev7Days = allDetectionItems.filter(
    (i) => i.created_at >= fourteenDaysAgo && i.created_at < sevenDaysAgo,
  ).length;
  const resolvedLast7Days = allDetectionItems.filter(
    (i) =>
      isReallyResolved(i) && i.resolved_at && i.resolved_at >= sevenDaysAgo,
  ).length;
  const resolvedPrev7Days = allDetectionItems.filter(
    (i) =>
      isReallyResolved(i) &&
      i.resolved_at &&
      i.resolved_at >= fourteenDaysAgo &&
      i.resolved_at < sevenDaysAgo,
  ).length;

  // 7日より古い items が 1 行も無い = 比較対象の履歴が存在しない。
  // この状態で「前週比 +N」と出すと、実態は「今週の合計」なのに増分のように
  // 見える嘘になるため、delta を null にして表示側で非表示にする。
  const hasHistoryBeforeWindow = allDetectionItems.some(
    (i) => i.created_at < sevenDaysAgo,
  );

  // 直近 7 日の日次 detected / resolved
  const fmtKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
  });
  const issueBuckets = new Map<
    string,
    { detected: number; resolved: number }
  >();
  const today = new Date();
  for (let i = ISSUE_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    issueBuckets.set(fmtKey.format(d), { detected: 0, resolved: 0 });
  }
  for (const item of allDetectionItems) {
    const createdMs = new Date(item.created_at).getTime();
    if (createdMs >= trendStartMs) {
      const k = fmtKey.format(new Date(item.created_at));
      const b = issueBuckets.get(k);
      if (b) b.detected++;
    }
    if (isReallyResolved(item) && item.resolved_at) {
      const resolvedMs = new Date(item.resolved_at).getTime();
      if (resolvedMs >= trendStartMs) {
        const k = fmtKey.format(new Date(item.resolved_at));
        const b = issueBuckets.get(k);
        if (b) b.resolved++;
      }
    }
  }
  const issueTrend: LineCountsPoint[] = [];
  for (let i = ISSUE_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const k = fmtKey.format(d);
    const v = issueBuckets.get(k) ?? { detected: 0, resolved: 0 };
    issueTrend.push({
      date: fmtLabel.format(d),
      detected: v.detected,
      resolved: v.resolved,
    });
  }

  // 直近 7 日の日次デプロイ成功 / 失敗
  const deployBuckets = new Map<string, { success: number; failure: number }>();
  for (let i = DEPLOY_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    deployBuckets.set(fmtKey.format(d), { success: 0, failure: 0 });
  }
  try {
    const deployRows = await fetchAllDeployments(
      products ?? [],
      DEPLOY_WINDOW_HOURS,
      DEPLOY_WINDOW_HOURS,
    );
    for (const r of deployRows) {
      const k = fmtKey.format(new Date(r.createdAt));
      const b = deployBuckets.get(k);
      if (!b) continue;
      if (r.state === "success") b.success++;
      else if (
        r.state === "failure" ||
        r.state === "error" ||
        r.state === "rate_limited"
      )
        b.failure++;
    }
  } catch (err) {
    console.error("[dashboard] fetchAllDeployments failed:", err);
  }
  const deployTrend: LineCountsPoint[] = [];
  for (let i = DEPLOY_TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const k = fmtKey.format(d);
    const v = deployBuckets.get(k) ?? { success: 0, failure: 0 };
    deployTrend.push({
      date: fmtLabel.format(d),
      success: v.success,
      failure: v.failure,
    });
  }

  return (
    <DashboardClient
      products={products ?? []}
      pendingApprovals={pendingApprovals ?? []}
      trendByProduct={trendByProduct}
      issueTrend={issueTrend}
      deployTrend={deployTrend}
      kpi={{
        resolvedLast7Days,
        resolvedDelta: hasHistoryBeforeWindow
          ? resolvedLast7Days - resolvedPrev7Days
          : null,
        detectedLast7Days,
        detectedDelta: hasHistoryBeforeWindow
          ? detectedLast7Days - detectedPrev7Days
          : null,
      }}
    />
  );
}
