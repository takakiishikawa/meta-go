"use client";

import { useState } from "react";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { BarChart3 } from "lucide-react";

export interface SecurityItemForEval {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  state: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF5630",
  high: "#FF8B00",
  medium: "#FF991F",
  low: "#36B37E",
};

export function ProductSecurityEvalButton({
  items,
  score,
  productName,
}: {
  items: SecurityItemForEval[];
  score: number | null;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const openItems = items.filter((i) => i.state !== "done");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-subtle transition-colors"
        style={{
          color: "var(--color-primary)",
          border: "1px solid var(--color-border)",
        }}
      >
        <BarChart3 className="size-3" />
        評価
      </button>

      <SimpleDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${productName} — セキュリティ評価`}
      >
        <div className="flex flex-col gap-3">
          {openItems.length === 0 ? (
            <div
              className="rounded-lg p-4 text-center"
              style={{ backgroundColor: "var(--color-surface-subtle)" }}
            >
              <span
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                未対応のセキュリティ問題はありません。
                {score !== null ? `（スコア: ${score}点）` : ""}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">
                未対応の問題（{openItems.length}件）
              </span>
              <div className="flex flex-col gap-2">
                {openItems.slice(0, 12).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border p-3 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-xs font-medium shrink-0"
                        style={{
                          backgroundColor:
                            (SEVERITY_COLORS[item.severity] ?? "#6B7280") + "22",
                          color: SEVERITY_COLORS[item.severity] ?? "#6B7280",
                        }}
                      >
                        {item.severity}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                    </div>
                    {item.description && (
                      <p
                        className="text-xs leading-relaxed pl-0.5"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>
                ))}
                {openItems.length > 12 && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    他 {openItems.length - 12} 件
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </SimpleDialog>
    </>
  );
}
