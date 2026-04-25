import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { PerformanceTable } from "@/components/performance/performance-table";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { Gauge } from "lucide-react";

const TREND_DAYS = 30;

export default async function PerformancePage() {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const trendSince = new Date(
    Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: metrics },
    { data: weekAgoMetrics },
    { data: products },
    { data: trendMetrics },
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
      .gte("measured_at", trendSince)
      .order("measured_at", { ascending: true }),
  ]);

  const allProducts = products ?? [];
  // Performance は measured_at だが buildTrend は collected_at 前提なので変換
  const trendRows = (trendMetrics ?? []).map((r) => ({
    product_id: r.product_id,
    score: r.score,
    collected_at: r.measured_at,
  }));
  const trendSeries = allProducts.map((p) => ({
    id: p.id,
    name: p.display_name,
    color: p.primary_color || "#6B7280",
  }));
  const trendData = buildTrend(
    trendRows,
    allProducts.map((p) => p.id),
    TREND_DAYS,
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

  const avgScore =
    latest.length > 0
      ? Math.round(
          latest.reduce((a: number, b) => a + ((b as any).score ?? 0), 0) /
            latest.length,
        )
      : null;

  return (
    <>
      <PageHeader
        title="パフォーマンス"
        description="Core Web Vitals とバンドルサイズの測定結果"
      />

      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 w-fit">
        <ScoreDonut score={avgScore} size={72} />
        <div>
          <div className="text-2xl font-semibold text-foreground">
            {avgScore ?? "—"}
          </div>
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            全go平均スコア
          </div>
        </div>
      </div>

      {allProducts.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">
              スコア推移
            </span>
            <span className="text-xs text-muted-foreground">
              直近 {TREND_DAYS} 日 / プロダクト別
            </span>
          </div>
          <MultiProductTrendChart data={trendData} products={trendSeries} />
        </div>
      )}

      {latest.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <PerformanceTable metrics={latest as any[]} deltas={deltas} />
      )}
    </>
  );
}
