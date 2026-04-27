/**
 * 各goリポジトリへのGit操作・GitHub API操作を共通化するユーティリティ
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const GITHUB_TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN!;
export const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa";

export const REPO_TO_SLUG: Record<string, string> = {
  "native-go": "nativego",
  "care-go": "carego",
  "kenyaku-go": "kenyakugo",
  "cook-go": "cookgo",
  "physical-go": "physicalgo",
  "task-go": "taskgo",
  "go-design-system": "designsystem",
  "meta-go": "metago",
};

export interface PullRequest {
  url: string;
  number: number;
  nodeId: string;
}

// ── Git 操作 ─────────────────────────────────────────────

export function cloneRepo(repo: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `metago-${repo}-`));
  execSync(
    `git clone --depth 1 https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repo}.git ${tmpDir}`,
    { stdio: "pipe" },
  );
  execSync(`git -C "${tmpDir}" config user.email "metago@github-actions"`);
  execSync(`git -C "${tmpDir}" config user.name "MetaGo"`);
  return tmpDir;
}

export function hasChanges(repoDir: string): boolean {
  try {
    execSync(`git -C "${repoDir}" diff --quiet`);
    return false;
  } catch {
    return true;
  }
}

export function createBranchAndCommit(
  repoDir: string,
  branch: string,
  message: string,
): boolean {
  if (!hasChanges(repoDir)) return false;
  execSync(`git -C "${repoDir}" checkout -b "${branch}"`);
  execSync(`git -C "${repoDir}" add -A`);
  execSync(`git -C "${repoDir}" commit -m "${message}"`);
  execSync(`git -C "${repoDir}" push --force origin "${branch}"`);
  return true;
}

export function cleanup(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── GitHub API ────────────────────────────────────────────

async function ghFetch(
  path: string,
  options: RequestInit = {},
  retries = 3,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(options.headers ?? {}),
        },
      });
      return res;
    } catch (e: any) {
      const transientCodes = new Set([
        "UND_ERR_SOCKET",
        "ECONNRESET",
        "EPIPE",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
      ]);
      const causeCode = e?.cause?.code ?? e?.code;
      const isSocketError =
        typeof causeCode === "string" && transientCodes.has(causeCode);
      if (attempt < retries && isSocketError) {
        const wait = attempt * 3000;
        console.warn(
          `  Network error on attempt ${attempt}/${retries} (${causeCode}), retrying in ${wait / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  throw new Error("ghFetch: exhausted retries");
}

export async function createPR(
  repo: string,
  opts: {
    title: string;
    body: string;
    head: string;
    base?: string;
    labels?: string[];
  },
): Promise<PullRequest> {
  const { title, body, head, base = "main", labels = [] } = opts;

  const res = await ghFetch(`/repos/${GITHUB_OWNER}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PR creation failed for ${repo}: ${JSON.stringify(err)}`);
  }

  const pr = await res.json();

  if (labels.length > 0) {
    await ghFetch(`/repos/${GITHUB_OWNER}/${repo}/issues/${pr.number}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }

  return { url: pr.html_url, number: pr.number, nodeId: pr.node_id };
}

/** L1: PR を即座にスカッシュマージ */
export async function mergePR(repo: string, pr: PullRequest): Promise<boolean> {
  const res = await ghFetch(
    `/repos/${GITHUB_OWNER}/${repo}/pulls/${pr.number}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash" }),
    },
  );

  if (res.ok) return true;

  // merge できない場合は auto-merge を有効化してフォールバック
  console.warn(
    `Direct merge failed for PR #${pr.number}, enabling auto-merge...`,
  );
  await enableAutoMerge(pr.nodeId);
  return false;
}

/** GraphQL mutation で auto-merge を有効化 */
async function enableAutoMerge(prNodeId: string) {
  const query = `
    mutation($id: ID!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: SQUASH }) {
        pullRequest { id }
      }
    }
  `;
  await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { id: prNodeId } }),
  });
}

/** L1 の標準フロー: PR 作成 → 即マージ。
 *
 * 戻り値の merged は **直接マージが完了したか** を表す。
 * - true:  直接 squash merge 完了 (PR は merged 状態)
 * - false: 直接 merge できず auto-merge を待機中 (CI 通過まで未確定)
 *
 * 呼び出し側は merged=false のとき markItemFixed してはならない (ゴースト fixed の原因)。
 */
export type CreateAndMergeResult = PullRequest & { merged: boolean };

export async function createAndMergePR(
  repo: string,
  opts: Parameters<typeof createPR>[1],
): Promise<CreateAndMergeResult> {
  const pr = await createPR(repo, opts);
  const merged = await mergePR(repo, pr);
  if (merged) {
    console.log(`✓ L1 PR merged: ${pr.url}`);
  } else {
    console.log(`⏳ L1 PR auto-merge pending: ${pr.url}`);
  }
  return { ...pr, merged };
}

/** open PR 一覧取得 */
export async function listOpenPRs(repo: string): Promise<any[]> {
  const res = await ghFetch(
    `/repos/${GITHUB_OWNER}/${repo}/pulls?state=open&per_page=100`,
  );
  if (!res.ok) return [];
  return res.json();
}
