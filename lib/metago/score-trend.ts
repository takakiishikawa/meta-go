/**
 * scores_history を「date × productId → score」の TrendPoint 配列に変換
 *
 * - 日付は Asia/Tokyo の calendar day で揃える
 * - 同日複数レコードがある場合は当該日内で最後のものを採用
 * - 範囲は rows 内の最古 〜 最新の日付。空きの日は null で埋める
 *   (recharts は connectNulls で線をつなぐ)
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
): TrendPoint[] {
  if (rows.length === 0) return [];

  // dateKey -> productId -> latestScore
  const buckets = new Map<string, Record<string, number>>();
  let minKey = "";
  let maxKey = "";
  for (const r of rows) {
    const key = dayKeyFmt.format(new Date(r.collected_at));
    if (!minKey || key < minKey) minKey = key;
    if (!maxKey || key > maxKey) maxKey = key;
    if (!buckets.has(key)) buckets.set(key, {});
    buckets.get(key)![r.product_id] = r.score; // 後勝ち
  }

  // 範囲内の全日付を生成 (UTC基準で1日ずつ進める。formatter で JST に投影される)
  const out: TrendPoint[] = [];
  // minKey は YYYY-MM-DD (JST). 当日の JST 00:00 = UTC 15:00 前日。
  // 単純に Date(minKey) で UTC 0:00 として扱い、format で TZ='Asia/Tokyo' を当てれば
  // 同じ日付ラベルになる (どの時刻でもその日のラベル)。
  const start = new Date(`${minKey}T00:00:00Z`);
  const end = new Date(`${maxKey}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
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
