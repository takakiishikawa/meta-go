import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { PerformanceTable } from "@/components/performance/performance-table";
import { Gauge } from "lucide-react";

export default async function PerformancePage() {
  const supabase = await createClient();

  const { data: metrics } = await supabase
    .schema("metago")
    .from("performance_metrics")
    .select(`*, products(name, display_name, primary_color)`)
    .order("measured_at", { ascending: false });

  const allMetrics = metrics ?? [];
  const latestPerProduct = allMetrics.reduce(
    (acc, m) => {
      const key = m.product_id;
      if (!acc[key]) acc[key] = m;
      return acc;
    },
    {} as Record<string, (typeof allMetrics)[0]>,
  );
  const latest = Object.values(latestPerProduct);
  const avgScore =
    latest.length > 0
      ? Math.round(
          latest.reduce((a: number, b) => a + ((b as any).score ?? 0), 0) /
            latest.length,
        )
      : null;

  return (
    <>
      <PageHeader
        title="パフォーマンス"
        description="Core Web Vitals とバンドルサイズの測定結果"
      />

      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 w-fit">
        <ScoreDonut score={avgScore} size={72} />
        <div>
          <div className="text-2xl font-bold text-foreground">
            {avgScore ?? "—"}
          </div>
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-secondary)",
            }}
          >
            全go平均スコア
          </div>
        </div>
      </div>

      {latest.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <PerformanceTable metrics={latest as any[]} />
      )}
    </>
  );
}
