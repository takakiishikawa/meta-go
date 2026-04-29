/**
 * Delivery 6 メニュー (Code Quality / Security / Dependencies / Design System /
 * Performance / Deployments) の issue 推移グラフ用データ整形ヘルパ。
 */

interface SummarizableRow {
  state: string | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * execution_logs を items の state machine に揃える変換。
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
