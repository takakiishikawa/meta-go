import { createClient } from "@/lib/supabase/server";
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { Pagination } from "@/components/ui/pagination";
import { ScoreDelta } from "@/components/score/score-delta";
import { MultiProductTrendChart } from "@/components/charts/multi-product-trend";
import { buildTrend } from "@/lib/metago/score-trend";
import { isResolved } from "@/lib/metago/items";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";
import { Code2 } from "lucide-react";

const PAGE_SIZE = 20;

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
};

const STATE_LABELS: Record<string, string> = {
  new: "未対応",
  fixing: "修正中",
  fixed: "完了",
  failed: "失敗",
  done: "完了",
};

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

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
      .from("quality_items")
      .select(`*, products(name, display_name, primary_color)`)
      .not("category", "in", '("Performance","パフォーマンス")')
      .order("created_at", { ascending: false })
      // PostgREST のデフォルト上限 1000 を明示的に超える値で指定。指定しないと
      // 古い 'fixed' / 'failed' 行が ORDER 末尾で切り落とされて UI に出ない。
      .limit(10000),
    supabase
      .schema("metago")
      .from("scores_history")
      .select(
        `product_id, score, collected_at, products(name, display_name, primary_color)`,
      )
      .eq("category", "quality")
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
      .eq("category", "quality")
      .lte("collected_at", sevenDaysAgo)
      .order("collected_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("scores_history")
      .select("product_id, score, collected_at")
      .eq("category", "quality")
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
    if (item.state === "new") {
      openCount[item.product_id] = (openCount[item.product_id] ?? 0) + 1;
    } else if (isResolved(item.state)) {
      doneCount[item.product_id] = (doneCount[item.product_id] ?? 0) + 1;
    }
    // 'fixing' / 'failed' はどちらにも数えない (中途状態 / 試行失敗は別バケツ)
  }

  const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
  const pagedItems = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        title="コード品質"
        description="goシリーズ全体のコード品質スコアと問題点一覧"
      />

      <IssueTrendSection items={allItems} />

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
                {["プロダクト", "スコア", "未対応", "解決済み"].map(
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
                const score = latestScore[product.id] ?? null;
                const prev = weekAgoScore[product.id] ?? null;
                const delta =
                  score !== null && prev !== null ? score - prev : null;
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
          icon={<Code2 className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-foreground">
            問題一覧{" "}
            <span
              style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}
            >
              ({allItems.length}件)
            </span>
          </span>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  {["プロダクト", "カテゴリ", "内容", "状態"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-surface-subtle"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              item.products?.primary_color || "#6B7280",
                          }}
                        />
                        <span className="text-sm text-foreground whitespace-nowrap">
                          {item.products?.display_name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{item.category}</Badge>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-sm font-medium text-foreground">
                        {item.title}
                      </div>
                      {item.description && (
                        <div
                          className="text-xs mt-0.5 line-clamp-2"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={isResolved(item.state) ? "default" : "outline"}
                      >
                        {STATE_LABELS[item.state] ?? item.state}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} basePath="/quality" />
        </div>
      )}
    </>
  );
}
