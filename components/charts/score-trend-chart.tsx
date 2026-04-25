"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface TrendPoint {
  date: string;
  quality?: number | null;
  security?: number | null;
  design_system?: number | null;
  performance?: number | null;
  overall?: number | null;
}

const SERIES: { key: keyof TrendPoint; label: string; color: string }[] = [
  { key: "overall", label: "総合", color: "#1E3A8A" },
  { key: "quality", label: "品質", color: "#0052CC" },
  { key: "security", label: "セキュリティ", color: "#FF5630" },
  { key: "design_system", label: "DS", color: "#6554C0" },
  { key: "performance", label: "パフォーマンス", color: "#00875A" },
];

export function ScoreTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        過去30日分のスコア履歴がまだありません
      </div>
    );
  }
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          {SERIES.map((s) => (
            <Line
              key={s.key as string}
              type="monotone"
              dataKey={s.key as string}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.key === "overall" ? 2.5 : 1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
