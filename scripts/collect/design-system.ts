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

const VIOLATION_PATTERNS: ViolationPattern[] = [
  {
    category: "カラー",
    pattern: /style=\{?\{[^}]*color:\s*['"]#[0-9a-fA-F]{3,6}['"]/g,
    description: "デザイントークン（var(--color-*)）を使わず直接カラーコードを使用",
    rule: "style属性内の color に直接カラーコード（#xxxxxx）を使わず、var(--color-*) トークンを使用してください",
  },
  {
    category: "フォントサイズ",
    pattern: /style=\{?\{[^}]*fontSize:\s*['"]?\d+px/g,
    description: "デザイントークン（var(--text-*)）を使わず直接フォントサイズを指定",
    rule: "style属性内の fontSize に直接px値を使わず、var(--text-*) トークンを使用してください",
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

    // スコア計算
    const totalViolations = allViolations.reduce((s, v) => s + v.issues.length, 0)
    const score = Math.max(0, 100 - totalViolations * 5)
    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category: "design_system",
      score,
    })

    console.log(`  violations: ${totalViolations}, score: ${score}`)

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
