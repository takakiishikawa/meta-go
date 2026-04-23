"use client";

import { PieChart, Pie, Cell } from "recharts";

interface ScoreDonutProps {
  score: number | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function ScoreDonut({
  score,
  size = 80,
  color = "#1E3A8A",
  strokeWidth = 8,
}: ScoreDonutProps) {
  const val = score ?? 0;
  const data = [{ value: val }, { value: 100 - val }];

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          cx={size / 2 - 1}
          cy={size / 2 - 1}
          innerRadius={size / 2 - strokeWidth - 2}
          outerRadius={size / 2 - 2}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          strokeWidth={0}
        >
          <Cell fill={score !== null ? color : "#E5E7EB"} />
          <Cell fill="var(--color-surface-subtle, #F3F4F6)" />
        </Pie>
      </PieChart>
      <div
        className="absolute inset-0 flex items-center justify-center font-semibold"
        style={{
          fontSize: size * 0.22,
          color: score !== null ? color : "var(--color-text-secondary)",
        }}
      >
        {score !== null ? score : "—"}
      </div>
    </div>
  );
}
