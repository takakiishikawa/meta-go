import { createClient } from "@/lib/supabase/server"
import { Badge } from "@takaki/go-design-system"
import { ScoreDonut } from "@/components/score/score-donut"
import { ExternalLink, Palette } from "lucide-react"

export default async function DesignSystemPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .schema("metago")
    .from("design_system_items")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })

  const { data: scores } = await supabase
    .schema("metago")
    .from("scores_history")
    .select("*")
    .eq("category", "design_system")
    .order("collected_at", { ascending: false })
    .limit(10)

  const allItems = items ?? []
  const openItems = allItems.filter((i) => i.state !== "done")
  const avgScore =
    scores && scores.length > 0
      ? Math.round(scores.reduce((a: number, b: { score: number }) => a + b.score, 0) / scores.length)
      : null

  const byCategory: Record<string, number> = allItems.reduce(
    (acc: Record<string, number>, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1
      return acc
    },
    {}
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-bold text-foreground" style={{ fontSize: "var(--text-2xl)" }}>
          デザインシステム
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
          go-design-system準拠率と違反一覧
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          <ScoreDonut score={avgScore} size={72} />
          <div>
            <div className="text-2xl font-bold text-foreground">{avgScore ? `${avgScore}%` : "—"}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>準拠率</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-bold text-foreground">{openItems.length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>未修正の違反</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-col gap-1">
            {Object.entries(byCategory).slice(0, 3).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--color-text-secondary)" }}>{cat}</span>
                <span className="font-medium text-foreground">{count as number}</span>
              </div>
            ))}
            {Object.keys(byCategory).length === 0 && (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>—</div>
            )}
          </div>
        </div>
      </div>

      {allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-20 text-center">
          <Palette className="size-12" style={{ color: "var(--color-text-secondary)" }} />
          <p className="font-medium text-foreground" style={{ fontSize: "var(--text-base)" }}>
            データがまだありません
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {["プロダクト", "カテゴリ", "違反内容", "状態", "PR"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-3 text-sm">{(item as any).products?.display_name ?? "—"}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{item.category}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{item.title}</div>
                    {item.description && (
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{item.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.state === "done" ? "default" : "outline"}>{item.state}</Badge>
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
    </div>
  )
}
