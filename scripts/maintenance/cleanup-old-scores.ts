/**
 * Retention 用バッチ: scores_history の古い行を削除する。
 *
 * 旧実装は metago.cleanup_old_scores(retention_days) RPC を呼んでいたが、
 * 該当 migration が本番に未適用で PGRST202 を吐いていた。
 * SERVICE_ROLE_KEY なら直接 DELETE できるので RPC 依存を外す。
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
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error, count } = await supabase
    .schema("metago")
    .from("scores_history")
    .delete({ count: "exact" })
    .lt("collected_at", cutoff)
    .select("id");

  if (error) {
    console.error("cleanup_old_scores failed:", error);
    process.exit(1);
  }
  const deleted = count ?? data?.length ?? 0;
  console.log(`✓ Deleted ${deleted} rows older than ${RETENTION_DAYS} days`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
