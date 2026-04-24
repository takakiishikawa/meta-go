interface ScoreDeltaProps {
  delta: number | null
}

export function ScoreDelta({ delta }: ScoreDeltaProps) {
  if (delta === null) return null

  if (delta === 0) {
    return (
      <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
        ±0
      </span>
    )
  }

  const positive = delta > 0
  return (
    <span
      className="text-xs font-medium"
      style={{ color: positive ? "#36B37E" : "#FF5630" }}
    >
      {positive ? "↑+" : "↓"}{delta}
    </span>
  )
}
