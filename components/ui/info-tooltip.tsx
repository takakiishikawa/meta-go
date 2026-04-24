'use client'

import { Info } from 'lucide-react'
import { useState } from 'react'

export function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1">
      <Info
        className="size-3 cursor-help"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <span
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 w-56 rounded-lg border border-border bg-surface p-2.5 text-xs leading-relaxed shadow-lg whitespace-normal"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
