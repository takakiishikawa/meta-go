/**
 * 各goのSupabaseスキーマから指標実測値を収集し、
 * psf_scoresテーブルにUPSERTする
 *
 * PSFスコア計算式:
 *   結果指標達成率 × 0.7 + 行動指標達成率 × 0.3
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const IS_PSF_SNAPSHOT = process.argv.includes("--psf-snapshot")

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function getProducts() {
  const { data } = await supabase.schema("metago").from("products").select("*")
  return data ?? []
}

async function getMetricDefinitions(productId: string) {
  const { data } = await supabase
    .schema("metago")
    .from("psf_metrics_definitions")
    .select("*")
    .eq("product_id", productId)
  return data ?? []
}

// ─── NativeGo ────────────────────────────────────────────────

async function collectNativeGo(supabase: SupabaseClient) {
  const metrics: Record<string, number | null> = {}

  try {
    // Speaking Test スコア（直近1件）
    const { data: speakingTest } = await supabase
      .schema("nativego")
      .from("speaking_tests")
      .select("score")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    metrics.speaking_test_score = speakingTest?.score ?? null
  } catch {
    metrics.speaking_test_score = null
  }

  try {
    // リピーティング回数/週（過去7日）
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { count } = await supabase
      .schema("nativego")
      .from("repeatings")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo)
    metrics.repeating_weekly = count ?? null
  } catch {
    metrics.repeating_weekly = null
  }

  return metrics
}

// ─── CareGo ──────────────────────────────────────────────────

async function collectCareGo(supabase: SupabaseClient) {
  const metrics: Record<string, number | null> = {}

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data: checkins } = await supabase
      .schema("carego")
      .from("checkins")
      .select("score")
      .gte("created_at", weekAgo)
    if (checkins && checkins.length > 0) {
      metrics.condition_avg = checkins.reduce((a, c) => a + c.score, 0) / checkins.length
    } else {
      metrics.condition_avg = null
    }
  } catch {
    metrics.condition_avg = null
  }

  return metrics
}

// ─── PSFスコア計算 ────────────────────────────────────────────

function calcPsfScore(
  metrics: Record<string, number | null>,
  definitions: any[]
): { psf_score: number; result_score: number; behavior_score: number } {
  const resultDefs = definitions.filter((d) => d.metric_type === "result")
  const behaviorDefs = definitions.filter((d) => d.metric_type === "behavior")

  function calcAchievement(defs: any[]): number {
    if (defs.length === 0) return 0
    let totalWeight = 0
    let weightedScore = 0
    for (const def of defs) {
      if (!def.target_value || def.target_value === 0) continue
      // 実測値がない場合はスキップ
      totalWeight += def.weight
      // 指標名からmetrics objectを参照する（将来拡張）
      weightedScore += 0 // データ収集実装後に値を挿入
    }
    if (totalWeight === 0) return 0
    return Math.min(100, (weightedScore / totalWeight) * 100)
  }

  const result_score = calcAchievement(resultDefs)
  const behavior_score = calcAchievement(behaviorDefs)
  const psf_score = result_score * 0.7 + behavior_score * 0.3

  return { psf_score, result_score, behavior_score }
}

async function main() {
  console.log(`🚀 Collecting Supabase metrics... (psf-snapshot: ${IS_PSF_SNAPSHOT})`)

  const products = await getProducts()

  for (const product of products) {
    console.log(`\n📊 ${product.display_name}`)
    const definitions = await getMetricDefinitions(product.id)

    // engagementデータの更新（エンゲージメント推移）
    // 各goのUsage計測は各スキーマのアクセスログから（将来実装）
    await supabase.schema("metago").from("engagement_history").insert({
      product_id: product.id,
      usage_count: 0, // 実装後に実測値を挿入
      trend: "flat",
      measured_at: new Date().toISOString(),
    })

    // PSFスナップショット（週次のみ）
    if (IS_PSF_SNAPSHOT) {
      const { psf_score, result_score, behavior_score } = calcPsfScore({}, definitions)
      await supabase.schema("metago").from("psf_scores").insert({
        product_id: product.id,
        psf_score,
        result_score,
        behavior_score,
        result_details: {},
        behavior_details: {},
        trend: "flat",
        collected_at: new Date().toISOString(),
      })
      console.log(`  PSF: ${psf_score.toFixed(1)} (result: ${result_score.toFixed(1)}, behavior: ${behavior_score.toFixed(1)})`)
    }
  }

  console.log("\n✅ Supabase metrics collection complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
