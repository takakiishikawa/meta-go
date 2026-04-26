"use client";

import { useState } from "react";
import { Badge, Button } from "@takaki/go-design-system";
import { SimpleDialog } from "@/components/ui/simple-dialog";
import { BarChart3 } from "lucide-react";

export interface EvalItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  state: string;
}

function getScoreLabel(score: number | null): string {
  if (score === null) return "未計測";
  if (score >= 90) return "優秀";
  if (score >= 75) return "良好";
  if (score >= 60) return "改善余地あり";
  if (score >= 40) return "問題あり";
  return "要対応";
}

function getSummary(items: EvalItem[], score: number | null): string {
  const open = items.filter((i) => i.state !== "done");
  const label = getScoreLabel(score);
  if (open.length === 0) {
    return `評価: ${label}（${score ?? "—"}点）。現在検出されている問題はありません。`;
  }
  const topCategories = [...new Set(open.map((i) => i.category))].slice(0, 3);
  return `評価: ${label}（${score ?? "—"}点）。未対応の問題が${open.length}件あります。主な課題: ${topCategories.join("、")}。`;
}

export function ProductEvalButton({
  items,
  score,
  productName,
}: {
  items: EvalItem[];
  score: number | null;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const openItems = items.filter((i) => i.state !== "done");

  const byCategory: Record<string, EvalItem[]> = {};
  for (const item of openItems) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-auto gap-1 px-2 py-1 text-xs hover:bg-surface-subtle"
        style={{ color: "var(--color-primary)" }}
      >
        <BarChart3 className="size-3" />
        評価
      </Button>

      <SimpleDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${productName} — 定性評価`}
      >
        <div className="flex flex-col gap-4">
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {getSummary(items, score)}
          </p>

          {Object.entries(byCategory).length > 0 ? (
            <div className="flex flex-col gap-4">
              {Object.entries(byCategory).map(([cat, catItems]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{cat}</Badge>
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {catItems.length}件
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 pl-2 border-l-2 border-border">
                    {catItems.slice(0, 4).map((item) => (
                      <div key={item.id}>
                        <div className="text-sm font-medium text-foreground">
                          {item.title}
                        </div>
                        {item.description && (
                          <div
                            className="text-xs mt-0.5 line-clamp-2"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {item.description}
                          </div>
                        )}
                      </div>
                    ))}
                    {catItems.length > 4 && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        他 {catItems.length - 4} 件
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="rounded-lg p-4 text-center"
              style={{ backgroundColor: "var(--color-surface-subtle)" }}
            >
              <span
                className="text-sm"
                style={{ color: "var(--color-text-secondary)" }}
              >
                現在検出されている問題はありません
              </span>
            </div>
          )}
        </div>
      </SimpleDialog>
    </>
  );
}
