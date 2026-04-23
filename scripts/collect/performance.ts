/**
 * Lighthouse CLI で各goのパフォーマンスを測定 → DB保存 + Claude分析で改善PR作成
 *
 * 問題が検出された場合:
 *   - ソースをcloneしてClaudeに分析させる
 *   - next/Image変換・dynamic import等の具体的修正をL2 PRで提案
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createReviewPR,
  cleanup,
} from "../../lib/github/git-operations"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const REPO_TO_SLUG: Record<string, string> = {
  "native-go":   "nativego",
  "care-go":     "carego",
  "kenyaku-go":  "kenyakugo",
  "cook-go":     "cookgo",
  "physical-go": "physicalgo",
  "task-go":     "taskgo",
}

const GO_REPOS: Record<string, string> = {
  nativego:   "native-go",
  carego:     "care-go",
  kenyakugo:  "kenyaku-go",
  cookgo:     "cook-go",
  physicalgo: "physical-go",
  taskgo:     "task-go",
}

const THRESHOLDS = {
  lcp: 2500,
  fid: 100,
  cls: 0.1,
  score: 70,
}

// ────────────────────────────────────────────────
// Lighthouse
// ────────────────────────────────────────────────

function findChrome(): string {
  const candidates = [
    "google-chrome", "google-chrome-stable",
    "chromium-browser", "chromium",
    "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium",
  ]
  for (const bin of candidates) {
    try { execSync(`which ${bin}`, { stdio: "pipe" }); return bin } catch {}
  }
  return "google-chrome"
}

function runLighthouse(url: string): { score: number; lcp: number; fid: number; cls: number } | null {
  const reportPath = path.join(os.tmpdir(), `lh-${Date.now()}.json`)
  const chrome = findChrome()
  try {
    execSync(
      [
        `npx lighthouse "${url}"`,
        `--output=json`,
        `--output-path="${reportPath}"`,
        `--chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage"`,
        `--chrome-path=$(which ${chrome} 2>/dev/null || echo "google-chrome")`,
        `--only-categories=performance`,
        `--quiet`,
      ].join(" "),
      { stdio: "pipe", timeout: 120_000 }
    )
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"))
    return {
      score: Math.round((report.categories?.performance?.score ?? 0) * 100),
      lcp:   Math.round(report.audits?.["largest-contentful-paint"]?.numericValue ?? 0),
      fid:   Math.round(report.audits?.["total-blocking-time"]?.numericValue ?? 0),
      cls:   parseFloat((report.audits?.["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
    }
  } catch (e: any) {
    console.warn(`  Lighthouse CLI failed for ${url}:`, e.stderr?.toString().slice(0, 200))
    return null
  } finally {
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath)
  }
}

// ────────────────────────────────────────────────
// Claude によるパフォーマンス改善分析 + 自動修正
// ────────────────────────────────────────────────

async function analyzeAndFix(
  repoDir: string,
  productName: string,
  issues: string[],
  anthropic: Anthropic
): Promise<{ patchCount: number; summary: string }> {
  // ソースファイルを収集
  let files: string[] = []
  try {
    files = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
      `-not -path "./node_modules/*" -not -path "./.next/*" | head -30`,
      { cwd: repoDir, stdio: "pipe" }
    ).toString().trim().split("\n").filter(Boolean)
  } catch { return { patchCount: 0, summary: "" } }

  const sections: string[] = []
  let totalChars = 0
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), "utf-8")
      if (totalChars + content.length > 60_000) break
      sections.push(`=== ${f} ===\n${content}`)
      totalChars += content.length
    } catch {}
  }
  if (sections.length === 0) return { patchCount: 0, summary: "" }

  const prompt = `You are a Next.js performance expert. The app "${productName}" has these Lighthouse issues:
${issues.map(i => `- ${i}`).join("\n")}

Analyze the source code and apply the most impactful fixes. Common fixes:
- Replace <img> with <Image> from next/image (add width/height if missing)
- Add loading="lazy" to images below the fold
- Convert heavy Client Components to Server Components where possible
- Add dynamic(() => import("..."), { ssr: false }) for large client-only libraries
- Remove unused imports that bloat the bundle

Source files:
${sections.join("\n\n")}

Return a JSON object:
{
  "patches": [
    { "file": "relative/path.tsx", "newContent": "complete new file content" }
  ],
  "summary": "日本語で変更内容の要約（200文字以内）"
}

Only include files you actually changed. Return ONLY the JSON — no explanation or markdown.`

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`  🤖 パフォーマンス改善分析... (試行 ${attempt})`)
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      })
      const raw = message.content[0]?.type === "text" ? message.content[0].text : ""
      const cleaned = raw.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("JSON not found")

      const result = JSON.parse(jsonMatch[0]) as {
        patches: Array<{ file: string; newContent: string }>
        summary: string
      }

      let patchCount = 0
      for (const patch of result.patches ?? []) {
        const fullPath = path.join(repoDir, patch.file)
        if (!fs.existsSync(fullPath)) continue
        fs.writeFileSync(fullPath, patch.newContent, "utf-8")
        console.log(`  ✓ 修正: ${patch.file}`)
        patchCount++
      }
      return { patchCount, summary: result.summary ?? "" }
    } catch (e: any) {
      if ((e?.status === 429) && attempt < 3) {
        await new Promise(r => setTimeout(r, 60_000 * attempt))
        continue
      }
      console.warn("  Claude分析失敗:", String(e).slice(0, 150))
      return { patchCount: 0, summary: "" }
    }
  }
  return { patchCount: 0, summary: "" }
}

// ────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────

async function processProduct(product: any, repo: string | null) {
  const url = product.vercel_url
  if (!url) {
    console.log(`  Skipping ${product.display_name}: no vercel_url`)
    return
  }

  console.log(`\n⚡ Performance: ${product.display_name} → ${url}`)

  const metrics = runLighthouse(url)
  if (!metrics) {
    console.log(`  ⚠️  Could not measure ${product.display_name}`)
    return
  }

  console.log(`  score: ${metrics.score}, LCP: ${metrics.lcp}ms, TBT: ${metrics.fid}ms, CLS: ${metrics.cls}`)

  await supabase.schema("metago").from("performance_metrics").insert({
    product_id: product.id,
    lcp: metrics.lcp, fid: metrics.fid, cls: metrics.cls, score: metrics.score,
  })

  await supabase.schema("metago").from("scores_history").insert({
    product_id: product.id, category: "performance", score: metrics.score,
  })

  const issues: string[] = []
  if (metrics.lcp   > THRESHOLDS.lcp)   issues.push(`LCP ${metrics.lcp}ms > ${THRESHOLDS.lcp}ms`)
  if (metrics.fid   > THRESHOLDS.fid)   issues.push(`TBT ${metrics.fid}ms > ${THRESHOLDS.fid}ms`)
  if (metrics.cls   > THRESHOLDS.cls)   issues.push(`CLS ${metrics.cls} > ${THRESHOLDS.cls}`)
  if (metrics.score < THRESHOLDS.score) issues.push(`score ${metrics.score} < ${THRESHOLDS.score}`)

  // quality_items 更新
  await supabase.schema("metago").from("quality_items")
    .delete().eq("product_id", product.id).eq("category", "Performance")

  for (const issue of issues) {
    await supabase.schema("metago").from("quality_items").insert({
      product_id: product.id, category: "Performance",
      title: `パフォーマンス: ${issue}`, description: `Lighthouse計測結果: ${issue}`,
      state: "new", level: "L1",
    })
  }

  // 問題がある場合 → ソース分析 + L2 改善PR
  if (issues.length > 0 && repo) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let repoDir: string | null = null
    try {
      repoDir = cloneRepo(repo)
      const { patchCount, summary } = await analyzeAndFix(repoDir, product.display_name, issues, anthropic)

      if (patchCount > 0 && hasChanges(repoDir)) {
        const branch = `metago/perf-${new Date().toISOString().slice(0, 10)}`
        const pushed = createBranchAndCommit(
          repoDir, branch,
          `perf: Lighthouse指摘パフォーマンス改善 [MetaGo L2]`
        )
        if (pushed) {
          const pr = await createReviewPR(repo, {
            title: `🤖 [MetaGo L2] パフォーマンス改善 — ${product.display_name}`,
            body: `MetaGo + Claude によるパフォーマンス改善提案です。

**Lighthouse計測結果**
${issues.map(i => `- ${i}`).join("\n")}

**変更内容**
${summary}

修正ファイル数: ${patchCount} 件

> ⚠️ L2: 動作確認後に承認してください。`,
            head: branch,
            labels: ["metago-needs-review"],
          })
          // approval_queue へ追加
          await supabase.schema("metago").from("approval_queue").insert({
            product_id:  product.id,
            title:       `パフォーマンス改善PR: ${product.display_name}`,
            description: `${issues.join(", ")} → ${summary}`,
            category:    "performance",
            state:       "pending",
            meta:        { pr_url: pr.url, level: "L2", repo },
          })
          console.log(`  📋 L2 PR作成: ${pr.url}`)
        }
      }
    } finally {
      if (repoDir) cleanup(repoDir)
    }
  }
}

async function main() {
  console.log("🚀 Starting performance measurement + improvement...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo = process.env.TARGET_REPO
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null

  for (const product of products) {
    if (targetSlug && product.name !== targetSlug) continue
    const repo = targetRepo ?? GO_REPOS[product.name] ?? null
    await processProduct(product, repo)
  }

  console.log("\n✅ Performance measurement complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
