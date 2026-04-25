-- ============================================================
-- 001_state_machine.sql
-- 違反/問題itemsの state machine 拡張 + UPSERT用unique制約追加
--
-- 適用対象: quality_items / design_system_items / security_items
--
-- state machine:
--   new       — scanで検出された未処理の違反
--   fixing    — fix-cron が処理中（ロック）
--   fixed     — 修正PRがマージされた
--   failed    — 修正失敗（リトライ上限超過）
--   done      — レガシー（fixedと同義、後方互換のため残す）
--
-- このSQLはidempotentで、何度実行してもエラーにならない設計です。
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- quality_items
-- ────────────────────────────────────────────────────────────

ALTER TABLE metago.quality_items
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE metago.quality_items DROP CONSTRAINT IF EXISTS quality_items_state_check;
ALTER TABLE metago.quality_items ADD CONSTRAINT quality_items_state_check
  CHECK (state IN ('new','fixing','fixed','failed','done'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_quality_items_key
  ON metago.quality_items(product_id, category, title);

-- ────────────────────────────────────────────────────────────
-- design_system_items
-- ────────────────────────────────────────────────────────────

ALTER TABLE metago.design_system_items
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'L1';

ALTER TABLE metago.design_system_items DROP CONSTRAINT IF EXISTS design_system_items_state_check;
ALTER TABLE metago.design_system_items ADD CONSTRAINT design_system_items_state_check
  CHECK (state IN ('new','fixing','fixed','failed','done'));

ALTER TABLE metago.design_system_items DROP CONSTRAINT IF EXISTS design_system_items_level_check;
ALTER TABLE metago.design_system_items ADD CONSTRAINT design_system_items_level_check
  CHECK (level IN ('L1','L2','L3'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_design_system_items_key
  ON metago.design_system_items(product_id, category, title);

-- ────────────────────────────────────────────────────────────
-- security_items
-- ────────────────────────────────────────────────────────────

ALTER TABLE metago.security_items
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'L2';

ALTER TABLE metago.security_items DROP CONSTRAINT IF EXISTS security_items_state_check;
ALTER TABLE metago.security_items ADD CONSTRAINT security_items_state_check
  CHECK (state IN ('new','fixing','fixed','failed','done'));

ALTER TABLE metago.security_items DROP CONSTRAINT IF EXISTS security_items_level_check;
ALTER TABLE metago.security_items ADD CONSTRAINT security_items_level_check
  CHECK (level IN ('L1','L2','L3'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_security_items_key
  ON metago.security_items(product_id, severity, title);

-- ────────────────────────────────────────────────────────────
-- インデックス: fix-cron が pending items を効率的にピックするため
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_quality_items_state_attempt
  ON metago.quality_items(state, attempt_count) WHERE state = 'new';
CREATE INDEX IF NOT EXISTS idx_design_system_items_state_attempt
  ON metago.design_system_items(state, attempt_count) WHERE state = 'new';
CREATE INDEX IF NOT EXISTS idx_security_items_state_attempt
  ON metago.security_items(state, attempt_count) WHERE state = 'new';
