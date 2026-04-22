import { createClient } from "@/lib/supabase/server"
import { DollarSign } from "lucide-react"

const SERVICES = ["vercel", "supabase", "anthropic", "other"]

export default async function CostPage() {
  const supabase = await createClient()

  const { data: records } = await supabase
    .schema("metago")
    .from("cost_records")
    .select(`*, products(name, display_name, primary_color)`)
    .order("recorded_at", { ascending: false })

  const { data: products } = await supabase
    .schema("metago")
    .from("products")
    .select("*")
    .order("priority")

  const allRecords = records ?? []
  const allProducts = products ?? []

  // Get latest month
  const latestMonth =
    allRecords.length > 0
      ? allRecords[0].recorded_at.substring(0, 7)
      : null

  // Build cross table: product x service
  const crossData = allProducts.map((product) => {
    const productRecords = allRecords.filter(
      (r) => r.product_id === product.id && (latestMonth ? r.recorded_at.startsWith(latestMonth) : true)
    )
    const byService = SERVICES.reduce(
      (acc, svc) => {
        const r = productRecords.find((rec) => rec.service === svc)
        acc[svc] = r ? r.amount : null
        return acc
      },
      {} as Record<string, number | null>
    )
    const total = Object.values(byService).reduce(
      (a, v) => (a ?? 0) + (v ?? 0),
      0 as number
    )
    return { product, byService, total }
  })

  const totalByCost = crossData.reduce((a, d) => a + (d.total ?? 0), 0)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-foreground" style={{ fontSize: "var(--text-2xl)" }}>
            コスト
          </h1>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            サービス別 × プロダクト別のコスト管理
          </p>
        </div>
        {latestMonth && (
          <span className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {latestMonth}
          </span>
        )}
      </div>

      {/* Total */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 w-fit">
        <DollarSign className="size-8" style={{ color: "var(--color-primary)" }} />
        <div>
          <div className="text-2xl font-bold text-foreground">
            ${totalByCost.toFixed(2)}
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>今月の合計コスト</div>
        </div>
      </div>

      {allRecords.length === 0 || allProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-20 text-center">
          <DollarSign className="size-12" style={{ color: "var(--color-text-secondary)" }} />
          <p className="font-medium text-foreground" style={{ fontSize: "var(--text-base)" }}>
            データがまだありません
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  プロダクト
                </th>
                {SERVICES.map((svc) => (
                  <th key={svc} className="px-4 py-3 text-right text-xs font-medium capitalize" style={{ color: "var(--color-text-secondary)" }}>
                    {svc}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  合計
                </th>
              </tr>
            </thead>
            <tbody>
              {crossData.map(({ product, byService, total }) => (
                <tr key={product.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="size-2.5 rounded-full" style={{ backgroundColor: product.primary_color || "#6B7280" }} />
                      <span className="text-sm text-foreground">{product.display_name}</span>
                    </div>
                  </td>
                  {SERVICES.map((svc) => (
                    <td key={svc} className="px-4 py-3 text-right text-sm">
                      {byService[svc] !== null ? `$${byService[svc]!.toFixed(2)}` : (
                        <span style={{ color: "var(--color-text-secondary)" }}>—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                    ${(total ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr className="border-t-2 border-border bg-surface-subtle">
                <td className="px-4 py-3 text-sm font-semibold text-foreground">合計</td>
                {SERVICES.map((svc) => {
                  const t = crossData.reduce((a, d) => a + (d.byService[svc] ?? 0), 0)
                  return (
                    <td key={svc} className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                      ${t.toFixed(2)}
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-right text-sm font-bold text-foreground">
                  ${totalByCost.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
