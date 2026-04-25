import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { ProductEvalButton } from "@/components/shared/product-eval-button";
import { ScoreDelta } from "@/components/score/score-delta";
import { DesignSystemViolationsTabs } from "@/components/design-system/violations-tabs";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { Palette } from "lucide-react";

// 計測対象外プロダクト (scanner 側 SKIP_PRODUCTS と同期)
const DS_EXCLUDED = new Set(["designsystem", "metago"]);

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
};

export default async function DesignSystemPage() {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: items },
    { data: scores },
    { data: products },
    { data: weekAgoScores },
    { data: trendScores },
  ] = await Promise.all([
    supabase
      .schema("metago")
      .from("design_system_items")
      .select(`*, products(name, display_name, primary_color)`)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("scores_history")
      .select(`product_id, score, collected_at`)
      .eq("category", "design_system")
      .order("collected_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("products")
      .select("id, name, display_name, primary_color")
      .order("priority"),
    supabase
      .schema("metago")
      .from("scores_history")
      .select("product_id, score")
      .eq("category", "design_system")
      .lte("collected_at", sevenDaysAgo)
      .order("collected_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("scores_history")
      .select("product_id, score, collected_at")
      .eq("category", "design_system")
      .order("collected_at", { ascending: true }),
  ]);

  const allItems = items ?? [];
  const allScores = scores ?? [];
  const allProducts = products ?? [];

  const latestScore: Record<string, number> = {};
  for (const s of allScores) {
    if (!(s.product_id in latestScore)) latestScore[s.product_id] = s.score;
  }

  const weekAgoScore: Record<string, number> = {};
  for (const s of weekAgoScores ?? []) {
    if (!(s.product_id in weekAgoScore)) weekAgoScore[s.product_id] = s.score;
  }

  const openCount: Record<string, number> = {};
  const doneCount: Record<string, number> = {};
  for (const item of allItems) {
    if (item.state === "new")
      openCount[item.product_id] = (openCount[item.product_id] ?? 0) + 1;
    else doneCount[item.product_id] = (doneCount[item.product_id] ?? 0) + 1;
  }

  const itemsByProduct: Record<string, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsByProduct[item.product_id]) itemsByProduct[item.product_id] = [];
    itemsByProduct[item.product_id].push(item);
  }

  const scoreValues = Object.values(latestScore);
  const avgScore =
    scoreValues.length > 0
      ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
      : null;

  const openItems = allItems.filter((i) => i.state !== "done");

  const byCategory: Record<string, number> = {};
  for (const item of allItems) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const trendSeries = allProducts
    .filter((p) => !DS_EXCLUDED.has(p.name))
    .map((p) => ({
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
        description="go-design-system準拠率と違反一覧"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
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
              全go平均準拠率
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-semibold text-foreground">
            {openItems.length}
          </div>
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            未修正の違反
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground mb-2">
            違反カテゴリ Top
          </div>
          {topCategories.length === 0 ? (
            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
              }}
            >
              —
            </span>
          ) : (
            <div className="flex flex-col gap-1">
              {topCategories.map(([cat, count]) => (
                <div
                  key={cat}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {cat}
                  </span>
                  <span className="text-xs font-semibold text-foreground shrink-0">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {allProducts.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">
              準拠率推移
            </span>
            <span className="text-xs text-muted-foreground">
              全期間 / プロダクト別 ({trendData.length}日分)
            </span>
          </div>
          <MultiProductTrendChart data={trendData} products={trendSeries} />
        </div>
      )}

      {allProducts.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-subtle">
            <span className="text-sm font-semibold text-foreground">
              プロダクト別準拠率
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["プロダクト", "スコア", "評価", "未修正", "修正済み"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {allProducts.map((product) => {
                const color =
                  product.primary_color || GO_COLORS[product.name] || "#6B7280";
                const isExempt = DS_EXCLUDED.has(product.name);
                const score = latestScore[product.id] ?? null;
                const prev = weekAgoScore[product.id] ?? null;
                const delta =
                  score !== null && prev !== null ? score - prev : null;
                const productItems = itemsByProduct[product.id] ?? [];

                if (isExempt) {
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-border last:border-0 bg-muted/20"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm text-foreground">
                            {product.display_name}
                          </span>
                        </div>
                      </td>
                      <td colSpan={4} className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          title={
                            product.name === "metago" ? "管理アプリ" : "DS本体"
                          }
                        >
                          計測対象外 —{" "}
                          {product.name === "metago" ? "管理アプリ" : "DS本体"}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={product.id}
                    className="border-b border-border last:border-0 hover:bg-surface-subtle"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-foreground">
                          {product.display_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ScoreDonut score={score} size={36} color={color} />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">
                            {score ?? "—"}
                          </span>
                          <ScoreDelta delta={delta} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ProductEvalButton
                        items={productItems}
                        score={score}
                        productName={product.display_name}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">
                        {openCount[product.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-sm"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {doneCount[product.id] ?? 0}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {allItems.length === 0 ? (
        <EmptyState
          icon={<Palette className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <DesignSystemViolationsTabs items={allItems} />
      )}
    </>
  );
}
