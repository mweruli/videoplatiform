export const RANGE_OPTIONS = [7, 30, 90] as const
export type RangeDays = (typeof RANGE_OPTIONS)[number]

interface RangeToggleProps {
  value: RangeDays
  onChange: (value: RangeDays) => void
  className?: string
}

/**
 * Small 7/30/90-day segmented control shared by BusinessAnalytics.tsx and
 * CampaignPerformance.tsx's trend charts — one control, reused, rather than
 * a bespoke toggle per screen.
 */
export default function RangeToggle({ value, onChange, className = '' }: RangeToggleProps) {
  return (
    <div className={`inline-flex flex-none items-center gap-0.5 rounded-full border border-border bg-panel p-0.5 ${className}`}>
      {RANGE_OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ease-brand ${
            value === days ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {days}d
        </button>
      ))}
    </div>
  )
}
