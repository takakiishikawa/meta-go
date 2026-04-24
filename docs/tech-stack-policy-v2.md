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

### 禁止パッケージ
即刻削除。

| パッケージ | 理由 |
|-----------|------|
| `openai` | Anthropic統一方針（`@anthropic-ai/sdk`に移行） |
| `ai` | 同上 |
| `@ai-sdk/*` | 同上 |

---

## Phase 1: 自動化対象（MetaGo auto-fix）

### 1. recharts dynamic import化（全ファイル）
**理由**: rechartsはSSR非対応のため static import するとバンドルサイズが膨らみHydration Errorのリスクがある。
**効果**: 初期バンドル -250KB程度。

```tsx
// ❌ 禁止
import { LineChart, XAxis } from "recharts"

// ✅ 必須
import dynamic from 'next/dynamic'
const LineChart = dynamic(
  () => import("recharts").then(m => ({ default: m.LineChart })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-muted rounded" /> }
)
```

### 2. @vercel/analytics 導入
**理由**: Core Web Vitalsの自動計測が必要。
**実施**: package.json追加 + `app/layout.tsx` に `<Analytics />` を追加。

### 3. 未使用recharts削除
**理由**: 不要な依存はバンドルサイズとセキュリティリスクを増やす。
**実施**: コード上で一切使われていない場合、package.jsonから削除。

### 4. Layer 2 欠損補充
**理由**: 標準ユーティリティの統一でgoシリーズ全体の品質を均一化。
**実施**: zod / date-fns / react-hook-form / @hookform/resolvers が欠損している場合に追加。

### 5. openai削除
**理由**: AI SDKは@anthropic-ai/sdkに統一。openaiとの混在は禁止。
**実施**: package.jsonから削除 + コードの書き換え（可能な場合）。

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
| go-design-system | ✅ | recharts dynamic importは対象外（DS自身はSSR対応前提） |
| meta-go | ❌ | 自己管理（Issue経由） |
