/**
 * deploy FIX
 *
 * 各Goプロダクトの最新Vercel deploymentを確認し、失敗していたら
 * build log + 失敗commitの内容を Claude に渡して修正PRを作成・即マージする。
 *
 * ループ防止:
 *   - 同じ commit_sha に対する 24h以内の試行が >= 3 なら諦め
 *   - execution_logs の category='deploy-fix' で履歴管理
 *
 * 認証: CLAUDE_CODE_OAUTH_TOKEN (Claude Code Max プラン) + VERCEL_TOKEN
 *
 * 環境変数:
 *   TARGET_REPO  — 対象リポジトリ名 (省略時は全Go)
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
} from "../../lib/github/git-operations";
import { GO_REPOS, REPO_TO_SLUG, getSupabase } from "../../lib/metago/items";
import { runClaudeForJSON } from "../../lib/metago/claude-cli";

const supabase = getSupabase();

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const MAX_ATTEMPTS_PER_COMMIT = 3;
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const FAILED_STATES = new Set(["ERROR", "CANCELED"]);

// product slug → Vercel project 名
const VERCEL_PROJECT_MAP: Record<string, string> = {
  nativego: "native-go",
  carego: "care-go",
  kenyakugo: "kenyaku-go",
  cookgo: "cook-go",
  physicalgo: "physical-go",
  taskgo: "task-go",
  designsystem: "go-design-system",
};

interface VercelDeployment {
  uid: string;
  url: string;
  state: string;
  createdAt: number;
  meta?: {
    githubCommitSha?: string;
    githubCommitRef?: string;
    githubCommitMessage?: string;
  };
}

async function vercelFetch<T = any>(p: string): Promise<T | null> {
  if (!VERCEL_TOKEN) return null;
  const res = await fetch(`https://api.vercel.com${p}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) {
    console.warn(`  Vercel API ${p} → ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

async function getLatestDeployment(
  vercelProject: string,
): Promise<VercelDeployment | null> {
  const data = await vercelFetch<{ deployments: VercelDeployment[] }>(
    `/v6/deployments?projectId=${vercelProject}&limit=1&target=production`,
  );
  // production が無ければ全 target
  if (!data?.deployments?.length) {
    const fallback = await vercelFetch<{ deployments: VercelDeployment[] }>(
      `/v6/deployments?projectId=${vercelProject}&limit=1`,
    );
    return fallback?.deployments?.[0] ?? null;
  }
  return data.deployments[0];
}

async function getBuildLog(deploymentId: string): Promise<string> {
  const data = await vercelFetch<any[]>(
    `/v3/deployments/${deploymentId}/events?limit=500`,
  );
  if (!Array.isArray(data)) return "";
  const lines: string[] = [];
  for (const ev of data) {
    const txt: string =
      typeof ev?.payload?.text === "string"
        ? ev.payload.text
        : typeof ev?.text === "string"
          ? ev.text
          : "";
    if (!txt) continue;
    const isError =
      ev?.type === "stderr" ||
      ev?.type === "error" ||
      /error|failed|failure|cannot|missing/i.test(txt);
    if (isError) lines.push(txt);
  }
  // 末尾10KBに丸める（大きすぎるとClaudeのcontextを圧迫）
  return lines.join("\n").slice(-10_000);
}

async function countRecentAttempts(
  productId: string,
  commitSha: string,
): Promise<number> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  const { data } = await supabase
    .schema("metago")
    .from("execution_logs")
    .select("id")
    .eq("product_id", productId)
    .eq("category", "deploy-fix")
    .gte("created_at", since)
    .like("description", `%${commitSha}%`);
  return data?.length ?? 0;
}

async function logAttempt(
  productId: string,
  state: "merged" | "abandoned" | "failed",
  data: Record<string, unknown>,
  title: string,
) {
  await supabase
    .schema("metago")
    .from("execution_logs")
    .insert({
      product_id: productId,
      category: "deploy-fix",
      title,
      description: JSON.stringify(data),
      state,
    });
}

function listSourceFiles(repoDir: string, limit: number): string[] {
  try {
    const out = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.json" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" -not -path "./dist/*" -not -path "./out/*" ` +
        `| head -${limit}`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim();
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function fixForProduct(product: { id: string; name: string; display_name: string }) {
  const repo = GO_REPOS[product.name];
  const vercelProject = VERCEL_PROJECT_MAP[product.name];
  if (!repo || !vercelProject) {
    console.log(`  ⏭  ${product.name}: repo / vercel mapping なし`);
    return;
  }

  console.log(`\n🔍 [DEPLOY-FIX] ${product.display_name} (${repo})`);

  const latest = await getLatestDeployment(vercelProject);
  if (!latest) {
    console.log(`  deployment 取得失敗`);
    return;
  }

  if (!FAILED_STATES.has(latest.state)) {
    console.log(`  ✅ 最新 deploy は ${latest.state} — 修正不要`);
    return;
  }

  const commitSha = latest.meta?.githubCommitSha;
  if (!commitSha) {
    console.log(`  ⏭  失敗 deploy だが commit SHA 不明 — スキップ`);
    return;
  }

  const branchRef = latest.meta?.githubCommitRef ?? "unknown";
  if (branchRef !== "main" && branchRef !== "master") {
    console.log(`  ⏭  非main branch (${branchRef}) — スキップ`);
    return;
  }

  const attempts = await countRecentAttempts(product.id, commitSha);
  if (attempts >= MAX_ATTEMPTS_PER_COMMIT) {
    console.log(
      `  ⛔ commit ${commitSha.slice(0, 7)}: ${attempts}/${MAX_ATTEMPTS_PER_COMMIT} 試行済み — 諦め`,
    );
    await logAttempt(
      product.id,
      "abandoned",
      {
        commit_sha: commitSha,
        deployment_id: latest.uid,
        reason: "max_attempts_exceeded",
        attempts,
      },
      `Deploy fix abandoned: ${commitSha.slice(0, 7)}`,
    );
    return;
  }

  console.log(
    `  💥 失敗 deploy: ${latest.uid} (${latest.state}) commit=${commitSha.slice(0, 7)} (試行 ${attempts}/${MAX_ATTEMPTS_PER_COMMIT})`,
  );

  const buildLog = await getBuildLog(latest.uid);
  if (!buildLog) {
    console.log(`  ⚠️  build log 取得失敗 — スキップ`);
    return;
  }

  let repoDir: string | null = null;
  try {
    repoDir = cloneRepo(repo);

    const files = listSourceFiles(repoDir, 30);
    const sections: string[] = [];
    let totalChars = 0;
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(repoDir, f), "utf-8");
        if (totalChars + content.length > 50_000) break;
        sections.push(`=== ${f} ===\n${content}`);
        totalChars += content.length;
      } catch {}
    }

    const prompt = `You are a senior engineer. The Vercel deployment for "${product.display_name}" failed.

**Failed commit**: ${commitSha}
**Failed branch**: ${branchRef}
**Vercel state**: ${latest.state}

**Build error log (tail)**:
\`\`\`
${buildLog}
\`\`\`

**Source files**:
${sections.join("\n\n")}

Analyze the build error and fix the source files so that \`npm run build\` succeeds. Common causes:
- TypeScript errors (TS2307: Cannot find module, TS2322 type mismatch, etc.)
- Missing import or wrong path
- Missing dependency (but do NOT add packages — only fix code)
- Wrong "use client" placement
- Import from a server-only module in a client component (or vice versa)

Constraints:
- Do NOT modify package.json or package-lock.json
- Do NOT change application logic or remove features
- If you cannot determine the fix with confidence, return an empty patches array
- Only include files you actually changed

Return JSON:
{
  "patches": [{ "file": "relative/path.tsx", "newContent": "..." }],
  "summary": "日本語で変更内容の要約（200文字以内）"
}

Return ONLY the JSON.`;

    console.log(`  🤖 Claude に修正依頼...`);
    const result = await runClaudeForJSON<{
      patches: Array<{ file: string; newContent: string }>;
      summary: string;
    }>(prompt);

    let patchCount = 0;
    for (const patch of result.patches ?? []) {
      const fullPath = path.join(repoDir, patch.file);
      if (!fs.existsSync(fullPath)) continue;
      fs.writeFileSync(fullPath, patch.newContent, "utf-8");
      patchCount++;
    }

    if (patchCount === 0 || !hasChanges(repoDir)) {
      console.log(`  ⚠️  Claudeが有効な修正を返さなかった`);
      await logAttempt(
        product.id,
        "failed",
        {
          commit_sha: commitSha,
          deployment_id: latest.uid,
          reason: "no_patches",
        },
        `Deploy fix attempted: ${commitSha.slice(0, 7)} (no patches)`,
      );
      return;
    }

    const branch = `metago/deploy-fix-${Date.now()}`;
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `fix(deploy): Vercelデプロイ失敗修正 [MetaGo L1]`,
    );
    if (!pushed) {
      console.log(`  ⚠️  branch push に失敗`);
      return;
    }

    const pr = await createAndMergePR(repo, {
      title: `🤖 [MetaGo L1] Vercelデプロイ修正 — ${product.display_name}`,
      body: [
        `MetaGo + Claude による Vercel デプロイ失敗の自動修復です。`,
        ``,
        `**失敗 deployment**: \`${latest.uid}\` (state: \`${latest.state}\`)`,
        `**失敗 commit**: \`${commitSha}\``,
        `**branch**: \`${branchRef}\``,
        `**試行**: ${attempts + 1} / ${MAX_ATTEMPTS_PER_COMMIT}`,
        ``,
        `**変更内容**`,
        result.summary ?? "(no summary)",
        ``,
        `修正ファイル数: ${patchCount} 件`,
      ].join("\n"),
      head: branch,
      labels: ["metago-auto-merge"],
    });

    await logAttempt(
      product.id,
      "merged",
      {
        commit_sha: commitSha,
        deployment_id: latest.uid,
        pr_url: pr.url,
        summary: result.summary,
        patch_count: patchCount,
      },
      `Deploy fix merged: ${commitSha.slice(0, 7)} → PR #${pr.number}`,
    );

    console.log(`  ✓ L1 PR merged: ${pr.url}`);
  } catch (e) {
    console.error(`  ❌ ${product.display_name}:`, e);
    await logAttempt(
      product.id,
      "failed",
      {
        commit_sha: commitSha,
        deployment_id: latest.uid,
        error: String(e).slice(0, 500),
      },
      `Deploy fix error: ${commitSha.slice(0, 7)}`,
    );
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
  if (!VERCEL_TOKEN) {
    console.error("❌ VERCEL_TOKEN が未設定");
    process.exit(1);
  }

  console.log("🚀 [FIX] deploy (L1)");

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*");
  if (!products?.length) return;

  const targetRepo = process.env.TARGET_REPO;
  const targetSlug = targetRepo ? REPO_TO_SLUG[targetRepo] : null;

  for (const product of products) {
    if (targetSlug && product.name !== targetSlug) continue;
    if (!VERCEL_PROJECT_MAP[product.name]) continue; // meta-go等は対象外
    await fixForProduct(product);
  }

  console.log("\n✅ [FIX] deploy complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
