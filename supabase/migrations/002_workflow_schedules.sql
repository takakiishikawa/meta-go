-- ============================================================
-- 002_workflow_schedules.sql
-- meta-go UI から GitHub Actions cron を管理するためのテーブル
--
-- このテーブルが source of truth。
-- meta-goのVercel Cron が定期的にこのテーブルを読み取り、
-- "due" になった workflow を GitHub workflow_dispatch で起動する。
-- ============================================================

CREATE TABLE IF NOT EXISTS metago.workflow_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name   TEXT NOT NULL UNIQUE,           -- 'scan-daily', 'fix-routine' 等
  workflow_file   TEXT NOT NULL,                  -- 'scan-daily.yml'
  display_name    TEXT NOT NULL,                  -- UI表示名
  description     TEXT,                           -- 何をするworkflowかの説明
  category        TEXT NOT NULL CHECK (category IN ('scan','fix','collect')),
  cron_expression TEXT NOT NULL,                  -- '0 18 * * *' 等 (UTC)
  cron_timezone   TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  last_run_at     TIMESTAMPTZ,
  last_run_status TEXT,                           -- 'success' / 'failed' / 'running'
  last_run_url    TEXT,                           -- GitHub Actions run URL
  next_run_at     TIMESTAMPTZ,                    -- 計算された次回実行予定
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_next_run
  ON metago.workflow_schedules(next_run_at) WHERE enabled = true;

-- ── RLS ─────────────────────────────────────────────────
ALTER TABLE metago.workflow_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "takaki_only_workflow_schedules" ON metago.workflow_schedules;
CREATE POLICY "takaki_only_workflow_schedules"
  ON metago.workflow_schedules FOR ALL
  USING (metago.is_takaki())
  WITH CHECK (metago.is_takaki());

-- ── 初期データ ──────────────────────────────────────────
INSERT INTO metago.workflow_schedules
  (workflow_name, workflow_file, display_name, description, category, cron_expression)
VALUES
  ('scan-daily-api', 'scan-daily-api.yml', 'Scan Daily API系',
    'github/vercel/supabase などAPI系の軽量調査。clone不要。', 'collect', '0 20 * * *'),

  ('scan-daily', 'scan-daily.yml', 'Scan Daily',
    'clone系の重い違反検出 (code-quality / design-system / security / performance / tech-stack)', 'scan', '0 18 * * *'),

  ('scan-weekly', 'scan-weekly.yml', 'Scan Weekly',
    'PSF snapshot / APIキースキャン / APIコスト収集', 'scan', '0 19 * * 1'),

  ('fix-routine', 'fix-routine.yml', 'Fix Routine',
    'pending items の修正PR作成 (4時間おき)', 'fix', '0 */4 * * *'),

  ('fix-weekly', 'fix-weekly.yml', 'Fix Weekly',
    '依存更新 (patch/minor/major) 自動PR', 'fix', '0 21 * * 1')

ON CONFLICT (workflow_name) DO UPDATE SET
  workflow_file   = EXCLUDED.workflow_file,
  display_name    = EXCLUDED.display_name,
  description     = EXCLUDED.description,
  category        = EXCLUDED.category;
  -- cron_expression と enabled はユーザー編集を尊重するので更新しない
