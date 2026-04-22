import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@takaki/go-design-system"
import { ScoreDonut } from "@/components/score/score-donut"
import { Gauge } from "lucide-react"

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
}

export default async function PerformancePage() {
  const supabase = await createClient()

  const { data: metrics } = await supabase
    .schema("metago")
    .from("performance_metrics")
    .select(`*, products(name, display_name, primary_color)`)
    .order("measured_at", { ascending: false })

  const allMetrics = metrics ?? []
  // Get latest per product
  const latestPerProduct = allMetrics.reduce(
    (acc, m) => {
      const key = m.product_id
      if (!acc[key]) acc[key] = m
      return acc
    },
    {} as Record<string, (typeof allMetrics)[0]>
  )
  const latest = Object.values(latestPerProduct)
  const avgScore =
    latest.length > 0
      ? Math.round((latest as any[]).reduce((a: number, b) => a + (b.score as number), 0) / latest.length)
      : null

  return (
    <>
      <PageHeader
        title="パフォーマンス"
        description="Core Web Vitals とバンドルサイズの測定結果"
      />

      {/* Overall */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 w-fit">
        <ScoreDonut score={avgScore} size={72} />
        <div>
          <div className="text-2xl font-bold text-foreground">{avgScore ?? "—"}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>全go平均スコア</div>
        </div>
      </div>

      {latest.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-20 text-center">
          <Gauge className="size-12" style={{ color: "var(--color-text-secondary)" }} />
          <p className="font-medium text-foreground" style={{ fontSize: "var(--text-base)" }}>
            データがまだありません
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {["プロダクト", "スコア", "LCP (ms)", "FID (ms)", "CLS", "API avg (ms)", "Bundle (KB)", "測定日"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(latest as any[]).map((m) => {
                const productName = m.products?.name ?? ""
                const color = (m as any).products?.primary_color || GO_COLORS[productName] || "#6B7280"
                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-sm text-foreground">{(m as any).products?.display_name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreDonut score={m.score} size={40} color={color} />
                    </td>
                    <td className="px-4 py-3 text-sm">{m.lcp ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{m.fid ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{m.cls ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{m.api_avg ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{m.bundle_size ?? "—"}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      {new Date(m.measured_at).toLocaleDateString("ja-JP")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
