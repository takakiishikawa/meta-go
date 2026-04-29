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

export interface IssueTrendPoint {
  date: string; // MM-DD label
  detected: number;
  resolved: number;
}

interface Props {
  data: IssueTrendPoint[];
  height?: number;
}

export function IssueTrendChart({ data, height = 240 }: Props) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        履歴がまだありません
      </div>
    );
  }
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            width={36}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--color-border)",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="circle"
          />
          <Line
            type="monotone"
            dataKey="detected"
            name="新規検知"
            stroke="#0052CC"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="resolved"
            name="解決"
            stroke="#36B37E"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
