/**
 * Delivery 6 メニュー (Code Quality / Security / Dependencies / Design System /
 * Performance / Deployments) で共通に表示する issue 統計の計算ヘルパ。
 *
 * 各ページの上部 banner で「未対応 N (+Δ7d) / 解決 N (+Δ7d)」を一貫して表示
 * するために使う。
 */
import { isResolved } from "./items";

export interface MenuStats {
  /** 現在の未解決 issue 数 (state が fixed/done 以外) */
  open: number;
  /** 累計の解決済み issue 数 */
  resolved: number;
  /** 直近 7 日に新規検知された数 (open の delta) */
  newLast7d: number;
  /** 直近 7 日に解決された数 (resolved の delta) */
  resolvedLast7d: number;
}

interface SummarizableRow {
  state: string | null;
  created_at: string;
  resolved_at: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function summarize<T extends SummarizableRow>(rows: T[]): MenuStats {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
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

/**
 * execution_logs を items の state machine に揃えてから summarize する用の変換。
 *   merged           → fixed (resolved 扱い)
 *   それ以外          → new   (open 扱い)
 * resolved_at 列は無いので merged 行は created_at を流用する。
 */
export function execLogToSummarizable(
  rows: {
    state: string;
    created_at: string;
  }[],
): SummarizableRow[] {
  return rows.map((r) => ({
    state: r.state === "merged" ? "fixed" : "new",
    created_at: r.created_at,
    resolved_at: r.state === "merged" ? r.created_at : null,
  }));
}
