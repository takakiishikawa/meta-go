/**
 * Delivery 6 メニュー (Code Quality / Security / Dependencies / Design System /
 * Performance / Deployments) のページ上部に共通配置する issue 統計バナー。
 *
 * 表示内容:
 *   未対応 N    (直近 7 日 +Δ)     ← warning 色
 *   解決済み N  (直近 7 日 +Δ)     ← success 色
 *
 * "issue 数" の意味はメニューによって少し違う:
 *   - quality / security / design-system / dependency: items テーブル行
 *   - performance: quality_items の category=Performance 行
 *   - deployments: execution_logs (deploy-fix) の merged↔failed mapping 後の行
 * いずれも summarize() で共通の MenuStats 形に揃える。
 */
import type { MenuStats } from "@/lib/metago/delivery-stats";

interface Props {
  stats: MenuStats;
  /** 「issue」の代わりに「違反」「脆弱性」など出したい場合に上書き */
  noun?: string;
}

function formatDelta(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `${n}`;
}

export function IssueStatsBanner({ stats, noun = "issue" }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <StatBlock
        label={`未対応 ${noun}`}
        value={stats.open}
        delta={stats.newLast7d}
        deltaSubLabel="直近7日に新規検知"
        accent="#FF8B00"
      />
      <StatBlock
        label={`解決済み ${noun} (累計)`}
        value={stats.resolved}
        delta={stats.resolvedLast7d}
        deltaSubLabel="直近7日に解決"
        accent="#36B37E"
      />
    </div>
  );
}

function StatBlock({
  label,
  value,
  delta,
  deltaSubLabel,
  accent,
}: {
  label: string;
  value: number;
  delta: number;
  deltaSubLabel: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-secondary)",
          }}
        >
          {label}
        </span>
        {delta !== 0 && (
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: accent }}
            title={deltaSubLabel}
          >
            {formatDelta(delta)} / 7d
          </span>
        )}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
        {value}
      </div>
      <div
        className="mt-0.5 text-xs"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {deltaSubLabel}: {formatDelta(delta)}
      </div>
    </div>
  );
}
