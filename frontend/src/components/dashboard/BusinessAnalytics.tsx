import DashSection from '../dashboardshell/DashSection'
import KpiCard from '../dashboardshell/KpiCard'
import EmptyState from '../ui/EmptyState'
import ProportionalBar from '../ui/ProportionalBar'
import Skeleton from '../ui/Skeleton'
import { useBusinessStats } from '../../hooks/useDashboard'
import type { ModerationStatusCounts } from '../../lib/api'

/**
 * Business Dashboard → Analytics (`pages/BusinessDashboard.tsx`'s "analytics"
 * section) — backs `GET /businesses/{id}/stats`. Four KPI tiles plus two
 * proportional-bar breakdowns instead of a chart library, per the brief's
 * "keep scope proportional to Phase 1a's basic-counts scope" guidance — see
 * docs/design/prototype-v1.html's v8 design pass. Recomputes whenever the
 * business switcher changes `businessId` (useBusinessStats keys its query on
 * it), same live-recompute pattern the rest of the dashboard already uses.
 */
export default function BusinessAnalytics({ businessId }: { businessId: string }) {
  const statsQuery = useBusinessStats(businessId)

  if (statsQuery.isLoading) {
    return (
      <div>
        <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
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

  return (
    <div>
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard value={s.business_view_count.toLocaleString()} label="Profile Views" />
        <KpiCard value={s.business_impression_count.toLocaleString()} label="Search Impressions" />
        <KpiCard value={s.total_product_views.toLocaleString()} label="Total Product Views" />
        <KpiCard value={s.total_video_views.toLocaleString()} label="Total Video Views" />
      </div>

      <DashSection title="Products by review status" subtitle={`${prodTotal} listing${prodTotal === 1 ? '' : 's'} total`}>
        <ProportionalBar rows={statusRows(s.product_counts)} />
      </DashSection>

      <DashSection title="Videos by review status" subtitle={`${vidTotal} video${vidTotal === 1 ? '' : 's'} total`}>
        <ProportionalBar rows={statusRows(s.video_counts)} />
      </DashSection>

      <p className="-mt-2 text-xs text-muted-foreground">Backed by <code>GET /businesses/&#123;id&#125;/stats</code>.</p>
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
