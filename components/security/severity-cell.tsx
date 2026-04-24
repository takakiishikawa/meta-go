"use client";

import { useState } from "react";
import { SimpleDialog } from "@/components/ui/simple-dialog";

interface SeverityItem {
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

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical（致命的）",
  high: "High（高リスク）",
  medium: "Medium（中リスク）",
  low: "Low（低リスク）",
};

export function SeverityCell({
  items,
  severity,
  productName,
}: {
  items: SeverityItem[];
  severity: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const count = items.filter((i) => i.severity === severity).length;
  const color = SEVERITY_COLORS[severity] ?? "#6B7280";

  if (count === 0) {
    return (
      <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
        0
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium underline-offset-2 hover:underline transition-colors"
        style={{ color }}
      >
        {count}
      </button>

      <SimpleDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${productName} — ${SEVERITY_LABELS[severity] ?? severity}`}
      >
        <div className="flex flex-col gap-2">
          {items
            .filter((i) => i.severity === severity)
            .map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border p-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium shrink-0"
                    style={{
                      backgroundColor: color + "22",
                      color,
                    }}
                  >
                    {item.state === "done" ? "✓ 対応済" : severity}
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
        </div>
      </SimpleDialog>
    </>
  );
}
