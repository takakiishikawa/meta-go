/**
 * 各goのオープンPRを取得し、approval_queue を同期する
 *
 * - label: metago-needs-review → approval_queue に pending レコードを追加
 * - state: closed/merged の PR → approval_queue の対応レコードを resolved に更新
 */

import { createClient } from "@supabase/supabase-js";
import {
  GITHUB_OWNER,
  GITHUB_TOKEN,
  REPO_TO_SLUG,
  listOpenPRs,
} from "../../lib/github/git-operations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GO_REPOS = Object.values(REPO_TO_SLUG).reduce(
  (acc, slug) => {
    const repo =
      Object.entries(REPO_TO_SLUG).find(([r, s]) => s === slug)?.[0] ?? "";
    if (repo) acc[slug] = repo;
    return acc;
  },
  {} as Record<string, string>,
);

// repo slug → product id のマップを取得
async function getProductMap(): Promise<Map<string, string>> {
  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("id, name");
  const map = new Map<string, string>();
  for (const p of products ?? []) map.set(p.name, p.id);
  return map;
}

// approval_queue にある pending PR URL のセット取得
async function getPendingPrUrls(): Promise<Set<string>> {
  const { data } = await supabase
    .schema("metago")
    .from("approval_queue")
    .select("meta")
    .eq("state", "pending");
  const urls = new Set<string>();
  for (const item of data ?? []) {
    if (item.meta?.pr_url) urls.add(item.meta.pr_url);
  }
  return urls;
}

async function syncPRs() {
  const productMap = await getProductMap();
  const pendingPrUrls = await getPendingPrUrls();

  for (const [slug, repo] of Object.entries(GO_REPOS)) {
    const productId = productMap.get(slug);
    const prs = await listOpenPRs(repo);

    for (const pr of prs) {
      const labels: string[] = (pr.labels ?? []).map((l: any) => l.name);

      // L2 (MetaGo承認待ち) ラベルがついているPRを approval_queue に追加
      if (
        labels.includes("metago-needs-review") &&
        !pendingPrUrls.has(pr.html_url)
      ) {
        await supabase
          .schema("metago")
          .from("approval_queue")
          .insert({
            product_id: productId ?? null,
            title: pr.title,
            description: pr.body?.substring(0, 300) ?? null,
            category: inferCategory(pr.title),
            state: "pending",
            meta: {
              pr_url: pr.html_url,
              pr_number: pr.number,
              repo,
              level: "L2",
            },
          });
        console.log(
          `  📋 Added to approval_queue: ${pr.title} (${repo}#${pr.number})`,
        );
        pendingPrUrls.add(pr.html_url);
      }
    }

    // L1 (metago-auto-merge) ラベルのPRを自動マージ試行
    for (const pr of prs) {
      const labels: string[] = (pr.labels ?? []).map((l: any) => l.name);
      if (!labels.includes("metago-auto-merge")) continue;

      const mergeRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/pulls/${pr.number}/merge`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ merge_method: "squash" }),
        },
      );

      if (mergeRes.ok) {
        console.log(`  ✓ Auto-merged L1 PR: ${repo}#${pr.number}`);
        await supabase
          .schema("metago")
          .from("execution_logs")
          .insert({
            product_id: productId ?? null,
            category: "self-heal",
            title: `L1 PR自動マージ: ${pr.title}`,
            description: pr.html_url,
            state: "merged",
          });
      }
    }
  }
}

function inferCategory(title: string): string {
  if (title.includes("依存") || title.includes("deps")) return "dependency";
  if (title.includes("デザイン") || title.includes("design"))
    return "design_system";
  if (title.includes("品質") || title.includes("lint")) return "quality";
  if (title.includes("セキュリティ") || title.includes("security"))
    return "security";
  if (title.includes("パフォーマンス") || title.includes("performance"))
    return "performance";
  return "quality";
}

async function main() {
  console.log("🚀 Starting PR status sync...");
  await syncPRs();
  console.log("✅ PR status sync complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
