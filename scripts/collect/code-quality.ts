/**
 * 各goをcloneしてESLint/TSC解析 → 違反をDB保存 + 自動修正PR作成 (L1)
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import {
  REPO_TO_SLUG,
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations"

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

interface LintMessage {
  ruleId: string | null
  message: string
  line: number
  column: number
  severity: number
}

interface LintResult {
  filePath: string
  messages: LintMessage[]
  errorCount: number
  warningCount: number
}

async function runLintAndFix(repoDir: string, productName: string): Promise<{
  violations: Array<{ file: string; rule: string; message: string }>
  fixedCount: number
}> {
  const violations: Array<{ file: string; rule: string; message: string }> = []

  // deps install
  try {
    execSync("npm ci", { cwd: repoDir, stdio: "pipe", timeout: 300_000 })
    console.log("  npm ci: OK")
  } catch (e: any) {
    console.warn("  npm ci failed, falling back to npm install:", e.stderr?.toString().slice(0, 200))
    try {
      execSync("npm install --legacy-peer-deps", { cwd: repoDir, stdio: "pipe", timeout: 300_000 })
      console.log("  npm install: OK")
    } catch (e2: any) {
      console.warn("  npm install also failed:", e2.stderr?.toString().slice(0, 200))
    }
  }

  // TS/TSX ファイル数を確認 (診断用)
  try {
    const tsFileCount = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) -not -path "./node_modules/*" -not -path "./.next/*" | wc -l`,
      { cwd: repoDir, stdio: "pipe" }
    ).toString().trim()
    console.log(`  TS/TSX files found: ${tsFileCount}`)
  } catch {}

  // ESLint JSON出力で違反を収集
  // next lint を優先、なければ npx eslint にフォールバック
  const lintReportPath = path.join(repoDir, ".metago-lint.json")
  const hasNextLint = fs.existsSync(path.join(repoDir, ".eslintrc.json")) ||
                      fs.existsSync(path.join(repoDir, ".eslintrc.js")) ||
                      fs.existsSync(path.join(repoDir, "eslint.config.js")) ||
                      fs.existsSync(path.join(repoDir, "eslint.config.mjs"))

  const lintCmd = hasNextLint
    ? `npx next lint --format json 2>"${lintReportPath}" || npx eslint . --ext .ts,.tsx --format json --output-file "${lintReportPath}"`
    : `npx eslint . --ext .ts,.tsx --format json --output-file "${lintReportPath}"`

  try {
    // next lint は stdout に出力するので別途ハンドル
    if (hasNextLint) {
      try {
        const out = execSync(`npx next lint --format json`, { cwd: repoDir, stdio: "pipe", timeout: 120_000 })
        fs.writeFileSync(lintReportPath, out.toString())
      } catch (e: any) {
        // next lint は違反があると非ゼロ終了 + stderr に JSON
        const output = e.stdout?.toString() || e.stderr?.toString() || "[]"
        fs.writeFileSync(lintReportPath, output)
      }
    } else {
      try {
        execSync(
          `npx eslint . --ext .ts,.tsx --format json --output-file "${lintReportPath}"`,
          { cwd: repoDir, stdio: "pipe", timeout: 120_000 }
        )
      } catch {
        // 違反があると非ゼロ終了するので catch する
      }
    }
  } catch {}

  if (fs.existsSync(lintReportPath)) {
    try {
      const raw = fs.readFileSync(lintReportPath, "utf-8").trim()
      // next lint JSON形式は [{ filePath, messages }] と同じ
      const results: LintResult[] = JSON.parse(raw.startsWith("[") ? raw : "[]")
      let fileCount = 0
      for (const result of results) {
        if (result.messages?.length > 0) fileCount++
        const relFile = path.relative(repoDir, result.filePath)
        for (const msg of result.messages ?? []) {
          if (msg.severity >= 1) {
            violations.push({
              file: relFile,
              rule: msg.ruleId ?? "unknown",
              message: `${relFile}:${msg.line} ${msg.message}`,
            })
          }
        }
      }
      console.log(`  ESLint: ${results.length} files checked, ${violations.length} violations`)
    } catch (e) {
      console.warn("  ESLint report parse failed:", e)
    }
    fs.unlinkSync(lintReportPath)
  } else {
    console.warn("  ESLint report not generated")
  }

  // ESLint --fix で自動修正
  let fixedCount = 0
  try {
    execSync(
      `npx eslint . --ext .ts,.tsx --fix`,
      { cwd: repoDir, stdio: "pipe", timeout: 120_000 }
    )
    if (hasChanges(repoDir)) fixedCount = violations.length
  } catch {
    if (hasChanges(repoDir)) fixedCount = violations.length
  }

  // Prettier
  try {
    execSync(
      `npx prettier --write "**/*.{ts,tsx,js,json,css}"`,
      { cwd: repoDir, stdio: "pipe", timeout: 60_000 }
    )
  } catch {}

  return { violations, fixedCount }
}

async function runTscCheck(repoDir: string): Promise<string[]> {
  const errors: string[] = []
  try {
    execSync("npx tsc --noEmit", { cwd: repoDir, stdio: "pipe" })
  } catch (e: any) {
    const output = e.stdout?.toString() ?? ""
    const lines = output.split("\n").filter((l: string) => l.includes(": error TS"))
    errors.push(...lines.slice(0, 20))
  }
  return errors
}

async function processRepo(product: any, repo: string) {
  console.log(`\n🔍 Code quality: ${product.display_name} (${repo})`)
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    const { violations, fixedCount } = await runLintAndFix(repoDir, product.name)
    const tscErrors = await runTscCheck(repoDir)

    // 違反を DB に保存
    const allIssues = [
      ...violations.map((v) => ({
        product_id: product.id,
        category: "ESLint",
        title: v.rule,
        description: v.message.substring(0, 500),
        state: "new",
        level: "L1",
      })),
      ...tscErrors.map((e) => ({
        product_id: product.id,
        category: "TypeScript",
        title: "型エラー",
        description: e.substring(0, 500),
        state: "new",
        level: "L1",
      })),
    ]

    for (const issue of allIssues.slice(0, 50)) {
      await supabase
        .schema("metago")
        .from("quality_items")
        .upsert(issue, { onConflict: "product_id,title,description", ignoreDuplicates: true })
    }

    // スコア計算
    const totalViolations = violations.length + tscErrors.length
    const score = Math.max(0, 100 - totalViolations * 2)
    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category: "quality",
      score,
    })

    // L1 自動修正 PR
    if (hasChanges(repoDir)) {
      const branch = `metago/code-quality-${new Date().toISOString().slice(0, 10)}`
      const pushed = createBranchAndCommit(
        repoDir,
        branch,
        `fix(code-quality): ESLint auto-fix / Prettier [L1 MetaGo]`
      )
      if (pushed) {
        await createAndMergePR(repo, {
          title: `🤖 [MetaGo L1] コード品質自動修正 — ${product.display_name}`,
          body: `MetaGo による ESLint 自動修正・Prettier 整形です。

**修正内容**
- ESLint violations: ${violations.length} 件 (自動修正: ${fixedCount} 件)
- TypeScript errors: ${tscErrors.length} 件 (参考表示のみ)
- Prettier 整形

> L1: 自動マージ対象。コードロジックへの変更はありません。`,
          head: branch,
          labels: ["metago-auto-merge"],
        })
      }
    }

    console.log(`  ✓ violations: ${violations.length}, tsc: ${tscErrors.length}, score: ${score}`)
  } catch (e) {
    console.error(`  ❌ Failed: ${repo}`, e)
    await supabase.schema("metago").from("execution_logs").insert({
      product_id: product.id,
      category: "code-quality",
      title: `コード品質チェック失敗: ${repo}`,
      description: String(e),
      state: "failed",
    })
  } finally {
    if (repoDir) cleanup(repoDir)
  }
}

async function main() {
  console.log("🚀 Starting code quality collection...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo = process.env.TARGET_REPO

  for (const product of products) {
    const repo = GO_REPOS[product.name]
    if (!repo) continue
    if (targetRepo && repo !== targetRepo) continue
    await processRepo(product, repo)
  }

  console.log("\n✅ Code quality collection complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
