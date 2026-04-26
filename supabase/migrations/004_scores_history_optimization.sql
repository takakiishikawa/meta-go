-- ============================================================
-- 004_scores_history_optimization.sql
-- scores_history を「1日1行/プロダクト/カテゴリ」に正規化し、
-- trend クエリ用の複合 index と古いデータの retention 用関数を追加。
--
-- 動機:
-- - saveScore() の DELETE+INSERT 設計が並列 scan 下で race を起こし、同日同
--   (product,category) で大量の重複行が発生していた (例: 4/23 metago perf
--   で score=0 行が7件)
-- - trend クエリは collected_at の範囲 + category で絞るため、対応 index
--   が無いとデータ量増加で線形劣化する
-- - 古いスコアは可視化用途には不要なので 90 日で自動削除する基盤を持っておく
-- ============================================================

-- 1) 既存重複の dedupe (Asia/Tokyo の calendar day 単位、最新 collected_at を残す)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        product_id,
        category,
        ((collected_at AT TIME ZONE 'Asia/Tokyo')::date)
      ORDER BY collected_at DESC
    ) AS rn
  FROM metago.scores_history
)
DELETE FROM metago.scores_history
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) "day" generated column を追加し UNIQUE 化
ALTER TABLE metago.scores_history
  ADD COLUMN IF NOT EXISTS day DATE GENERATED ALWAYS AS
    ((collected_at AT TIME ZONE 'Asia/Tokyo')::date) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_scores_history_product_cat_day
  ON metago.scores_history (product_id, category, day);

-- 3) trend クエリ用の複合 index
CREATE INDEX IF NOT EXISTS idx_scores_history_product_cat_collected_at
  ON metago.scores_history (product_id, category, collected_at DESC);

-- 4) Retention 関数: 引数で指定した日数より古い行を削除
CREATE OR REPLACE FUNCTION metago.cleanup_old_scores(retention_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = metago, public
AS $$
DECLARE
  deleted INT;
BEGIN
  DELETE FROM metago.scores_history
  WHERE collected_at < (now() - (retention_days || ' days')::interval);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION metago.cleanup_old_scores(INT) TO authenticated, service_role;
