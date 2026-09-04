/**
 * Simple proportional-bar breakdown — see docs/design/prototype-v1.html's
 * `.bar-row`/`.bar-track`/`.bar-fill` (v8 design pass). Used by the Business
 * Dashboard's Analytics screen for "Products/Videos by review status"
 * instead of a chart library, per the brief's "keep scope proportional"
 * guidance — a labelled bar reads faster than three bare numbers here.
 */
export interface BarRowData {
  key: string
  label: string
  value: number
  /** Tailwind background class for the fill — teal/amber/red to match the moderation status-pill colours. */
  colorClassName: string
}

export default function ProportionalBar({ rows }: { rows: BarRowData[] }) {
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Nothing listed yet.</p>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const pct = Math.round((row.value / total) * 100)
        return (
          <div key={row.key} className="flex items-center gap-2.5">
            <div className="w-[76px] flex-none text-xs font-bold text-muted-foreground">{row.label}</div>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-brand ${row.colorClassName}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-6 flex-none text-right text-xs font-extrabold text-foreground">{row.value}</div>
          </div>
        )
      })}
    </div>
  )
}
