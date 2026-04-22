import { createClient } from "@/lib/supabase/server"
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system"
import { ScoreDonut } from "@/components/score/score-donut"
import { ExternalLink, ShieldAlert } from "lucide-react"

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#FF5630",
  high: "#FF8B00",
  medium: "#FF991F",
  low: "#36B37E",
}

export default async function SecurityPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .schema("metago")
    .from("security_items")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })

  const { data: scores } = await supabase
    .schema("metago")
    .from("scores_history")
    .select("*")
    .eq("category", "security")
    .order("collected_at", { ascending: false })
    .limit(10)

  const allItems = items ?? []
  const openItems = allItems.filter((i) => i.state !== "done")
  const avgScore =
    scores && scores.length > 0
      ? Math.round(scores.reduce((a: number, b: { score: number }) => a + b.score, 0) / scores.length)
      : null
  const criticalCount = openItems.filter((i) => i.severity === "critical").length
  const highCount = openItems.filter((i) => i.severity === "high").length

  return (
    <>
      <PageHeader
        title="セキュリティ"
        description="脆弱性と依存関係のセキュリティ問題"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          <ScoreDonut score={avgScore} size={72} />
          <div>
            <div className="text-2xl font-bold text-foreground">{avgScore ?? "—"}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>スコア</div>
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
          <div className="text-sm text-red-600">Critical</div>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950">
          <div className="text-2xl font-bold text-orange-600">{highCount}</div>
          <div className="text-sm text-orange-600">High</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-bold text-foreground">{openItems.length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>未対応</div>
        </div>
      </div>

      {allItems.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {["プロダクト", "深刻度", "タイトル", "CVE", "状態", "PR"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-3 text-sm">{item.products?.display_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: SEVERITY_COLORS[item.severity] ?? "#6B7280" }}>
                      {item.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{item.title}</div>
                    {item.description && <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{item.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: "var(--color-text-secondary)" }}>{item.cve ?? "—"}</td>
                  <td className="px-4 py-3"><Badge variant={item.state === "done" ? "default" : "outline"}>{item.state}</Badge></td>
                  <td className="px-4 py-3">
                    {item.pr_url && <a href={item.pr_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" style={{ color: "var(--color-primary)" }} /></a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
