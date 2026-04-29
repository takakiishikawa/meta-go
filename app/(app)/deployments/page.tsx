import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { Rocket } from "lucide-react";
import {
  fetchAllDeployments,
  dailyCounts,
  summarize,
} from "@/lib/metago/github-deployments";
import { execLogToSummarizable } from "@/lib/metago/delivery-stats";
import { IssueTrendSection } from "@/components/delivery/issue-trend-section";
import { DeploymentsTable } from "@/components/deployments/deployments-table";
import {
  DeploySuccessTrendChart,
  type DailySuccessPoint,
  type ProductSeries,
} from "@/components/charts/deploy-success-trend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_WINDOW_HOURS = 168; // 7日: 成功推移チャート用に status も全期間 fetch
const CHART_DAYS = 7;
const HOBBY_DAILY_BUDGET = 100;
const TZ = "Asia/Tokyo";

function StatCard({
  label,
  value,
  sublabel,
  accent,
  children,
}: {
  label: string;
  value?: number | string;
  sublabel?: string;
  accent: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {value !== undefined && (
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {value}
          </div>
        )}
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
        {children}
      </div>
    </div>
  );
}

export default async function DeploymentsPage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("id, name, display_name, primary_color, github_repo")
    .order("priority");

  // 7日(count) + 48h(status) を1回のfetchでまとめて取得
  const allRows = await fetchAllDeployments(
    products ?? [],
    CHART_DAYS * 24,
    STATUS_WINDOW_HOURS,
  );

  // tableに渡すのは status 取得済みの 48h 分のみ
  const statusSinceMs = Date.now() - STATUS_WINDOW_HOURS * 60 * 60 * 1000;
  const tableRows = allRows.filter(
    (r) => new Date(r.createdAt).getTime() >= statusSinceMs,
  );

  // 24h 集計
  const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = allRows.filter(
    (r) => new Date(r.createdAt).getTime() >= dayAgoMs,
  );
  const sum24h = summarize(last24h);

  // 7日 daily breakdown
  const daily = dailyCounts(allRows, CHART_DAYS);
  const todayCount = daily[daily.length - 1]?.count ?? 0;

  // 直近7日の "成功" deploy 数を date × productId で集計 (stacked bar 用)
  const productSeries: ProductSeries[] = (products ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    color: p.primary_color ?? "#6B7280",
  }));

  const fmtKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
  });

  const successBuckets = new Map<string, Map<string, number>>(); // dateKey -> productId -> count
  for (const r of allRows) {
    if (r.state !== "success") continue;
    const key = fmtKey.format(new Date(r.createdAt));
    if (!successBuckets.has(key)) successBuckets.set(key, new Map());
    const inner = successBuckets.get(key)!;
    inner.set(r.productId, (inner.get(r.productId) ?? 0) + 1);
  }

  const successTrend: DailySuccessPoint[] = [];
  const today = new Date();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = fmtKey.format(d);
    const inner = successBuckets.get(key);
    const point: DailySuccessPoint = { date: fmtLabel.format(d) };
    for (const p of productSeries) {
      point[p.id] = inner?.get(p.id) ?? 0;
    }
    successTrend.push(point);
  }
  const totalSuccess7d = successTrend.reduce((sum, p) => {
    let row = 0;
    for (const k of Object.keys(p)) if (k !== "date") row += Number(p[k]) || 0;
    return sum + row;
  }, 0);

  // Deploy fix の execution_logs を issue 単位で集計 (failed/abandoned=未対応, merged=解決)
  const { data: deployLogRows } = await supabase
    .schema("metago")
    .from("execution_logs")
    .select("state, created_at")
    .eq("category", "deploy-fix")
    .limit(10000);
  const deployIssueItems = execLogToSummarizable(
    (deployLogRows ?? []) as { state: string; created_at: string }[],
  );

  return (
    <>
      <PageHeader
        title="Deployments"
        description={`Vercel への全デプロイと結果（直近 ${STATUS_WINDOW_HOURS}h、7日分のbudget可視化）`}
      />

      <IssueTrendSection items={deployIssueItems} noun="デプロイ問題" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <StatCard
          label="今日の使用率"
          value={`${todayCount} / ${HOBBY_DAILY_BUDGET}`}
          sublabel="Hobby plan day budget (Asia/Tokyo)"
          accent={
            todayCount >= 90
              ? "#DC2626"
              : todayCount >= 70
                ? "#D97706"
                : "#1E3A8A"
          }
        />

        <StatCard label="直近24h 結果" accent="#059669">
          <div className="mt-1 flex items-end gap-4">
            <div>
              <div className="text-2xl font-semibold text-success">
                {sum24h.success}
              </div>
              <div className="text-xs text-muted-foreground">成功</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-destructive">
                {sum24h.failure}
              </div>
              <div className="text-xs text-muted-foreground">
                失敗{sum24h.rateLimited > 0 && ` (rate ${sum24h.rateLimited})`}
              </div>
            </div>
            {sum24h.pending > 0 && (
              <div>
                <div className="text-2xl font-semibold text-primary">
                  {sum24h.pending}
                </div>
                <div className="text-xs text-muted-foreground">進行中</div>
              </div>
            )}
          </div>
        </StatCard>

        <StatCard label="直近7日 daily budget" accent="#6554C0">
          <div className="mt-2 flex items-end justify-between gap-1">
            {daily.map((d, i) => {
              const ratio = Math.min(1, d.count / HOBBY_DAILY_BUDGET);
              const over = d.count >= HOBBY_DAILY_BUDGET;
              const isToday = i === daily.length - 1;
              const color = over
                ? "#DC2626"
                : ratio >= 0.9
                  ? "#D97706"
                  : "#6554C0";
              return (
                <div
                  key={d.dateISO}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${d.dateISO}: ${d.count} / ${HOBBY_DAILY_BUDGET}`}
                >
                  <span
                    className="text-xs font-mono"
                    style={{ color, fontWeight: isToday ? 700 : 400 }}
                  >
                    {d.count}
                  </span>
                  <div className="relative h-12 w-full overflow-hidden rounded bg-muted/40">
                    <div
                      className="absolute bottom-0 left-0 right-0"
                      style={{
                        height: `${ratio * 100}%`,
                        backgroundColor: color,
                        opacity: isToday ? 1 : 0.7,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </StatCard>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-foreground">
            デプロイ成功数の推移
          </span>
          <span className="text-xs text-muted-foreground">
            直近 {CHART_DAYS} 日 / プロダクト別 (合計 {totalSuccess7d})
          </span>
        </div>
        <DeploySuccessTrendChart data={successTrend} products={productSeries} />
      </div>

      {tableRows.length === 0 ? (
        <EmptyState
          icon={<Rocket className="size-12" />}
          title="deployment がまだありません"
          description={
            process.env.GITHUB_TOKEN
              ? `直近 ${STATUS_WINDOW_HOURS}h に Vercel deployment が観測されませんでした`
              : "GITHUB_TOKEN が未設定です。Vercel deployment 履歴を取得できません"
          }
        />
      ) : (
        <DeploymentsTable rows={tableRows} />
      )}
    </>
  );
}
