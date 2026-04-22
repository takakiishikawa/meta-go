import { createClient } from "@/lib/supabase/server"
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system"
import { ScoreDonut } from "@/components/score/score-donut"
import { ExternalLink } from "lucide-react"

const LEVEL_COLORS: Record<string, string> = {
  L1: "#FF5630",
  L2: "#FF991F",
  L3: "#36B37E",
}

const STATE_LABELS: Record<string, string> = {
  new: "未対応",
  done: "完了",
}

export default async function QualityPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .schema("metago")
    .from("quality_items")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })

  const { data: scores } = await supabase
    .schema("metago")
    .from("scores_history")
    .select("*")
    .eq("category", "quality")
    .order("collected_at", { ascending: false })
    .limit(10)

  const allItems = items ?? []
  const openItems = allItems.filter((i) => i.state === "new")
  const avgScore =
    scores && scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length)
      : null

  return (
    <>
      <PageHeader
        title="コード品質"
        description="goシリーズ全体のコード品質スコアと問題点一覧"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          <ScoreDonut score={avgScore} size={72} />
          <div>
            <div className="text-2xl font-bold text-foreground">{avgScore ?? "—"}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>総合スコア</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-bold text-foreground">{openItems.length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>未対応の問題</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-bold text-foreground">
            {allItems.filter((i) => i.state === "done").length}
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>解決済み</div>
        </div>
      </div>

      {allItems.length === 0 ? (
        <EmptyState
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {["プロダクト", "カテゴリ", "タイトル", "レベル", "状態", "PR"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-3 text-sm">{item.products?.display_name ?? "—"}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{item.category}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{item.title}</div>
                    {item.description && (
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{item.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: LEVEL_COLORS[item.level] ?? "#6B7280" }}>
                      {item.level}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.state === "done" ? "default" : "outline"}>
                      {STATE_LABELS[item.state] ?? item.state}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {item.pr_url && (
                      <a href={item.pr_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-4" style={{ color: "var(--color-primary)" }} />
                      </a>
                    )}
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
