/**
 * GitHub Deployments API クライアント
 *
 * Vercel が GitHub に作成した deployment event をそのまま読む。
 * 各 deployment には複数の status イベントが付き、最新が最終結果。
 *
 * 参考: https://docs.github.com/en/rest/deployments
 */

const GITHUB_OWNER = process.env.GITHUB_OWNER || "takakiishikawa";
const GH_TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN || "";

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
  commitSubject: string | null;
  commitUrl: string | null;
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

interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string };
}

const HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// Next.js fetch cache TTL — page リクエスト毎に発火を避けるため 15 分キャッシュ
const FETCH_CACHE = { next: { revalidate: 900 } } as const;

function classify(state: string, description: string): DeploymentState {
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

async function fetchAllDeploymentsForRepo(
  repoFullName: string,
  sinceISO: string,
): Promise<GhDeployment[]> {
  // /repos/{owner}/{repo}/deployments は降順なのでページを進めるごとに古くなる
  // sinceISO より古いものに到達したら打ち切り
  const repo = repoFullName.includes("/")
    ? repoFullName
    : `${GITHUB_OWNER}/${repoFullName}`;
  const all: GhDeployment[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/deployments?per_page=100&page=${page}`,
      { headers: HEADERS, ...FETCH_CACHE },
    );
    if (!res.ok) break;
    const items = (await res.json()) as GhDeployment[];
    if (items.length === 0) break;
    for (const d of items) {
      if (d.created_at >= sinceISO) all.push(d);
    }
    if (items[items.length - 1].created_at < sinceISO) break;
  }
  return all;
}

async function fetchLatestStatus(d: GhDeployment): Promise<{
  state: DeploymentState;
  description: string;
  targetUrl: string | null;
}> {
  const sres = await fetch(`${d.statuses_url}?per_page=1`, {
    headers: HEADERS,
    ...FETCH_CACHE,
  });
  if (!sres.ok) {
    return { state: "unknown", description: "", targetUrl: null };
  }
  const statuses = (await sres.json()) as GhDeploymentStatus[];
  const latest = statuses[0];
  return {
    state: latest ? classify(latest.state, latest.description) : "unknown",
    description: latest?.description ?? "",
    targetUrl: latest?.target_url ?? null,
  };
}

/**
 * 当該リポの recent commits を取得して sha → {subject, url} の Map を返す。
 * deployment の sha は40文字、表示用には7文字に短縮するので両方の lookup を入れる。
 */
async function fetchCommitsByRepo(
  repoFullName: string,
  sinceISO: string,
): Promise<Map<string, { subject: string; url: string }>> {
  const repo = repoFullName.includes("/")
    ? repoFullName
    : `${GITHUB_OWNER}/${repoFullName}`;
  const map = new Map<string, { subject: string; url: string }>();
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?since=${sinceISO}&per_page=100&page=${page}`,
      { headers: HEADERS, ...FETCH_CACHE },
    );
    if (!res.ok) break;
    const items = (await res.json()) as GhCommit[];
    if (items.length === 0) break;
    for (const c of items) {
      const subject = (c.commit?.message ?? "").split("\n")[0].trim();
      const entry = { subject, url: c.html_url };
      map.set(c.sha, entry);
      map.set(c.sha.slice(0, 7), entry);
    }
    if (items.length < 100) break;
  }
  return map;
}

async function fetchRepoDeployments(
  repoFullName: string,
  product: {
    id: string;
    name: string;
    display_name: string;
    primary_color: string | null;
  },
  countWindowSinceISO: string,
  statusWindowSinceISO: string,
): Promise<DeploymentRow[]> {
  const [deployments, commitMap] = await Promise.all([
    fetchAllDeploymentsForRepo(repoFullName, countWindowSinceISO),
    fetchCommitsByRepo(repoFullName, countWindowSinceISO),
  ]);

  // statusWindow に入るものだけ status fetch、その他は count 用に state="unknown"
  const rows = await Promise.all(
    deployments.map(async (d): Promise<DeploymentRow> => {
      let extra = {
        state: "unknown" as DeploymentState,
        description: "",
        targetUrl: null as string | null,
      };
      if (d.created_at >= statusWindowSinceISO) {
        extra = await fetchLatestStatus(d);
      }
      const commit = commitMap.get(d.sha) ?? null;
      return {
        productId: product.id,
        productName: product.name,
        productDisplayName: product.display_name,
        primaryColor: product.primary_color,
        repo: repoFullName.includes("/")
          ? repoFullName
          : `${GITHUB_OWNER}/${repoFullName}`,
        deploymentId: d.id,
        sha: d.sha.slice(0, 7),
        ref: d.ref,
        environment: d.environment,
        createdAt: d.created_at,
        state: extra.state,
        description: extra.description,
        targetUrl: extra.targetUrl,
        commitSubject: commit?.subject ?? null,
        commitUrl: commit?.url ?? null,
      };
    }),
  );
  return rows;
}

export async function fetchAllDeployments(
  products: Array<{
    id: string;
    name: string;
    display_name: string;
    primary_color: string | null;
    github_repo: string | null;
  }>,
  countWindowHours = 168, // 7日: chart用
  statusWindowHours = 48, // 48h: table+成功/失敗 集計用
): Promise<DeploymentRow[]> {
  if (!GH_TOKEN) {
    return [];
  }
  const now = Date.now();
  const countSinceISO = new Date(
    now - countWindowHours * 60 * 60 * 1000,
  ).toISOString();
  const statusSinceISO = new Date(
    now - statusWindowHours * 60 * 60 * 1000,
  ).toISOString();

  const settled = await Promise.allSettled(
    products
      .filter((p) => p.github_repo)
      .map((p) =>
        fetchRepoDeployments(p.github_repo!, p, countSinceISO, statusSinceISO),
      ),
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
 * Asia/Tokyo の calendar day で過去 N 日分の deploy 数を集計
 * 戻り値: 古い順に並んだ {label, dateISO, count}[]
 */
export function dailyCounts(
  rows: DeploymentRow[],
  days = 7,
  timezone = "Asia/Tokyo",
): Array<{ label: string; dateISO: string; count: number }> {
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
  });
  const fmtKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const key = fmtKey.format(new Date(r.createdAt)); // YYYY-MM-DD
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const out: Array<{ label: string; dateISO: string; count: number }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = fmtKey.format(d);
    out.push({
      label: fmt.format(d),
      dateISO: key,
      count: buckets.get(key) ?? 0,
    });
  }
  return out;
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
