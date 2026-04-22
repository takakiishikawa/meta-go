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

const LEVEL_COLORS: Record<string, string> = {
  L1: "#36B37E",
  L2: "#FF991F",
}

const CATEGORY_LABELS: Record<string, string> = {
  dependency: "依存更新",
  quality: "コード品質",
  design_system: "デザインシステム",
  security: "セキュリティ",
  performance: "パフォーマンス",
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
  const level = item.meta?.level ?? "L2"
  const repo = item.meta?.repo?.split("/")[1] ?? null

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
      {/* カラーバー */}
      {item.products?.primary_color && (
        <div className="h-0.5" style={{ backgroundColor: item.products.primary_color }} />
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* ヘッダー行 */}
        <div className="flex items-start gap-2 justify-between">
          <div className="flex flex-col gap-1 min-w-0">
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
              <span
                className="text-[10px] font-bold rounded px-1 py-0.5 text-white"
                style={{ backgroundColor: LEVEL_COLORS[level] ?? "#6B7280" }}
              >
                {level}
              </span>
              <Badge variant="outline">
                {CATEGORY_LABELS[item.category] ?? item.category}
              </Badge>
              {repo && (
                <span className="text-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
                  {repo}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>
            {item.description && (
              <p className="text-xs line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
                {item.description}
              </p>
            )}
          </div>
        </div>

        {/* フッター行 */}
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
              {isPending && action === "reject" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <XCircle className="size-3" />
              )}
              却下
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
            >
              {isPending && action === "approve" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckCircle className="size-3" />
              )}
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

  const pending = localItems.filter((i) => i.state === "pending")
  const resolved = localItems.filter((i) => i.state !== "pending")

  async function handleApprove(id: string) {
    const res = await fetch(`/api/approval/${id}/approve`, { method: "POST" })
    if (res.ok) {
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, state: "approved", resolved_at: new Date().toISOString() }
            : i
        )
      )
    } else {
      const body = await res.json().catch(() => ({}))
      alert(`承認に失敗しました: ${body.error ?? res.status}`)
    }
  }

  async function handleReject(id: string) {
    const res = await fetch(`/api/approval/${id}/reject`, { method: "POST" })
    if (res.ok) {
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, state: "rejected", resolved_at: new Date().toISOString() }
            : i
        )
      )
    } else {
      const body = await res.json().catch(() => ({}))
      alert(`却下に失敗しました: ${body.error ?? res.status}`)
    }
  }

  return (
    <>
      {/* 承認待ち */}
      {pending.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-12" />}
          title="承認待ちはありません"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((item) => (
            <PendingCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {/* 処理済み */}
      {resolved.length > 0 && (
        <div>
          <h2
            className="mb-3 font-semibold text-foreground"
            style={{ fontSize: "var(--text-base)" }}
          >
            処理済み（直近）
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <tbody>
                {resolved.slice(0, 10).map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                      {item.products?.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {item.meta?.pr_url && (
                        <a
                          href={item.meta.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs"
                          style={{ color: "var(--color-primary)" }}
                        >
                          <GitPullRequest className="size-3" />
                          PR
                        </a>
                      )}
                    </td>
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
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                      {item.resolved_at
                        ? new Date(item.resolved_at).toLocaleDateString("ja-JP")
                        : "—"}
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
