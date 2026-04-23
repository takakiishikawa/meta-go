/**
 * Lighthouse で各goのパフォーマンスを測定 → DB保存
 *
 * 環境変数:
 *   TARGET_REPO  — 処理対象リポジトリ名 (例: "native-go")。未設定時は全リポ処理。
 */

import { createClient } from "@supabase/supabase-js"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lighthouse = require("lighthouse")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chromeLauncher = require("chrome-launcher")

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

// 閾値: これを超えると quality_items に記録
const THRESHOLDS = {
  lcp: 2500,       // ms
  fid: 100,        // ms
  cls: 0.1,
  score: 70,       // Performance score (0-100)
}

async function runLighthouse(url: string): Promise<{
  lcp: number
  fid: number
  cls: number
  score: number
} | null> {
  let chrome: any = null

  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    })

    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance"],
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
      },
    })

    const lhr = result?.lhr
    if (!lhr) return null

    return {
      score: Math.round((lhr.categories?.performance?.score ?? 0) * 100),
      lcp: Math.round(lhr.audits?.["largest-contentful-paint"]?.numericValue ?? 0),
      fid: Math.round(lhr.audits?.["total-blocking-time"]?.numericValue ?? 0),
      cls: parseFloat((lhr.audits?.["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
    }
  } catch (e) {
    console.warn(`  Lighthouse failed for ${url}:`, e)
    return null
  } finally {
    if (chrome) await chrome.kill().catch(() => {})
  }
}

async function processProduct(product: any) {
  const url = product.vercel_url
  if (!url) {
    console.log(`  Skipping ${product.display_name}: no vercel_url`)
    return
  }

  console.log(`\n⚡ Performance: ${product.display_name} → ${url}`)

  const metrics = await runLighthouse(url)
  if (!metrics) {
    console.log(`  ⚠️  Could not measure ${product.display_name}`)
    return
  }

  console.log(`  score: ${metrics.score}, LCP: ${metrics.lcp}ms, TBT: ${metrics.fid}ms, CLS: ${metrics.cls}`)

  // performance_metrics に保存
  await supabase.schema("metago").from("performance_metrics").insert({
    product_id: product.id,
    lcp: metrics.lcp,
    fid: metrics.fid,
    cls: metrics.cls,
    score: metrics.score,
  })

  // scores_history に記録
  await supabase.schema("metago").from("scores_history").insert({
    product_id: product.id,
    category: "performance",
    score: metrics.score,
  })

  // 閾値超過の場合は quality_items に課題として記録
  const issues: string[] = []
  if (metrics.lcp > THRESHOLDS.lcp) issues.push(`LCP ${metrics.lcp}ms > ${THRESHOLDS.lcp}ms`)
  if (metrics.fid > THRESHOLDS.fid) issues.push(`TBT ${metrics.fid}ms > ${THRESHOLDS.fid}ms`)
  if (metrics.cls > THRESHOLDS.cls) issues.push(`CLS ${metrics.cls} > ${THRESHOLDS.cls}`)
  if (metrics.score < THRESHOLDS.score) issues.push(`Performance score ${metrics.score} < ${THRESHOLDS.score}`)

  for (const issue of issues) {
    await supabase.schema("metago").from("quality_items").upsert(
      {
        product_id: product.id,
        category: "Performance",
        title: `パフォーマンス改善: ${issue}`,
        description: `Lighthouseで計測した結果、${issue} が閾値を超えています。`,
        state: "new",
        level: "L1",
      },
      { onConflict: "product_id,title", ignoreDuplicates: true }
    )
  }
}

async function main() {
  console.log("🚀 Starting performance measurement...")

  const { data: products } = await supabase.schema("metago").from("products").select("*")
  if (!products?.length) return

  const targetRepo = process.env.TARGET_REPO
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null

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
