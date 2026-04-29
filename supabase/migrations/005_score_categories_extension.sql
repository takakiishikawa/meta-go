-- ============================================================
-- 005_score_categories_extension.sql
-- scores_history.category の CHECK 制約に新カテゴリを追加。
--
-- 動機:
--  - tech-stack scan は category='tech_stack' で saveScore() を呼ぶが、
--    元の制約は ('quality','security','design_system','performance') のみで
--    本番 DB 側で先に手動で緩めていない限り insert が落ちていた。
--  - dependencies スコア (更新性 + 共通化) を新規追加するため、
--    'dependencies' を許可する必要がある。
--
-- このマイグレーションは idempotent。既に拡張済みでも安全に再適用できる。
-- ============================================================

ALTER TABLE metago.scores_history
  DROP CONSTRAINT IF EXISTS scores_history_category_check;

ALTER TABLE metago.scores_history
  ADD CONSTRAINT scores_history_category_check
  CHECK (category IN (
    'quality',
    'security',
    'design_system',
    'performance',
    'tech_stack',
    'dependencies'
  ));
