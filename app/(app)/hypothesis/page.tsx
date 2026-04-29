import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@takaki/go-design-system";
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
        description="各goで検証中の課題仮説・解決策仮説と、優先度つきのバックログ"
      />

      {isEmpty ? (
        <EmptyState
          icon={<Lightbulb className="size-12" />}
          title="仮説がまだありません"
          description="課題・解決策の仮説とバックログが追加されるとここに表示されます"
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
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-subtle">
                    <TableRow>
                      {[
                        "プロダクト",
                        "タイトル",
                        "確信度",
                        "状態",
                        "作成日",
                      ].map((h) => (
                        <TableHead key={h} className="px-4 py-3 text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {problems.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="px-4 py-3 text-sm">
                          {h.products?.display_name ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {h.confidence ? `${h.confidence}%` : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="outline">{h.state}</Badge>
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {new Date(h.created_at).toLocaleDateString("ja-JP")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
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
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-subtle">
                    <TableRow>
                      {[
                        "プロダクト",
                        "タイトル",
                        "確信度",
                        "状態",
                        "作成日",
                      ].map((h) => (
                        <TableHead key={h} className="px-4 py-3 text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {solutions.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="px-4 py-3 text-sm">
                          {h.products?.display_name ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {h.confidence ? `${h.confidence}%` : "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="outline">{h.state}</Badge>
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {new Date(h.created_at).toLocaleDateString("ja-JP")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
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
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-subtle">
                    <TableRow>
                      {[
                        "プロダクト",
                        "タイトル",
                        "優先度",
                        "状態",
                        "作成日",
                      ].map((h) => (
                        <TableHead key={h} className="px-4 py-3 text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backlog.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="px-4 py-3 text-sm">
                          {item.products?.display_name ?? "—"}
                        </TableCell>
                        <TableCell className="px-4 py-3">
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
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge
                            className="text-white"
                            style={{
                              backgroundColor:
                                PRIORITY_COLORS[item.priority] ?? "#6B7280",
                            }}
                          >
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="outline">{item.state}</Badge>
                        </TableCell>
                        <TableCell
                          className="px-4 py-3 text-sm"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          {new Date(item.created_at).toLocaleDateString(
                            "ja-JP",
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
