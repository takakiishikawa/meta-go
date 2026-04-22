import { createClient } from "@/lib/supabase/server"
import { Badge } from "@takaki/go-design-system"
import { Clock, CheckCircle, XCircle } from "lucide-react"

export default async function ApprovalPage() {
  const supabase = await createClient()

  const { data: items } = await supabase
    .schema("metago")
    .from("approval_queue")
    .select(`*, products(display_name, primary_color)`)
    .order("created_at", { ascending: false })

  const pending = (items ?? []).filter((i) => i.state === "pending")
  const resolved = (items ?? []).filter((i) => i.state !== "pending")

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-bold text-foreground" style={{ fontSize: "var(--text-2xl)" }}>
          承認待ち
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
          人間の判断が必要なアイテム一覧
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-20 text-center">
          <CheckCircle className="size-12" style={{ color: "var(--color-text-secondary)" }} />
          <p className="font-medium text-foreground" style={{ fontSize: "var(--text-base)" }}>
            承認待ちはありません
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>プロダクト</th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>タイトル</th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>カテゴリ</th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>作成日</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-3 text-sm">{(item as any).products?.display_name ?? "—"}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{item.title}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{item.category}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-sm text-amber-600">
                      <Clock className="size-3" />
                      承認待ち
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(item.created_at).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-foreground" style={{ fontSize: "var(--text-base)" }}>
            処理済み（直近）
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <tbody>
                {resolved.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      {(item as any).products?.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.title}</td>
                    <td className="px-4 py-3">
                      {item.state === "approved" ? (
                        <div className="flex items-center gap-1 text-sm text-green-600">
                          <CheckCircle className="size-3" />承認済み
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-sm text-red-500">
                          <XCircle className="size-3" />却下
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
