/**
 * Retention 用バッチ: scores_history の古い行を削除する。
 * 既存の metago.cleanup_old_scores(retention_days) RPC を呼び出すだけ。
 *
 * 環境変数:
 *   SCORES_RETENTION_DAYS — 削除閾値 (default 90)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RETENTION_DAYS = Number(process.env.SCORES_RETENTION_DAYS ?? 90);

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase
    .schema("metago")
    .rpc("cleanup_old_scores", { retention_days: RETENTION_DAYS });

  if (error) {
    console.error("cleanup_old_scores failed:", error);
    process.exit(1);
  }
  console.log(`✓ Deleted ${data ?? 0} rows older than ${RETENTION_DAYS} days`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
