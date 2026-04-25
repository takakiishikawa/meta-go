/**
 * GitHub Deployments API クライアント
 *
 * Vercel が GitHub に作成した deployment event をそのまま読む。
 * 各 deployment には複数の status イベントが付き、最新が最終結果。
 *
 * 参考: https://docs.github.com/en/rest/deployments
 */

const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa";

export type DeploymentState =
  | "success"
  | "failure"
  | "error"
  | "rate_limited"
  | "pending"
  | "queued"
  | "in_progress"
  | "unknown";

export interface DeploymentRow {
  productId: string;
  productName: string;
  productDisplayName: string;
  primaryColor: string | null;
  repo: string;
  deploymentId: number;
  sha: string;
  ref: string;
  environment: string; // "Production" | "Preview" | ...
  createdAt: string;
  state: DeploymentState;
  description: string;
  targetUrl: string | null;
}

interface GhDeployment {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  created_at: string;
  statuses_url: string;
}

interface GhDeploymentStatus {
  state: string;
  description: string;
  target_url: string | null;
  log_url: string | null;
  created_at: string;
}

const HEADERS = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ""}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function classify(
  state: string,
  description: string,
): DeploymentState {
  if (/rate limited/i.test(description)) return "rate_limited";
  switch (state) {
    case "success":
    case "failure":
    case "error":
    case "pending":
    case "queued":
    case "in_progress":
      return state;
    default:
      return "unknown";
  }
}

async function fetchRepoDeployments(
  repoFullName: string,
  product: {
    id: string;
    name: string;
    display_name: string;
    primary_color: string | null;
  },
  sinceISO: string,
): Promise<DeploymentRow[]> {
  // /repos/{owner}/{repo}/deployments?per_page=100  (Vercel が作る最新分が降順)
  const repo = repoFullName.includes("/")
    ? repoFullName
    : `${GITHUB_OWNER}/${repoFullName}`;
  const res = await fetch(
    `https://api.github.com/repos/${repo}/deployments?per_page=100`,
    { headers: HEADERS, cache: "no-store" },
  );
  if (!res.ok) return [];
  const deployments = (await res.json()) as GhDeployment[];

  const recent = deployments.filter((d) => d.created_at >= sinceISO);

  // 各 deployment の最新 status を並列取得
  const rows = await Promise.all(
    recent.map(async (d): Promise<DeploymentRow | null> => {
      const sres = await fetch(`${d.statuses_url}?per_page=1`, {
        headers: HEADERS,
        cache: "no-store",
      });
      if (!sres.ok) return null;
      const statuses = (await sres.json()) as GhDeploymentStatus[];
      const latest = statuses[0];
      const state = latest ? classify(latest.state, latest.description) : "unknown";
      return {
        productId: product.id,
        productName: product.name,
        productDisplayName: product.display_name,
        primaryColor: product.primary_color,
        repo,
        deploymentId: d.id,
        sha: d.sha.slice(0, 7),
        ref: d.ref,
        environment: d.environment,
        createdAt: d.created_at,
        state,
        description: latest?.description ?? "",
        targetUrl: latest?.target_url ?? null,
      };
    }),
  );

  return rows.filter((r): r is DeploymentRow => r !== null);
}

export async function fetchAllDeployments(
  products: Array<{
    id: string;
    name: string;
    display_name: string;
    primary_color: string | null;
    github_repo: string | null;
  }>,
  windowHours = 48,
): Promise<DeploymentRow[]> {
  if (!process.env.GITHUB_TOKEN) {
    return [];
  }
  const sinceISO = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  const settled = await Promise.allSettled(
    products
      .filter((p) => p.github_repo)
      .map((p) => fetchRepoDeployments(p.github_repo!, p, sinceISO)),
  );

  const all: DeploymentRow[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  // 新しい順
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return all;
}

/**
 * Vercel 失敗を集計するための補助。description も含めてレートリミット等を区別。
 */
export function summarize(rows: DeploymentRow[]) {
  const total = rows.length;
  let success = 0;
  let failure = 0;
  let rateLimited = 0;
  let pending = 0;
  let production = 0;
  let preview = 0;
  for (const r of rows) {
    if (r.environment === "Production") production++;
    else if (r.environment === "Preview") preview++;
    switch (r.state) {
      case "success":
        success++;
        break;
      case "failure":
      case "error":
        failure++;
        break;
      case "rate_limited":
        rateLimited++;
        break;
      case "pending":
      case "queued":
      case "in_progress":
        pending++;
        break;
    }
  }
  return { total, success, failure, rateLimited, pending, production, preview };
}
