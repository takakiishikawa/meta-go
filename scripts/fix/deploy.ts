/**
 * deploy FIX
 *
 * 各Goプロダクトの最新 main commit の Vercel status を GitHub commit-status API
 * で確認し、failure の場合だけ runner 上で `npm ci && npm run build` を再実行
 * してエラーを再現、build log を Claude に渡してパッチを受け取る。
 *
 * パッチ適用後にもう一度 build して通ることを検証してから L1 PR を即マージ。
 *
 * ループ防止:
 *   - 同じ commit_sha に対する 24h以内の試行が >= 3 なら諦め
 *   - execution_logs の category='deploy-fix' で履歴管理
 *
 * 認証: CLAUDE_CODE_OAUTH_TOKEN (Claude Code Max プラン) のみ
 *
 * 環境変数:
 *   TARGET_REPO  — 対象リポジトリ名 (省略時は全Go)
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  cloneRepo,
  hasChanges,
  createBranchAndCommit,
  createAndMergePR,
  cleanup,
  GITHUB_TOKEN,
  GITHUB_OWNER,
} from "../../lib/github/git-operations";
import { GO_REPOS, REPO_TO_SLUG, getSupabase } from "../../lib/metago/items";
import { runClaudeForJSON } from "../../lib/metago/claude-cli";

const supabase = getSupabase();

const MAX_ATTEMPTS_PER_COMMIT = 3;
const MAX_BUILD_RETRIES = 2;
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const BUILD_TIMEOUT_MS = 8 * 60 * 1000;

// Vercel未deployのリポは対象外
const DEPLOY_TARGET_REPOS = new Set([
  "native-go",
  "care-go",
  "kenyaku-go",
  "cook-go",
  "physical-go",
  "task-go",
  "go-design-system",
]);

interface CommitStatus {
  state: string; // "success" | "failure" | "pending" | "error"
  context: string;
  description: string;
  target_url: string;
  updated_at: string;
}

async function ghFetch<T = any>(p: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${p}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    console.warn(`  GitHub API ${p} → ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

/** main HEAD のVercel statusを取得。failureならcommit SHAも返す */
async function getLatestVercelFailure(
  repo: string,
): Promise<{ commitSha: string; description: string } | null> {
  const head = await ghFetch<{ sha: string }>(
    `/repos/${GITHUB_OWNER}/${repo}/commits/main`,
  );
  if (!head?.sha) return null;

  const statuses = await ghFetch<CommitStatus[]>(
    `/repos/${GITHUB_OWNER}/${repo}/commits/${head.sha}/statuses`,
  );
  if (!Array.isArray(statuses)) return null;

  // 同contextは複数返ることがあるので最新を取る
  const vercel = statuses
    .filter((s) => s.context === "Vercel")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )[0];

  if (!vercel) return null;
  if (vercel.state !== "failure" && vercel.state !== "error") return null;

  return { commitSha: head.sha, description: vercel.description };
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

interface BuildResult {
  ok: boolean;
  log: string;
}

/**
 * runner上で `npm ci && npm run build` を実行して結果を返す。
 * 失敗の場合は最後の30KBのstdout/stderrを log として返す。
 */
function runBuild(repoDir: string): BuildResult {
  const env = { ...process.env, CI: "1", FORCE_COLOR: "0" };

  // npm ci
  const ci = spawnSync(
    "npm",
    ["ci", "--include=dev", "--legacy-peer-deps", "--no-audit", "--no-fund"],
    {
      cwd: repoDir,
      env,
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      encoding: "utf-8",
    },
  );
  if (ci.status !== 0) {
    const log = `=== npm ci failed (exit ${ci.status}) ===\n${(ci.stdout ?? "") + (ci.stderr ?? "")}`;
    return { ok: false, log: log.slice(-30_000) };
  }

  const build = spawnSync("npm", ["run", "build"], {
    cwd: repoDir,
    env,
    timeout: BUILD_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    encoding: "utf-8",
  });
  const combined =
    (build.stdout ?? "") + (build.stderr ? `\n[STDERR]\n${build.stderr}` : "");
  if (build.status !== 0) {
    return {
      ok: false,
      log: `=== npm run build failed (exit ${build.status}) ===\n${combined.slice(-30_000)}`,
    };
  }
  return { ok: true, log: "" };
}

function listRelevantSourceFiles(
  repoDir: string,
  buildLog: string,
  limit = 30,
): string[] {
  // build log中のファイルパスを最優先
  const mentionedFiles = new Set<string>();
  const re = /\.\/([\w./()@\-[\]]+\.(?:tsx?|jsx?|mjs|cjs|json|css))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buildLog))) {
    mentionedFiles.add(m[1]);
  }

  const files: string[] = [];
  for (const f of mentionedFiles) {
    if (fs.existsSync(path.join(repoDir, f))) files.push(f);
    if (files.length >= limit) return files;
  }

  // 不足分は find で補充
  try {
    const found = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" \\) ` +
        `-not -path "./node_modules/*" -not -path "./.next/*" -not -path "./dist/*" -not -path "./out/*" ` +
        `| head -${limit}`,
      { cwd: repoDir, stdio: "pipe" },
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const f of found) {
      const rel = f.replace(/^\.\//, "");
      if (!files.includes(rel)) files.push(rel);
      if (files.length >= limit) break;
    }
  } catch {}
  return files;
}

function buildClaudePrompt(
  productName: string,
  commitSha: string,
  buildLog: string,
  fileSections: string[],
): string {
  return `You are a senior engineer. The Vercel deployment for "${productName}" failed.

**Failed commit**: ${commitSha}

**Build error log (tail)**:
\`\`\`
${buildLog}
\`\`\`

**Source files** (the ones referenced by the error first):
${fileSections.join("\n\n")}

Analyze the build error and patch the source files so that \`npm run build\` succeeds.

Common causes seen in this codebase:
- A previous Claude run accidentally wrote its own English narration as the first line of a .tsx file (e.g. "The fix is clear..."). DELETE that line entirely.
- TypeScript errors (TS2307: Cannot find module, TS2322 type mismatch).
- Wrong / missing import path.
- Misplaced \`"use client"\` (must be the very first line, before any import).
- Server-only API used inside a Client Component (or vice versa).

Constraints:
- Do NOT modify package.json or package-lock.json.
- Do NOT change application logic or remove features.
- If you cannot determine the fix with confidence, return an empty patches array.
- Only include files you actually changed.

Return ONLY valid JSON, no surrounding prose, no markdown fences:
{
  "patches": [{ "file": "relative/path.tsx", "newContent": "..." }],
  "summary": "日本語で変更内容の要約（200文字以内）"
}`;
}

async function fixForProduct(product: {
  id: string;
  name: string;
  display_name: string;
}) {
  const repo = GO_REPOS[product.name];
  if (!repo || !DEPLOY_TARGET_REPOS.has(repo)) {
    console.log(`  ⏭  ${product.name}: deploy-fix 対象外`);
    return;
  }

  console.log(`\n🔍 [DEPLOY-FIX] ${product.display_name} (${repo})`);

  const failure = await getLatestVercelFailure(repo);
  if (!failure) {
    console.log(`  ✅ Vercel status は failure ではない — skip`);
    return;
  }

  const { commitSha } = failure;
  const attempts = await countRecentAttempts(product.id, commitSha);
  if (attempts >= MAX_ATTEMPTS_PER_COMMIT) {
    console.log(
      `  ⛔ ${commitSha.slice(0, 7)}: ${attempts}/${MAX_ATTEMPTS_PER_COMMIT} — 諦め`,
    );
    await logAttempt(
      product.id,
      "abandoned",
      { commit_sha: commitSha, reason: "max_attempts_exceeded", attempts },
      `Deploy fix abandoned: ${commitSha.slice(0, 7)}`,
    );
    return;
  }

  console.log(
    `  💥 commit ${commitSha.slice(0, 7)} (試行 ${attempts + 1}/${MAX_ATTEMPTS_PER_COMMIT})`,
  );

  let repoDir: string | null = null;
  try {
    repoDir = cloneRepo(repo);

    console.log(`  🔨 ローカル build で再現...`);
    let build = runBuild(repoDir);
    if (build.ok) {
      // ローカル build が通る = Vercel 環境固有 (env var 不足 / Node version 差 /
      // build cache 等) → コード修正で直る問題ではないので Claude を呼ばずに
      // abandoned として記録 (人間 escalate 相当)。failed で積み続けるとログが
      // 偽の失敗で埋まり真の問題が見えなくなる。
      console.log(
        `  ⚠️  ローカル build は成功 — Vercel固有 — escalate to human`,
      );
      await logAttempt(
        product.id,
        "abandoned",
        {
          commit_sha: commitSha,
          reason: "vercel_specific_needs_human",
        },
        `Deploy fix abandoned (Vercel-specific): ${commitSha.slice(0, 7)}`,
      );
      return;
    }

    let summary = "";
    let totalPatchCount = 0;
    let success = false;

    for (let retry = 0; retry < MAX_BUILD_RETRIES + 1; retry++) {
      const files = listRelevantSourceFiles(repoDir, build.log, 30);
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

      const prompt = buildClaudePrompt(
        product.display_name,
        commitSha,
        build.log,
        sections,
      );

      console.log(`  🤖 Claude に修正依頼... (retry ${retry})`);
      const result = await runClaudeForJSON<{
        patches: Array<{ file: string; newContent: string }>;
        summary: string;
      }>(prompt);

      let patchCount = 0;
      for (const patch of result.patches ?? []) {
        const fullPath = path.join(repoDir, patch.file);
        if (!fs.existsSync(fullPath)) continue;
        // 安全策: 1行目が明らかに会話文に見えるpatchは弾く
        const first = patch.newContent.split("\n")[0].trim();
        if (
          /^(The|I'll|Here|Let me|This|Sure|Now|First|Looking)/.test(first) &&
          !first.startsWith("//") &&
          !first.startsWith('"use')
        ) {
          console.log(
            `  ⚠️  patch for ${patch.file} の1行目が会話文っぽい — 弾く`,
          );
          continue;
        }
        fs.writeFileSync(fullPath, patch.newContent, "utf-8");
        patchCount++;
      }

      if (patchCount === 0) {
        console.log(`  ⚠️  有効な patch なし`);
        break;
      }
      totalPatchCount += patchCount;
      summary = result.summary || summary;

      console.log(`  🔨 修正後 build 検証...`);
      build = runBuild(repoDir);
      if (build.ok) {
        success = true;
        break;
      }
      console.log(`  ❌ build まだ失敗 — retry`);
    }

    if (!success) {
      console.log(`  ⛔ 修正失敗 — PR は作成しない`);
      await logAttempt(
        product.id,
        "failed",
        {
          commit_sha: commitSha,
          reason: success === false ? "build_still_failing" : "no_patches",
          patch_count: totalPatchCount,
        },
        `Deploy fix attempt failed: ${commitSha.slice(0, 7)}`,
      );
      return;
    }

    if (!hasChanges(repoDir)) {
      console.log(`  ⚠️  changes 無し — skip`);
      return;
    }

    const branch = `metago/deploy-fix-${Date.now()}`;
    const pushed = createBranchAndCommit(
      repoDir,
      branch,
      `fix(deploy): Vercelデプロイ失敗修正 [MetaGo L1]`,
    );
    if (!pushed) return;

    const pr = await createAndMergePR(repo, {
      title: `🤖 [MetaGo L1] Vercelデプロイ修正 — ${product.display_name}`,
      body: [
        `MetaGo + Claude による Vercel デプロイ失敗の自動修復です。`,
        ``,
        `**失敗 commit**: \`${commitSha}\``,
        `**試行**: ${attempts + 1} / ${MAX_ATTEMPTS_PER_COMMIT}`,
        `**修正後ローカルビルド**: ✅ 成功確認済み`,
        ``,
        `**変更内容**`,
        summary || "(no summary)",
        ``,
        `修正ファイル数: ${totalPatchCount} 件`,
      ].join("\n"),
      head: branch,
      labels: ["metago-auto-merge"],
    });

    // 実マージ結果を反映 (ゴースト merged 防止)
    await logAttempt(
      product.id,
      pr.merged ? "merged" : "failed",
      {
        commit_sha: commitSha,
        pr_url: pr.url,
        summary,
        patch_count: totalPatchCount,
        merged: pr.merged,
        ...(pr.merged ? {} : { reason: "auto_merge_pending" }),
      },
      pr.merged
        ? `Deploy fix merged: ${commitSha.slice(0, 7)} → PR #${pr.number}`
        : `Deploy fix auto-merge pending: ${commitSha.slice(0, 7)} → PR #${pr.number}`,
    );

    console.log(`  ✓ L1 PR merged: ${pr.url}`);
  } catch (e) {
    console.error(`  ❌ ${product.display_name}:`, e);
    await logAttempt(
      product.id,
      "failed",
      { commit_sha: commitSha, error: String(e).slice(0, 500) },
      `Deploy fix error: ${commitSha.slice(0, 7)}`,
    );
  } finally {
    if (repoDir) cleanup(repoDir);
  }
}

async function main() {
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
    await fixForProduct(product);
  }

  console.log("\n✅ [FIX] deploy complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
