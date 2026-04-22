/**
 * デザインシステム準拠率チェック（週次）
 * 各goのリポジトリをクローンして静的解析する
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!
const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const GO_REPOS: Record<string, string> = {
  nativego: "native-go",
  carego: "care-go",
  kenyakugo: "kenyaku-go",
  cookgo: "cook-go",
  physicalgo: "physical-go",
  taskgo: "task-go",
}

// 違反パターン定義
const VIOLATION_PATTERNS = [
  {
    category: "カラー",
    pattern: /style=.*color:\s*['"]?#(?!var\()/g,
    description: "デザイントークン（var(--color-*)）を使わず直接カラーコードを使用",
  },
  {
    category: "フォント",
    pattern: /style=.*fontSize:\s*['"]?\d+px/g,
    description: "デザイントークン（var(--text-*)）を使わず直接フォントサイズを指定",
  },
]

async function analyzeRepo(productId: string, repoName: string, tmpDir: string) {
  const repoPath = path.join(tmpDir, repoName)

  try {
    // クローン
    execSync(
      `git clone --depth 1 https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repoName}.git ${repoPath}`,
      { stdio: "pipe" }
    )
  } catch (e) {
    console.warn(`Failed to clone ${repoName}:`, e)
    return
  }

  const violations: Array<{ category: string; title: string; description: string; file: string }> = []

  // TSX/TSファイルを検索
  const findFiles = (dir: string): string[] => {
    const result: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git") continue
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          result.push(...findFiles(fullPath))
        } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          result.push(fullPath)
        }
      }
    } catch {}
    return result
  }

  const files = findFiles(repoPath)
  for (const file of files) {
    let content: string
    try {
      content = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }

    for (const vp of VIOLATION_PATTERNS) {
      const matches = content.match(vp.pattern)
      if (matches && matches.length > 0) {
        const relativePath = path.relative(repoPath, file)
        violations.push({
          category: vp.category,
          title: `${vp.category}違反: ${relativePath}`,
          description: `${vp.description} (${matches.length}箇所)`,
          file: relativePath,
        })
      }
    }
  }

  // Upsert violations
  for (const v of violations.slice(0, 50)) {
    await supabase.schema("metago").from("design_system_items").upsert(
      {
        product_id: productId,
        category: v.category,
        title: v.title,
        description: v.description,
        state: "new",
      },
      { onConflict: "product_id,title", ignoreDuplicates: true }
    )
  }

  // スコア計算（違反0件 = 100点、1件ごとに5点減点、最低0点）
  const score = Math.max(0, 100 - violations.length * 5)
  await supabase.schema("metago").from("scores_history").insert({
    product_id: productId,
    category: "design_system",
    score,
  })

  console.log(`✓ ${repoName}: ${violations.length} violations, score: ${score}`)

  // クリーンアップ
  fs.rmSync(repoPath, { recursive: true, force: true })
}

async function main() {
  console.log("🚀 Checking design system compliance...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products) return

  const tmpDir = fs.mkdtempSync("/tmp/metago-ds-")

  try {
    for (const product of products) {
      const repo = GO_REPOS[product.name]
      if (!repo) continue
      console.log(`\n🎨 ${product.display_name}`)
      await analyzeRepo(product.id, repo, tmpDir)
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log("\n✅ Design system compliance check complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
