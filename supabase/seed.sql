-- ============================================================
-- MetaGo Seed Data
-- schema.sql 実行後に実行してください
-- ============================================================

-- ============================================================
-- products
-- ============================================================
INSERT INTO metago.products (name, display_name, description, github_repo, vercel_url, primary_color, priority) VALUES
  ('nativego',   'NativeGo',   'Native Campレッスンを定着させるツール',       'takakiishikawa/native-go',   'https://native-go.vercel.app',   '#0052CC', 1),
  ('carego',     'CareGo',     '良いコンディションを安定させる',               'takakiishikawa/care-go',     'https://care-go.vercel.app',     '#00875A', 2),
  ('kenyakugo',  'KenyakuGo',  '支出の無駄を減らす',                           'takakiishikawa/kenyaku-go',  'https://kenyaku-go.vercel.app',  '#FF5630', 3),
  ('cookgo',     'CookGo',     '健康的な自炊を継続する',                       'takakiishikawa/cook-go',     'https://cook-go.vercel.app',     '#FF991F', 4),
  ('physicalgo', 'PhysicalGo', '身体を鍛え続ける',                             'takakiishikawa/physical-go', 'https://physical-go.vercel.app', '#6554C0', 5),
  ('taskgo',     'TaskGo',     'やるべきタスクを整理する',                     'takakiishikawa/task-go',     'https://task-go.vercel.app',     '#00B8D9', 6)
ON CONFLICT (name) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  description   = EXCLUDED.description,
  github_repo   = EXCLUDED.github_repo,
  vercel_url    = EXCLUDED.vercel_url,
  primary_color = EXCLUDED.primary_color,
  priority      = EXCLUDED.priority;

-- ============================================================
-- psf_metrics_definitions
-- ============================================================

-- NativeGo
INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT
  p.id,
  'result',
  'Speaking Test スコア',
  80,
  '点',
  'AIスピーキングテストの月次スコア（直近値）',
  1.0,
  'nativego.speaking_tests.score'
FROM metago.products p WHERE p.name = 'nativego';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', 'リピーティング回数/週', 50, '回', 'リピーティング練習の週次集計', 1.0, 'nativego.repeatings (weekly count)'
FROM metago.products p WHERE p.name = 'nativego';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', 'スピーキング回数/週', 30, '回', 'スピーキング練習の週次集計', 1.0, 'nativego.speakings (weekly count)'
FROM metago.products p WHERE p.name = 'nativego';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', 'Native Camp回数/週', 14, '回', 'Native Campセッションの週次集計', 1.0, 'nativego.native_camp_sessions (weekly count)'
FROM metago.products p WHERE p.name = 'nativego';

-- CareGo
INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'result', 'コンディションスコア週次平均', 4.0, '点', 'チェックインスコアの週次平均', 1.0, 'carego.checkins.score (weekly avg)'
FROM metago.products p WHERE p.name = 'carego';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '朝チェックイン率/週', 100, '%', '朝チェックインの記録率', 1.0, 'carego.checkins (morning rate)'
FROM metago.products p WHERE p.name = 'carego';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '夜チェックイン率/週', 100, '%', '夜チェックインの記録率', 1.0, 'carego.checkins (evening rate)'
FROM metago.products p WHERE p.name = 'carego';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '瞑想回数/週', 5, '回', '瞑想ログの週次集計', 1.0, 'carego.meditation_logs (weekly count)'
FROM metago.products p WHERE p.name = 'carego';

-- KenyakuGo
INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'result', '月次無駄支出削減率', -10, '%', '前月比での無駄支出削減率', 1.0, 'kenyakugo.expenses (month-over-month)'
FROM metago.products p WHERE p.name = 'kenyakugo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '記録数/月', 20, '件', '支出記録の月次件数', 1.0, 'kenyakugo.expenses (monthly count)'
FROM metago.products p WHERE p.name = 'kenyakugo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '分析確認回数/月', 15, '回', '分析画面の月次確認回数', 0.5, NULL
FROM metago.products p WHERE p.name = 'kenyakugo';

-- CookGo
INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'result', '自炊率/月', 70, '%', '月間の自炊割合（目標70%）', 1.0, NULL
FROM metago.products p WHERE p.name = 'cookgo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '週自炊回数', 5, '回', '週あたりの自炊回数', 1.0, NULL
FROM metago.products p WHERE p.name = 'cookgo';

-- PhysicalGo
INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'result', '総挙上重量推移', 10, '%（3ヶ月前比）', '3ヶ月前比での総挙上重量の増加率', 1.0, NULL
FROM metago.products p WHERE p.name = 'physicalgo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', 'ジム頻度/週', 5, '回', '週あたりのジム利用回数', 1.0, NULL
FROM metago.products p WHERE p.name = 'physicalgo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', 'ログ記録率/月', 100, '%', '月間のトレーニングログ記録率', 1.0, NULL
FROM metago.products p WHERE p.name = 'physicalgo';

-- TaskGo
INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'result', 'タスク完了率', 85, '%', '登録タスクの完了率', 1.0, NULL
FROM metago.products p WHERE p.name = 'taskgo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '登録数/日', 15, '件', '1日あたりのタスク登録数', 1.0, NULL
FROM metago.products p WHERE p.name = 'taskgo';

INSERT INTO metago.psf_metrics_definitions (product_id, metric_type, name, target_value, unit, description, weight, data_source)
SELECT p.id, 'behavior', '完了数/日', 13, '件', '1日あたりのタスク完了数', 1.0, NULL
FROM metago.products p WHERE p.name = 'taskgo';
