import { createClient } from "@/lib/supabase/server"
import { Badge, PageHeader } from "@takaki/go-design-system"
import { ExternalLink, ScrollText, CheckCircle2, Clock, XCircle } from "lucide-react"

const STATE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  merged: { icon: CheckCircle2, color: "#36B37E", label: "マージ済み" },
  pending: { icon: Clock, color: "#FF991F", label: "承認待ち" },
  failed: { icon: XCircle, color: "#FF5630", label: "失敗" },
}

export default async function ExecLogPage() {
  const supabase = await createClient()

  const { data: logs } = await supabase
    .schema("metago")
    .from("execution_logs")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })
    .limit(100)

  const allLogs = logs ?? []

  // Summary by product x category
  const summary: Record<string, { product: string; category: string; count: number }> = allLogs.reduce(
    (acc: Record<string, { product: string; category: string; count: number }>, log) => {
      const key = `${log.product_id}:${log.category}`
      if (!acc[key]) acc[key] = { product: (log as any).products?.display_name ?? "—", category: log.category, count: 0 }
      acc[key].count++
      return acc
    },
    {}
  )

  return (
    <>
      <PageHeader
        title="実行ログ"
        description="MetaGoの自動実行履歴"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-bold text-foreground">{allLogs.length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>総実行件数</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <div className="text-2xl font-bold text-green-600">
            {allLogs.filter((l) => l.state === "merged").length}
          </div>
          <div className="text-sm text-green-600">マージ済み</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="text-2xl font-bold text-amber-600">
            {allLogs.filter((l) => l.state === "pending").length}
          </div>
          <div className="text-sm text-amber-600">承認待ち</div>
        </div>
      </div>

      {allLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-20 text-center">
          <ScrollText className="size-12" style={{ color: "var(--color-text-secondary)" }} />
          <p className="font-medium text-foreground" style={{ fontSize: "var(--text-base)" }}>
            データがまだありません
          </p>
        </div>
      ) : (
        <>
          {/* Summary table */}
          {Object.keys(summary).length > 0 && (
            <div>
              <h2 className="mb-3 font-semibold text-foreground" style={{ fontSize: "var(--text-base)" }}>
                プロダクト × カテゴリ別集計
              </h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-subtle">
                      {["プロダクト", "カテゴリ", "件数"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(summary).map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-sm text-foreground">{row.product}</td>
                        <td className="px-4 py-3"><Badge variant="outline">{row.category}</Badge></td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Log list */}
          <div>
            <h2 className="mb-3 font-semibold text-foreground" style={{ fontSize: "var(--text-base)" }}>
              最近の実行履歴
            </h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle">
                    {["プロダクト", "カテゴリ", "タイトル", "状態", "日時", "PR"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLogs.map((log) => {
                    const stateConf = STATE_CONFIG[log.state] ?? STATE_CONFIG.pending
                    const StateIcon = stateConf.icon
                    return (
                      <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                        <td className="px-4 py-3 text-sm">{(log as any).products?.display_name ?? "—"}</td>
                        <td className="px-4 py-3"><Badge variant="outline">{log.category}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-foreground">{log.title}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm" style={{ color: stateConf.color }}>
                            <StateIcon className="size-3" />
                            {stateConf.label}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                          {new Date(log.created_at).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-3">
                          {log.pr_url && (
                            <a href={log.pr_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="size-4" style={{ color: "var(--color-primary)" }} />
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
