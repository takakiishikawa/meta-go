/**
 * Sidebar の Delivery 6 メニューに表示する issue 統計を取得する。
 *
 * 6 メニュー:
 *   /quality       — quality_items (category != Performance/パフォーマンス)
 *   /security      — security_items
 *   /dependency    — dependency_items
 *   /design-system — design_system_items
 *   /performance   — quality_items (category = Performance/パフォーマンス)
 *   /deployments   — execution_logs (category = deploy-fix)
 *
 * 各メニューで以下を返す:
 *   open            : 現在の未解決 issue 数 (state が fixed/done/merged 以外)
 *   resolved        : 累計の解決済み issue 数
 *   newLast7d       : 直近 7 日に検知/発生した issue 数 (delta of open)
 *   resolvedLast7d  : 直近 7 日に解決した issue 数 (delta of resolved)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isResolved } from "./items";

export interface MenuStats {
  open: number;
  resolved: number;
  newLast7d: number;
  resolvedLast7d: number;
}

export type DeliveryHref =
  | "/quality"
  | "/security"
  | "/dependency"
  | "/design-system"
  | "/performance"
  | "/deployments";

export type DeliveryStats = Record<DeliveryHref, MenuStats>;

const PERF_CATEGORIES = ["Performance", "パフォーマンス"] as const;

interface ItemRow {
  state: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface CategorizedRow extends ItemRow {
  category: string;
}

function summarize(rows: ItemRow[], sevenDaysAgo: string): MenuStats {
  let open = 0;
  let resolved = 0;
  let newLast7d = 0;
  let resolvedLast7d = 0;
  for (const r of rows) {
    if (isResolved(r.state)) {
      resolved++;
      if (r.resolved_at && r.resolved_at >= sevenDaysAgo) resolvedLast7d++;
    } else {
      open++;
      if (r.created_at >= sevenDaysAgo) newLast7d++;
    }
  }
  return { open, resolved, newLast7d, resolvedLast7d };
}

export async function fetchDeliveryStats(
  supabase: SupabaseClient,
): Promise<DeliveryStats> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // execution_logs (deploy-fix) は state の意味が items と異なる:
  //   merged          → 解決済み
  //   failed/abandoned → 未解決 (人間 escalate 待ち含む)
  // また resolved_at 列は無いので created_at で 7d delta を判定する。
  const [
    qRes,
    sRes,
    dRes,
    dsRes,
    deployRes,
  ] = await Promise.all([
    supabase
      .schema("metago")
      .from("quality_items")
      .select("state, category, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("security_items")
      .select("state, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("dependency_items")
      .select("state, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("design_system_items")
      .select("state, created_at, resolved_at")
      .limit(10000),
    supabase
      .schema("metago")
      .from("execution_logs")
      .select("state, created_at")
      .eq("category", "deploy-fix")
      .limit(10000),
  ]);

  const qualityRows = (qRes.data ?? []) as CategorizedRow[];
  const qualityNonPerf = qualityRows.filter(
    (r) => !PERF_CATEGORIES.includes(r.category as (typeof PERF_CATEGORIES)[number]),
  );
  const qualityPerf = qualityRows.filter((r) =>
    PERF_CATEGORIES.includes(r.category as (typeof PERF_CATEGORIES)[number]),
  );

  // Deployments: state を items の state machine にマップして summarize に流す
  const deployRows = ((deployRes.data ?? []) as { state: string; created_at: string }[]).map(
    (r) => ({
      // merged → fixed (resolved 扱い), それ以外は new (open 扱い)
      state: r.state === "merged" ? "fixed" : "new",
      created_at: r.created_at,
      // execution_logs に resolved_at は無いので、merged 行は created_at を流用
      resolved_at: r.state === "merged" ? r.created_at : null,
    }),
  );

  return {
    "/quality": summarize(qualityNonPerf, sevenDaysAgo),
    "/security": summarize((sRes.data ?? []) as ItemRow[], sevenDaysAgo),
    "/dependency": summarize((dRes.data ?? []) as ItemRow[], sevenDaysAgo),
    "/design-system": summarize((dsRes.data ?? []) as ItemRow[], sevenDaysAgo),
    "/performance": summarize(qualityPerf, sevenDaysAgo),
    "/deployments": summarize(deployRows, sevenDaysAgo),
  };
}
