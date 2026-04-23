"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginationProps {
  page: number
  totalPages: number
  basePath: string
}

export function Pagination({ page, totalPages, basePath }: PaginationProps) {
  if (totalPages <= 1) return null

  function makeHref(p: number) {
    return `${basePath}?page=${p}`
  }

  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, page + 2)
  const pages: number[] = []
  for (let i = start; i <= end; i++) pages.push(i)

  const linkBase = "rounded px-2.5 py-1 text-sm transition-colors hover:bg-surface-subtle"
  const inactive = "text-[color:var(--color-text-secondary)]"
  const active = "bg-surface-subtle font-medium text-foreground"
  const navBtn = "flex items-center rounded p-1.5 transition-colors hover:bg-surface-subtle text-[color:var(--color-text-secondary)]"

  return (
    <div className="flex items-center justify-center gap-0.5 py-2">
      <Link
        href={makeHref(Math.max(1, page - 1))}
        className={`${navBtn} ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        aria-disabled={page <= 1}
      >
        <ChevronLeft className="size-4" />
      </Link>

      {start > 1 && (
        <>
          <Link href={makeHref(1)} className={`${linkBase} ${inactive}`}>1</Link>
          {start > 2 && <span className={`px-1 text-sm ${inactive}`}>…</span>}
        </>
      )}

      {pages.map((p) => (
        <Link key={p} href={makeHref(p)} className={`${linkBase} ${p === page ? active : inactive}`}>
          {p}
        </Link>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className={`px-1 text-sm ${inactive}`}>…</span>}
          <Link href={makeHref(totalPages)} className={`${linkBase} ${inactive}`}>{totalPages}</Link>
        </>
      )}

      <Link
        href={makeHref(Math.min(totalPages, page + 1))}
        className={`${navBtn} ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
        aria-disabled={page >= totalPages}
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  )
}
