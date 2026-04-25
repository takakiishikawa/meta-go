# CLAUDE.md 配布テンプレート v2.0

## 統合ルール

1. **既存内容保持**: リポジトリ固有の設定（スキーマ名、固有の注意事項等）は既存CLAUDE.mdの内容を引き継ぐ
2. **テンプレート統合**: 以下のテンプレートをベースに、既存内容の固有部分を保持して統合する
3. **AGENTS.md参照**: 全リポジトリで `@AGENTS.md` を先頭に配置する

## リポジトリ別調整

- **go-design-system**: 「go-design-systemを使用する」ルールは不要。代わりにパッケージ公開・後方互換性のルールを追加
- **meta-go**: 既存のCLAUDE.mdを優先。上書きせずPRをスキップ

---

## 標準goアプリ用 CLAUDE.md テンプレート

以下が native-go, care-go, kenyaku-go, cook-go, physical-go, task-go 向けの標準テンプレート。

```
@AGENTS.md

# {REPO_DISPLAY_NAME} — CLAUDE.md

## プロジェクト概要
{REPO_DESCRIPTION}

## 技術スタック
- Framework: Next.js (App Router) + TypeScript
- Styling: Tailwind CSS + go-design-system
- Auth: Supabase Auth（Google OAuth）
- DB: Supabase
- Deploy: Vercel

## 開発コマンド
\`\`\`bash
npm install       # 依存関係インストール
npm run dev       # 開発サーバー (localhost:3000)
npm run build     # 本番ビルド
npm run lint      # ESLint
\`\`\`

## 重要なルール
1. **go-design-systemのコンポーネント優先** — Button, Card, Badge等は `@takaki/go-design-system` 経由
2. **Server Components優先** — `'use client'` は必要箇所のみ
3. **型安全** — `any` 型は使用しない
4. **AI SDK** — `@anthropic-ai/sdk` のみ使用（openai等は禁止）
5. **MetaGo管理下** — コード品質・依存更新PRはMetaGoが自動作成

## パッケージ規則
| Layer | 内容 |
|-------|------|
| Foundation | next, react, typescript, tailwindcss, `@takaki/go-design-system` |
| Layer 1 (DS吸収) | Radix UI等は直接importしない（DS経由で使う） |
| Layer 2 (全go共通) | `@supabase/*`, zod, date-fns, react-hook-form, `@vercel/analytics` |
| Layer 3 (機能) | `@dnd-kit/*`, react-dropzone 等（機能に応じて） |
| Layer 4 (固有) | このプロダクト専用ライブラリのみ |
| 禁止 | openai, ai, `@ai-sdk/*` |

## MetaGo連携
MetaGoがこのリポジトリを中央管理しています。
- **L1（自動マージ）**: ESLint修正、Prettier、未使用import、デザインシステム違反修正、patch/minor依存更新
- **L2（承認待ち）**: major依存更新のみ
```

---

## go-design-system 用 CLAUDE.md テンプレート

```
@AGENTS.md

# go-design-system — CLAUDE.md

## プロジェクト概要
goシリーズ全プロダクトが依存する共通UIコンポーネントライブラリ。Atlassian風デザインで統一感を提供。

## 技術スタック
- React + TypeScript
- Tailwind CSS
- Radix UI Primitives（内部使用）
- shadcn/ui ベース

## 重要なルール（絶対遵守）
1. **フレームワーク非依存を維持する** — このリポジトリは Goシリーズ全体で
   共有される共通UIライブラリ。Next.js / Remix / 他のメタフレームワーク固有の
   モジュール（`next/dynamic`, `next/link`, `next/image`, `next/router`,
   `@vercel/analytics` など）を **import / dependencies / devDependencies** に
   入れてはならない。SSR最適化はconsumer側の責務。
2. **peerDependencies に列挙された以外のフレームワーク依存を増やさない** —
   `react`, `react-dom`, `tailwindcss` 以外のフレームワークレベル依存はNG。
3. **Breaking changeは慎重に** — 全goが依存するため後方互換性を維持
4. **セマンティックバージョニング厳守** — patch/minor/majorを正確に判断
5. **コンポーネントのAPIを安定させる** — propsの名前・型は変更しない
6. **Tailwind v4を前提** — 各goはTailwind v4を使用している

## "use client" について
クライアントAPI（`useState`, `useEffect`, event handlers 等）を使うコンポーネントには
ファイル先頭に `"use client"` を付ける。これによりNext.js App Routerの
Server Componentビルドでも安全に使える。`next/dynamic({ ssr: false })` でラップ
する必要は無い（それはフレームワーク依存を増やすだけ）。

## MetaGo連携
このリポジトリは tech-stack-compliance 自動修正の対象**外**（matrixから除外済み）。
- **L1（自動マージ）**: ESLint修正、patch/minor依存更新、デザインシステム違反修正
- **L2（承認待ち）**: major依存更新
- **対象外**: tech-stack-compliance v2.0 — フレームワーク非依存維持のため
```
