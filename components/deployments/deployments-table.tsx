"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  DeploymentRow,
  DeploymentState,
} from "@/lib/metago/github-deployments";

const PAGE_SIZE = 100;

type StateFilter = "all" | "success" | "failure" | "rate_limited" | "pending";

const STATE_TABS: { key: StateFilter; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "success", label: "成功" },
  { key: "failure", label: "失敗" },
  { key: "rate_limited", label: "Rate limit" },
  { key: "pending", label: "進行中" },
];

const STATE_STYLE: Record<
  DeploymentState,
  {
    bg: string;
    fg: string;
    border: string;
    label: string;
    Icon: typeof CheckCircle2;
  }
> = {
  success: {
    bg: "#DCFCE7",
    fg: "#166534",
    border: "#BBF7D0",
    label: "成功",
    Icon: CheckCircle2,
  },
  failure: {
    bg: "#FEE2E2",
    fg: "#991B1B",
    border: "#FECACA",
    label: "失敗",
    Icon: XCircle,
  },
  error: {
    bg: "#FEE2E2",
    fg: "#991B1B",
    border: "#FECACA",
    label: "エラー",
    Icon: XCircle,
  },
  rate_limited: {
    bg: "#FEF3C7",
    fg: "#92400E",
    border: "#FDE68A",
    label: "Rate limit",
    Icon: AlertTriangle,
  },
  pending: {
    bg: "#DBEAFE",
    fg: "#1E40AF",
    border: "#BFDBFE",
    label: "Pending",
    Icon: Clock,
  },
  queued: {
    bg: "#DBEAFE",
    fg: "#1E40AF",
    border: "#BFDBFE",
    label: "Queued",
    Icon: Clock,
  },
  in_progress: {
    bg: "#DBEAFE",
    fg: "#1E40AF",
    border: "#BFDBFE",
    label: "Building",
    Icon: Clock,
  },
  unknown: {
    bg: "transparent",
    fg: "var(--color-text-secondary)",
    border: "var(--color-border)",
    label: "—",
    Icon: Clock,
  },
};

function StateBadge({ state }: { state: DeploymentState }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.unknown;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
    >
      <s.Icon className="size-3" />
      {s.label}
    </span>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.round(h / 24);
  return `${d}日前`;
}

export function DeploymentsTable({ rows }: { rows: DeploymentRow[] }) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  // フィルタ変更時は1ページ目に戻す
  useEffect(() => {
    setPage(1);
  }, [stateFilter, productFilter]);

  const products = useMemo(() => {
    const m = new Map<
      string,
      { id: string; name: string; color: string | null }
    >();
    for (const r of rows) {
      if (!m.has(r.productId)) {
        m.set(r.productId, {
          id: r.productId,
          name: r.productDisplayName,
          color: r.primaryColor,
        });
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const stateCounts = useMemo(() => {
    const c: Record<StateFilter, number> = {
      all: rows.length,
      success: 0,
      failure: 0,
      rate_limited: 0,
      pending: 0,
    };
    for (const r of rows) {
      if (r.state === "success") c.success++;
      else if (r.state === "failure" || r.state === "error") c.failure++;
      else if (r.state === "rate_limited") c.rate_limited++;
      else if (
        r.state === "pending" ||
        r.state === "queued" ||
        r.state === "in_progress"
      )
        c.pending++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (stateFilter !== "all") {
        if (
          stateFilter === "failure" &&
          r.state !== "failure" &&
          r.state !== "error"
        )
          return false;
        if (stateFilter === "success" && r.state !== "success") return false;
        if (stateFilter === "rate_limited" && r.state !== "rate_limited")
          return false;
        if (
          stateFilter === "pending" &&
          r.state !== "pending" &&
          r.state !== "queued" &&
          r.state !== "in_progress"
        )
          return false;
      }
      if (productFilter !== "all" && r.productId !== productFilter)
        return false;
      return true;
    });
  }, [rows, stateFilter, productFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-3">
      {/* state tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {STATE_TABS.map((tab) => {
          const active = stateFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStateFilter(tab.key)}
              className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {stateCounts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* product chip filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">プロダクト:</span>
        <button
          onClick={() => setProductFilter("all")}
          className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
            productFilter === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          全て
        </button>
        {products.map((p) => {
          const active = productFilter === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setProductFilter(p.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: p.color ?? "#6B7280" }}
              />
              {p.name}
            </button>
          );
        })}
      </div>

      {/* table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["プロダクト", "Commit / 変更内容", "状態", "失敗理由", "作成", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  該当する deployment はありません。
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr
                  key={r.deploymentId}
                  className="border-b border-border last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: r.primaryColor ?? "#6B7280",
                        }}
                      />
                      {r.productDisplayName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 max-w-md">
                    <div className="flex items-baseline gap-2">
                      {r.commitUrl ? (
                        <a
                          href={r.commitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-muted-foreground hover:text-primary"
                        >
                          {r.sha}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.sha}
                        </span>
                      )}
                      <span
                        className="truncate text-sm text-foreground"
                        title={r.commitSubject ?? undefined}
                      >
                        {r.commitSubject ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StateBadge state={r.state} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-md truncate">
                    {r.state === "success" ? "—" : r.description || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {relTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.targetUrl && (
                      <a
                        href={r.targetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Vercel deployment を開く"
                        className="inline-flex text-primary hover:opacity-80"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} /{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-md border border-border p-1.5 hover:bg-muted/40 disabled:opacity-40 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
            </button>
            <span className="text-sm text-muted-foreground">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded-md border border-border p-1.5 hover:bg-muted/40 disabled:opacity-40 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
