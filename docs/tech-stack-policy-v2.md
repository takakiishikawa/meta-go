# goシリーズ 技術スタック方針書 v2.0

最終更新: 2026-04-24

## 概要

goシリーズ全プロダクト（native-go, care-go, kenyaku-go, cook-go, physical-go, task-go）が統一すべき技術スタック方針を定める。
MetaGoが中央から自動チェック・修正PRを作成する。

---

## パッケージ階層

### Foundation（固定）
変更不可。全goで必ず使用するコアパッケージ。

| パッケージ | 用途 |
|-----------|------|
| next | React製フルスタックフレームワーク（App Router + RSC） |
| react / react-dom | UIライブラリ |
| typescript | 型安全なJavaScript |
| tailwindcss | ユーティリティファーストCSS |
| `@takaki/go-design-system` | goシリーズ共通デザインシステム |

### Layer 1: go-design-system が吸収すべきパッケージ
各goでの**直接importは違反**。go-design-system経由で使う。

- `@radix-ui/*` — DS内部で使用。cn() / コンポーネント経由で利用
- `clsx`, `tailwind-merge`, `class-variance-authority` — DS内のcn()経由
- `sonner` — DS内のToaster / toast() 経由
- `next-themes` — DS内のThemeProvider経由
- `react-day-picker`, `cmdk`, `vaul` — DS内のコンポーネント経由

### Layer 2: 全go必須の標準ユーティリティ
欠損しているgoは警告対象。

| パッケージ | 用途 |
|-----------|------|
| `@supabase/ssr` | Next.js Supabase Auth SSR対応 |
| `@supabase/supabase-js` | Supabase公式クライアント |
| `@anthropic-ai/sdk` | Claude API（唯一許可されたAI SDK） |
| `zod` | スキーマバリデーション |
| `date-fns` | 日付操作 |
| `react-hook-form` | フォームライブラリ |
| `@hookform/resolvers` | hook-form + zod連携 |
| `@vercel/analytics` | Core Web Vitals計測 |
| `lucide-react` | アイコンライブラリ |
| `recharts` | グラフライブラリ（dynamic import必須） |

### Layer 3: 機能ライブラリ（使うgoのみ）
機能要件に応じてインストール可。他goへの持ち込み禁止。

- `@dnd-kit/*` — ドラッグ&ドロップ
- `react-dropzone` — ファイルドロップ
- `@tanstack/react-table` — 高機能テーブル
- `@tanstack/react-query` — サーバー状態管理（動的データのみ）

### Layer 4: プロダクト固有
各goの独自要件のみ。MetaGoの承認が必要。

### AI 用途のパッケージ

| パッケージ | 用途 |
|-----------|------|
| `@anthropic-ai/sdk` | テキスト生成（チャット、構造化出力など） |
| `openai` | 音声文字起こし(STT, Whisper) **専用**。テキスト生成には使わない |

### 禁止パッケージ
即刻削除。

| パッケージ | 理由 |
|-----------|------|
| `ai` | AI SDK 抽象化ライブラリ。本シリーズではプロバイダ SDK を直接使う方針 |
| `@ai-sdk/*` | 同上 |

---

## Phase 1: 自動化対象（MetaGo auto-fix）

> **重要な前提**: 全項目は **Next.js アプリケーション** を対象とする。
> `go-design-system` のようなフレームワーク非依存ライブラリには **適用しない**
> （ワークフロー matrix からも除外済み。実例: 2026-04-24 PR #7 で `next/dynamic`
> を design-system に混入させ、依存する全 Go の Vercel デプロイをドミノ倒し
> させた事故が発生）。

### 1. rechartsは "use client" コンポーネントで使う
**理由**: recharts は SSR 非対応のため、Server Component で直接 import すると
ビルドエラーや Hydration エラーの原因になる。

**対応**: recharts を import するファイルの先頭に `"use client"` ディレクティブ
を付ける（Next.js App Router の標準パターン）。**`next/dynamic({ ssr: false })`
でラップする必要は無い**（クライアントバンドルにしか入らないので意味が無く、
ライブラリで使うとフレームワーク依存が増える）。

```tsx
// ✅ 正しい
"use client"
import { LineChart, XAxis } from "recharts"
```

**禁止**:
- `@takaki/go-design-system` を含むフレームワーク非依存ライブラリで `next/dynamic`
  や `next/*`, `@vercel/*` 等を import しない（peerDeps 外のモジュールを参照すると
  DTS ビルドが破壊される）。
- アプリ側でも、`"use client"` で十分なケースで `next/dynamic` を強制的に
  使わない（複雑性が増えるだけで利益が無い）。

### 2. @vercel/analytics 導入
**理由**: Core Web Vitals の自動計測が必要。
**実施**: package.json 追加 + `app/layout.tsx` に `<Analytics />` を追加。
**対象外**: `go-design-system`（共通UIライブラリ。アプリ側の責務）。

### 3. 未使用 recharts 削除
**理由**: 不要な依存はバンドルサイズとセキュリティリスクを増やす。
**実施**: コード上で一切使われていない場合、package.json から削除。
**例外**: `@takaki/go-design-system` を依存に持つプロジェクトでは削除しない。
DS のバンドルが `recharts` を直 import するため、アプリコードで使われていなくても
モジュール解決のために必要（実例: 2026-04-24 task-go, kenyaku-go で recharts
削除によるビルド失敗）。

### 4. Layer 2 欠損補充
**理由**: 標準ユーティリティの統一でgoシリーズ全体の品質を均一化。
**実施**: zod / date-fns / react-hook-form / @hookform/resolvers が欠損している場合に追加。
**対象外**: `go-design-system`（peerDeps として既に列挙済み。consumer 側の責務）。

---

## Phase 2: 手動対応（将来的に自動化検討）

- Layer 1パッケージの直接import除去（DS側にコンポーネント追加が必要）
- `@tanstack/react-query` → RSC/Server Actionsへの移行
- 各goのTypeScript strict mode有効化
- テストカバレッジの導入

---

## 適用対象

| リポジトリ | Phase 1対象 | 備考 |
|-----------|------------|------|
| native-go | ✅ | |
| care-go | ✅ | |
| kenyaku-go | ✅ | |
| cook-go | ✅ | |
| physical-go | ✅ | |
| task-go | ✅ | |
| go-design-system | ❌ | フレームワーク非依存維持のため対象外（matrix から除外） |
| meta-go | ❌ | 自己管理（Issue経由） |
