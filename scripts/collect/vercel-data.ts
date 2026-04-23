/**
 * Vercel APIからデプロイ情報を収集し、実行ログに記録する
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GO_VERCEL_PROJECTS: Record<string, string> = {
  nativego: "native-go",
  carego: "care-go",
  kenyakugo: "kenyaku-go",
  cookgo: "cook-go",
  physicalgo: "physical-go",
  taskgo: "task-go",
};

async function vercelFetch(path: string) {
  if (!VERCEL_TOKEN) {
    console.warn("VERCEL_TOKEN not set, skipping Vercel API");
    return null;
  }
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    console.warn(`Vercel API ${path} returned ${res.status}`);
    return null;
  }
  return res.json();
}

async function main() {
  console.log("🚀 Collecting Vercel data...");

  if (!VERCEL_TOKEN) {
    console.log("VERCEL_TOKEN not configured. Skipping.");
    return;
  }

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products) return;

  for (const product of products) {
    const projectName = GO_VERCEL_PROJECTS[product.name];
    if (!projectName) continue;

    const deployments = await vercelFetch(
      `/v6/deployments?projectId=${projectName}&limit=5`,
    );
    if (!deployments?.deployments?.length) continue;

    const latest = deployments.deployments[0];
    console.log(
      `✓ ${product.display_name}: latest deploy ${latest.state} at ${latest.createdAt}`,
    );

    // 実行ログに記録
    await supabase
      .schema("metago")
      .from("execution_logs")
      .insert({
        product_id: product.id,
        category: "deployment",
        title: `Deployment: ${latest.state}`,
        description: `URL: ${latest.url}, Branch: ${latest.meta?.githubCommitRef ?? "unknown"}`,
        state: latest.state === "READY" ? "merged" : "failed",
      });
  }

  console.log("\n✅ Vercel data collection complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
