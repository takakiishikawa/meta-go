import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { Rocket } from "lucide-react";
import {
  fetchAllDeployments,
  summarize,
} from "@/lib/metago/github-deployments";
import { DeploymentsTable } from "@/components/deployments/deployments-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WINDOW_HOURS = 48;

function StatCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  accent: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
        {sublabel && (
          <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
        )}
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

  const rows = await fetchAllDeployments(products ?? [], WINDOW_HOURS);
  const sum = summarize(rows);

  // Hobby plan の day budget = 100。直近24h を別計算で出す
  const sinceDay = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = rows.filter(
    (r) => new Date(r.createdAt).getTime() >= sinceDay,
  );
  const sum24h = summarize(last24h);

  return (
    <>
      <PageHeader
        title="Deployments"
        description={`Vercel への全デプロイと結果（直近 ${WINDOW_HOURS}h）。GitHub Deployments API 経由でリアルタイム取得。`}
      />

      {/* Hobby plan budget */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="24h 合計"
          value={`${sum24h.total} / 100`}
          sublabel={`Hobby day budget`}
          accent={sum24h.total >= 90 ? "#DC2626" : "#1E3A8A"}
        />
        <StatCard
          label="成功"
          value={sum24h.success}
          sublabel="直近24h"
          accent="#059669"
        />
        <StatCard
          label="失敗"
          value={sum24h.failure + sum24h.rateLimited}
          sublabel={`含 rate limit ${sum24h.rateLimited}`}
          accent="#DC2626"
        />
        <StatCard
          label="48h 視点"
          value={`P:${sum.production}  /  Pre:${sum.preview}`}
          sublabel={`計 ${sum.total}`}
          accent="#6554C0"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Rocket className="size-12" />}
          title="deployment がまだありません"
          description={
            process.env.GITHUB_TOKEN
              ? "直近48h に Vercel deployment が観測されませんでした"
              : "GITHUB_TOKEN が未設定です。Vercel deployment 履歴を取得できません"
          }
        />
      ) : (
        <DeploymentsTable rows={rows} />
      )}
    </>
  );
}
