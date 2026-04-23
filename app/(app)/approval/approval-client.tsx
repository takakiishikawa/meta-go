"use client"

import { useState, useTransition } from "react"
import { Badge, Button, EmptyState } from "@takaki/go-design-system"
import {
  CheckCircle2,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
  GitPullRequest,
  Loader2,
  TrendingUp,
  AlertTriangle,
} from "lucide-react"

interface ApprovalItem {
  id: string
  title: string
  description: string | null
  category: string
  state: string
  created_at: string
  resolved_at: string | null
  meta: {
    pr_url?: string | null
    level?: string | null
    repo?: string | null
  } | null
  products: {
    display_name: string
    primary_color: string
  } | null
}

const CATEGORY_LABELS: Record<string, string> = {
  dependency:    "依存更新",
  quality:       "コード品質",
  design_system: "デザインシステム",
  security:      "セキュリティ",
  performance:   "パフォーマンス",
}

interface MeritRisk {
  merits: string[]
  risks: string[]
}

function getMeritRisk(category: string, description: string | null): MeritRisk {
  const desc = description ?? ""
  switch (category) {
    case "dependency":
      return {
        merits: [
          "最新版のセキュリティパッチ・バグ修正が適用される",
          "新機能・パフォーマンス改善が利用可能になる",
        ],
        risks: [
          "メジャーバージョンアップのため破壊的変更が含まれる可能性あり",
          "依存先のAPI変更によりビルドエラーやランタイムエラーが発生する可能性あり",
        ],
      }
    case "security":
      return {
        merits: [
          "既知の脆弱性を修正しセキュリティリスクを低減",
          "コンプライアンス要件への適合",
        ],
        risks: [
          desc.toLowerCase().includes("claude") || desc.toLowerCase().includes("修正")
            ? "ソースコード修正を含むため、意図しない動作変更の可能性あり"
            : "修正内容の動作確認が推奨される",
          "修正箇所のテストカバレッジを確認してください",
        ],
      }
    case "performance":
      return {
        merits: [
          "Lighthouse スコアの改善によるユーザー体験向上",
          "Core Web Vitals の改善でSEOに好影響",
        ],
        risks: [
          "画像コンポーネント変換・dynamic import追加によるレンダリング挙動の変更",
          "SSR / CSR 切り替えが含まれる場合、初期表示に差異が生じる可能性あり",
        ],
      }
    case "design_system":
      return {
        merits: [
          "go-design-system 準拠によるデザイン一貫性向上",
          "ブランドガイドライン適用でUI品質が向上",
        ],
        risks: [
          "スタイル変更により既存UIの見た目が若干変わる可能性あり",
          "DSコンポーネントへの置き換えで props の互換性要確認",
        ],
      }
    case "quality":
      return {
        merits: [
          "コード品質の向上、将来の保守性・拡張性の改善",
          "型安全性の強化によるバグ混入リスク低減",
        ],
        risks: [
          "リファクタリング・型修正により動作変更が生じる可能性あり",
          "自動修正のため、意図しない副作用がないか確認推奨",
        ],
      }
    default:
      return {
        merits: ["改善提案の適用"],
        risks: ["変更内容をPRで確認の上、承認してください"],
      }
  }
}

function PendingCard({
  item,
  onApprove,
  onReject,
}: {
  item: ApprovalItem
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [action, setAction] = useState<"approve" | "reject" | null>(null)
  const prUrl = item.meta?.pr_url
  const repo  = item.meta?.repo?.split("/")[1] ?? null
  const { merits, risks } = getMeritRisk(item.category, item.description)

  function handleApprove() {
    setAction("approve")
    startTransition(() => onApprove(item.id))
  }

  function handleReject() {
    setAction("reject")
    startTransition(() => onReject(item.id))
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {item.products?.primary_color && (
        <div className="h-0.5" style={{ backgroundColor: item.products.primary_color }} />
      )}

      <div className="p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {item.products && (
                <span
                  className="text-xs font-medium rounded px-1.5 py-0.5"
                  style={{
                    backgroundColor: (item.products.primary_color ?? "#6B7280") + "22",
                    color: item.products.primary_color ?? "#6B7280",
                  }}
                >
                  {item.products.display_name}
                </span>
              )}
              <Badge variant="outline">
                {CATEGORY_LABELS[item.category] ?? item.category}
              </Badge>
              {repo && (
                <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
                  {repo}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
            {item.description && (
              <p className="text-xs line-clamp-3" style={{ color: "var(--color-text-secondary)" }}>
                {item.description}
              </p>
            )}
          </div>
        </div>

        {/* Merit / Risk */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md p-3" style={{ backgroundColor: "#36B37E11", border: "1px solid #36B37E33" }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="size-3.5" style={{ color: "#36B37E" }} />
              <span className="text-xs font-semibold" style={{ color: "#36B37E" }}>承認のメリット</span>
            </div>
            <ul className="flex flex-col gap-1">
              {merits.map((m, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span className="mt-1 size-1 rounded-full shrink-0" style={{ backgroundColor: "#36B37E" }} />
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md p-3" style={{ backgroundColor: "#FF563011", border: "1px solid #FF563033" }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="size-3.5" style={{ color: "#FF8B00" }} />
              <span className="text-xs font-semibold" style={{ color: "#FF8B00" }}>リスクと注意点</span>
            </div>
            <ul className="flex flex-col gap-1">
              {risks.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span className="mt-1 size-1 rounded-full shrink-0" style={{ backgroundColor: "#FF8B00" }} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            {prUrl && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                <GitPullRequest className="size-3" />
                PR を確認
                <ExternalLink className="size-2.5" />
              </a>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <Clock className="size-3" />
              {new Date(item.created_at).toLocaleDateString("ja-JP")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              disabled={isPending}
              className="text-red-500 hover:text-red-600 hover:border-red-300"
            >
              {isPending && action === "reject" ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
              却下
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={isPending}>
              {isPending && action === "approve" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
              承認してマージ
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ApprovalClient({ items }: { items: ApprovalItem[] }) {
  const [localItems, setLocalItems] = useState<ApprovalItem[]>(items)

  const pending  = localItems.filter(i => i.state === "pending")
  const resolved = localItems.filter(i => i.state !== "pending")

  async function handleApprove(id: string) {
    const res = await fetch(`/api/approval/${id}/approve`, { method: "POST" })
    if (res.ok) {
      setLocalItems(prev => prev.map(i => i.id === id ? { ...i, state: "approved", resolved_at: new Date().toISOString() } : i))
    } else {
      const body = await res.json().catch(() => ({}))
      alert(`承認に失敗しました: ${body.error ?? res.status}`)
    }
  }

  async function handleReject(id: string) {
    const res = await fetch(`/api/approval/${id}/reject`, { method: "POST" })
    if (res.ok) {
      setLocalItems(prev => prev.map(i => i.id === id ? { ...i, state: "rejected", resolved_at: new Date().toISOString() } : i))
    } else {
      const body = await res.json().catch(() => ({}))
      alert(`却下に失敗しました: ${body.error ?? res.status}`)
    }
  }

  return (
    <>
      {pending.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="size-12" />} title="承認待ちはありません" />
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map(item => (
            <PendingCard key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">処理済み（直近）</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <tbody>
                {resolved.slice(0, 15).map(item => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.products?.primary_color || "#6B7280" }} />
                        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{item.products?.display_name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.meta?.pr_url && (
                        <a href={item.meta.pr_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: "var(--color-primary)" }}>
                          <GitPullRequest className="size-3" />PR
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.state === "approved" ? (
                        <div className="flex items-center gap-1 text-xs" style={{ color: "#36B37E" }}>
                          <CheckCircle className="size-3" />承認済み
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-red-500">
                          <XCircle className="size-3" />却下
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                      {item.resolved_at ? new Date(item.resolved_at).toLocaleDateString("ja-JP") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
