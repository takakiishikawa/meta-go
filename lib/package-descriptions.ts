export type PackageLayer =
  | "foundation"
  | "layer1-ds"
  | "layer2-standard"
  | "layer3-feature"
  | "layer4-specific"
  | "forbidden";

export interface PackageInfo {
  description: string;
  category: string;
  layer: PackageLayer;
}

export const PACKAGE_DESCRIPTIONS: Record<string, PackageInfo> = {
  // ── Foundation ────────────────────────────────────────────
  next: {
    description:
      "React製フルスタックフレームワーク。App Router + RSC + SSR対応",
    category: "Framework",
    layer: "foundation",
  },
  react: {
    description: "UIライブラリ。コンポーネントベースで画面を構築",
    category: "Framework",
    layer: "foundation",
  },
  "react-dom": {
    description: "ReactをブラウザのDOMに反映するためのライブラリ",
    category: "Framework",
    layer: "foundation",
  },
  typescript: {
    description: "型安全なJavaScript。コンパイル時にエラーを検出",
    category: "Language",
    layer: "foundation",
  },
  tailwindcss: {
    description: "ユーティリティファーストのCSSフレームワーク",
    category: "Styling",
    layer: "foundation",
  },
  "@tailwindcss/postcss": {
    description: "Tailwind CSS v4をPostCSSで処理するためのプラグイン",
    category: "Styling",
    layer: "foundation",
  },
  "@takaki/go-design-system": {
    description:
      "goシリーズ共通デザインシステム。Atlassian風UIとトークンを提供",
    category: "Design System",
    layer: "foundation",
  },

  // ── Layer 1: go-design-system が吸収すべき ────────────────
  "@radix-ui/react-accordion": {
    description: "アコーディオン（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-alert-dialog": {
    description: "確認ダイアログ（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-avatar": {
    description: "アバター画像コンポーネント（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-checkbox": {
    description: "チェックボックス（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-collapsible": {
    description: "折りたたみ（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-dialog": {
    description: "モーダル/ダイアログ（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-dropdown-menu": {
    description: "ドロップダウンメニュー（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-label": {
    description: "アクセシブルなラベル（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-popover": {
    description: "ポップオーバー（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-progress": {
    description: "プログレスバー（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-scroll-area": {
    description: "カスタムスクロール領域（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-select": {
    description: "セレクトボックス（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-separator": {
    description: "区切り線（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-slider": {
    description: "スライダー（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-slot": {
    description: "コンポーネント合成ユーティリティ（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-switch": {
    description: "スイッチトグル（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-tabs": {
    description: "タブコンポーネント（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  "@radix-ui/react-tooltip": {
    description: "ツールチップ（shadcn/ui土台）",
    category: "UI Primitive",
    layer: "layer1-ds",
  },
  clsx: {
    description: "クラス名を条件分岐で結合（DSのcn()経由で使う）",
    category: "Utility",
    layer: "layer1-ds",
  },
  "tailwind-merge": {
    description: "Tailwindクラスの重複を解決（DSのcn()経由で使う）",
    category: "Utility",
    layer: "layer1-ds",
  },
  "class-variance-authority": {
    description: "コンポーネントのバリアント管理（shadcn/ui土台）",
    category: "Utility",
    layer: "layer1-ds",
  },
  sonner: {
    description: "トースト通知ライブラリ（DS経由で<Toaster>/toast()を使う）",
    category: "UI",
    layer: "layer1-ds",
  },
  "next-themes": {
    description: "ダーク/ライトモード切替（DS経由で<ThemeProvider>を使う）",
    category: "UI",
    layer: "layer1-ds",
  },
  "react-day-picker": {
    description: "日付選択UI（DS経由で<DatePicker>を使う）",
    category: "UI",
    layer: "layer1-ds",
  },
  cmdk: {
    description: "コマンドパレット（DS経由で<Command>を使う）",
    category: "UI",
    layer: "layer1-ds",
  },
  vaul: {
    description: "ドロワーコンポーネント（DS経由で<Drawer>を使う）",
    category: "UI",
    layer: "layer1-ds",
  },
  "tailwind-animate": {
    description: "Tailwindアニメーションプラグイン（DS内部で使用）",
    category: "Styling",
    layer: "layer1-ds",
  },
  "tailwindcss-animate": {
    description: "Tailwindアニメーションプラグイン（DS内部で使用）",
    category: "Styling",
    layer: "layer1-ds",
  },

  // ── Layer 2: 全go必須の標準ユーティリティ ──────────────────
  "@supabase/ssr": {
    description: "Next.jsでSupabase AuthをSSR対応させるライブラリ",
    category: "Backend",
    layer: "layer2-standard",
  },
  "@supabase/supabase-js": {
    description: "Supabase公式JSクライアント（DB/Auth/Storage）",
    category: "Backend",
    layer: "layer2-standard",
  },
  "@anthropic-ai/sdk": {
    description: "Claude API公式SDK。全goで唯一許可されたAI SDK",
    category: "AI",
    layer: "layer2-standard",
  },
  zod: {
    description: "TypeScript向けスキーマバリデーション（フォーム・APIで必須）",
    category: "Validation",
    layer: "layer2-standard",
  },
  "date-fns": {
    description: "日付操作ライブラリ（moment.jsより軽量）",
    category: "Utility",
    layer: "layer2-standard",
  },
  "react-hook-form": {
    description: "React向けフォームライブラリ（zod連携で型安全）",
    category: "Form",
    layer: "layer2-standard",
  },
  "@hookform/resolvers": {
    description: "react-hook-formとzod等のバリデーションを連携",
    category: "Form",
    layer: "layer2-standard",
  },
  "@vercel/analytics": {
    description: "Core Web VitalsなどVercel Analytics（全goで必須）",
    category: "Analytics",
    layer: "layer2-standard",
  },
  "lucide-react": {
    description: "アイコンライブラリ（shadcn/uiで標準使用）",
    category: "UI",
    layer: "layer2-standard",
  },
  recharts: {
    description: "Reactグラフライブラリ（dynamic importで使うこと）",
    category: "Chart",
    layer: "layer2-standard",
  },

  // ── Layer 3: 機能ライブラリ（使うgoのみ） ─────────────────
  "@dnd-kit/core": {
    description: "ドラッグ&ドロップライブラリのコア",
    category: "Interaction",
    layer: "layer3-feature",
  },
  "@dnd-kit/sortable": {
    description: "並び替え機能を提供（@dnd-kit/coreと組み合わせ）",
    category: "Interaction",
    layer: "layer3-feature",
  },
  "@dnd-kit/utilities": {
    description: "@dnd-kit関連のユーティリティ",
    category: "Interaction",
    layer: "layer3-feature",
  },
  "react-dropzone": {
    description: "ファイルドロップ領域を作るライブラリ",
    category: "File",
    layer: "layer3-feature",
  },
  "@tanstack/react-table": {
    description: "高機能テーブルライブラリ（DS経由で<DataTable>を使う想定）",
    category: "Data Display",
    layer: "layer3-feature",
  },
  "@tanstack/react-query": {
    description: "サーバー状態管理（動的データ取得時のみ使用）",
    category: "State",
    layer: "layer3-feature",
  },

  // ── Layer 4: プロダクト固有 ────────────────────────────────
  "web-push": {
    description: "Webプッシュ通知（CareGoで使用）",
    category: "Notification",
    layer: "layer4-specific",
  },
  googleapis: {
    description: "Google APIクライアント（KenyakuGoのGmail連携等）",
    category: "Integration",
    layer: "layer4-specific",
  },
  "canvas-confetti": {
    description: "紙吹雪アニメーション（PhysicalGoのお祝い演出）",
    category: "Animation",
    layer: "layer4-specific",
  },
  "tw-animate-css": {
    description: "Tailwind用アニメーションプリセット",
    category: "Animation",
    layer: "layer4-specific",
  },

  // ── 禁止パッケージ ─────────────────────────────────────────
  openai: {
    description: "⚠️ 禁止：Anthropic統一方針のため使用不可",
    category: "AI",
    layer: "forbidden",
  },
  ai: {
    description: "⚠️ 禁止：@anthropic-ai/sdk に統一すること",
    category: "AI",
    layer: "forbidden",
  },
  "@ai-sdk/openai": {
    description: "⚠️ 禁止：@anthropic-ai/sdk に統一すること",
    category: "AI",
    layer: "forbidden",
  },
};

export const LAYER_CONFIG = {
  foundation: {
    label: "🔒 Foundation（固定）",
    note: "Next.js / React / TypeScript / Tailwind / go-design-system。変更不可。",
    color: "#1E3A8A",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  "layer1-ds": {
    label: "🎨 Layer 1: go-design-system が吸収",
    note: "DS経由でcn() / <Toaster> / <DatePicker>等として利用。各goでの直接importは違反。",
    color: "#7C3AED",
    bg: "#F5F3FF",
    border: "#DDD6FE",
  },
  "layer2-standard": {
    label: "🔧 Layer 2: 全go必須の標準ユーティリティ",
    note: "zod / date-fns / @vercel/analytics など。欠損しているgoは赤色で警告。",
    color: "#059669",
    bg: "#ECFDF5",
    border: "#A7F3D0",
  },
  "layer3-feature": {
    label: "📦 Layer 3: 機能ライブラリ",
    note: "@dnd-kit / react-dropzone など。使うgoのみインストール可。",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  "layer4-specific": {
    label: "⚙️ Layer 4: プロダクト固有",
    note: "web-push(CareGo) / googleapis(KenyakuGo) など。他goへの持ち込み禁止。",
    color: "#6B7280",
    bg: "#F9FAFB",
    border: "#E5E7EB",
  },
  forbidden: {
    label: "❌ 方針違反パッケージ",
    note: "openai など。Anthropic統一方針に違反。即刻削除してください。",
    color: "#DC2626",
    bg: "#FEF2F2",
    border: "#FECACA",
  },
} as const satisfies Record<
  PackageLayer,
  { label: string; note: string; color: string; bg: string; border: string }
>;

export const LAYER_ORDER: PackageLayer[] = [
  "foundation",
  "layer1-ds",
  "layer2-standard",
  "layer3-feature",
  "layer4-specific",
  "forbidden",
];
