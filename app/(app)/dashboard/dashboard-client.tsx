"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertCircle,
  Clock,
  ArrowUpRight,
  GitMerge,
  Activity,
  Rocket,
} from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system";
import {
  MultiProductTrendChart,
  type TrendPoint as MultiTrendPoint,
} from "@/components/charts/multi-product-trend";
import {
  IssueTrendChart,
  type IssueTrendPoint,
} from "@/components/charts/issue-trend-chart";

interface Product {
  id: string;
  name: string;
  display_name: string;
  description: string;
  github_repo: string;
  vercel_url: string;
  primary_color: string;
  priority: number;
}

interface ApprovalItem {
  id: string;
  product_id: string;
  title: string;
  category: string;
  state: string;
  created_at: string;
}

type Cat = "quality" | "security" | "design_system" | "performance";

export type TrendByProduct = Record<
  string,
  Record<string, Partial<Record<Cat, number>>>
>;

interface DashboardClientProps {
  products: Product[];
  pendingApprovals: ApprovalItem[];
  trendByProduct: TrendByProduct;
  issueTrend: IssueTrendPoint[];
  deployStats: { success: number; failure: number; pending: number };
  kpi: {
    resolvedLast7Days: number;
    resolvedDelta: number;
    detectedLast7Days: number;
    detectedDelta: number;
  };
}

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
};

const CATS: Cat[] = ["quality", "security", "design_system", "performance"];

export function DashboardClient({
  products,
  pendingApprovals,
  trendByProduct,
  issueTrend,
  deployStats,
  kpi,
}: DashboardClientProps) {
  const hasData = products.length > 0;

  // 全プロダクトの overall (4カテゴリ平均) スコアの全期間トレンド
  const overviewTrend = useMemo<MultiTrendPoint[]>(() => {
    const allDateKeys = new Set<string>();
    for (const productId of Object.keys(trendByProduct)) {
      for (const dateKey of Object.keys(trendByProduct[productId])) {
        allDateKeys.add(dateKey);
      }
    }
    if (allDateKeys.size === 0) return [];

    const sorted = [...allDateKeys].sort();
    const minKey = sorted[0];
    const maxKey = sorted[sorted.length - 1];

    const fmtLabel = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "UTC",
      month: "2-digit",
      day: "2-digit",
    });

    const points: MultiTrendPoint[] = [];
    const start = new Date(`${minKey}T00:00:00Z`);
    const end = new Date(`${maxKey}T00:00:00Z`);
    for (
      let t = start.getTime();
      t <= end.getTime();
      t += 24 * 60 * 60 * 1000
    ) {
      const d = new Date(t);
      const key = d.toISOString().slice(0, 10);
      const point: MultiTrendPoint = { date: fmtLabel.format(d) };
      for (const product of products) {
        const cats = trendByProduct[product.id]?.[key];
        if (!cats) {
          point[product.id] = null;
          continue;
        }
        const values = CATS.map((c) => cats[c]).filter(
          (v): v is number => v != null,
        );
        point[product.id] =
          values.length > 0
            ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
            : null;
      }
      points.push(point);
    }
    return points;
  }, [products, trendByProduct]);

  const overviewSeries = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: p.display_name,
        color: p.primary_color || GO_COLORS[p.name] || "#6B7280",
      })),
    [products],
  );

  const deployTotal =
    deployStats.success + deployStats.failure + deployStats.pending;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="goシリーズ全体の健全性を俯瞰する"
        actions={
          pendingApprovals.length > 0 ? (
            <Link
              href="/approval"
              className="flex items-center gap-2 rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm font-medium text-warning transition-colors hover:opacity-80"
            >
              <AlertCircle className="size-4" />
              承認待ち {pendingApprovals.length}件
              <ArrowUpRight className="size-3" />
            </Link>
          ) : undefined
        }
      />

      {/* KPI: 直近7日の検知 / 解決 (前7日比) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          icon={<GitMerge className="size-4" />}
          label="直近7日に解決"
          value={kpi.resolvedLast7Days}
          delta={kpi.resolvedDelta}
          sublabel="解決された issue 数 / 前7日比"
          accent="#36B37E"
        />
        <KpiCard
          icon={<Activity className="size-4" />}
          label="直近7日に検知"
          value={kpi.detectedLast7Days}
          delta={kpi.detectedDelta}
          sublabel="新規検知された issue 数 / 前7日比"
          accent="#0052CC"
        />
      </div>

      {!hasData ? (
        <EmptyState
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <>
          {/* Issue trend (検知 vs 解決) */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">
                issue 検知 / 解決 推移
              </span>
              <span className="text-xs text-muted-foreground">
                過去 {issueTrend.length} 日 / 全カテゴリ合算
              </span>
            </div>
            <IssueTrendChart data={issueTrend} height={260} />
          </div>

          {/* Deploy summary */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">
                デプロイ
              </span>
              <Link
                href="/deployments"
                className="flex items-center gap-1 text-xs"
                style={{ color: "var(--color-primary)" }}
              >
                詳細
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
            {deployTotal === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Rocket className="size-4" />
                直近7日のデプロイは観測されていません
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <DeployStat
                  label="成功"
                  value={deployStats.success}
                  accent="#36B37E"
                />
                <DeployStat
                  label="失敗"
                  value={deployStats.failure}
                  accent="#FF5630"
                />
                <DeployStat
                  label="進行中"
                  value={deployStats.pending}
                  accent="#0052CC"
                />
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              直近7日 / 全プロダクト合算
            </div>
          </div>

          {/* All-products score trend */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-foreground">
                総合スコア推移
              </span>
              <span className="text-xs text-muted-foreground">
                全期間 / 4カテゴリの平均 ({overviewTrend.length}日分)
              </span>
            </div>
            <MultiProductTrendChart
              data={overviewTrend}
              products={overviewSeries}
              height={260}
            />
          </div>

          {/* Recent Approvals */}
          {pendingApprovals.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2
                  className="font-semibold text-foreground"
                  style={{ fontSize: "var(--text-base)" }}
                >
                  承認待ち
                </h2>
                <Link
                  href="/approval"
                  className="text-sm font-medium"
                  style={{ color: "var(--color-primary)" }}
                >
                  すべて見る
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {pendingApprovals.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-warning" />
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {item.title}
                      </span>
                    </div>
                    <Badge variant="outline">{item.category}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function formatDelta(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `${n}`;
}

function KpiCard({
  icon,
  label,
  value,
  delta,
  sublabel,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta: number;
  sublabel: string;
  accent: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex size-7 items-center justify-center rounded-md"
              style={{ backgroundColor: accent + "1A", color: accent }}
            >
              {icon}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </div>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: accent }}
          >
            {formatDelta(delta)} / 7d
          </span>
        </div>
        <div className="mt-2 text-3xl font-semibold text-foreground tabular-nums">
          {value}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
}

function DeployStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div
        className="text-2xl font-semibold tabular-nums"
        style={{ color: value > 0 ? accent : "var(--color-foreground)" }}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
