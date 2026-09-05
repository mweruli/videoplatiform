import { useState } from 'react'

import DashSection from '../dashboardshell/DashSection'
import KpiCard from '../dashboardshell/KpiCard'
import TopPerformersList from './TopPerformersList'
import EmptyState from '../ui/EmptyState'
import ProportionalBar from '../ui/ProportionalBar'
import RangeToggle, { type RangeDays } from '../ui/RangeToggle'
import Skeleton from '../ui/Skeleton'
import TrendChart from '../ui/TrendChart'
import { useBusinessCampaigns } from '../../hooks/useCampaigns'
import { useBusinessStats, useBusinessStatsTimeseries } from '../../hooks/useDashboard'
import { formatConversionRate, formatKES } from '../../lib/format'
import type { ModerationStatusCounts } from '../../lib/api'

/**
 * Business Dashboard → Analytics (`pages/BusinessDashboard.tsx`'s "analytics"
 * section) — backs `GET /businesses/{id}/stats` (KPI tiles + funnel/top
 * performers) and `GET /businesses/{id}/stats/timeseries` (trend charts).
 *
 * Phase 1a shipped the four KPI tiles and the two proportional-bar
 * breakdowns below (moderation status by row) — both untouched here, per
 * this round's brief. Phase 1b (this pass) adds: a views/impressions trend
 * chart, top-5 products/videos, the two conversion-rate figures, and — only
 * when this business actually has campaigns — a rolled-up campaign
 * reach/spend trend. See docs/decisions.md's "core analytics: daily
 * timeseries layer" entry (and its 2026-09-05 read-endpoint follow-up) for
 * the exact response shapes this renders.
 */
export default function BusinessAnalytics({ businessId }: { businessId: string }) {
  const [days, setDays] = useState<RangeDays>(30)
  const statsQuery = useBusinessStats(businessId)
  const timeseriesQuery = useBusinessStatsTimeseries(businessId, days)
  const campaignsQuery = useBusinessCampaigns(businessId)
  const hasCampaigns = (campaignsQuery.data?.items.length ?? 0) > 0

  if (statsQuery.isLoading) {
    return (
      <div>
        <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (statsQuery.isError || !statsQuery.data) {
    return (
      <EmptyState tone="error" title="Couldn't load analytics" subtitle="Check your connection and try again.">
        <button
          type="button"
          onClick={() => statsQuery.refetch()}
          className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
        >
          Retry
        </button>
      </EmptyState>
    )
  }

  const s = statsQuery.data
  const prodTotal = countsTotal(s.product_counts)
  const vidTotal = countsTotal(s.video_counts)
  const businessConversion = formatConversionRate(s.business_view_conversion_rate)
  const productConversion = formatConversionRate(s.product_view_conversion_rate)

  const tsRows = timeseriesQuery.data ?? []
  const dates = tsRows.map((d) => d.date)
  const totalCampaignSpend = tsRows.reduce((sum, d) => sum + Number(d.campaign_spend_kes), 0)

  return (
    <div>
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard value={s.business_view_count.toLocaleString()} label="Profile Views" />
        <KpiCard value={s.business_impression_count.toLocaleString()} label="Search Impressions" />
        <KpiCard value={s.total_product_views.toLocaleString()} label="Total Product Views" />
        <KpiCard value={s.total_video_views.toLocaleString()} label="Total Video Views" />
      </div>

      <DashSection
        title="Views &amp; impressions trend"
        subtitle={`Daily totals for the last ${days} days`}
        action={<RangeToggle value={days} onChange={setDays} />}
      >
        {timeseriesQuery.isLoading && <Skeleton className="h-52 w-full" />}
        {timeseriesQuery.isError && <p className="text-sm text-danger">Couldn&apos;t load the trend chart. Try again shortly.</p>}
        {!timeseriesQuery.isLoading && !timeseriesQuery.isError && (
          <TrendChart
            dates={dates}
            ariaLabel={`Profile views, search impressions, product views and video views per day, last ${days} days`}
            formatValue={(v) => v.toLocaleString('en-KE')}
            series={[
              { key: 'business_views', label: 'Profile views', color: 'var(--color-teal)', values: tsRows.map((d) => d.business_views) },
              {
                key: 'business_impressions',
                label: 'Search impressions',
                color: 'var(--color-amber)',
                values: tsRows.map((d) => d.business_impressions),
              },
              {
                key: 'product_views',
                label: 'Product views',
                color: 'var(--color-brand)',
                values: tsRows.map((d) => d.total_product_views),
              },
              { key: 'video_views', label: 'Video views', color: 'var(--color-danger)', values: tsRows.map((d) => d.total_video_views) },
            ]}
          />
        )}
      </DashSection>

      <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DashSection title="Profile conversion" className="mb-0">
          <ConversionFigure pct={businessConversion.pct} ratio={businessConversion.ratio} />
        </DashSection>
        <DashSection title="Product conversion" className="mb-0">
          <ConversionFigure pct={productConversion.pct} ratio={productConversion.ratio} />
        </DashSection>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <DashSection title="Top products" subtitle="By lifetime views" className="mb-0 lg:mb-3.5">
          <TopPerformersList
            entries={s.top_products.map((p) => ({ id: p.id, label: p.name, view_count: p.view_count }))}
            emptyLabel="No approved products with views yet."
          />
        </DashSection>
        <DashSection title="Top videos" subtitle="By lifetime views" className="mb-0 lg:mb-3.5">
          <TopPerformersList
            entries={s.top_videos.map((v) => ({ id: v.id, label: v.title, view_count: v.view_count }))}
            emptyLabel="No approved videos with views yet."
          />
        </DashSection>
      </div>

      {hasCampaigns && (
        <DashSection
          title="Campaign reach &amp; spend"
          subtitle={`Rolled up across every campaign this business owns, last ${days} days`}
        >
          {timeseriesQuery.isLoading && <Skeleton className="h-52 w-full" />}
          {!timeseriesQuery.isLoading && !timeseriesQuery.isError && (
            <>
              <TrendChart
                dates={dates}
                ariaLabel={`Campaign impressions and clicks per day, last ${days} days`}
                formatValue={(v) => v.toLocaleString('en-KE')}
                series={[
                  {
                    key: 'campaign_impressions',
                    label: 'Impressions',
                    color: 'var(--color-teal)',
                    values: tsRows.map((d) => d.campaign_impression_count),
                  },
                  { key: 'campaign_clicks', label: 'Clicks', color: 'var(--color-amber)', values: tsRows.map((d) => d.campaign_click_count) },
                ]}
              />
              <div className="mt-3.5 border-t border-border pt-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-muted-foreground">Spend</p>
                  <p className="text-xs font-bold text-foreground">{formatKES(totalCampaignSpend)} total this window</p>
                </div>
                <TrendChart
                  dates={dates}
                  height={110}
                  ariaLabel={`Campaign spend in KES per day, last ${days} days`}
                  formatValue={(v) => formatKES(v)}
                  series={[
                    {
                      key: 'campaign_spend',
                      label: 'Spend',
                      color: 'var(--color-amber)',
                      area: true,
                      values: tsRows.map((d) => Number(d.campaign_spend_kes)),
                    },
                  ]}
                />
              </div>
            </>
          )}
        </DashSection>
      )}

      <DashSection title="Products by review status" subtitle={`${prodTotal} listing${prodTotal === 1 ? '' : 's'} total`}>
        <ProportionalBar rows={statusRows(s.product_counts)} />
      </DashSection>

      <DashSection title="Videos by review status" subtitle={`${vidTotal} video${vidTotal === 1 ? '' : 's'} total`}>
        <ProportionalBar rows={statusRows(s.video_counts)} />
      </DashSection>

      <p className="-mt-2 text-xs text-muted-foreground">
        Backed by <code>GET /businesses/&#123;id&#125;/stats</code> and <code>GET /businesses/&#123;id&#125;/stats/timeseries</code>.
      </p>
    </div>
  )
}

function ConversionFigure({ pct, ratio }: { pct: string; ratio: string | null }) {
  if (ratio === null && pct === '—') {
    return <p className="text-sm text-muted-foreground">Not enough data yet — no impressions recorded.</p>
  }
  return (
    <div>
      <div className="font-display text-2xl font-bold tracking-tight text-foreground">{pct}</div>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">
        {ratio ? <>of impressions become a view — {ratio}.</> : 'of impressions have become a view so far.'}
      </p>
    </div>
  )
}

function countsTotal(counts: ModerationStatusCounts): number {
  return counts.approved + counts.pending + counts.rejected
}

function statusRows(counts: ModerationStatusCounts) {
  return [
    { key: 'approved', label: 'Approved', value: counts.approved, colorClassName: 'bg-teal' },
    { key: 'pending', label: 'Pending', value: counts.pending, colorClassName: 'bg-amber' },
    { key: 'rejected', label: 'Rejected', value: counts.rejected, colorClassName: 'bg-danger' },
  ]
}
