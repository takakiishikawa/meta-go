import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@takaki/go-design-system";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";
import { IssueList } from "@/components/delivery/issue-list";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  const supabase = await createClient();

  const [{ data: products }, { data: trendMetrics }, { data: perfItems }] =
    await Promise.all([
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
      supabase
        .schema("metago")
        .from("quality_items")
        .select(`*, products(name, display_name, primary_color)`)
        .in("category", ["Performance", "パフォーマンス"])
        .order("created_at", { ascending: false })
        .limit(10000),
    ]);

  const allProducts = products ?? [];
  const allItems = perfItems ?? [];

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
    trendSeries.map((p) => p.id),
  );

  return (
    <>
      <PageHeader
        title="パフォーマンス"
        description="Lighthouse による Core Web Vitals 計測結果"
      />

      <IssueTrendSection items={allItems} />

      {allProducts.length > 0 && (
        <Card className="p-4">
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
        </Card>
      )}

      <IssueList
        items={allItems}
        noun="問題"
        page={page}
        basePath="/performance"
      />
    </>
  );
}
