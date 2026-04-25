"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Clock,
  ArrowUpRight,
  GitMerge,
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import {
  ScoreTrendChart,
  type TrendPoint,
} from "@/components/charts/score-trend-chart";
import {
  MultiProductTrendChart,
  type TrendPoint as MultiTrendPoint,
} from "@/components/charts/multi-product-trend";

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
  latestByPC: Record<string, number>;
  weekAgoByPC: Record<string, number>;
  trendByProduct: TrendByProduct;
  kpi: {
    mergedLast7Days: number;
    detectedLast7Days: number;
    openIssues: number;
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

const CATEGORY_LABELS: Record<Cat, string> = {
  quality: "コード品質",
  security: "セキュリティ",
  design_system: "デザインシステム",
  performance: "パフォーマンス",
};

const CATS: Cat[] = ["quality", "security", "design_system", "performance"];

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function overallScore(
  productId: string,
  latestByPC: Record<string, number>,
): number | null {
  const values = CATS.map((c) => latestByPC[`${productId}|${c}`]).filter(
    (v): v is number => v != null,
  );
  return avg(values);
}

export function DashboardClient({
  products,
  pendingApprovals,
  latestByPC,
  weekAgoByPC,
  trendByProduct,
  kpi,
}: DashboardClientProps) {
  const hasData = products.length > 0;
  const [trendOpen, setTrendOpen] = useState<Product | null>(null);

  // 全プロダクトの overall (4カテゴリ平均) スコアの全期間トレンドを組み立て
  // 範囲は trendByProduct 内に存在する最古〜最新の日付。空き日は null で埋める
  const overviewTrend = useMemo<MultiTrendPoint[]>(() => {
    // page.tsx 側で collected_at.slice(0,10) を date key にしているのでそれをそのまま使う
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
    for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
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

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="goシリーズ全体の健全性を俯瞰する"
        actions={
          pendingApprovals.length > 0 ? (
            <Link
              href="/approval"
              className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <AlertCircle className="size-4" />
              承認待ち {pendingApprovals.length}件
              <ArrowUpRight className="size-3" />
            </Link>
          ) : undefined
        }
      />

      {/* Global KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<GitMerge className="size-4" />}
          label="直近1週間でマージ済み"
          value={kpi.mergedLast7Days}
          sublabel="改善されたPR数"
          accent="#36B37E"
        />
        <KpiCard
          icon={<Activity className="size-4" />}
          label="直近1週間で検知"
          value={kpi.detectedLast7Days}
          sublabel="新たに検知された問題"
          accent="#0052CC"
        />
        <KpiCard
          icon={<AlertTriangle className="size-4" />}
          label="未解決の問題"
          value={kpi.openIssues}
          sublabel="残タスクの総数"
          accent="#FF8B00"
        />
      </div>

      {!hasData ? (
        <EmptyState
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <>
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

          {/* Product Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const score = overallScore(product.id, latestByPC);
              const prevValues = CATS.map(
                (c) => weekAgoByPC[`${product.id}|${c}`],
              ).filter((v): v is number => v != null);
              const prev = avg(prevValues);
              const delta =
                score !== null && prev !== null ? score - prev : null;
              const color =
                product.primary_color || GO_COLORS[product.name] || "#6B7280";
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  score={score}
                  delta={delta}
                  color={color}
                  latestByPC={latestByPC}
                  onOpenTrend={() => setTrendOpen(product)}
                />
              );
            })}
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
                      <Clock className="size-4 text-amber-500" />
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

          {/* Trend modal */}
          {trendOpen && (
            <SimpleDialog
              open={!!trendOpen}
              onClose={() => setTrendOpen(null)}
              title={`${trendOpen.display_name} — 過去30日のスコア推移`}
            >
              <TrendModalBody
                trend={trendByProduct[trendOpen.id] ?? {}}
                color={
                  trendOpen.primary_color ||
                  GO_COLORS[trendOpen.name] ||
                  "#6B7280"
                }
              />
            </SimpleDialog>
          )}
        </>
      )}
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sublabel: string;
  accent: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex size-7 items-center justify-center rounded-md"
            style={{ backgroundColor: accent + "1A", color: accent }}
          >
            {icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="mt-2 text-3xl font-semibold text-foreground">
          {value}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
        <Minus className="size-3" />
        —
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
        <Minus className="size-3" />
        ±0
      </span>
    );
  }
  const positive = delta > 0;
  const styles = positive
    ? {
        bg: "#DCFCE7",
        fg: "#166534",
        border: "#BBF7D0",
        Icon: TrendingUp,
        label: `+${delta}`,
      }
    : {
        bg: "#FEE2E2",
        fg: "#991B1B",
        border: "#FECACA",
        Icon: TrendingDown,
        label: `${delta}`,
      };
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: styles.bg,
        color: styles.fg,
        borderColor: styles.border,
      }}
    >
      <styles.Icon className="size-3" />
      {styles.label}
    </span>
  );
}

function ProductCard({
  product,
  score,
  delta,
  color,
  latestByPC,
  onOpenTrend,
}: {
  product: Product;
  score: number | null;
  delta: number | null;
  color: string;
  latestByPC: Record<string, number>;
  onOpenTrend: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenTrend}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenTrend();
        }
      }}
      className="group cursor-pointer rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Product Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span
            className="font-semibold text-foreground"
            style={{
              fontSize: "var(--text-base)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            {product.display_name}
          </span>
        </div>
        <Link
          href={`/products/${product.name}`}
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 transition-opacity group-hover:opacity-100"
          aria-label="プロダクト詳細を開く"
        >
          <ArrowUpRight
            className="size-4"
            style={{ color: "var(--color-text-secondary)" }}
          />
        </Link>
      </div>

      {/* Overall Score */}
      <div className="mb-4 flex items-center gap-4">
        <ScoreDonut score={score} size={64} color={color} />
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-semibold text-foreground"
              style={{
                fontSize: "var(--text-2xl)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              {score !== null ? score : "—"}
            </span>
            <DeltaBadge delta={delta} />
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-secondary)",
            }}
          >
            総合スコア（前週比）
          </div>
        </div>
      </div>

      {/* Category Scores */}
      <div className="grid grid-cols-2 gap-2">
        {CATS.map((cat) => {
          const v = latestByPC[`${product.id}|${cat}`];
          return (
            <div
              key={cat}
              className="flex items-center justify-between rounded border border-border px-2 py-1"
            >
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {CATEGORY_LABELS[cat]}
              </span>
              <span
                className="font-medium"
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-primary)",
                }}
              >
                {v != null ? v : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendModalBody({
  trend,
  color: _color,
}: {
  trend: Record<string, Partial<Record<Cat, number>>>;
  color: string;
}) {
  const points = useMemo<TrendPoint[]>(() => {
    const dates = Object.keys(trend).sort();
    return dates.map((date) => {
      const cats = trend[date];
      const values = CATS.map((c) => cats[c]).filter(
        (v): v is number => v != null,
      );
      const overall =
        values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : null;
      return {
        date: date.slice(5), // MM-DD
        quality: cats.quality ?? null,
        security: cats.security ?? null,
        design_system: cats.design_system ?? null,
        performance: cats.performance ?? null,
        overall,
      };
    });
  }, [trend]);

  return <ScoreTrendChart data={points} />;
}
