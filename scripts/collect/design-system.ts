/**
 * デザインシステム準拠率チェック → 違反をDB保存 + Claude APIで自動修正PR作成 (L1)
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations"
import { fixViolationsWithClaude } from "../../lib/github/claude-api"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GO_REPOS: Record<string, string> = {
  nativego:   "native-go",
  carego:     "care-go",
  kenyakugo:  "kenyaku-go",
  cookgo:     "cook-go",
  physicalgo: "physical-go",
  taskgo:     "task-go",
}

interface ViolationPattern {
  category: string
  pattern: RegExp
  description: string
  rule: string
}

// Tailwind パレットカラー名一覧
const TW_COLORS = [
  "red","orange","amber","yellow","lime","green","emerald","teal",
  "cyan","sky","blue","indigo","violet","purple","fuchsia","pink","rose",
  "slate","gray","zinc","neutral","stone",
].join("|")

// Tailwind カラー系プレフィックス
const TW_PREFIXES = [
  "text","bg","border","ring","fill","stroke","shadow","outline",
  "from","to","via","decoration","divide","placeholder","caret","accent",
].join("|")

const VIOLATION_PATTERNS: ViolationPattern[] = [
  // 1. Tailwind パレットカラークラス直書き (最頻出違反)
  //    例: text-blue-500, bg-red-100, border-green-300
  {
    category: "Tailwindカラー直書き",
    pattern: new RegExp(
      `(?:${TW_PREFIXES})-(${TW_COLORS})-(?:50|100|200|300|400|500|600|700|800|900|950)(?![\\w-])`,
      "g"
    ),
    description: "Tailwindパレットカラー直書き。go-design-systemのCSS変数(var(--color-*))またはDSコンポーネントのpropsを使用してください",
    rule: "className内のTailwindパレットカラー(text-blue-500等)をvar(--color-*)トークンに置き換えてください",
  },

  // 2. Tailwind arbitrary カラー値 (text-[#xxx], bg-[rgb(...)])
  {
    category: "任意カラー値直書き",
    pattern: /(?:text|bg|border|ring|fill|stroke|from|to|via)\-\[(?:#[0-9a-fA-F]{3,8}|rgb[a]?\()/g,
    description: "Tailwind arbitrary値でカラーを直接指定。var(--color-*)トークンを使用してください",
    rule: "className内のarbitrary color値([#xxx]等)をvar(--color-*)に置き換えてください",
  },

  // 3. style属性内の直接カラーコード
  //    例: style={{ color: '#1E3A8A' }}, style={{ backgroundColor: "rgb(30,58,138)" }}
  {
    category: "styleカラー直書き",
    pattern: /style=\{[^}]*(?:color|background(?:Color)?|borderColor|fill|stroke):\s*['"](?:#[0-9a-fA-F]{3,8}|rgb)/g,
    description: "style属性内に直接カラーコードを指定。var(--color-*)トークンを使用してください",
    rule: "style属性のcolor系プロパティをvar(--color-*)に置き換えてください",
  },

  // 4. style属性内の直接フォントサイズ (px/rem直書き)
  //    例: style={{ fontSize: '12px' }}, style={{ fontSize: '0.75rem' }}
  {
    category: "フォントサイズ直書き",
    pattern: /style=\{[^}]*fontSize:\s*['"]?(?:\d+px|\d*\.\d+rem)/g,
    description: "style属性内にpx/rem値で直接フォントサイズを指定。var(--text-*)トークンを使用してください",
    rule: "style属性のfontSizeをvar(--text-*)に置き換えてください",
  },

  // 5. Tailwind arbitrary フォントサイズ (text-[12px], text-[0.75rem])
  {
    category: "任意フォントサイズ直書き",
    pattern: /text-\[(?:\d+px|\d*\.\d+rem)\]/g,
    description: "Tailwind arbitrary値でフォントサイズを直接指定。var(--text-*)トークンを使用してください",
    rule: "text-[12px]等の任意値をvar(--text-*)に置き換えてください",
  },

  // 6. go-design-system の代わりに素のHTML要素を使用
  //    例: <button class, <input type=, <select name=
  {
    category: "素のHTML要素使用",
    pattern: /<(?:button|input|select|textarea)\s+(?!.*\/\/)/g,
    description: "go-design-systemのButtonやInputコンポーネントではなく素のHTML要素を使用",
    rule: "<button>→<Button>, <input>→<Input>等、go-design-systemコンポーネントを使用してください",
  },
]

function findTsxFiles(dir: string): string[] {
  const result: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) result.push(...findTsxFiles(fullPath))
      else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) result.push(fullPath)
    }
  } catch {}
  return result
}

interface FileViolation {
  file: string
  fullPath: string
  content: string
  issues: string[]
  category: string
}

async function analyzeRepo(product: any, repo: string) {
  console.log(`\n🎨 Design system: ${product.display_name} (${repo})`)
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    const allViolations: FileViolation[] = []
    const files = findTsxFiles(repoDir)
    console.log(`  📂 Scanning ${files.length} TS/TSX files...`)

    for (const filePath of files) {
      let content: string
      try {
        content = fs.readFileSync(filePath, "utf-8")
      } catch {
        continue
      }
      const relPath = path.relative(repoDir, filePath)

      for (const vp of VIOLATION_PATTERNS) {
        const matches = [...content.matchAll(new RegExp(vp.pattern.source, "g"))]
        if (matches.length === 0) continue

        const existing = allViolations.find((v) => v.file === relPath && v.category === vp.category)
        const issues = matches.map((m) => `L: ${m[0].substring(0, 80)}`)

        if (existing) {
          existing.issues.push(...issues)
        } else {
          allViolations.push({
            file: relPath,
            fullPath: filePath,
            content,
            issues,
            category: vp.category,
          })
        }

        // DB に違反記録
        await supabase.schema("metago").from("design_system_items").upsert(
          {
            product_id: product.id,
            category: vp.category,
            title: `${vp.category}違反: ${relPath}`,
            description: `${vp.description} (${matches.length}箇所)`,
            state: "new",
          },
          { onConflict: "product_id,title", ignoreDuplicates: false }
        )
      }
    }

    // スコア計算（違反ファイル数ベース、1ファイルあたり-3点、最低0点）
    const violatedFileCount = allViolations.length
    const totalHits = allViolations.reduce((s, v) => s + v.issues.length, 0)
    const score = Math.max(0, 100 - violatedFileCount * 3)
    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category: "design_system",
      score,
    })

    // カテゴリ別サマリー
    const byCategory = new Map<string, number>()
    for (const v of allViolations) {
      byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + v.issues.length)
    }
    const summary = [...byCategory.entries()].map(([k, n]) => `${k}:${n}`).join(", ")
    console.log(`  violated files: ${violatedFileCount}, total hits: ${totalHits}, score: ${score}`)
    if (summary) console.log(`  breakdown: ${summary}`)

    // Claude API で自動修正
    if (allViolations.length > 0) {
      const patchTargets = allViolations.slice(0, 10).map((v) => ({
        file: v.file,
        content: v.content,
        issues: v.issues,
      }))

      const rule =
        "デザインシステムトークンを使用してください。style属性内の直接カラーコードは var(--color-*) に、直接px値は var(--text-*) に置き換えてください。"

      console.log(`  🤖 Asking Claude to fix ${patchTargets.length} files...`)
      const patches = await fixViolationsWithClaude(patchTargets, rule)

      for (const patch of patches) {
        const fullPath = path.join(repoDir, patch.filePath)
        fs.writeFileSync(fullPath, patch.newContent, "utf-8")
      }

      if (hasChanges(repoDir)) {
        const branch = `metago/design-system-${new Date().toISOString().slice(0, 10)}`
        const pushed = createBranchAndCommit(
          repoDir,
          branch,
          `fix(design-system): デザイントークン適用 [L1 MetaGo]`
        )
        if (pushed) {
          await createAndMergePR(repo, {
            title: `🤖 [MetaGo L1] デザインシステム違反修正 — ${product.display_name}`,
            body: `MetaGo + Claude によるデザインシステム違反の自動修正です。

**修正内容**
- 直接カラーコード → \`var(--color-*)\` トークンへ置換
- 直接フォントサイズ → \`var(--text-*)\` トークンへ置換
- 修正ファイル数: ${patches.length} 件

> L1: 自動マージ対象。スタイルトークンの置換のみです。`,
            head: branch,
            labels: ["metago-auto-merge"],
          })
        }
      }
    }
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e)
    await supabase.schema("metago").from("execution_logs").insert({
      product_id: product.id,
      category: "design-system",
      title: `デザインシステムチェック失敗: ${repo}`,
      description: String(e),
      state: "failed",
    })
  } finally {
    if (repoDir) cleanup(repoDir)
  }
}

async function main() {
  console.log("🚀 Starting design system compliance check...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo = process.env.TARGET_REPO

  for (const product of products) {
    const repo = GO_REPOS[product.name]
    if (!repo) continue
    if (targetRepo && repo !== targetRepo) continue
    await analyzeRepo(product, repo)
  }

  console.log("\n✅ Design system compliance check complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
