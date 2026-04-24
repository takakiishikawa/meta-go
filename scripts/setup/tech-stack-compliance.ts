/**
 * 各goリポジトリを技術スタック方針書v2.0に準拠させる
 *
 * 環境変数:
 *   TARGET_REPO    — 対象リポジトリ名 (matrix で注入)
 *   TARGET_REPOS   — "all" または カンマ区切り (例: "native-go,care-go")
 *   TARGET_FIXES   — "all" または カンマ区切り (recharts-dynamic, vercel-analytics, remove-unused, layer2-missing, remove-openai)
 *   DRY_RUN        — "true" の場合、PR を作成せずログのみ
 *   AUTO_MERGE     — "true" の場合、PR に auto-merge を設定
 */

import Anthropic from "@anthropic-ai/sdk"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import {
  cloneRepo,
  createBranchAndCommit,
  createPR,
  cleanup,
} from "../../lib/github/git-operations"

const TARGET_REPO = process.env.TARGET_REPO!
const TARGET_REPOS = process.env.TARGET_REPOS || "all"
const TARGET_FIXES = process.env.TARGET_FIXES || "all"
const DRY_RUN = process.env.DRY_RUN === "true"
const AUTO_MERGE = process.env.AUTO_MERGE === "true"
const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa"
const GITHUB_RUN_ID = process.env.GITHUB_RUN_ID || ""

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── ユーティリティ ────────────────────────────────────────────

function shouldProcess(repo: string): boolean {
  if (TARGET_REPOS === "all") return true
  return TARGET_REPOS.split(",").map((r) => r.trim()).includes(repo)
}

function shouldFix(fix: string): boolean {
  if (TARGET_FIXES === "all") return true
  return TARGET_FIXES.split(",").map((f) => f.trim()).includes(fix)
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"))
}

function writeJson(filePath: string, data: any) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

function findFiles(dir: string, exts: string[]): string[] {
  const results: string[] = []
  const walk = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === ".next") continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (exts.some((ext) => e.name.endsWith(ext))) results.push(full)
    }
  }
  walk(dir)
  return results
}

function hasImport(content: string, pkg: string): boolean {
  return new RegExp(`from\\s+['"]${pkg.replace("/", "\\/")}['"]`).test(content) ||
    new RegExp(`require\\s*\\(\\s*['"]${pkg.replace("/", "\\/")}['"]`).test(content)
}

async function fixWithClaude(
  fileName: string,
  content: string,
  instruction: string,
): Promise<string | null> {
  if (content.length > 80_000) {
    console.warn(`  ${fileName} が大きすぎるためスキップ (${content.length} chars)`)
    return null
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        messages: [{
          role: "user",
          content: `${instruction}

ファイル名: ${fileName}

現在のファイル内容:
\`\`\`tsx
${content}
\`\`\`

修正後のファイル内容のみを返してください（説明なし、マークダウンのコードフェンスなし）。`,
        }],
      })
      const text = msg.content[0]
      if (text.type !== "text") return null
      return text.text.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "").trim()
    } catch (e: any) {
      if ((e?.status === 429) && attempt < 3) {
        const wait = 60_000 * attempt
        console.warn(`  Rate limit (attempt ${attempt}/3), ${wait / 1000}s 待機...`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      console.warn(`  Claude API エラー (${fileName}):`, e?.message)
      return null
    }
  }
  return null
}

// ── Fix 1: recharts dynamic import化 ──────────────────────────

async function fixRechartsImports(repoDir: string): Promise<{ changed: boolean; files: string[] }> {
  const tsFiles = findFiles(repoDir, [".tsx", ".ts"])
  const changedFiles: string[] = []

  for (const file of tsFiles) {
    const content = fs.readFileSync(file, "utf-8")
    if (!hasImport(content, "recharts")) continue

    // 既にdynamic importされていれば skip
    if (content.includes("from 'next/dynamic'") || content.includes('from "next/dynamic"')) {
      const lines = content.split("\n")
      const hasStaticRecharts = lines.some(
        (l) => /^import\s+\{[^}]+\}\s+from\s+['"]recharts['"]/.test(l)
      )
      if (!hasStaticRecharts) {
        console.log(`  ⏭  ${path.relative(repoDir, file)}: 既にdynamic import済み`)
        continue
      }
    }

    console.log(`  🔧 recharts dynamic import: ${path.relative(repoDir, file)}`)
    const fixed = await fixWithClaude(
      path.relative(repoDir, file),
      content,
      `rechartsのstatic importをnext/dynamicのdynamic importに変換してください。

変換ルール:
- \`import { ComponentA, ComponentB } from "recharts"\` のような行をすべてdynamic importに変換
- 各コンポーネントを個別のdynamic importにする
- ssr: false を必ず設定
- LoadingフォールバックはChartコンポーネント（LineChart, BarChart, AreaChart等）のみに付ける
  例: loading: () => <div className="animate-pulse h-40 bg-muted rounded" />
- XAxis, YAxis, CartesianGrid, Tooltip等のヘルパーコンポーネントはloading不要
- 'use client' ディレクティブがなければ先頭に追加（rechartsはCSR専用のため必須）
- TypeScriptの型エラーが出ないように変換する
- ファイルの他の部分は変更しない`
    )
    if (fixed) {
      fs.writeFileSync(file, fixed, "utf-8")
      changedFiles.push(path.relative(repoDir, file))
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  return { changed: changedFiles.length > 0, files: changedFiles }
}

// ── Fix 2: @vercel/analytics 導入 ─────────────────────────────

async function addVercelAnalytics(repoDir: string): Promise<boolean> {
  const pkgPath = path.join(repoDir, "package.json")
  if (!fs.existsSync(pkgPath)) return false

  const pkg = readJson(pkgPath)
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  if (deps["@vercel/analytics"]) {
    console.log(`  ⏭  @vercel/analytics: 既に追加済み`)
    return false
  }

  console.log(`  🔧 @vercel/analytics を追加`)
  pkg.dependencies = pkg.dependencies || {}
  pkg.dependencies["@vercel/analytics"] = "^1.5.0"
  writeJson(pkgPath, pkg)

  // layout.tsx に Analytics を追加
  const layoutPath = path.join(repoDir, "app", "layout.tsx")
  if (!fs.existsSync(layoutPath)) {
    console.log(`  ⚠️  app/layout.tsx が見つからないため Analytics コンポーネント追加をスキップ`)
    return true
  }

  const layoutContent = fs.readFileSync(layoutPath, "utf-8")
  if (layoutContent.includes("@vercel/analytics")) {
    console.log(`  ⏭  app/layout.tsx: Analytics既に追加済み`)
    return true
  }

  const fixed = await fixWithClaude(
    "app/layout.tsx",
    layoutContent,
    `app/layout.tsx に @vercel/analytics の Analytics コンポーネントを追加してください。

実施内容:
1. \`import { Analytics } from '@vercel/analytics/react'\` をインポートに追加
2. RootLayout の return の </body> の直前に <Analytics /> を追加
3. 既存のコードは一切変更しない（追加のみ）`
  )
  if (fixed) {
    fs.writeFileSync(layoutPath, fixed, "utf-8")
  }

  return true
}

// ── Fix 3: 未使用recharts削除 ─────────────────────────────────

function removeUnusedRecharts(repoDir: string): boolean {
  const pkgPath = path.join(repoDir, "package.json")
  if (!fs.existsSync(pkgPath)) return false

  const pkg = readJson(pkgPath)
  const hasDep = pkg.dependencies?.["recharts"] || pkg.devDependencies?.["recharts"]
  if (!hasDep) {
    console.log(`  ⏭  recharts: package.json に存在しない`)
    return false
  }

  const tsFiles = findFiles(repoDir, [".tsx", ".ts"])
  const isUsed = tsFiles.some((f) => hasImport(fs.readFileSync(f, "utf-8"), "recharts"))

  if (isUsed) {
    console.log(`  ⏭  recharts: コードで使用されているため削除しない`)
    return false
  }

  console.log(`  🔧 recharts を削除（未使用）`)
  if (pkg.dependencies?.["recharts"]) delete pkg.dependencies["recharts"]
  if (pkg.devDependencies?.["recharts"]) delete pkg.devDependencies["recharts"]
  writeJson(pkgPath, pkg)
  return true
}

// ── Fix 4: Layer 2 欠損補充 ───────────────────────────────────

const LAYER2_PACKAGES: Record<string, string> = {
  "zod": "^3.24.0",
  "date-fns": "^4.1.0",
  "react-hook-form": "^7.54.2",
  "@hookform/resolvers": "^3.9.1",
}

function addLayer2Missing(repoDir: string): { changed: boolean; added: string[] } {
  const pkgPath = path.join(repoDir, "package.json")
  if (!fs.existsSync(pkgPath)) return { changed: false, added: [] }

  const pkg = readJson(pkgPath)
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const added: string[] = []

  for (const [name, version] of Object.entries(LAYER2_PACKAGES)) {
    if (!deps[name]) {
      console.log(`  🔧 Layer 2 追加: ${name}@${version}`)
      pkg.dependencies = pkg.dependencies || {}
      pkg.dependencies[name] = version
      added.push(name)
    }
  }

  if (added.length > 0) writeJson(pkgPath, pkg)
  return { changed: added.length > 0, added }
}

// ── Fix 5: openai 削除 ────────────────────────────────────────

async function removeOpenAI(repoDir: string): Promise<boolean> {
  const pkgPath = path.join(repoDir, "package.json")
  if (!fs.existsSync(pkgPath)) return false

  const pkg = readJson(pkgPath)
  const hasOpenAI = pkg.dependencies?.["openai"] || pkg.devDependencies?.["openai"]
  if (!hasOpenAI) {
    console.log(`  ⏭  openai: package.json に存在しない`)
    return false
  }

  console.log(`  🔧 openai を削除`)
  if (pkg.dependencies?.["openai"]) delete pkg.dependencies["openai"]
  if (pkg.devDependencies?.["openai"]) delete pkg.devDependencies["openai"]
  writeJson(pkgPath, pkg)

  // openai を使っているファイルを @anthropic-ai/sdk に書き換え
  const tsFiles = findFiles(repoDir, [".tsx", ".ts"])
  for (const file of tsFiles) {
    const content = fs.readFileSync(file, "utf-8")
    if (!hasImport(content, "openai")) continue

    console.log(`  🔧 openai → @anthropic-ai/sdk: ${path.relative(repoDir, file)}`)
    const fixed = await fixWithClaude(
      path.relative(repoDir, file),
      content,
      `このファイルの openai SDK を @anthropic-ai/sdk に書き換えてください。

変換ルール:
- \`import OpenAI from 'openai'\` → \`import Anthropic from '@anthropic-ai/sdk'\`
- \`new OpenAI({ apiKey: ... })\` → \`new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })\`
- \`openai.chat.completions.create(...)\` → \`anthropic.messages.create(...)\`
- モデル名は claude-sonnet-4-6 を使用
- メッセージ構造をAnthropicのフォーマット（messages配列、role/content）に変換
- 書き換えが困難な場合はコメント /* TODO: openai → anthropic 移行が必要 */ を残して import だけ削除`
    )
    if (fixed) {
      fs.writeFileSync(file, fixed, "utf-8")
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  return true
}

// ── package-lock.json 更新 ────────────────────────────────────

function updatePackageLock(repoDir: string) {
  try {
    console.log(`  📦 package-lock.json を更新中...`)
    execSync("npm install --package-lock-only --ignore-scripts", {
      cwd: repoDir,
      stdio: "pipe",
      timeout: 120_000,
    })
    console.log(`  ✓ package-lock.json 更新完了`)
  } catch (e: any) {
    console.warn(`  ⚠️  package-lock.json 更新失敗:`, e?.message?.slice(0, 200))
  }
}

// ── GitHub: auto-merge 有効化 ─────────────────────────────────

async function enableAutoMerge(prNodeId: string) {
  const query = `
    mutation($id: ID!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) {
        pullRequest { id }
      }
    }
  `
  const GH_PAT = process.env.GH_PAT || process.env.GITHUB_TOKEN!
  await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: prNodeId } }),
  })
}

// ── メイン ───────────────────────────────────────────────────

async function run() {
  if (!TARGET_REPO) {
    console.error("❌ TARGET_REPO is not set")
    process.exit(1)
  }

  if (!shouldProcess(TARGET_REPO)) {
    console.log(`⏭  ${TARGET_REPO}: TARGET_REPOS="${TARGET_REPOS}" に含まれないためスキップ`)
    return
  }

  console.log(`\n🔍 ${TARGET_REPO}: tech-stack compliance チェック開始`)
  console.log(`   fixes: ${TARGET_FIXES} | dry_run: ${DRY_RUN} | auto_merge: ${AUTO_MERGE}`)

  let tmpDir: string | null = null
  try {
    tmpDir = cloneRepo(TARGET_REPO)
    console.log(`  ✓ Cloned ${TARGET_REPO}`)

    const pkgPath = path.join(tmpDir, "package.json")
    if (!fs.existsSync(pkgPath)) {
      console.log(`  ⏭  package.json が見つからないためスキップ`)
      return
    }

    const appliedFixes: string[] = []
    let packageJsonChanged = false

    // Fix 1: recharts dynamic import
    if (shouldFix("recharts-dynamic")) {
      const result = await fixRechartsImports(tmpDir)
      if (result.changed) appliedFixes.push(`✅ rechartsのdynamic import化 (${result.files.join(", ")})`)
    }

    // Fix 2: @vercel/analytics
    if (shouldFix("vercel-analytics")) {
      const changed = await addVercelAnalytics(tmpDir)
      if (changed) {
        appliedFixes.push("✅ @vercel/analytics 導入")
        packageJsonChanged = true
      }
    }

    // Fix 3: 未使用recharts削除
    if (shouldFix("remove-unused")) {
      const changed = removeUnusedRecharts(tmpDir)
      if (changed) {
        appliedFixes.push("✅ 未使用recharts削除")
        packageJsonChanged = true
      }
    }

    // Fix 4: Layer 2 欠損補充
    if (shouldFix("layer2-missing")) {
      const result = addLayer2Missing(tmpDir)
      if (result.changed) {
        appliedFixes.push(`✅ Layer 2 欠損補充: ${result.added.join(", ")}`)
        packageJsonChanged = true
      }
    }

    // Fix 5: openai 削除
    if (shouldFix("remove-openai")) {
      const changed = await removeOpenAI(tmpDir)
      if (changed) {
        appliedFixes.push("✅ openai 削除")
        packageJsonChanged = true
      }
    }

    if (appliedFixes.length === 0) {
      console.log(`  ℹ️  ${TARGET_REPO}: 修正対象なし — PRは作成しません`)
      return
    }

    console.log(`\n  📋 適用した修正:`)
    appliedFixes.forEach((f) => console.log(`     ${f}`))

    // package-lock.json 更新
    if (packageJsonChanged) {
      updatePackageLock(tmpDir)
    }

    if (DRY_RUN) {
      console.log(`\n  [DRY RUN] 以上の変更を適用予定。コミット・PR作成はしません。`)
      return
    }

    const branch = "metago/tech-stack-compliance-v2"
    const committed = createBranchAndCommit(
      tmpDir,
      branch,
      `chore: Tech stack compliance to v2.0 policy (MetaGo自動修正)`
    )

    if (!committed) {
      console.log(`  ℹ️  変更なし（git diff が空）— PRは作成しません`)
      return
    }

    const runUrl = GITHUB_RUN_ID
      ? `https://github.com/${GITHUB_OWNER}/meta-go/actions/runs/${GITHUB_RUN_ID}`
      : `https://github.com/${GITHUB_OWNER}/meta-go/actions`

    const fixesChecklist = [
      ["recharts-dynamic", "rechartsのdynamic import化"],
      ["vercel-analytics", "@vercel/analytics 導入"],
      ["remove-unused", "未使用依存削除"],
      ["layer2-missing", "Layer 2 欠損補充"],
      ["remove-openai", "openai 削除"],
    ].map(([key, label]) => {
      const done = appliedFixes.some((f) => f.includes(label.split(" ")[0]))
      return `- [${done ? "x" : " "}] ${label}`
    }).join("\n")

    const pr = await createPR(TARGET_REPO, {
      title: "chore: Tech stack compliance to v2.0 policy",
      body: `## MetaGoが自動生成した技術スタック刷新PRです。

## 実施した修正
${fixesChecklist}

## 詳細
${appliedFixes.map((f) => `- ${f}`).join("\n")}

## 参考
- 方針書: https://github.com/${GITHUB_OWNER}/meta-go/blob/main/docs/tech-stack-policy-v2.md
- 実行workflow: ${runUrl}

---
*このPRはMetaGoが自動作成しました*`,
      head: branch,
      labels: ["tech-stack-compliance", "metago-auto"],
    })

    console.log(`  📋 PR作成: ${pr.url}`)

    if (AUTO_MERGE) {
      await enableAutoMerge(pr.nodeId)
      console.log(`  ✓ auto-merge 有効化`)
    }
  } finally {
    if (tmpDir) cleanup(tmpDir)
  }
}

run().catch((err) => {
  console.error(`❌ ${TARGET_REPO}:`, err.message || err)
  process.exit(1)
})
