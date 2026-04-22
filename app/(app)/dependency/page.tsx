import { createClient } from "@/lib/supabase/server"
import { Badge, PageHeader } from "@takaki/go-design-system"
import { ExternalLink, Package } from "lucide-react"

const UPDATE_TYPE_COLORS: Record<string, string> = {
  patch: "#36B37E",
  minor: "#FF991F",
  major: "#FF5630",
  framework: "#6554C0",
}

const STATE_LABELS: Record<string, string> = {
  new: "未対応",
  in_progress: "対応中",
  done: "完了",
}

export default async function DependencyPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .schema("metago")
    .from("dependency_items")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })

  const allItems = items ?? []
  const majorCount = allItems.filter((i) => i.update_type === "major" && i.state !== "done").length
  const minorCount = allItems.filter((i) => i.update_type === "minor" && i.state !== "done").length

  return (
    <>
      <PageHeader
        title="依存・技術スタック"
        description="パッケージ更新状況と技術スタック一覧"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-bold text-foreground">{allItems.length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>総更新件数</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <div className="text-2xl font-bold text-red-600">{majorCount}</div>
          <div className="text-sm text-red-600">Major更新あり</div>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950">
          <div className="text-2xl font-bold text-orange-600">{minorCount}</div>
          <div className="text-sm text-orange-600">Minor更新あり</div>
        </div>
      </div>

      {allItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-20 text-center">
          <Package className="size-12" style={{ color: "var(--color-text-secondary)" }} />
          <p className="font-medium text-foreground" style={{ fontSize: "var(--text-base)" }}>
            データがまだありません
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {["プロダクト", "パッケージ", "現バージョン", "最新バージョン", "種類", "状態", "PR"].map((h) => (
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
                  <td className="px-4 py-3 text-sm font-mono font-medium text-foreground">{item.package_name}</td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: "var(--color-text-secondary)" }}>{item.current_version}</td>
                  <td className="px-4 py-3 text-sm font-mono text-green-600">{item.latest_version}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: UPDATE_TYPE_COLORS[item.update_type] ?? "#6B7280" }}
                    >
                      {item.update_type}
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
