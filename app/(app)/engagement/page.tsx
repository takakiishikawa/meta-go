"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@takaki/go-design-system";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

export default function EngagementPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.schema("metago").from("products").select("*").order("priority"),
      supabase
        .schema("metago")
        .from("engagement_history")
        .select(`*, products(name, display_name, primary_color)`)
        .order("measured_at", { ascending: false })
        .limit(200),
    ]).then(([p, h]) => {
      setProducts(p.data ?? []);
      setHistory(h.data ?? []);
      setLoading(false);
    });
  }, []);

  // Chart data
  const chartData: Record<string, any> = {};
  history.forEach((h) => {
    const date = h.measured_at.substring(0, 10);
    if (!chartData[date]) chartData[date] = { date };
    const name = h.products?.name ?? h.product_id;
    chartData[date][name] = h.usage_count;
  });
  const chartArray = Object.values(chartData)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  // Latest per product
  const latestPerProduct = history.reduce(
    (acc, h) => {
      if (!acc[h.product_id]) acc[h.product_id] = h;
      return acc;
    },
    {} as Record<string, any>,
  );

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
        title="使用パターン"
        description="エンゲージメント推移（全go）"
      />

      {history.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-12" />}
          title="データがまだありません"
          description="使用パターンの収集が開始されると表示されます"
        />
      ) : (
        <>
          {/* Summary table */}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader className="bg-surface-subtle">
                <TableRow>
                  {["プロダクト", "最新利用数", "トレンド", "測定日"].map(
                    (h) => (
                      <TableHead key={h} className="px-4 py-3 text-xs">
                        {h}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const latest = latestPerProduct[product.id];
                  const color =
                    product.primary_color ||
                    GO_COLORS[product.name] ||
                    "#6B7280";
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm text-foreground">
                            {product.display_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-medium text-foreground">
                        {latest ? latest.usage_count : "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {latest?.trend === "up" ? (
                          <TrendingUp className="size-4 text-success" />
                        ) : latest?.trend === "down" ? (
                          <TrendingDown className="size-4 text-destructive" />
                        ) : (
                          <Minus
                            className="size-4"
                            style={{ color: "var(--color-text-secondary)" }}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        className="px-4 py-3 text-sm"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {latest
                          ? new Date(latest.measured_at).toLocaleDateString(
                              "ja-JP",
                            )
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Chart */}
          {chartArray.length > 0 && (
            <Card className="p-4">
              <h2
                className="mb-4 font-semibold text-foreground"
                style={{ fontSize: "var(--text-base)" }}
              >
                利用数推移（30日間）
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartArray}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                  />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
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
            </Card>
          )}
        </>
      )}
    </>
  );
}
