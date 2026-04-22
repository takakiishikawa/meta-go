"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  PageHeader,
  EmptyState,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  MultiSelect,
} from "@takaki/go-design-system"
import { Key, Pencil, Trash2, ExternalLink, RefreshCw } from "lucide-react"

interface ApiKey {
  id: string
  env_var_name: string
  name: string | null
  provider: string | null
  category: string | null
  used_by: string[]
  notes: string | null
  auto_detected: boolean
  last_seen_at: string | null
  created_at: string
}

interface Product {
  id: string
  name: string
  display_name: string
  primary_color: string
}

const CATEGORIES = [
  "AI / LLM",
  "認証・Auth",
  "データベース",
  "決済・Payment",
  "分析・Analytics",
  "通知・Messaging",
  "ストレージ",
  "インフラ",
  "その他",
]

const GOOGLE_PM_URL = "https://passwords.google.com"

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-xs)" }}>—</span>
  return <Badge variant="outline">{category}</Badge>
}

function ProductDots({ slugs, products }: { slugs: string[]; products: Product[] }) {
  if (!slugs.length) return <span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-xs)" }}>—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.map(slug => {
        const p = products.find(p => p.name === slug)
        return (
          <span
            key={slug}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: (p?.primary_color ?? "#6B7280") + "22", color: p?.primary_color ?? "#6B7280" }}
          >
            <span className="size-1.5 rounded-full inline-block" style={{ backgroundColor: p?.primary_color ?? "#6B7280" }} />
            {p?.display_name ?? slug}
          </span>
        )
      })}
    </div>
  )
}

interface EditForm {
  name: string
  provider: string
  category: string
  notes: string
  used_by: string[]
}

function EditDialog({
  apiKey,
  products,
  open,
  onClose,
  onSave,
}: {
  apiKey: ApiKey
  products: Product[]
  open: boolean
  onClose: () => void
  onSave: (id: string, values: EditForm) => Promise<void>
}) {
  const [form, setForm] = useState<EditForm>({
    name: apiKey.name ?? "",
    provider: apiKey.provider ?? "",
    category: apiKey.category ?? "",
    notes: apiKey.notes ?? "",
    used_by: apiKey.used_by ?? [],
  })
  const [saving, setSaving] = useState(false)

  const productOptions = products.map(p => ({ value: p.name, label: p.display_name }))

  async function handleSave() {
    setSaving(true)
    await onSave(apiKey.id, form)
    setSaving(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">{apiKey.env_var_name}</code>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>名前（サービス名）</label>
            <input
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: OpenAI API"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>プロバイダー</label>
            <input
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              placeholder="例: OpenAI"
              value={form.provider}
              onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>カテゴリ</label>
            <select
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              <option value="">カテゴリを選択</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>利用プロダクト</label>
            <MultiSelect
              options={productOptions}
              value={form.used_by}
              onChange={v => setForm(f => ({ ...f, used_by: v }))}
              placeholder="プロダクトを選択"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>メモ</label>
            <textarea
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={2}
              placeholder="用途・注意事項など"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>キャンセル</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ApisClient({
  apiKeys: initialKeys,
  products,
}: {
  apiKeys: ApiKey[]
  products: Product[]
}) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(initialKeys)
  const [editTarget, setEditTarget] = useState<ApiKey | null>(null)

  async function handleSave(id: string, values: EditForm) {
    const supabase = createClient()
    const { data } = await supabase
      .schema("metago")
      .from("api_keys")
      .update({
        name: values.name || null,
        provider: values.provider || null,
        category: values.category || null,
        notes: values.notes || null,
        used_by: values.used_by,
      })
      .eq("id", id)
      .select()
      .single()

    if (data) {
      setApiKeys(keys => keys.map(k => k.id === id ? (data as ApiKey) : k))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このエントリを削除しますか？")) return
    const supabase = createClient()
    await supabase.schema("metago").from("api_keys").delete().eq("id", id)
    setApiKeys(keys => keys.filter(k => k.id !== id))
  }

  const lastSeen = apiKeys
    .filter(k => k.last_seen_at)
    .sort((a, b) => new Date(b.last_seen_at!).getTime() - new Date(a.last_seen_at!).getTime())[0]
    ?.last_seen_at

  return (
    <>
      <PageHeader
        title="API管理"
        description="goシリーズで利用する環境変数・APIキー一覧（週1回自動スキャン）"
        actions={
          <div className="flex items-center gap-3">
            {lastSeen && (
              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                <RefreshCw className="size-3" />
                最終スキャン: {new Date(lastSeen).toLocaleDateString("ja-JP")}
              </span>
            )}
            <a
              href={GOOGLE_PM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <Key className="size-4" />
                Google パスワードマネージャー
                <ExternalLink className="size-3" />
              </Button>
            </a>
          </div>
        }
      />

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={<Key className="size-12" />}
          title="APIキーがまだ検出されていません"
          description="週次ワークフローが実行されると各goリポジトリからAPIキー名が自動スキャンされます"
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                {["環境変数名", "名前 / プロバイダー", "カテゴリ", "利用プロダクト", "メモ", "最終検出", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apiKeys.map(key => (
                <tr key={key.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                  {/* 環境変数名 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                        {key.env_var_name}
                      </code>
                      {key.auto_detected && (
                        <span className="rounded text-[10px] px-1 font-medium" style={{ backgroundColor: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>
                          自動
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 名前 / プロバイダー */}
                  <td className="px-4 py-3">
                    {key.name ? (
                      <div>
                        <div className="text-sm font-medium text-foreground">{key.name}</div>
                        {key.provider && (
                          <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{key.provider}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>未設定</span>
                    )}
                  </td>

                  {/* カテゴリ */}
                  <td className="px-4 py-3">
                    <CategoryBadge category={key.category} />
                  </td>

                  {/* 利用プロダクト */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <ProductDots slugs={key.used_by} products={products} />
                  </td>

                  {/* メモ */}
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="text-xs line-clamp-2" style={{ color: "var(--color-text-secondary)" }}>
                      {key.notes || "—"}
                    </span>
                  </td>

                  {/* 最終検出 */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                    {key.last_seen_at
                      ? new Date(key.last_seen_at).toLocaleDateString("ja-JP")
                      : "—"}
                  </td>

                  {/* アクション */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditTarget(key)}
                        className="rounded p-1 hover:bg-surface-subtle transition-colors"
                        title="編集"
                      >
                        <Pencil className="size-3.5" style={{ color: "var(--color-text-secondary)" }} />
                      </button>
                      <button
                        onClick={() => handleDelete(key.id)}
                        className="rounded p-1 hover:bg-surface-subtle transition-colors"
                        title="削除"
                      >
                        <Trash2 className="size-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editTarget && (
        <EditDialog
          apiKey={editTarget}
          products={products}
          open
          onClose={() => setEditTarget(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}
