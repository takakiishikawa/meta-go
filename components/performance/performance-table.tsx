'use client'

import { useState } from 'react'
import { ScoreDonut } from '@/components/score/score-donut'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { SimpleDialog } from '@/components/ui/simple-dialog'
import { BarChart3 } from 'lucide-react'

export interface PerformanceMetric {
  id: string
  score: number | null
  lcp: number | null
  fid: number | null
  cls: number | null
  api_avg: number | null
  bundle_size: number | null
  products: { name: string; display_name: string; primary_color: string } | null
}

const GO_COLORS: Record<string, string> = {
  nativego:   '#0052CC',
  carego:     '#00875A',
  kenyakugo:  '#FF5630',
  cookgo:     '#FF991F',
  physicalgo: '#6554C0',
  taskgo:     '#00B8D9',
}

const TOOLTIP_TEXTS = {
  lcp:    'Largest Contentful Paint: ページの主要コンテンツが表示されるまでの時間。2,500ms以下が理想的。',
  fid:    'First Input Delay: ユーザーが初めてページを操作してから、ブラウザが応答するまでの遅延。100ms以下が理想的。',
  cls:    'Cumulative Layout Shift: ページ読み込み中のレイアウトのズレ量。0.1以下が理想的。',
  apiAvg: 'APIの平均レスポンスタイム。サーバーサイドのエンドポイントが返答するまでの平均時間（ms）。',
  bundle: 'JavaScriptバンドルの合計サイズ。小さいほど初回読み込みが速くなる。300KB以下が目安。',
}

interface MetricDisplay {
  label: string
  value: string
  good: boolean
}

function getMetrics(m: PerformanceMetric): MetricDisplay[] {
  return [
    { label: 'LCP',    value: m.lcp        != null ? `${m.lcp}ms`        : '—', good: m.lcp        == null || m.lcp        <= 2500 },
    { label: 'FID',    value: m.fid        != null ? `${m.fid}ms`        : '—', good: m.fid        == null || m.fid        <= 100  },
    { label: 'CLS',    value: m.cls        != null ? String(m.cls)       : '—', good: m.cls        == null || m.cls        <= 0.1  },
    { label: 'API avg',value: m.api_avg    != null ? `${m.api_avg}ms`    : '—', good: true },
    { label: 'Bundle', value: m.bundle_size != null ? `${m.bundle_size}KB` : '—', good: m.bundle_size == null || m.bundle_size <= 300 },
  ]
}

function getIssues(m: PerformanceMetric): string[] {
  const issues: string[] = []
  if (m.lcp != null) {
    if (m.lcp > 4000)       issues.push(`LCP ${m.lcp}ms：ページ表示が遅すぎます（目標: 2,500ms以下）`)
    else if (m.lcp > 2500)  issues.push(`LCP ${m.lcp}ms：ページ表示速度に改善余地があります（目標: 2,500ms以下）`)
  }
  if (m.fid != null) {
    if (m.fid > 300)        issues.push(`FID ${m.fid}ms：操作への反応が遅すぎます（目標: 100ms以下）`)
    else if (m.fid > 100)   issues.push(`FID ${m.fid}ms：操作への反応速度に改善余地があります（目標: 100ms以下）`)
  }
  if (m.cls != null) {
    if (m.cls > 0.25)       issues.push(`CLS ${m.cls}：画面のちらつき・ズレが多すぎます（目標: 0.1以下）`)
    else if (m.cls > 0.1)   issues.push(`CLS ${m.cls}：画面のちらつき・ズレが基準を超えています（目標: 0.1以下）`)
  }
  if (m.bundle_size != null && m.bundle_size > 500) {
    issues.push(`バンドル ${m.bundle_size}KB：JSファイルが大きく初回読み込みに影響します（目標: 300KB以下）`)
  }
  return issues
}

function EvalButton({ metric, productName }: { metric: PerformanceMetric; productName: string }) {
  const [open, setOpen] = useState(false)
  const issues = getIssues(metric)
  const metrics = getMetrics(metric)

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

      <SimpleDialog open={open} onClose={() => setOpen(false)} title={`${productName} — パフォーマンス評価`}>
        <div className="flex flex-col gap-4">
          {issues.length > 0 ? (
            <div className="flex flex-col gap-2">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <span className="mt-1.5 size-1.5 rounded-full shrink-0" style={{ backgroundColor: '#FF8B00' }} />
                  <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{issue}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'var(--color-surface-subtle)' }}>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                すべての指標が良好な範囲に収まっています。
              </span>
            </div>
          )}

          <div className="rounded-lg border border-border p-3 flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground">計測値</span>
            {metrics.map(({ label, value, good }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                <span className="text-xs font-medium" style={{ color: value === '—' ? 'var(--color-text-secondary)' : good ? '#36B37E' : '#FF8B00' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </SimpleDialog>
    </>
  )
}

export function PerformanceTable({ metrics }: { metrics: PerformanceMetric[] }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-subtle">
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>プロダクト</th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>スコア</th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="inline-flex items-center">LCP (ms)<InfoTooltip text={TOOLTIP_TEXTS.lcp} /></span>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="inline-flex items-center">FID (ms)<InfoTooltip text={TOOLTIP_TEXTS.fid} /></span>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="inline-flex items-center">CLS<InfoTooltip text={TOOLTIP_TEXTS.cls} /></span>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="inline-flex items-center">API avg (ms)<InfoTooltip text={TOOLTIP_TEXTS.apiAvg} /></span>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="inline-flex items-center">Bundle (KB)<InfoTooltip text={TOOLTIP_TEXTS.bundle} /></span>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>評価</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(m => {
            const productName = m.products?.name ?? ''
            const color = m.products?.primary_color || GO_COLORS[productName] || '#6B7280'
            return (
              <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-subtle">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-foreground">{m.products?.display_name ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ScoreDonut score={m.score} size={40} color={color} />
                </td>
                <td className="px-4 py-3 text-sm">{m.lcp ?? '—'}</td>
                <td className="px-4 py-3 text-sm">{m.fid ?? '—'}</td>
                <td className="px-4 py-3 text-sm">{m.cls ?? '—'}</td>
                <td className="px-4 py-3 text-sm">{m.api_avg ?? '—'}</td>
                <td className="px-4 py-3 text-sm">{m.bundle_size ?? '—'}</td>
                <td className="px-4 py-3">
                  <EvalButton metric={m} productName={m.products?.display_name ?? '—'} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
