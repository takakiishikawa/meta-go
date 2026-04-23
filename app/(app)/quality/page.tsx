import { createClient } from "@/lib/supabase/server"
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system"
import { ScoreDonut } from "@/components/score/score-donut"
import { Pagination } from "@/components/ui/pagination"
import { Code2, ExternalLink } from "lucide-react"

const PAGE_SIZE = 20

const GO_COLORS: Record<string, string> = {
  nativego:   "#0052CC",
  carego:     "#00875A",
  kenyakugo:  "#FF5630",
  cookgo:     "#FF991F",
  physicalgo: "#6554C0",
  taskgo:     "#00B8D9",
}

const STATE_LABELS: Record<string, string> = { new: "未対応", done: "完了" }

export default async function QualityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? "1", 10))

  const supabase = await createClient()

  const [{ data: items }, { data: scores }, { data: products }] = await Promise.all([
    supabase
      .schema("metago")
      .from("quality_items")
      .select(`*, products(name, display_name, primary_color)`)
      .order("created_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("scores_history")
      .select(`product_id, score, collected_at, products(name, display_name, primary_color)`)
      .eq("category", "quality")
      .order("collected_at", { ascending: false }),
    supabase
      .schema("metago")
      .from("products")
      .select("id, name, display_name, primary_color")
      .order("priority"),
  ])

  const allItems  = items    ?? []
  const allScores = scores   ?? []
  const allProducts = products ?? []

  // Latest score per product
  const latestScore: Record<string, number> = {}
  for (const s of allScores) {
    if (!(s.product_id in latestScore)) latestScore[s.product_id] = s.score
  }

  // Counts per product
  const openCount:  Record<string, number> = {}
  const doneCount:  Record<string, number> = {}
  for (const item of allItems) {
    if (item.state === "new") openCount[item.product_id]  = (openCount[item.product_id]  ?? 0) + 1
    else                      doneCount[item.product_id]  = (doneCount[item.product_id]  ?? 0) + 1
  }

  const scoreValues = Object.values(latestScore)
  const avgScore = scoreValues.length > 0
    ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
    : null

  const totalPages = Math.ceil(allItems.length / PAGE_SIZE)
  const pagedItems = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <PageHeader
        title="コード品質"
        description="goシリーズ全体のコード品質スコアと問題点一覧"
      />

      {/* Overall stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          <ScoreDonut score={avgScore} size={72} />
          <div>
            <div className="text-2xl font-semibold text-foreground">{avgScore ?? "—"}</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>全go平均スコア</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-semibold text-foreground">{allItems.filter(i => i.state === "new").length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>未対応の問題</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="text-2xl font-semibold text-foreground">{allItems.filter(i => i.state === "done").length}</div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>解決済み</div>
        </div>
      </div>

      {/* Per-product score table */}
      {allProducts.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface-subtle">
            <span className="text-sm font-semibold text-foreground">プロダクト別スコア</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["プロダクト", "スコア", "未対応", "解決済み"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allProducts.map(product => {
                const color = product.primary_color || GO_COLORS[product.name] || "#6B7280"
                const score = latestScore[product.id] ?? null
                return (
                  <tr key={product.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm text-foreground">{product.display_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ScoreDonut score={score} size={36} color={color} />
                        <span className="text-sm font-semibold text-foreground">{score ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{openCount[product.id] ?? 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{doneCount[product.id] ?? 0}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Issues list */}
      {allItems.length === 0 ? (
        <EmptyState
          icon={<Code2 className="size-12" />}
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-foreground">
            問題一覧 <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>({allItems.length}件)</span>
          </span>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-subtle">
                  {["プロダクト", "カテゴリ", "内容", "状態", "PR"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedItems.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.products?.primary_color || "#6B7280" }} />
                        <span className="text-sm text-foreground whitespace-nowrap">{item.products?.display_name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{item.category}</Badge>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-sm font-medium text-foreground">{item.title}</div>
                      {item.description && (
                        <div className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>{item.description}</div>
                      )}
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
          <Pagination page={page} totalPages={totalPages} basePath="/quality" />
        </div>
      )}
    </>
  )
}
