/**
 * 各goリポジトリに CLAUDE.md を配布する
 *
 * 環境変数:
 *   TARGET_REPO    — 対象リポジトリ名 (例: "native-go")。matrix で注入される
 *   TARGET_REPOS   — "all" または カンマ区切りリポジトリ名 (例: "native-go,care-go")
 *   DRY_RUN        — "true" の場合、PR を作成せずログのみ
 *   TEMPLATE_VERSION — テンプレートバージョン (例: "v2.0")
 */

import * as fs from "fs"
import * as path from "path"
import {
  cloneRepo,
  createBranchAndCommit,
  createReviewPR,
  cleanup,
} from "../../lib/github/git-operations"

const TARGET_REPO = process.env.TARGET_REPO!
const TARGET_REPOS = process.env.TARGET_REPOS || "all"
const DRY_RUN = process.env.DRY_RUN === "true"
const TEMPLATE_VERSION = process.env.TEMPLATE_VERSION || "v2.0"

const REPO_META: Record<string, { display: string; description: string }> = {
  "native-go":      { display: "native-go", description: "子育て記録・成長管理アプリ。お子さんの日々を記録し、成長を可視化する。" },
  "care-go":        { display: "care-go",   description: "介護記録・ケア管理アプリ。介護者の負担を軽減し、ケアの質を向上させる。" },
  "kenyaku-go":     { display: "kenyaku-go", description: "節約・家計管理アプリ。支出を把握し、賢い節約習慣を身につける。" },
  "cook-go":        { display: "cook-go",   description: "料理・レシピ管理アプリ。献立計画から買い物リストまでをサポートする。" },
  "physical-go":    { display: "physical-go", description: "フィジカル管理・運動記録アプリ。健康的な生活習慣の継続を支援する。" },
  "task-go":        { display: "task-go",   description: "タスク管理・GTDアプリ。仕事と生活のタスクを統合管理する。" },
  "go-design-system": { display: "go-design-system", description: "goシリーズ共通デザインシステム。" },
  "meta-go":        { display: "meta-go",   description: "goシリーズの中央管理ダッシュボード。" },
}

function shouldProcess(repo: string): boolean {
  if (TARGET_REPOS === "all") return true
  return TARGET_REPOS.split(",").map((r) => r.trim()).includes(repo)
}

function generateAgentsMd(): string {
  return `# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code. Heed deprecation notices.
`
}

function generateClaudeMd(repo: string): string {
  const meta = REPO_META[repo]
  if (!meta) throw new Error(`Unknown repo: ${repo}`)

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

## 重要なルール
1. **Breaking changeは慎重に** — 全goが依存するため後方互換性を維持
2. **セマンティックバージョニング厳守** — patch/minor/majorを正確に判断
3. **コンポーネントのAPIを安定させる** — propsの名前・型は変更しない
4. **Tailwind v4を前提** — 各goはTailwind v4を使用している

## MetaGo連携
MetaGoがこのリポジトリを中央管理しています。
- **L1（自動マージ）**: ESLint修正、patch/minor依存更新
- **L2（承認待ち）**: major依存更新
`
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
1. **go-design-systemのコンポーネント優先** — Button, Card, Badge等は \`@takaki/go-design-system\` 経由
2. **Server Components優先** — \`'use client'\` は必要箇所のみ
3. **型安全** — \`any\` 型は使用しない
4. **AI SDK** — \`@anthropic-ai/sdk\` のみ使用（openai等は禁止）
5. **MetaGo管理下** — コード品質・依存更新PRはMetaGoが自動作成

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
`
}

async function run() {
  if (!TARGET_REPO) {
    console.error("❌ TARGET_REPO is not set")
    process.exit(1)
  }

  if (!shouldProcess(TARGET_REPO)) {
    console.log(`⏭  ${TARGET_REPO}: TARGET_REPOS="${TARGET_REPOS}" に含まれないためスキップ`)
    return
  }

  if (TARGET_REPO === "meta-go") {
    console.log(`⏭  meta-go: 自己管理リポジトリのためスキップ`)
    return
  }

  console.log(`\n📝 ${TARGET_REPO}: CLAUDE.md 配布開始 (${TEMPLATE_VERSION})`)

  const claudeMdContent = generateClaudeMd(TARGET_REPO)
  const agentsMdContent = generateAgentsMd()

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${TARGET_REPO}/CLAUDE.md の内容:\n`)
    console.log(claudeMdContent)
    console.log(`[DRY RUN] AGENTS.md も配布対象`)
    return
  }

  let tmpDir: string | null = null
  try {
    tmpDir = cloneRepo(TARGET_REPO)
    console.log(`  ✓ Cloned ${TARGET_REPO}`)

    const claudeMdPath = path.join(tmpDir, "CLAUDE.md")
    const agentsMdPath = path.join(tmpDir, "AGENTS.md")

    fs.writeFileSync(claudeMdPath, claudeMdContent, "utf-8")
    console.log(`  ✓ CLAUDE.md を書き込み`)

    if (!fs.existsSync(agentsMdPath)) {
      fs.writeFileSync(agentsMdPath, agentsMdContent, "utf-8")
      console.log(`  ✓ AGENTS.md を新規作成`)
    } else {
      console.log(`  ✓ AGENTS.md は既存のためスキップ`)
    }

    const branch = `metago/update-claude-md-${TEMPLATE_VERSION.replace(/\./g, "-")}`
    const committed = createBranchAndCommit(
      tmpDir,
      branch,
      `docs: CLAUDE.md を ${TEMPLATE_VERSION} に更新 (MetaGo自動配布)`
    )

    if (!committed) {
      console.log(`  ℹ️  変更なし — ${TARGET_REPO} は既に最新`)
      return
    }

    const pr = await createReviewPR(TARGET_REPO, {
      title: `docs: CLAUDE.md 更新 (${TEMPLATE_VERSION})`,
      body: `## MetaGo による CLAUDE.md 自動配布

テンプレートバージョン: \`${TEMPLATE_VERSION}\`

### 変更内容
- \`CLAUDE.md\` を最新テンプレートに更新
- 全goシリーズ共通のルール・パッケージ規則を統一

### レビューポイント
- プロジェクト固有の記述に漏れがないか確認
- 問題なければマージしてください（L2: 手動承認）

---
*このPRはMetaGoが自動作成しました*`,
      head: branch,
      labels: ["metago-needs-review"],
    })

    console.log(`  📋 PR作成: ${pr.url}`)
  } finally {
    if (tmpDir) cleanup(tmpDir)
  }
}

run().catch((err) => {
  console.error(`❌ ${TARGET_REPO}:`, err.message || err)
  process.exit(1)
})
