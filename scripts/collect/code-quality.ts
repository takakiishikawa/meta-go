/**
 * 各goをcloneしてESLint/TSC解析 → 違反をDB保存 + 自動修正PR作成 (L1)
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import Anthropic from "@anthropic-ai/sdk"
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
    execSync("npx tsc --noEmit", { cwd: repoDir, stdio: "pipe", timeout: 120_000 })
  } catch (e: any) {
    const output = e.stdout?.toString() ?? ""
    const lines = output.split("\n").filter((l: string) => l.includes(": error TS"))
    errors.push(...lines.slice(0, 20))
  }
  return errors
}

interface AiIssue {
  title: string
  category: string
  description: string
  severity: "high" | "medium" | "low"
  file?: string
}

async function analyzeWithClaude(repoDir: string, productName: string): Promise<AiIssue[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // 分析対象ファイルを収集 (app/, components/, lib/, hooks/)
  let files: string[] = []
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
      `-not -path "./node_modules/*" -not -path "./.next/*" ` +
      `\\( -path "./app/*" -o -path "./components/*" -o -path "./lib/*" -o -path "./hooks/*" \\) ` +
      `| head -30`,
      { cwd: repoDir, stdio: "pipe" }
    ).toString().trim().split("\n").filter(Boolean)
  } catch {
    return []
  }

  if (files.length === 0) return []
  console.log(`  🤖 Claude AI analysis: reading ${files.length} files...`)

  // ファイル内容を収集 (合計60KB制限)
  const fileSections: string[] = []
  let totalChars = 0
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), "utf-8")
      if (totalChars + content.length > 60_000) break
      fileSections.push(`=== ${f} ===\n${content}`)
      totalChars += content.length
    } catch {}
  }

  const sourceCode = fileSections.join("\n\n")

  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: `You are a senior engineer auditing a Next.js TypeScript application called "${productName}" for technical debt and future risk.

Analyze the following source files and identify concrete issues that could cause bugs, maintenance burden, or scalability problems in the future.

${sourceCode}

Return a JSON array of issues. Each issue must have:
- "title": short title (max 80 chars, in Japanese)
- "category": one of "設計/アーキテクチャ" | "エラーハンドリング" | "型安全性" | "パフォーマンス" | "セキュリティ" | "保守性" | "重複コード"
- "description": detailed explanation in Japanese (max 300 chars) including WHY it's a problem and WHAT could go wrong
- "severity": "high" | "medium" | "low"
- "file": the most relevant file path (optional)

Focus ONLY on real, observable problems in this specific code. Do NOT invent generic suggestions. Limit to the 15 most impactful issues.

Return ONLY the JSON array with no explanation or markdown.`,
        }],
      })

      const text = message.content[0]?.type === "text" ? message.content[0].text : ""
      const cleaned = text.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim()
      const parsed = JSON.parse(cleaned.startsWith("[") ? cleaned : "[]")
      console.log(`  🤖 Claude found ${parsed.length} issues`)
      return parsed as AiIssue[]
    } catch (e: any) {
      const isRateLimit = e?.status === 429 || e?.error?.error?.type === "rate_limit_error"
      if (isRateLimit && attempt < MAX_RETRIES) {
        const wait = 60_000 * attempt
        console.warn(`  Rate limit (attempt ${attempt}/${MAX_RETRIES}), waiting ${wait / 1000}s...`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      console.warn("  Claude analysis failed:", String(e).slice(0, 200))
      return []
    }
  }
  return []
}

async function processRepo(product: any, repo: string) {
  console.log(`\n🔍 Code quality: ${product.display_name} (${repo})`)
  let repoDir: string | null = null

  try {
    repoDir = cloneRepo(repo)

    const { violations, fixedCount } = await runLintAndFix(repoDir, product.name)
    const tscErrors = await runTscCheck(repoDir)
    const aiIssues = await analyzeWithClaude(repoDir, product.display_name)

    // 既存レコードを削除してから新規挿入 (unique制約なしのためupsertは使わない)
    await supabase.schema("metago").from("quality_items")
      .delete().eq("product_id", product.id)

    // ESLint/TSC違反を保存
    const lintIssues = [
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
    for (const issue of lintIssues.slice(0, 50)) {
      await supabase.schema("metago").from("quality_items").insert(issue)
    }

    // Claude AI 分析結果を保存
    for (const issue of aiIssues.slice(0, 15)) {
      await supabase.schema("metago").from("quality_items").insert({
        product_id: product.id,
        category: issue.category,
        title: issue.title.substring(0, 200),
        description: issue.file
          ? `[${issue.file}] ${issue.description}`.substring(0, 500)
          : issue.description.substring(0, 500),
        state: "new",
        level: issue.severity === "high" ? "L1" : "L2",
      })
    }

    // スコア計算: ESLint/TSC + AI分析の重み付き
    const lintScore = Math.max(0, 100 - (violations.length + tscErrors.length) * 2)
    const aiPenalty = aiIssues.filter(i => i.severity === "high").length * 5 +
                      aiIssues.filter(i => i.severity === "medium").length * 2
    const score = Math.max(0, Math.round((lintScore + Math.max(0, 100 - aiPenalty)) / 2))

    await supabase.schema("metago").from("scores_history").insert({
      product_id: product.id,
      category: "quality",
      score,
    })

    // L1 自動修正 PR (ESLint/Prettier のみ)
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

    console.log(`  ✓ ESLint: ${violations.length}, TSC: ${tscErrors.length}, AI issues: ${aiIssues.length}, score: ${score}`)
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
