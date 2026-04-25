/**
 * 各goリポジトリに CLAUDE.md を配布する
 *
 * 環境変数:
 *   TARGET_REPO    — 対象リポジトリ名 (例: "native-go")。matrix で注入される
 *   TARGET_REPOS   — "all" または カンマ区切りリポジトリ名 (例: "native-go,care-go")
 *   DRY_RUN        — "true" の場合、PR を作成せずログのみ
 *   TEMPLATE_VERSION — テンプレートバージョン (例: "v2.0")
 */

import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations";

const TARGET_REPO = process.env.TARGET_REPO!;
const TARGET_REPOS = process.env.TARGET_REPOS || "all";
const DRY_RUN = process.env.DRY_RUN === "true";
const TEMPLATE_VERSION = process.env.TEMPLATE_VERSION || "v2.0";

const REPO_META: Record<string, { display: string; description: string }> = {
  "native-go": {
    display: "native-go",
    description:
      "子育て記録・成長管理アプリ。お子さんの日々を記録し、成長を可視化する。",
  },
  "care-go": {
    display: "care-go",
    description:
      "介護記録・ケア管理アプリ。介護者の負担を軽減し、ケアの質を向上させる。",
  },
  "kenyaku-go": {
    display: "kenyaku-go",
    description:
      "節約・家計管理アプリ。支出を把握し、賢い節約習慣を身につける。",
  },
  "cook-go": {
    display: "cook-go",
    description:
      "料理・レシピ管理アプリ。献立計画から買い物リストまでをサポートする。",
  },
  "physical-go": {
    display: "physical-go",
    description:
      "フィジカル管理・運動記録アプリ。健康的な生活習慣の継続を支援する。",
  },
  "task-go": {
    display: "task-go",
    description: "タスク管理・GTDアプリ。仕事と生活のタスクを統合管理する。",
  },
  "go-design-system": {
    display: "go-design-system",
    description: "goシリーズ共通デザインシステム。",
  },
  "meta-go": {
    display: "meta-go",
    description: "goシリーズの中央管理ダッシュボード。",
  },
};

function shouldProcess(repo: string): boolean {
  if (TARGET_REPOS === "all") return true;
  return TARGET_REPOS.split(",")
    .map((r) => r.trim())
    .includes(repo);
}

function generateAgentsMd(repo: string): string {
  if (repo === "go-design-system") {
    return `# AGENTS.md — go-design-system

このリポジトリは Goシリーズ全プロダクトの共通UIコンポーネントライブラリ。
**フレームワーク非依存**であることが設計上の絶対要件。

## エージェントが守るべき原則

### 1. フレームワーク固有モジュールを import しない
以下は **絶対に** import / dependencies / devDependencies に追加しない:

- \`next/*\` — \`next/dynamic\`, \`next/link\`, \`next/image\`, \`next/router\`, \`next/headers\` 等すべて
- \`@vercel/*\` — \`@vercel/analytics\`, \`@vercel/og\` 等すべて
- React Router (\`react-router\`, \`react-router-dom\`)
- Remix (\`@remix-run/*\`)
- Expo (\`expo-*\`)、React Native (\`react-native\`)

これらが必要な処理は **consumer 側（各 Go アプリ）の責務**。
ライブラリ側で吸収しようとすると tsup の DTS ビルドが peerDeps に無いモジュールを
解決できず破壊される（実例: 2026-04-24, MetaGo PR #7 が \`next/dynamic\` を混入し、
依存する全 Go の Vercel デプロイが連鎖的に失敗）。

### 2. SSR 関連の最適化は consumer 側で
recharts のような「SSR で動かない」ライブラリは、ライブラリ内で \`dynamic({ ssr: false })\`
ラップせず、**素直に static import する**。consumer 側が必要なら自前で
\`dynamic(() => import('@takaki/go-design-system').then(m => m.ChartArea), { ssr: false })\`
する。クライアント API を使うコンポーネントは \`"use client"\` ディレクティブだけ付ける。

### 3. 新しいライブラリを追加する前に
- 既存の \`peerDependencies\` / \`dependencies\` で代替できないか確認
- 追加するなら、それがフレームワーク非依存か確認
- フレームワークレベルの最適化が欲しい場合は consumer 側に書く

### 4. ビルドの仕組み
- \`tsup\` で ESM/CJS/DTS を \`dist/\` に出力
- \`prepare\` スクリプトで自動ビルドされるため、consumer が \`npm install\` した時点で
  ビルドが走る → import エラーがあるとここで失敗し、**全 Go のデプロイを止める**
- DTS ビルドは型解決のため peerDeps 外のモジュールを参照すると失敗する

## レビュー観点

エージェントが PR を作る／レビューする際:

- [ ] 新規 import に \`next/*\`, \`@vercel/*\` 等のフレームワーク依存が含まれていないか
- [ ] \`dependencies\` / \`devDependencies\` に上記が混入していないか
- [ ] \`dynamic()\` 等のフレームワーク API でラップしていないか
- [ ] \`"use client"\` を必要なファイルに付けているか
`;
  }

  return `# AGENTS.md

このリポジトリは Next.js (App Router) アプリケーション。
共通UIは \`@takaki/go-design-system\` 経由で使う。

## ガイドライン

- Server Component を優先。クライアントAPIが必要なら \`"use client"\` を付ける
- \`@takaki/go-design-system\` で代替できるものは直 import しない（Layer 1 違反）
- AI SDKは \`@anthropic-ai/sdk\` のみ使用、\`openai\` は禁止
- \`recharts\` は \`"use client"\` 付きコンポーネントで static import すれば良い
  （\`next/dynamic({ ssr: false })\` でラップする必要は無い）
- DB は Supabase、認証は Supabase Auth
`;
}

function generateClaudeMd(repo: string): string {
  const meta = REPO_META[repo];
  if (!meta) throw new Error(`Unknown repo: ${repo}`);

  if (repo === "go-design-system") {
    return `@AGENTS.md

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
   モジュール（\`next/dynamic\`, \`next/link\`, \`next/image\`, \`next/router\`,
   \`@vercel/analytics\` など）を **import / dependencies / devDependencies** に
   入れてはならない。SSR最適化はconsumer側の責務。
2. **peerDependencies に列挙された以外のフレームワーク依存を増やさない** —
   \`react\`, \`react-dom\`, \`tailwindcss\` 以外のフレームワークレベル依存はNG。
3. **Breaking changeは慎重に** — 全goが依存するため後方互換性を維持
4. **セマンティックバージョニング厳守** — patch/minor/majorを正確に判断
5. **コンポーネントのAPIを安定させる** — propsの名前・型は変更しない
6. **Tailwind v4を前提** — 各goはTailwind v4を使用している

## "use client" について
クライアントAPI（\`useState\`, \`useEffect\`, event handlers 等）を使うコンポーネントには
ファイル先頭に \`"use client"\` を付ける。これによりNext.js App Routerの
Server Componentビルドでも安全に使える。\`next/dynamic({ ssr: false })\` でラップ
する必要は無い（それはフレームワーク依存を増やすだけ）。

## MetaGo連携
このリポジトリは tech-stack-compliance 自動修正の対象**外**（matrixから除外済み）。
- **L1（自動マージ）**: ESLint修正、patch/minor依存更新、デザインシステム違反修正
- **L2（承認待ち）**: major依存更新
- **対象外**: tech-stack-compliance v2.0 — フレームワーク非依存維持のため
`;
  }

  return `@AGENTS.md

# ${meta.display} — CLAUDE.md

## プロジェクト概要
${meta.description}

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
1. **\`@takaki/go-design-system\` を最優先** — UIコンポーネントだけでなくレイアウト・ページテンプレート・トークン・ユーティリティ・Hooks すべて DS から取る（詳細は次セクション）
2. **Server Components優先** — \`'use client'\` は必要箇所のみ
3. **型安全** — \`any\` 型は使用しない
4. **AI SDK** — \`@anthropic-ai/sdk\` のみ使用（openai等は禁止）
5. **MetaGo管理下** — コード品質・依存更新PRはMetaGoが自動作成

## go-design-system の使い方

### エントリで必須の import
\`\`\`tsx
// app/layout.tsx か app/globals.css 経由で
import "@takaki/go-design-system/tokens.css"
import "@takaki/go-design-system/globals.css"
\`\`\`

### 提供される要素（直importせず DS から取る）
- **UIコンポーネント**: Button, Card, Badge, Dialog, Sheet, Tabs, Sidebar, DataTable, Calendar, Chart 等（shadcn/ui 準拠）
- **レイアウト**: \`AppLayout\`, \`PageHeader\`
- **ページテンプレート**: \`DashboardPage\`, \`LoginPage\`, \`ConceptPage\`, \`SettingsPage\`, \`AppSidebar\` / \`AppSwitcher\` / \`UserMenu\`（sidebar-01）
- **Feedback**: \`Banner\`, \`EmptyState\`, \`Spinner\`, \`Toaster\` + \`toast()\`
- **Form 補助**: \`FormActions\`, \`DatePicker\`
- **ユーティリティ**: \`cn()\`（\`clsx\` + \`tailwind-merge\` を抽象化。Layer 1 の直 import 代替）
- **Hooks**: \`useIsMobile()\`

### 設計指針
- ページ単位（ダッシュボード／ログイン／設定／コンセプト等）は **まず DS のテンプレートで作れないか確認** してから自前実装する
- ボタン色や spacing は \`tokens.css\` の CSS 変数（\`--color-primary\`, \`--spacing-*\` 等）で上書き。コンポーネント内 hardcode は避ける
- Layer 1 の Radix UI / sonner / next-themes / clsx 等は **DS 経由のラッパー** で使う（直 import は禁止）

## パッケージ規則
| Layer | 内容 |
|-------|------|
| Foundation | next, react, typescript, tailwindcss, \`@takaki/go-design-system\` |
| Layer 1 (DS吸収) | Radix UI等は直接importしない（DS経由で使う） |
| Layer 2 (全go共通) | \`@supabase/*\`, zod, date-fns, react-hook-form, \`@vercel/analytics\` |
| Layer 3 (機能) | \`@dnd-kit/*\`, react-dropzone 等（機能に応じて） |
| Layer 4 (固有) | このプロダクト専用ライブラリのみ |
| 禁止 | openai, ai, \`@ai-sdk/*\` |

## MetaGo連携
MetaGoがこのリポジトリを中央管理しています。
- **L1（自動マージ）**: ESLint修正、Prettier、未使用import、デザインシステム違反修正、patch/minor依存更新
- **L2（承認待ち）**: major依存更新のみ
`;
}

async function run() {
  if (!TARGET_REPO) {
    console.error("❌ TARGET_REPO is not set");
    process.exit(1);
  }

  if (!shouldProcess(TARGET_REPO)) {
    console.log(
      `⏭  ${TARGET_REPO}: TARGET_REPOS="${TARGET_REPOS}" に含まれないためスキップ`,
    );
    return;
  }

  if (TARGET_REPO === "meta-go") {
    console.log(`⏭  meta-go: 自己管理リポジトリのためスキップ`);
    return;
  }

  console.log(`\n📝 ${TARGET_REPO}: CLAUDE.md 配布開始 (${TEMPLATE_VERSION})`);

  const claudeMdContent = generateClaudeMd(TARGET_REPO);
  const agentsMdContent = generateAgentsMd(TARGET_REPO);

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${TARGET_REPO}/CLAUDE.md の内容:\n`);
    console.log(claudeMdContent);
    console.log(`[DRY RUN] AGENTS.md も配布対象`);
    return;
  }

  let tmpDir: string | null = null;
  try {
    tmpDir = cloneRepo(TARGET_REPO);
    console.log(`  ✓ Cloned ${TARGET_REPO}`);

    const claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const agentsMdPath = path.join(tmpDir, "AGENTS.md");

    fs.writeFileSync(claudeMdPath, claudeMdContent, "utf-8");
    console.log(`  ✓ CLAUDE.md を書き込み`);

    // go-design-system の AGENTS.md は framework-agnostic ガードを必ず最新に
    // 保つため強制上書き。他のリポは既存があればスキップ（ユーザー編集を保護）。
    if (TARGET_REPO === "go-design-system") {
      fs.writeFileSync(agentsMdPath, agentsMdContent, "utf-8");
      console.log(`  ✓ AGENTS.md を強制上書き（framework-agnostic ガード）`);
    } else if (!fs.existsSync(agentsMdPath)) {
      fs.writeFileSync(agentsMdPath, agentsMdContent, "utf-8");
      console.log(`  ✓ AGENTS.md を新規作成`);
    } else {
      console.log(`  ✓ AGENTS.md は既存のためスキップ`);
    }

    const branch = `metago/update-claude-md-${TEMPLATE_VERSION.replace(/\./g, "-")}`;
    const committed = createBranchAndCommit(
      tmpDir,
      branch,
      `docs: CLAUDE.md を ${TEMPLATE_VERSION} に更新 (MetaGo自動配布)`,
    );

    if (!committed) {
      console.log(`  ℹ️  変更なし — ${TARGET_REPO} は既に最新`);
      return;
    }

    const pr = await createAndMergePR(TARGET_REPO, {
      title: `docs: CLAUDE.md 更新 (${TEMPLATE_VERSION})`,
      body: `## MetaGo による CLAUDE.md 自動配布

テンプレートバージョン: \`${TEMPLATE_VERSION}\`

### 変更内容
- \`CLAUDE.md\` を最新テンプレートに更新
- 全goシリーズ共通のルール・パッケージ規則を統一

---
*このPRはMetaGoが自動作成しました（L1: auto-merge）*`,
      head: branch,
      labels: ["metago-auto-merge"],
    });

    console.log(`  ✓ PR作成 & マージ: ${pr.url}`);
  } finally {
    if (tmpDir) cleanup(tmpDir);
  }
}

run().catch((err) => {
  console.error(`❌ ${TARGET_REPO}:`, err.message || err);
  process.exit(1);
});
