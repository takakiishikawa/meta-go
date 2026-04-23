/**
 * コストデータを収集する（週次）
 * 手動入力または各サービスのAPIから取得
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("🚀 Collecting cost data...");
  console.log(
    "Note: Vercel and Supabase do not provide programmatic billing APIs.",
  );
  console.log(
    "Cost data should be entered manually via the MetaGo UI or seed SQL.",
  );
  console.log("✅ Cost collection skipped (manual entry required)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
