import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { ShieldAlert } from "lucide-react";
import { SecurityVulnerabilityTable } from "@/components/security/security-vulnerability-table";
import { SeverityCell } from "@/components/security/severity-cell";
import { ScoreDelta } from "@/components/score/score-delta";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export default async function SecurityPage() {
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
      .from("security_items")
      .select(`*, products(name, display_name, primary_color)`)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase
      .schema("metago")
      .from("scores_history")
      .select(`product_id, score, collected_at`)
      .eq("category", "security")
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
      .eq("category", "security")
      .lte("collected_at", sevenDaysAgo)
      .order("collected_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("scores_history")
      .select("product_id, score, collected_at")
      .eq("category", "security")
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

  const sevCount: Record<string, Record<string, number>> = {};
  for (const item of allItems) {
    if (!sevCount[item.product_id]) sevCount[item.product_id] = {};
    sevCount[item.product_id][item.severity] =
      (sevCount[item.product_id][item.severity] ?? 0) + 1;
  }

  const itemsByProduct: Record<string, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsByProduct[item.product_id]) itemsByProduct[item.product_id] = [];
    itemsByProduct[item.product_id].push(item);
  }

  const trendSeries = allProducts.map((p) => ({
    id: p.id,
    name: p.display_name,
    color: p.primary_color || GO_COLORS[p.name] || "#6B7280",
  }));
  const trendData = buildTrend(
    trendScores ?? [],
    allProducts.map((p) => p.id),
  );

  return (
    <>
      <PageHeader
        title="セキュリティ"
        description="脆弱性と依存関係のセキュリティ問題"
      />

      <IssueTrendSection items={allItems} noun="脆弱性" />

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

      {allProducts.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-subtle">
            <span className="text-sm font-semibold text-foreground">
              プロダクト別スコア
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {[
                  "プロダクト",
                  "スコア",
                  "Critical",
                  "High",
                  "Medium",
                  "Low",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allProducts.map((product) => {
                const color =
                  product.primary_color || GO_COLORS[product.name] || "#6B7280";
                const score = latestScore[product.id] ?? null;
                const prev = weekAgoScore[product.id] ?? null;
                const delta =
                  score !== null && prev !== null ? score - prev : null;
                const sev = sevCount[product.id] ?? {};
                const productItems = itemsByProduct[product.id] ?? [];
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
                    {SEVERITY_ORDER.map((sev_key) => (
                      <td key={sev_key} className="px-4 py-3">
                        <SeverityCell
                          items={productItems.map((i) => ({
                            id: i.id,
                            title: i.title,
                            description: i.description ?? null,
                            severity: i.severity,
                            state: i.state,
                          }))}
                          severity={sev_key}
                          productName={product.display_name}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {allItems.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-foreground">
            脆弱性一覧{" "}
            <span
              style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}
            >
              ({allItems.length}件)
            </span>
          </span>
          <SecurityVulnerabilityTable items={allItems} />
        </div>
      )}
    </>
  );
}
