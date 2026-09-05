export interface TopPerformerEntry {
  id: string
  label: string
  view_count: number
}

interface TopPerformersListProps {
  entries: TopPerformerEntry[]
  emptyLabel: string
}

/**
 * Compact ranked "best performer" list — Business Analytics' top-5
 * products/videos. Deliberately its own small row style rather than reusing
 * ProductManageCard/VideoManageCard (those are full management cards with
 * edit actions/moderation chrome built for a different job); instead mirrors
 * the compact `border-border bg-panel rounded-lg px-3 py-2 text-xs` row
 * convention CampaignFundingHistory.tsx already established for exactly this
 * kind of small in-card list, so the visual language is reused even though
 * the component is new.
 */
export default function TopPerformersList({ entries, emptyLabel }: TopPerformersListProps) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>
  }
  const maxViews = Math.max(...entries.map((e) => e.view_count), 1)

  return (
    <ol className="flex flex-col gap-1.5">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-panel px-3 py-2 text-xs">
          <span className="w-4 flex-none text-center font-display text-[11px] font-bold text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{entry.label}</span>
          <div className="h-1.5 w-14 flex-none overflow-hidden rounded-full bg-border/50 sm:w-20">
            <div
              className="h-full rounded-full bg-teal transition-[width] duration-300 ease-brand"
              style={{ width: `${Math.max(4, Math.round((entry.view_count / maxViews) * 100))}%` }}
            />
          </div>
          <span className="w-10 flex-none text-right font-bold text-foreground tabular-nums">{entry.view_count.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  )
}
