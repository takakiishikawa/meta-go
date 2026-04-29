import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@takaki/go-design-system";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";
import { IssueList } from "@/components/delivery/issue-list";

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
  designsystem: "#7C3AED",
};

export default async function DesignSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  const supabase = await createClient();

  const [{ data: items }, { data: products }, { data: trendScores }] =
    await Promise.all([
      supabase
        .schema("metago")
        .from("design_system_items")
        .select(`*, products(name, display_name, primary_color)`)
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .schema("metago")
        .from("products")
        .select("id, name, display_name, primary_color")
        .order("priority"),
      supabase
        .schema("metago")
        .from("scores_history")
        .select("product_id, score, collected_at")
        .eq("category", "design_system")
        .order("collected_at", { ascending: true }),
    ]);

  const allItems = items ?? [];
  const allProducts = products ?? [];

  const trendSeries = allProducts.map((p) => ({
    id: p.id,
    name: p.display_name,
    color: p.primary_color || GO_COLORS[p.name] || "#6B7280",
  }));
  const trendData = buildTrend(
    trendScores ?? [],
    trendSeries.map((p) => p.id),
  );

  return (
    <>
      <PageHeader
        title="デザインシステム"
        description="go-design-system への準拠率と違反箇所"
      />

      <IssueTrendSection items={allItems} noun="違反" />

      {allProducts.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">
              準拠率推移
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
        noun="違反"
        page={page}
        basePath="/design-system"
      />
    </>
  );
}
