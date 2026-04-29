"use client";

import { useMemo, useState } from "react";
import {
  LineCountsChart,
  type LineCountsPoint,
} from "@/components/charts/line-counts-chart";

interface Item {
  state: string | null;
  created_at: string;
  resolved_at: string | null;
}

const RANGES = [
  { id: "7d", label: "1週間", days: 7 },
  { id: "30d", label: "1ヶ月", days: 30 },
  { id: "all", label: "全期間", days: null as number | null },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const TZ = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;

function isResolvedState(state: string | null): boolean {
  return state === "fixed" || state === "done";
}

function buildBuckets(
  items: Item[],
  days: number | null,
): LineCountsPoint[] {
  const fmtKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ,
    month: "2-digit",
    day: "2-digit",
  });

  const today = new Date();
  let totalDays: number;
  if (days === null) {
    // 全期間: 最古の created_at / resolved_at から今日まで
    let earliestMs = today.getTime();
    for (const it of items) {
      const c = new Date(it.created_at).getTime();
      if (c < earliestMs) earliestMs = c;
      if (it.resolved_at) {
        const r = new Date(it.resolved_at).getTime();
        if (r < earliestMs) earliestMs = r;
      }
    }
    totalDays = Math.max(
      7,
      Math.ceil((today.getTime() - earliestMs) / DAY_MS) + 1,
    );
    // 上限: 365 日 (recharts のレンダリングを保護)
    if (totalDays > 365) totalDays = 365;
  } else {
    totalDays = days;
  }

  const startMs = today.getTime() - (totalDays - 1) * DAY_MS;
  const buckets = new Map<string, { detected: number; resolved: number }>();
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    buckets.set(fmtKey.format(d), { detected: 0, resolved: 0 });
  }

  for (const it of items) {
    const cMs = new Date(it.created_at).getTime();
    if (cMs >= startMs) {
      const k = fmtKey.format(new Date(it.created_at));
      const b = buckets.get(k);
      if (b) b.detected++;
    }
    if (isResolvedState(it.state) && it.resolved_at) {
      const rMs = new Date(it.resolved_at).getTime();
      if (rMs >= startMs) {
        const k = fmtKey.format(new Date(it.resolved_at));
        const b = buckets.get(k);
        if (b) b.resolved++;
      }
    }
  }

  const out: LineCountsPoint[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const k = fmtKey.format(d);
    const v = buckets.get(k) ?? { detected: 0, resolved: 0 };
    out.push({
      date: fmtLabel.format(d),
      detected: v.detected,
      resolved: v.resolved,
    });
  }
  return out;
}

interface Props {
  items: Item[];
  title?: string;
  noun?: string;
  height?: number;
  defaultRange?: RangeId;
}

export function IssueTrendSection({
  items,
  title,
  noun = "issue",
  height = 260,
  defaultRange = "7d",
}: Props) {
  const [rangeId, setRangeId] = useState<RangeId>(defaultRange);
  const range = RANGES.find((r) => r.id === rangeId)!;
  const data = useMemo(
    () => buildBuckets(items, range.days),
    [items, range.days],
  );
  const headline = title ?? `${noun} 検知 / 解決 推移`;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          {headline}
        </span>
        <RangeTabs value={rangeId} onChange={setRangeId} />
      </div>
      <LineCountsChart
        data={data}
        height={height}
        series={[
          { key: "detected", name: "新規検知", color: "#0052CC" },
          { key: "resolved", name: "解決", color: "#36B37E" },
        ]}
      />
    </div>
  );
}

function RangeTabs({
  value,
  onChange,
}: {
  value: RangeId;
  onChange: (v: RangeId) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-subtle p-0.5">
      {RANGES.map((r) => {
        const active = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className="rounded px-2.5 py-1 text-xs transition-colors"
            style={{
              backgroundColor: active ? "var(--color-surface)" : "transparent",
              color: active
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              fontWeight: active ? 600 : 500,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : undefined,
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
