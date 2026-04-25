-- ============================================================
-- 003_drop_workflow_schedules.sql
-- 002 で導入した workflow_schedules を撤去。
-- スケジュールは GitHub Actions の `schedule:` cron に一元化したため
-- DB 側で持つ必要がなくなった。
-- ============================================================

DROP TABLE IF EXISTS metago.workflow_schedules CASCADE;
