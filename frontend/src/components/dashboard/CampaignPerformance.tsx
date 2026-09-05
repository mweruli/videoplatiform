import { useState } from 'react'

import Icon from '../icons/Icon'
import RangeToggle, { type RangeDays } from '../ui/RangeToggle'
import TrendChart from '../ui/TrendChart'
import { useCampaignStatsTimeseries } from '../../hooks/useCampaigns'
import { formatKES } from '../../lib/format'

interface CampaignPerformanceProps {
  campaignId: string
  className?: string
}

/**
 * Per-campaign spend trend + budget-exhaustion projection — an expand-in-
 * place disclosure on CampaignCard.tsx, collapsed by default and only
 * fetching once expanded, identical pattern to CampaignFundingHistory.tsx
 * (same file's own established convention for "extra detail that doesn't
 * need to load with the card"). Backed by
 * `GET /campaigns/{id}/stats/timeseries` — see docs/decisions.md's "core
 * analytics: daily timeseries layer" entry and its 2026-09-05 read-endpoint
 * follow-up for the exact response shape.
 */
export default function CampaignPerformance({ campaignId, className = '' }: CampaignPerformanceProps) {
  const [expanded, setExpanded] = useState(false)
  const [days, setDays] = useState<RangeDays>(30)
  const statsQuery = useCampaignStatsTimeseries(campaignId, days, expanded)
  const data = statsQuery.data

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground"
      >
        <Icon name="chevronRight" size={11} className={`transition-transform duration-150 ease-brand ${expanded ? 'rotate-90' : ''}`} />
        <Icon name="chart" size={12} />
        Performance &amp; spend trend
      </button>

      {expanded && (
        <div className="mt-2.5 rounded-xl border border-border bg-panel p-3">
          {statsQuery.isLoading && <div className="h-40 animate-pulse rounded-lg bg-border/40" />}
          {statsQuery.isError && <p className="text-xs text-danger">Couldn&apos;t load this campaign&apos;s performance data.</p>}

          {!statsQuery.isLoading && !statsQuery.isError && data && (
            <>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">Last {days} days</p>
                <RangeToggle value={days} onChange={setDays} />
              </div>

              <TrendChart
                dates={data.days.map((d) => d.date)}
                height={130}
                ariaLabel={`Impressions and clicks per day for this campaign, last ${days} days`}
                formatValue={(v) => v.toLocaleString('en-KE')}
                series={[
                  { key: 'impressions', label: 'Impressions', color: 'var(--color-teal)', values: data.days.map((d) => d.impressions) },
                  { key: 'clicks', label: 'Clicks', color: 'var(--color-amber)', values: data.days.map((d) => d.clicks) },
                ]}
              />

              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1.5 text-[11px] font-bold tracking-[0.05em] text-muted-foreground uppercase">Spend</p>
                <TrendChart
                  dates={data.days.map((d) => d.date)}
                  height={90}
                  ariaLabel={`Spend in KES per day for this campaign, last ${days} days`}
                  formatValue={(v) => formatKES(v)}
                  series={[
                    {
                      key: 'spend',
                      label: 'Spend',
                      color: 'var(--color-amber)',
                      area: true,
                      values: data.days.map((d) => Number(d.spend_kes)),
                    },
                  ]}
                />
              </div>

              <BudgetProjection
                remainingKes={Number(data.remaining_kes)}
                avgDailySpendKes={Number(data.avg_daily_spend_kes)}
                projectedDaysRemaining={data.projected_days_remaining}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function BudgetProjection({
  remainingKes,
  avgDailySpendKes,
  projectedDaysRemaining,
}: {
  remainingKes: number
  avgDailySpendKes: number
  projectedDaysRemaining: number | null
}) {
  if (projectedDaysRemaining === null) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-border/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <Icon name="clock" size={13} className="mt-0.5 flex-none" />
        No recent spend — no budget projection available yet.
      </p>
    )
  }

  const wholeDays = Math.floor(projectedDaysRemaining)
  const urgent = projectedDaysRemaining <= 3

  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        urgent ? 'border-danger/40 bg-danger/10 text-danger' : 'border-amber/40 bg-amber/10 text-amber-ink dark:text-amber'
      }`}
    >
      <Icon name={urgent ? 'alertTriangle' : 'clock'} size={13} className="mt-0.5 flex-none" />
      <span>
        <span className="font-bold">~{wholeDays === 0 ? '<1' : wholeDays} day{wholeDays === 1 ? '' : 's'}</span> of budget remaining at the
        current spend rate ({formatKES(avgDailySpendKes)}/day avg, {formatKES(remainingKes)} left).
      </span>
    </p>
  )
}
