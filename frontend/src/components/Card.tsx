import type { CSSProperties, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">{label}</span>
      <span className="tabular-nums text-xl font-semibold break-words">{value}</span>
      {sub && <span className="text-xs text-[var(--ink-soft)] break-words">{sub}</span>}
    </Card>
  )
}
