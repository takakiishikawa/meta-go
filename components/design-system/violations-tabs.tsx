"use client";

import { useState } from "react";
import { Badge } from "@takaki/go-design-system";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ViolationItem {
  id: string;
  category: string;
  title: string;
  description: string | null;
  state: string;
  products: {
    name?: string;
    display_name?: string;
    primary_color?: string;
  } | null;
}

const PAGE_SIZE = 20;

export function DesignSystemViolationsTabs({
  items,
}: {
  items: ViolationItem[];
}) {
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter(Boolean)),
  ).sort();

  const counts = items.reduce<Record<string, number>>(
    (acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    },
    { all: items.length },
  );

  const [active, setActive] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filtered =
    active === "all" ? items : items.filter((i) => i.category === active);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-foreground">
          違反一覧{" "}
          <span className="font-normal text-muted-foreground">
            ({items.length}件)
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {[
          { key: "all", label: "All" },
          ...categories.map((c) => ({ key: c, label: c })),
        ].map((tab) => {
          const isActive = active === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActive(tab.key);
                setPage(1);
              }}
              className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-subtle">
              {["プロダクト", "カテゴリ", "違反内容", "状態"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"
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
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  該当する違反はありません。
                </td>
              </tr>
            ) : (
              paged.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-0 hover:bg-surface-subtle"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            item.products?.primary_color || "#6B7280",
                        }}
                      />
                      <span className="text-sm text-foreground whitespace-nowrap">
                        {item.products?.display_name ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{item.category}</Badge>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="text-sm font-medium text-foreground">
                      {item.title}
                    </div>
                    {item.description && (
                      <div className="text-xs mt-0.5 line-clamp-2 text-muted-foreground">
                        {item.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={item.state === "done" ? "default" : "outline"}
                    >
                      {item.state}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="rounded-md p-1.5 hover:bg-surface-subtle disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm text-muted-foreground">
            {safePage} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="rounded-md p-1.5 hover:bg-surface-subtle disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
