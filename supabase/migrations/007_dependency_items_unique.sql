-- ============================================================
-- 007_dependency_items_unique.sql
-- dependency_items に (product_id, package_name) の UNIQUE 制約を追加。
--
-- 背景:
-- - dependency-check.ts / github-data.ts は upsert に
--   onConflict: 'product_id,package_name' を指定しているが、001 で他の items
--   テーブルに付けた UNIQUE INDEX が dependency_items だけ抜けていた
-- - PostgREST は対応する unique/exclusion constraint が無いと
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification" を返し、upsert 全件失敗。/dependency が常に 0 件になる
--   原因になっていた
-- ============================================================

-- 既存の重複を救済 (古い行を削除して最新を残す)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY product_id, package_name
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM metago.dependency_items
)
DELETE FROM metago.dependency_items d
 USING ranked r
 WHERE d.id = r.id
   AND r.rn > 1;

-- UNIQUE INDEX を作成 (他の items テーブルと命名を揃える)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dependency_items_key
  ON metago.dependency_items(product_id, package_name);
