"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@takaki/go-design-system";
import {
  ExternalLink,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
} from "lucide-react";

export interface LogItem {
  id: string;
  category: string;
  title: string;
  description: string | null;
  level: string | null;
  state: string;
  pr_url: string | null;
  created_at: string;
  products: {
    display_name?: string;
    primary_color?: string;
  } | null;
}

const STATE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  merged: { icon: CheckCircle2, color: "#36B37E", label: "マージ済み" },
  pending: { icon: Clock, color: "#FF991F", label: "承認待ち" },
  failed: { icon: XCircle, color: "#FF5630", label: "失敗" },
};

type StateFilter = "all" | "merged" | "failed";

const STATE_TABS: { key: StateFilter; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "merged", label: "成功" },
  { key: "failed", label: "失敗" },
];

export function ExecLogTable({ logs }: { logs: LogItem[] }) {
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const categories = useMemo(
    () => Array.from(new Set(logs.map((l) => l.category).filter(Boolean))).sort(),
    [logs],
  );

  const stateCounts = useMemo(() => {
    return {
      all: logs.length,
      merged: logs.filter((l) => l.state === "merged").length,
      failed: logs.filter((l) => l.state === "failed").length,
    } as Record<StateFilter, number>;
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (stateFilter !== "all" && l.state !== stateFilter) return false;
      if (categoryFilter !== "all" && l.category !== categoryFilter)
        return false;
      return true;
    });
  }, [logs, stateFilter, categoryFilter]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* State tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {STATE_TABS.map((tab) => {
          const isActive = stateFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStateFilter(tab.key)}
              className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                  isActive
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

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">カテゴリ:</span>
        <button
          onClick={() => setCategoryFilter("all")}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
            categoryFilter === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
          }`}
        >
          全て
        </button>
        {categories.map((c) => {
          const isActive = categoryFilter === c;
          return (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-subtle">
              <th className="w-8 px-2 py-3" />
              {["プロダクト", "カテゴリ", "タイトル", "状態", "日時", "PR"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  該当する実行ログがありません。
                </td>
              </tr>
            ) : (
              filtered.map((log) => {
                const stateConf =
                  STATE_CONFIG[log.state] ?? STATE_CONFIG.pending;
                const StateIcon = stateConf.icon;
                const isOpen = expanded.has(log.id);
                const hasDetails = !!(log.description || log.level);
                return (
                  <Fragment key={log.id}>
                    <tr
                      onClick={() => hasDetails && toggle(log.id)}
                      className={`border-b border-border last:border-0 hover:bg-surface-subtle ${
                        hasDetails ? "cursor-pointer" : ""
                      }`}
                    >
                      <td className="px-2 py-3 align-middle">
                        {hasDetails && (
                          <ChevronRight
                            className={`size-4 text-muted-foreground transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                log.products?.primary_color ?? "#6B7280",
                            }}
                          />
                          {log.products?.display_name ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{log.category}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-foreground">
                          {log.title}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center gap-1 text-sm"
                          style={{ color: stateConf.color }}
                        >
                          <StateIcon className="size-3" />
                          {stateConf.label}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleDateString("ja-JP")}
                      </td>
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {log.pr_url && (
                          <a
                            href={log.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink
                              className="size-4"
                              style={{ color: "var(--color-primary)" }}
                            />
                          </a>
                        )}
                      </td>
                    </tr>
                    {isOpen && hasDetails && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-col gap-2 text-xs">
                            {log.level && (
                              <div>
                                <span className="font-semibold text-foreground">
                                  Level:
                                </span>{" "}
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                  {log.level}
                                </code>
                              </div>
                            )}
                            {log.description && (
                              <div>
                                <div className="mb-1 font-semibold text-foreground">
                                  詳細
                                </div>
                                <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
                                  {log.description}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
