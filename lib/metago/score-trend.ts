/**
 * scores_history を「date × productId → score」の TrendPoint 配列に変換
 *
 * - 日付は Asia/Tokyo の calendar day で揃える
 * - 同日複数レコードがある場合は当該日内で最後のものを採用
 * - 欠損日は埋めずに connectNulls 任せ (recharts側でつなぐ)
 */

import type { TrendPoint } from "@/components/charts/multi-product-trend";

interface ScoreRow {
  product_id: string;
  score: number;
  collected_at: string;
}

const TZ = "Asia/Tokyo";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dayLabelFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ,
  month: "2-digit",
  day: "2-digit",
});

export function buildTrend(
  rows: ScoreRow[],
  productIds: string[],
  days: number,
): TrendPoint[] {
  // dateKey -> productId -> latestScore
  const buckets = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = dayKeyFmt.format(new Date(r.collected_at));
    if (!buckets.has(key)) buckets.set(key, {});
    buckets.get(key)![r.product_id] = r.score; // 後勝ち (上位の order に依存)
  }

  const out: TrendPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKeyFmt.format(d);
    const label = dayLabelFmt.format(d);
    const point: TrendPoint = { date: label };
    const dayScores = buckets.get(key) ?? {};
    for (const pid of productIds) {
      point[pid] = dayScores[pid] ?? null;
    }
    out.push(point);
  }
  return out;
}
