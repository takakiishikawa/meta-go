@AGENTS.md

# MetaGo — CLAUDE.md

## プロダクト概要

MetaGoはtakakiの「もう一人のPM」として機能する自律的プロダクト。goシリーズ全体のPSF達成を支援する。

## 技術スタック

- Framework: Next.js (App Router) + TypeScript
- Styling: Tailwind CSS + go-design-system
- Auth: Supabase Auth（Google OAuth）
- DB: Supabase（metagoスキーマ）
- Deploy: Vercel

## ディレクトリ構造

```
app/(app)/          # 認証必須ページ群
app/(auth)/         # ログイン・コールバック
components/         # 共通UIコンポーネント
lib/supabase/       # Supabaseクライアント
lib/metago/         # MetaGoビジネスロジック
scripts/collect/    # データ収集スクリプト（GitHub Actions用）
scripts/setup/      # 他goへの展開スクリプト
supabase/           # schema.sql / seed.sql
.github/workflows/  # CI/CD
```

## 重要なルール

1. **他goのコードは触らない** — MetaGoはSELECTのみ
2. **他goのSupabaseスキーマは変更しない**
3. **Server Components優先** — 'use client'は必要箇所のみ
4. **go-design-systemのコンポーネント優先** — Button, Card, Badge等はgds経由
5. **RLSはtakakiのみアクセス可能** — `metago.is_takaki()`で制御

## Supabaseクライアントの使い方

```tsx
// Server Component / Route Handler
import { createClient } from "@/lib/supabase/server"
const supabase = await createClient()
const { data } = await supabase.schema("metago").from("products").select("*")

// Client Component
import { createClient } from "@/lib/supabase/client"
const supabase = createClient()
```

## データ収集の注意

- 各goのスキーマへのアクセスは`SUPABASE_SERVICE_ROLE_KEY`が必要
- anon keyでは他スキーマを読み取れない場合がある
- 収集スクリプトは`scripts/collect/`に配置、`tsx`で実行

## 環境変数

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
ANTHROPIC_API_KEY
GITHUB_TOKEN
GITHUB_OWNER=takakiishikawa
SUPABASE_SERVICE_ROLE_KEY  # 収集スクリプト用
VERCEL_TOKEN               # コスト・デプロイ情報取得用
```
