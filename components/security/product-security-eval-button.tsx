'use client'

import { useState } from 'react'
import { SimpleDialog } from '@/components/ui/simple-dialog'
import { BarChart3 } from 'lucide-react'

export interface SecurityItemForEval {
  id: string
  title: string
  severity: string
  state: string
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF5630',
  high:     '#FF8B00',
  medium:   '#FF991F',
  low:      '#36B37E',
}

function getSummary(items: SecurityItemForEval[], score: number | null): string {
  const open = items.filter(i => i.state !== 'done')
  const critical = open.filter(i => i.severity === 'critical').length
  const high = open.filter(i => i.severity === 'high').length

  if (open.length === 0) {
    return `セキュリティ問題は現在検出されていません。${score !== null ? `スコア ${score}点。` : ''}継続的なモニタリングを維持してください。`
  }
  if (critical > 0) {
    return `緊急対応が必要なCritical脆弱性が${critical}件あります。攻撃者に悪用されると深刻な被害につながるため、今すぐ対応が必要です。`
  }
  if (high > 0) {
    return `高リスク（High）の脆弱性が${high}件あります。早急な対応を推奨します。`
  }
  return `中〜低リスクの脆弱性が${open.length}件あります。スコア${score ?? '—'}点。計画的に対応してください。`
}

export function ProductSecurityEvalButton({ items, score, productName }: {
  items: SecurityItemForEval[]
  score: number | null
  productName: string
}) {
  const [open, setOpen] = useState(false)
  const openItems = items.filter(i => i.state !== 'done')

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-subtle transition-colors"
        style={{ color: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
      >
        <BarChart3 className="size-3" />
        評価
      </button>

      <SimpleDialog open={open} onClose={() => setOpen(false)} title={`${productName} — セキュリティ評価`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {getSummary(items, score)}
          </p>
          {openItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">未対応の問題（{openItems.length}件）</span>
              <div className="flex flex-col gap-1.5">
                {openItems.slice(0, 12).map(item => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium shrink-0"
                      style={{ backgroundColor: (SEVERITY_COLORS[item.severity] ?? '#6B7280') + '22', color: SEVERITY_COLORS[item.severity] ?? '#6B7280' }}
                    >
                      {item.severity}
                    </span>
                    <span className="text-sm text-foreground truncate">{item.title}</span>
                  </div>
                ))}
                {openItems.length > 12 && (
                  <span className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>他 {openItems.length - 12} 件</span>
                )}
              </div>
            </div>
          )}
        </div>
      </SimpleDialog>
    </>
  )
}
