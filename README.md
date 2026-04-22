# MetaGo

> PSF Product Manager — takakiのもう一人のPM

MetaGoはgoシリーズ全体のPSF（Product Super-specific Fit）達成を支援する自律的プロダクト。

## 機能

### Delivery（守る）
- コード品質・セキュリティの継続モニタリング
- 依存関係・技術スタックの最新化
- go-design-system準拠率の維持
- パフォーマンス・コストの自律管理

### Discovery（育てる）
- PSFスコアの測定と可視化
- 使用パターン分析
- 仮説立案・バックログ管理

## 技術スタック

| 項目 | 技術 |
|------|------|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + go-design-system |
| Auth | Supabase Auth (Google OAuth) |
| DB | Supabase (metagoスキーマ) |
| Deploy | Vercel |

## セットアップ

### 1. Supabaseスキーマの作成

Supabaseダッシュボードで以下を実行：

```sql
-- 1. スキーマとテーブル作成
\i supabase/schema.sql

-- 2. 初期データ投入
\i supabase/seed.sql
```

### 2. 環境変数の設定

Vercelプロジェクトに以下の環境変数を設定：

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=https://metago.vercel.app
ANTHROPIC_API_KEY
GITHUB_TOKEN
GITHUB_OWNER=takakiishikawa
SUPABASE_SERVICE_ROLE_KEY
VERCEL_TOKEN
```

### 3. GitHub Secretsの設定

リポジトリの Settings > Secrets and variables > Actions に追加：

- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_OWNER` (= `takakiishikawa`)
- `VERCEL_TOKEN`

### 4. 他goへのClaude Code Action展開（任意）

```bash
export GITHUB_TOKEN=your_token
bash scripts/setup/deploy-claude-action.sh
```

## 開発

```bash
npm run dev
```

## データ収集

GitHub Actions cronで毎日自動実行されます。手動実行は：

```bash
# GitHub APIデータ収集
npx tsx scripts/collect/github-data.ts

# Supabase指標収集
npx tsx scripts/collect/supabase-data.ts

# PSFスナップショット（週次）
npx tsx scripts/collect/supabase-data.ts --psf-snapshot
```

## URL

- 本番: https://metago.vercel.app
- GitHub: https://github.com/takakiishikawa/meta-go
