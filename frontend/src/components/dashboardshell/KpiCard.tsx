import type { ReactNode } from 'react'

interface KpiCardProps {
  value: ReactNode
  label: string
  /** Amber-accented number — used for anything that wants the owner/moderator's attention (pending counts). */
  accent?: boolean
}

/** One stat tile in a dashboard/admin Overview's KPI grid — see docs/design/prototype-v1.html's `.kpi-card`. */
export default function KpiCard({ value, label, accent }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className={`font-display text-2xl font-bold tracking-tight ${accent ? 'text-amber-ink dark:text-amber' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-bold tracking-[0.05em] text-muted-foreground uppercase">{label}</div>
    </div>
  )
}
