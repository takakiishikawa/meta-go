"use client";

import { ScoreDonut } from "@/components/score/score-donut";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ScoreDelta } from "@/components/score/score-delta";

export interface PerformanceMetric {
  id: string;
  score: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  api_avg: number | null;
  bundle_size: number | null;
  products: {
    name: string;
    display_name: string;
    primary_color: string;
  } | null;
}

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
};

const TOOLTIP_TEXTS = {
  lcp: "Largest Contentful Paint: ページの主要コンテンツが表示されるまでの時間。2,500ms以下が理想的。",
  fid: "First Input Delay: ユーザーが初めてページを操作してから、ブラウザが応答するまでの遅延。100ms以下が理想的。",
  cls: "Cumulative Layout Shift: ページ読み込み中のレイアウトのズレ量。0.1以下が理想的。",
  apiAvg:
    "APIの平均レスポンスタイム。サーバーサイドのエンドポイントが返答するまでの平均時間（ms）。",
  bundle:
    "JavaScriptバンドルの合計サイズ。小さいほど初回読み込みが速くなる。300KB以下が目安。",
};

type Verdict = "good" | "warn" | "bad" | "neutral";

const VERDICT_STYLE: Record<
  Verdict,
  { bg: string; fg: string; border: string }
> = {
  good: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
  warn: { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
  bad: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
  neutral: {
    bg: "transparent",
    fg: "var(--color-text-secondary)",
    border: "var(--color-border)",
  },
};

function lcpVerdict(v: number | null): Verdict {
  if (v == null) return "neutral";
  if (v <= 2500) return "good";
  if (v <= 4000) return "warn";
  return "bad";
}
function fidVerdict(v: number | null): Verdict {
  if (v == null) return "neutral";
  if (v <= 100) return "good";
  if (v <= 300) return "warn";
  return "bad";
}
function clsVerdict(v: number | null): Verdict {
  if (v == null) return "neutral";
  if (v <= 0.1) return "good";
  if (v <= 0.25) return "warn";
  return "bad";
}

function MetricCell({
  value,
  verdict,
  unit = "",
}: {
  value: number | null;
  verdict: Verdict;
  unit?: string;
}) {
  if (value == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono font-medium"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
    >
      {value}
      {unit}
    </span>
  );
}

export interface ExemptProduct {
  id: string;
  name: string;
  display_name: string;
  primary_color: string | null;
  reason: string;
}

export function PerformanceTable({
  metrics,
  deltas = {},
  exempt = [],
}: {
  metrics: PerformanceMetric[];
  deltas?: Record<string, number | null>;
  exempt?: ExemptProduct[];
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-subtle">
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              プロダクト
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              スコア
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span className="inline-flex items-center">
                LCP (ms)
                <InfoTooltip text={TOOLTIP_TEXTS.lcp} />
              </span>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span className="inline-flex items-center">
                FID (ms)
                <InfoTooltip text={TOOLTIP_TEXTS.fid} />
              </span>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span className="inline-flex items-center">
                CLS
                <InfoTooltip text={TOOLTIP_TEXTS.cls} />
              </span>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span className="inline-flex items-center">
                API avg (ms)
                <InfoTooltip text={TOOLTIP_TEXTS.apiAvg} />
              </span>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <span className="inline-flex items-center">
                Bundle (KB)
                <InfoTooltip text={TOOLTIP_TEXTS.bundle} />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const productName = m.products?.name ?? "";
            const color =
              m.products?.primary_color || GO_COLORS[productName] || "#6B7280";
            const productId = (m as unknown as { product_id?: string })
              .product_id;
            const delta =
              productId != null ? (deltas[productId] ?? null) : null;
            return (
              <tr
                key={m.id}
                className="border-b border-border last:border-0 hover:bg-surface-subtle"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm text-foreground">
                      {m.products?.display_name ?? "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-0.5">
                    <ScoreDonut score={m.score} size={40} color={color} />
                    <ScoreDelta delta={delta} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <MetricCell
                    value={m.lcp}
                    verdict={lcpVerdict(m.lcp)}
                    unit="ms"
                  />
                </td>
                <td className="px-4 py-3">
                  <MetricCell
                    value={m.fid}
                    verdict={fidVerdict(m.fid)}
                    unit="ms"
                  />
                </td>
                <td className="px-4 py-3">
                  <MetricCell value={m.cls} verdict={clsVerdict(m.cls)} />
                </td>
                <td className="px-4 py-3 text-sm">{m.api_avg ?? "—"}</td>
                <td className="px-4 py-3 text-sm">{m.bundle_size ?? "—"}</td>
              </tr>
            );
          })}
          {exempt.map((p) => (
            <tr
              key={p.id}
              className="border-b border-border last:border-0 bg-muted/20"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: p.primary_color ?? "#6B7280",
                    }}
                  />
                  <span className="text-sm text-foreground">
                    {p.display_name}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3" colSpan={6}>
                <span
                  className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  title={p.reason}
                >
                  計測対象外 — {p.reason}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
