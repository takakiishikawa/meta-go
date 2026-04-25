"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface SuccessRateRow {
  productId: string;
  name: string;
  color: string;
  total: number;
  success: number;
  failure: number;
  rateLimited: number;
}

interface Props {
  data: SuccessRateRow[];
  height?: number;
}

export function ProductSuccessRateChart({ data, height = 220 }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        deployment データがまだありません
      </div>
    );
  }
  const enriched = data.map((d) => ({
    ...d,
    rate: d.total > 0 ? Math.round((d.success / d.total) * 100) : 0,
  }));
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={enriched}
          layout="vertical"
          margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            width={100}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
            formatter={(value, _name, item) => {
              const r = (item?.payload ?? {}) as SuccessRateRow;
              return [
                `${value}% (成功 ${r.success ?? 0} / 失敗 ${r.failure ?? 0} / rate ${r.rateLimited ?? 0})`,
                "成功率",
              ];
            }}
            labelFormatter={() => ""}
          />
          <Bar
            dataKey="rate"
            label={{
              position: "right",
              fill: "var(--color-text-primary)",
              fontSize: 11,
              formatter: (label) => `${label ?? 0}%`,
            }}
          >
            {enriched.map((d) => (
              <Cell key={d.productId} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
