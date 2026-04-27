import { createClient } from "@/lib/supabase/server";
import { DashboardClient, type TrendByProduct } from "./dashboard-client";
import { isResolved } from "@/lib/metago/items";

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

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
      .select("id, state, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("security_items")
      .select("id, state, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("design_system_items")
      .select("id, state, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("dependency_items")
      .select("id, state, created_at, resolved_at")
      .limit(10000),
  ]);

  const allScores = scoresHistory ?? [];

  // 各カテゴリの最新値・1週間前の値を product 単位で計算
  type Cat = "quality" | "security" | "design_system" | "performance";
  const CATS: Cat[] = ["quality", "security", "design_system", "performance"];
  const latestByPC = new Map<string, number>(); // `${product_id}|${cat}`
  const weekAgoByPC = new Map<string, number>();

  for (const row of allScores) {
    const k = `${row.product_id}|${row.category}`;
    // ascending order なので末尾が最新
    latestByPC.set(k, row.score);
    if (row.collected_at <= sevenDaysAgo) {
      weekAgoByPC.set(k, row.score);
    }
  }

  // 過去30日のトレンド: product_id × date(YYYY-MM-DD) → カテゴリ毎に最新値
  const trendByProduct: TrendByProduct = {};
  for (const row of allScores) {
    const date = row.collected_at.slice(0, 10);
    if (!trendByProduct[row.product_id]) trendByProduct[row.product_id] = {};
    if (!trendByProduct[row.product_id][date])
      trendByProduct[row.product_id][date] = {};
    // 同日複数あれば最後のものが残る (ascending order)
    trendByProduct[row.product_id][date][row.category as Cat] = row.score;
  }

  // 全アイテム合算
  const allDetectionItems = [
    ...(qualityItems ?? []),
    ...(securityItems ?? []),
    ...(designItems ?? []),
    ...(depItems ?? []),
  ];
  const detectedLast7Days = allDetectionItems.filter(
    (i) => i.created_at >= sevenDaysAgo,
  ).length;
  const openIssues = allDetectionItems.filter(
    (i) => !isResolved(i.state),
  ).length;
  // PR 単位ではなく **issue (item) 単位** で集計する。1 PR で複数 item を解決する
  // ことがあり、PR 数で語ると検知/未解決の単位と齟齬が出る。
  const resolvedLast7Days = allDetectionItems.filter(
    (i) =>
      isResolved(i.state) && i.resolved_at && i.resolved_at >= sevenDaysAgo,
  ).length;

  return (
    <DashboardClient
      products={products ?? []}
      pendingApprovals={pendingApprovals ?? []}
      latestByPC={Object.fromEntries(latestByPC)}
      weekAgoByPC={Object.fromEntries(weekAgoByPC)}
      trendByProduct={trendByProduct}
      kpi={{
        resolvedLast7Days,
        detectedLast7Days,
        openIssues,
      }}
    />
  );
}
