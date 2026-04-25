"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, PageHeader, Spinner } from "@takaki/go-design-system";
import { ScoreDonut } from "@/components/score/score-donut";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
};

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "up") return <TrendingUp className="size-4 text-success" />;
  if (trend === "down")
    return <TrendingDown className="size-4 text-destructive" />;
  return (
    <Minus
      className="size-4"
      style={{ color: "var(--color-text-secondary)" }}
    />
  );
}

export default function PsfPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [psfScores, setPsfScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.schema("metago").from("products").select("*").order("priority"),
      supabase
        .schema("metago")
        .from("psf_scores")
        .select(`*, products(name, display_name, primary_color)`)
        .order("collected_at", { ascending: false })
        .limit(200),
    ]).then(([p, s]) => {
      setProducts(p.data ?? []);
      setPsfScores(s.data ?? []);
      setLoading(false);
    });
  }, []);

  // Latest PSF per product
  const latestPerProduct = psfScores.reduce(
    (acc, s) => {
      if (!acc[s.product_id]) acc[s.product_id] = s;
      return acc;
    },
    {} as Record<string, any>,
  );

  // Chart data: group by date
  const chartData: Record<string, any> = {};
  psfScores.forEach((s) => {
    const date = s.collected_at.substring(0, 10);
    if (!chartData[date]) chartData[date] = { date };
    const name = s.products?.name ?? s.product_id;
    chartData[date][name] = s.psf_score;
  });
  const chartArray = Object.values(chartData)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="PSF"
        description="Product Super-specific Fit — 各goの課題適合度スコア"
      />

      {products.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="size-12" />}
          title="データがまだありません"
          description="PSFスコアの収集が開始されると表示されます"
        />
      ) : (
        <>
          {/* PSF Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const latest = latestPerProduct[product.id];
              const color =
                product.primary_color || GO_COLORS[product.name] || "#6B7280";
              return (
                <div
                  key={product.id}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span
                        className="font-semibold text-foreground"
                        style={{ fontSize: "var(--text-sm)" }}
                      >
                        {product.display_name}
                      </span>
                    </div>
                    <TrendIcon trend={latest?.trend ?? null} />
                  </div>
                  {latest ? (
                    <>
                      <div className="flex items-center gap-4">
                        <ScoreDonut
                          score={Math.round(latest.psf_score)}
                          size={64}
                          color={color}
                        />
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-4">
                            <span
                              style={{
                                fontSize: "var(--text-xs)",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              結果
                            </span>
                            <span
                              className="font-medium"
                              style={{ fontSize: "var(--text-xs)" }}
                            >
                              {Math.round(latest.result_score)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span
                              style={{
                                fontSize: "var(--text-xs)",
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              行動
                            </span>
                            <span
                              className="font-medium"
                              style={{ fontSize: "var(--text-xs)" }}
                            >
                              {Math.round(latest.behavior_score)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-16 items-center justify-center">
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        データなし
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* PSF Trend Chart */}
          {chartArray.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2
                className="mb-4 font-semibold text-foreground"
                style={{ fontSize: "var(--text-base)" }}
              >
                PSFトレンド
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartArray}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                  />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {products.map((p) => (
                    <Line
                      key={p.name}
                      type="monotone"
                      dataKey={p.name}
                      stroke={p.primary_color || GO_COLORS[p.name] || "#6B7280"}
                      strokeWidth={2}
                      dot={false}
                      name={p.display_name}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  );
}
