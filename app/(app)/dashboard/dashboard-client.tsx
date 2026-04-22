"use client"

import Link from "next/link"
import { AlertCircle, Clock, ArrowUpRight } from "lucide-react"
import { Badge, EmptyState, PageHeader } from "@takaki/go-design-system"
import { ScoreDonut } from "@/components/score/score-donut"

interface Product {
  id: string
  name: string
  display_name: string
  description: string
  github_repo: string
  vercel_url: string
  primary_color: string
  priority: number
}

interface ScoreRecord {
  id: string
  product_id: string
  category: string
  score: number
  collected_at: string
}

interface ApprovalItem {
  id: string
  product_id: string
  title: string
  category: string
  state: string
  created_at: string
}

interface DashboardClientProps {
  products: Product[]
  latestScores: ScoreRecord[]
  pendingApprovals: ApprovalItem[]
}

const GO_COLORS: Record<string, string> = {
  nativego: "#0052CC",
  carego: "#00875A",
  kenyakugo: "#FF5630",
  cookgo: "#FF991F",
  physicalgo: "#6554C0",
  taskgo: "#00B8D9",
}

const CATEGORY_LABELS: Record<string, string> = {
  quality: "コード品質",
  security: "セキュリティ",
  design_system: "デザインシステム",
  performance: "パフォーマンス",
}

function getLatestScore(
  scores: ScoreRecord[],
  productId: string,
  category: string
): number | null {
  const found = scores.find(
    (s) => s.product_id === productId && s.category === category
  )
  return found ? found.score : null
}

function overallScore(
  scores: ScoreRecord[],
  productId: string
): number | null {
  const categories = ["quality", "security", "design_system", "performance"]
  const values = categories
    .map((c) => getLatestScore(scores, productId, c))
    .filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function DashboardClient({
  products,
  latestScores,
  pendingApprovals,
}: DashboardClientProps) {
  const hasData = products.length > 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="goシリーズ全体の健全性を俯瞰する"
        actions={
          pendingApprovals.length > 0 ? (
            <Link
              href="/approval"
              className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <AlertCircle className="size-4" />
              承認待ち {pendingApprovals.length}件
              <ArrowUpRight className="size-3" />
            </Link>
          ) : undefined
        }
      />

      {!hasData ? (
        <EmptyState
          title="データがまだありません"
          description="GitHub Actions cronが実行されるとデータが表示されます"
        />
      ) : (
        <>
          {/* Product Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const score = overallScore(latestScores, product.id)
              const color = product.primary_color || GO_COLORS[product.name] || "#6B7280"
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  score={score}
                  color={color}
                  scores={latestScores}
                />
              )
            })}
          </div>

          {/* Recent Approvals */}
          {pendingApprovals.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-foreground" style={{ fontSize: "var(--text-base)" }}>
                  承認待ち
                </h2>
                <Link
                  href="/approval"
                  className="text-sm font-medium"
                  style={{ color: "var(--color-primary)" }}
                >
                  すべて見る
                </Link>
              </div>
              <div className="flex flex-col gap-2">
                {pendingApprovals.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-amber-500" />
                      <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                        {item.title}
                      </span>
                    </div>
                    <Badge variant="outline">{item.category}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function ProductCard({
  product,
  score,
  color,
  scores,
}: {
  product: Product
  score: number | null
  color: string
  scores: ScoreRecord[]
}) {
  const categories = ["quality", "security", "design_system", "performance"] as const
  return (
    <Link href={`/products/${product.name}`}>
      <div className="group rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md cursor-pointer">
        {/* Product Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="size-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span
              className="font-semibold text-foreground"
              style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-weight-semibold)" }}
            >
              {product.display_name}
            </span>
          </div>
          <ArrowUpRight
            className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--color-text-secondary)" }}
          />
        </div>

        {/* Overall Score */}
        <div className="mb-4 flex items-center gap-4">
          <ScoreDonut score={score} size={64} color={color} />
          <div>
            <div
              className="font-bold text-foreground"
              style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-weight-bold)" }}
            >
              {score !== null ? score : "—"}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
              総合スコア
            </div>
          </div>
        </div>

        {/* Category Scores */}
        <div className="grid grid-cols-2 gap-2">
          {categories.map((cat) => {
            const s = scores.find(
              (sc) => sc.product_id === product.id && sc.category === cat
            )
            return (
              <div
                key={cat}
                className="flex items-center justify-between rounded border border-border px-2 py-1"
              >
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <span
                  className="font-medium"
                  style={{ fontSize: "var(--text-xs)", color: "var(--color-text-primary)" }}
                >
                  {s ? s.score : "—"}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Link>
  )
}

