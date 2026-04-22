-- ============================================================
-- MetaGo Supabase Schema
-- Supabaseダッシュボードの SQL Editor で実行してください
-- ============================================================

-- スキーマ作成
CREATE SCHEMA IF NOT EXISTS metago;

-- ============================================================
-- Tables
-- ============================================================

-- products: goシリーズのメタデータ
CREATE TABLE IF NOT EXISTS metago.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,          -- 'nativego', 'carego', etc.
  display_name  TEXT NOT NULL,                 -- 'NativeGo', 'CareGo', etc.
  description   TEXT,
  github_repo   TEXT,                          -- 'takakiishikawa/native-go'
  vercel_url    TEXT,
  primary_color TEXT,
  priority      INTEGER NOT NULL DEFAULT 99,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- scores_history: Deliveryスコア履歴
CREATE TABLE IF NOT EXISTS metago.scores_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  category     TEXT NOT NULL CHECK (category IN ('quality','security','design_system','performance')),
  score        INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quality_items: コード品質の個別アイテム
CREATE TABLE IF NOT EXISTS metago.quality_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  state       TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','done')),
  level       TEXT NOT NULL DEFAULT 'L2' CHECK (level IN ('L1','L2','L3')),
  pr_url      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- security_items: セキュリティの個別アイテム
CREATE TABLE IF NOT EXISTS metago.security_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  severity    TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  title       TEXT NOT NULL,
  cve         TEXT,
  description TEXT,
  state       TEXT NOT NULL DEFAULT 'new',
  pr_url      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- dependency_items: 依存関係の個別アイテム
CREATE TABLE IF NOT EXISTS metago.dependency_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  package_name    TEXT NOT NULL,
  current_version TEXT NOT NULL,
  latest_version  TEXT NOT NULL,
  update_type     TEXT NOT NULL CHECK (update_type IN ('patch','minor','major','framework')),
  state           TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new','done','in_progress')),
  pr_url          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- design_system_items: デザインシステム違反
CREATE TABLE IF NOT EXISTS metago.design_system_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  state       TEXT NOT NULL DEFAULT 'new',
  pr_url      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- performance_metrics: パフォーマンス測定結果
CREATE TABLE IF NOT EXISTS metago.performance_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  lcp         NUMERIC,
  fid         NUMERIC,
  cls         NUMERIC,
  api_avg     NUMERIC,
  bundle_size NUMERIC,
  score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cost_records: コスト記録
CREATE TABLE IF NOT EXISTS metago.cost_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  service     TEXT NOT NULL CHECK (service IN ('vercel','supabase','anthropic','other')),
  amount      NUMERIC NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  recorded_at DATE NOT NULL  -- 月単位: 'YYYY-MM-01'
);

-- execution_logs: MetaGo実行ログ
CREATE TABLE IF NOT EXISTS metago.execution_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES metago.products(id) ON DELETE SET NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  level       TEXT,
  state       TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('merged','pending','failed')),
  pr_url      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- approval_queue: 承認待ちアイテム
CREATE TABLE IF NOT EXISTS metago.approval_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES metago.products(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL,
  meta        JSONB,
  state       TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- psf_scores: PSFスコア履歴
CREATE TABLE IF NOT EXISTS metago.psf_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  psf_score        NUMERIC NOT NULL,
  result_score     NUMERIC NOT NULL,
  behavior_score   NUMERIC NOT NULL,
  result_details   JSONB DEFAULT '{}',
  behavior_details JSONB DEFAULT '{}',
  trend            TEXT CHECK (trend IN ('up','down','flat')),
  collected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- psf_metrics_definitions: PSF指標定義
CREATE TABLE IF NOT EXISTS metago.psf_metrics_definitions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  metric_type  TEXT NOT NULL CHECK (metric_type IN ('result','behavior')),
  name         TEXT NOT NULL,
  target_value NUMERIC,
  unit         TEXT,
  description  TEXT,
  weight       NUMERIC NOT NULL DEFAULT 1.0,
  data_source  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- engagement_history: エンゲージメント推移
CREATE TABLE IF NOT EXISTS metago.engagement_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  usage_count INTEGER NOT NULL,
  trend       TEXT CHECK (trend IN ('up','down','flat')),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- hypotheses: 仮説
CREATE TABLE IF NOT EXISTS metago.hypotheses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('problem','solution')),
  parent_hypothesis_id UUID REFERENCES metago.hypotheses(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  confidence           INTEGER CHECK (confidence BETWEEN 0 AND 100),
  state                TEXT NOT NULL DEFAULT '立案中',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ
);

-- backlog: バックログ
CREATE TABLE IF NOT EXISTS metago.backlog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES metago.products(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  priority    TEXT NOT NULL DEFAULT 'Med' CHECK (priority IN ('High','Med','Low')),
  state       TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- api_keys: goシリーズで利用するAPI・環境変数の管理
-- env_var_name を一意キーとし、スクリプトが自動検出してupsertする
CREATE TABLE IF NOT EXISTS metago.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_var_name  TEXT NOT NULL UNIQUE,   -- 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY', etc.
  name          TEXT,                   -- 人が読める名前（手動編集可）
  provider      TEXT,                   -- 'OpenAI', 'Stripe' など（手動編集可）
  category      TEXT,                   -- 'AI / LLM', '認証', '決済' など
  used_by       TEXT[] NOT NULL DEFAULT '{}', -- 利用プロダクトのslug配列（自動更新）
  notes         TEXT,                   -- 備考（手動編集可）
  auto_detected BOOLEAN NOT NULL DEFAULT true,
  last_seen_at  TIMESTAMPTZ,            -- 最後にソースコードで検出された日時
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scores_history_product_category ON metago.scores_history(product_id, category);
CREATE INDEX IF NOT EXISTS idx_scores_history_collected_at ON metago.scores_history(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_items_product ON metago.quality_items(product_id);
CREATE INDEX IF NOT EXISTS idx_security_items_product ON metago.security_items(product_id);
CREATE INDEX IF NOT EXISTS idx_dependency_items_product ON metago.dependency_items(product_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_product ON metago.execution_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_approval_queue_state ON metago.approval_queue(state);
CREATE INDEX IF NOT EXISTS idx_psf_scores_product ON metago.psf_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_engagement_history_product ON metago.engagement_history(product_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE metago.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.scores_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.quality_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.security_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.dependency_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.design_system_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.cost_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.psf_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.psf_metrics_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.engagement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE metago.backlog ENABLE ROW LEVEL SECURITY;

-- takakiのみアクセス可能（Google OAuthのemailで判定）
-- メールアドレスは環境に合わせて変更してください
CREATE OR REPLACE FUNCTION metago.is_takaki()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT auth.email() = 'rittukk1@gmail.com'
$$;

-- 全テーブルにポリシー適用
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'products','scores_history','quality_items','security_items',
    'dependency_items','design_system_items','performance_metrics',
    'cost_records','execution_logs','approval_queue','psf_scores',
    'psf_metrics_definitions','engagement_history','hypotheses','backlog'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "takaki_only_%s" ON metago.%I
       FOR ALL TO authenticated
       USING (metago.is_takaki())
       WITH CHECK (metago.is_takaki())',
      t, t
    );
  END LOOP;
END$$;

-- ============================================================
-- Permissions
-- ============================================================

-- スキーマ使用権限
GRANT USAGE ON SCHEMA metago TO authenticated, anon, service_role;

-- テーブル権限
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA metago TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA metago TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA metago TO anon;

-- シーケンス権限
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA metago TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA metago TO service_role;

-- 今後作成するテーブルにも自動付与
ALTER DEFAULT PRIVILEGES IN SCHEMA metago
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA metago
  GRANT ALL ON TABLES TO service_role;
