/**
 * Lighthouse CLI で各goのパフォーマンスを測定 → DB保存
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

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

const THRESHOLDS = {
  lcp: 2500,
  fid: 100,
  cls: 0.1,
  score: 70,
}

function findChrome(): string {
  const candidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium-browser",
    "chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ]
  for (const bin of candidates) {
    try {
      execSync(`which ${bin}`, { stdio: "pipe" })
      return bin
    } catch {}
  }
  return "google-chrome"
}

function runLighthouse(url: string): {
  score: number
  lcp: number
  fid: number
  cls: number
} | null {
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

async function processProduct(product: any) {
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
    lcp:        metrics.lcp,
    fid:        metrics.fid,
    cls:        metrics.cls,
    score:      metrics.score,
  })

  await supabase.schema("metago").from("scores_history").insert({
    product_id: product.id,
    category:   "performance",
    score:      metrics.score,
  })

  const issues: string[] = []
  if (metrics.lcp   > THRESHOLDS.lcp)   issues.push(`LCP ${metrics.lcp}ms > ${THRESHOLDS.lcp}ms`)
  if (metrics.fid   > THRESHOLDS.fid)   issues.push(`TBT ${metrics.fid}ms > ${THRESHOLDS.fid}ms`)
  if (metrics.cls   > THRESHOLDS.cls)   issues.push(`CLS ${metrics.cls} > ${THRESHOLDS.cls}`)
  if (metrics.score < THRESHOLDS.score) issues.push(`score ${metrics.score} < ${THRESHOLDS.score}`)

  // 既存のパフォーマンス問題レコードを削除してから新規挿入
  await supabase.schema("metago").from("quality_items")
    .delete().eq("product_id", product.id).eq("category", "Performance")

  for (const issue of issues) {
    await supabase.schema("metago").from("quality_items").insert({
      product_id:  product.id,
      category:    "Performance",
      title:       `パフォーマンス: ${issue}`,
      description: `Lighthouse計測結果: ${issue}`,
      state:       "new",
      level:       "L1",
    })
  }
}

async function main() {
  console.log("🚀 Starting performance measurement...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo   = process.env.TARGET_REPO
  const targetSlug   = targetRepo ? REPO_TO_SLUG[targetRepo] : null

  for (const product of products) {
    if (targetSlug && product.name !== targetSlug) continue
    await processProduct(product)
  }

  console.log("\n✅ Performance measurement complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
