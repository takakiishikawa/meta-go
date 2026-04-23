import { createClient } from "@/lib/supabase/server";
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system";
import { Lightbulb } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  High: "#FF5630",
  Med: "#FF991F",
  Low: "#36B37E",
};

export default async function HypothesisPage() {
  const supabase = await createClient();

  const [hypothesesRes, backlogRes, productsRes] = await Promise.all([
    supabase
      .schema("metago")
      .from("hypotheses")
      .select(`*, products(display_name, primary_color)`)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("backlog")
      .select(`*, products(display_name, primary_color)`)
      .order("priority")
      .order("created_at", { ascending: false }),
    supabase.schema("metago").from("products").select("*").order("priority"),
  ]);

  const hypotheses = hypothesesRes.data ?? [];
  const backlog = backlogRes.data ?? [];
  const products = productsRes.data ?? [];

  const problems = hypotheses.filter((h) => h.type === "problem");
  const solutions = hypotheses.filter((h) => h.type === "solution");

  const isEmpty = hypotheses.length === 0 && backlog.length === 0;

  return (
    <>
      <PageHeader
        title="仮説・バックログ"
        description="プロダクト別の課題仮説・解決策仮説・バックログ"
      />

      {isEmpty ? (
        <EmptyState
          icon={<Lightbulb className="size-12" />}
          title="データがまだありません"
          description="仮説とバックログが追加されると表示されます"
        />
      ) : (
        <>
          {/* Problem Hypotheses */}
          {problems.length > 0 && (
            <div>
              <h2
                className="mb-3 font-semibold text-foreground"
                style={{ fontSize: "var(--text-base)" }}
              >
                課題仮説
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-subtle">
                      {[
                        "プロダクト",
                        "タイトル",
                        "確信度",
                        "状態",
                        "作成日",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((h) => (
                      <tr
                        key={h.id}
                        className="border-b border-border last:border-0 hover:bg-surface-subtle"
                      >
                        <td className="px-4 py-3 text-sm">
                          {h.products?.display_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-foreground">
                            {h.title}
                          </div>
                          {h.description && (
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              {h.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {h.confidence ? `${h.confidence}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{h.state}</Badge>
                        </td>
                        <td
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {new Date(h.created_at).toLocaleDateString("ja-JP")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Solution Hypotheses */}
          {solutions.length > 0 && (
            <div>
              <h2
                className="mb-3 font-semibold text-foreground"
                style={{ fontSize: "var(--text-base)" }}
              >
                解決策仮説
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-subtle">
                      {[
                        "プロダクト",
                        "タイトル",
                        "確信度",
                        "状態",
                        "作成日",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {solutions.map((h) => (
                      <tr
                        key={h.id}
                        className="border-b border-border last:border-0 hover:bg-surface-subtle"
                      >
                        <td className="px-4 py-3 text-sm">
                          {h.products?.display_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-foreground">
                            {h.title}
                          </div>
                          {h.description && (
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              {h.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {h.confidence ? `${h.confidence}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{h.state}</Badge>
                        </td>
                        <td
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {new Date(h.created_at).toLocaleDateString("ja-JP")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Backlog */}
          {backlog.length > 0 && (
            <div>
              <h2
                className="mb-3 font-semibold text-foreground"
                style={{ fontSize: "var(--text-base)" }}
              >
                バックログ
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-subtle">
                      {[
                        "プロダクト",
                        "タイトル",
                        "優先度",
                        "状態",
                        "作成日",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-medium"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {backlog.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border last:border-0 hover:bg-surface-subtle"
                      >
                        <td className="px-4 py-3 text-sm">
                          {item.products?.display_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-foreground">
                            {item.title}
                          </div>
                          {item.description && (
                            <div
                              className="text-xs mt-0.5"
                              style={{ color: "var(--color-text-secondary)" }}
                            >
                              {item.description}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                            style={{
                              backgroundColor:
                                PRIORITY_COLORS[item.priority] ?? "#6B7280",
                            }}
                          >
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{item.state}</Badge>
                        </td>
                        <td
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {new Date(item.created_at).toLocaleDateString(
                            "ja-JP",
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
