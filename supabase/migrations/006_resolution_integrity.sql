-- ============================================================
-- 006_resolution_integrity.sql
-- 「解決(resolved)」の意味を一致させるためのスキーマ整備とデータ救済。
--
-- 背景:
-- - 'fixed'/'done' に遷移した item が次回 scan で再検出されても upsertItem は
--   state を更新しないため、コードに違反が残ったまま「解決済み」として扱われる
--   ゾンビが発生していた (例: tech-stack の shadcn 残存 item)
-- - dependency_items に resolved_at / last_seen_at が無く、ダッシュボード KPI
--   集計で resolved_at を select するクエリが PostgREST で 42703 を返し、
--   dependency 系が KPI からまるごと欠落していた
--
-- なお scores_history.category への 'tech_stack' 追加は
-- 005_score_categories_extension.sql で対応済み。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) dependency_items: 他の items テーブルと state machine 列を揃える
-- ────────────────────────────────────────────────────────────

ALTER TABLE metago.dependency_items
  ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- 既存の done 行に resolved_at を埋める (created_at で代用 — 取得不能のため近似)
UPDATE metago.dependency_items
   SET resolved_at = COALESCE(resolved_at, created_at)
 WHERE state IN ('done','fixed')
   AND resolved_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- 2) ゾンビ救済: state='fixed'/'done' なのに直近 scan で再検出されている
--    (last_seen_at > resolved_at + 5分) 行を 'new' に戻す。
--
--    5分のバッファは markStaleItemsResolved と同一トランザクション内の
--    タイムスタンプ前後関係ノイズを吸収するため。
-- ────────────────────────────────────────────────────────────

WITH revived AS (
  UPDATE metago.quality_items
     SET state = 'new', resolved_at = NULL
   WHERE state IN ('fixed','done')
     AND resolved_at IS NOT NULL
     AND last_seen_at > resolved_at + interval '5 minutes'
  RETURNING id
)
SELECT 'quality_items' AS table_name, COUNT(*) AS revived FROM revived;

WITH revived AS (
  UPDATE metago.security_items
     SET state = 'new', resolved_at = NULL
   WHERE state IN ('fixed','done')
     AND resolved_at IS NOT NULL
     AND last_seen_at > resolved_at + interval '5 minutes'
  RETURNING id
)
SELECT 'security_items' AS table_name, COUNT(*) AS revived FROM revived;

WITH revived AS (
  UPDATE metago.design_system_items
     SET state = 'new', resolved_at = NULL
   WHERE state IN ('fixed','done')
     AND resolved_at IS NOT NULL
     AND last_seen_at > resolved_at + interval '5 minutes'
  RETURNING id
)
SELECT 'design_system_items' AS table_name, COUNT(*) AS revived FROM revived;
