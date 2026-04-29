import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { PerformanceTable } from "@/components/performance/performance-table";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";
import { Gauge } from "lucide-react";

export default async function PerformancePage() {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: metrics },
    { data: weekAgoMetrics },
    { data: products },
    { data: trendMetrics },
    { data: perfIssueRows },
  ] = await Promise.all([
    supabase
      .schema("metago")
      .from("performance_metrics")
      .select(`*, products(name, display_name, primary_color)`)
      .order("measured_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("performance_metrics")
      .select("product_id, score")
      .lte("measured_at", sevenDaysAgo)
      .order("measured_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("products")
      .select("id, name, display_name, primary_color")
      .order("priority"),
    supabase
      .schema("metago")
      .from("performance_metrics")
      .select("product_id, score, measured_at")
      .order("measured_at", { ascending: true }),
    // Performance issue 集計用 — quality_items の category=Performance 行を読む
    supabase
      .schema("metago")
      .from("quality_items")
      .select("state, created_at, resolved_at")
      .in("category", ["Performance", "パフォーマンス"])
      .limit(10000),
  ]);

  const allProducts = products ?? [];
  // 計測対象外プロダクト (DS本体は public showcase のみで計測対象が薄い)
  const PERF_EXCLUDED = new Set(["designsystem"]);
  // Performance は measured_at だが buildTrend は collected_at 前提なので変換
  const trendRows = (trendMetrics ?? []).map((r) => ({
    product_id: r.product_id,
    score: r.score,
    collected_at: r.measured_at,
  }));
  const trendSeries = allProducts
    .filter((p) => !PERF_EXCLUDED.has(p.name))
    .map((p) => ({
      id: p.id,
      name: p.display_name,
      color: p.primary_color || "#6B7280",
    }));
  const trendData = buildTrend(
    trendRows,
    trendSeries.map((p) => p.id),
  );

  const allMetrics = metrics ?? [];
  const latestPerProduct = allMetrics.reduce(
    (acc, m) => {
      const key = m.product_id;
      if (!acc[key]) acc[key] = m;
      return acc;
    },
    {} as Record<string, (typeof allMetrics)[0]>,
  );
  const latest = Object.values(latestPerProduct) as (typeof allMetrics)[0][];

  const weekAgoScore: Record<string, number> = {};
  for (const m of weekAgoMetrics ?? []) {
    if (!(m.product_id in weekAgoScore)) weekAgoScore[m.product_id] = m.score;
  }

  const deltas: Record<string, number | null> = {};
  for (const m of latest) {
    const prev = weekAgoScore[m.product_id] ?? null;
    deltas[m.product_id] =
      m.score !== null && prev !== null ? m.score - prev : null;
  }

  const exempt = allProducts
    .filter((p) => PERF_EXCLUDED.has(p.name))
    .map((p) => ({
      id: p.id,
      name: p.name,
      display_name: p.display_name,
      primary_color: p.primary_color,
      reason: "デザインシステム本体",
    }));

  return (
    <>
      <PageHeader
        title="パフォーマンス"
        description="Core Web Vitals とバンドルサイズの測定結果"
      />

      <IssueTrendSection items={perfIssueRows ?? []} />

      {allProducts.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">
              スコア推移
            </span>
            <span className="text-xs text-muted-foreground">
              全期間 / プロダクト別 ({trendData.length}日分)
            </span>
          </div>
          <MultiProductTrendChart
            data={trendData}
            products={trendSeries}
            height={520}
          />
        </div>
      )}

      {latest.length === 0 && exempt.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <PerformanceTable
          metrics={latest as any[]}
          deltas={deltas}
          exempt={exempt}
        />
      )}
    </>
  );
}
