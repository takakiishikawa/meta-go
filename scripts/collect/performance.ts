/**
 * Lighthouse CIで各goのパフォーマンスを測定する（週次）
 * 注: Lighthouse CIのセットアップが必要
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  console.log("🚀 Measuring performance...")
  console.log("Note: Lighthouse CI integration is not yet configured.")
  console.log("To enable: install @lhci/cli and configure .lighthouserc.js")
  console.log("✅ Performance measurement skipped (not configured)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
