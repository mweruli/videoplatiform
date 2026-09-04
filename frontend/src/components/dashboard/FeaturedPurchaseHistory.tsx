import { useState } from 'react'

import Icon from '../icons/Icon'
import { useFeaturedPurchaseHistory } from '../../hooks/useFeaturedPurchase'
import { formatDate, formatKES } from '../../lib/format'
import type { FeaturedPurchaseStatus } from '../../lib/api'

const STATUS_STYLE: Record<FeaturedPurchaseStatus, string> = {
  completed: 'bg-teal/15 text-teal',
  pending: 'bg-panel text-muted-foreground',
  failed: 'bg-danger/15 text-danger',
}

const STATUS_LABEL: Record<FeaturedPurchaseStatus, string> = {
  completed: 'Completed',
  pending: 'Pending',
  failed: 'Failed',
}

interface FeaturedPurchaseHistoryProps {
  businessId: string
  className?: string
}

/**
 * Lower-priority per the backend design doc's own framing ("include if time
 * allows, not a blocker") — a collapsed-by-default disclosure so it doesn't
 * compete for attention with the FeatureCard CTA above it. Only fetches
 * once expanded (`enabled` gate), since most visits to this section won't
 * need it.
 */
export default function FeaturedPurchaseHistory({ businessId, className = '' }: FeaturedPurchaseHistoryProps) {
  const [expanded, setExpanded] = useState(false)
  const historyQuery = useFeaturedPurchaseHistory(businessId, expanded)
  const purchases = historyQuery.data?.items ?? []

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground"
      >
        <Icon name="chevronRight" size={11} className={`transition-transform duration-150 ease-brand ${expanded ? 'rotate-90' : ''}`} />
        Purchase history
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5">
          {historyQuery.isLoading && <div className="h-10 animate-pulse rounded-lg bg-panel" />}
          {historyQuery.isError && <p className="text-xs text-danger">Couldn&apos;t load purchase history.</p>}
          {!historyQuery.isLoading && !historyQuery.isError && purchases.length === 0 && (
            <p className="text-xs text-muted-foreground">No featured-placement purchases yet.</p>
          )}
          {purchases.map((purchase) => (
            <div key={purchase.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-foreground">
                  {purchase.tier_label}
                  {purchase.product_id ? ' · Product' : ' · Business'}
                </span>
                <span className="ml-2 text-muted-foreground">{formatKES(Number(purchase.amount_kes))}</span>
              </div>
              <div className="flex flex-none items-center gap-2">
                <span className="text-muted-foreground">{formatDate(purchase.created_at)}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[purchase.status]}`}>
                  {STATUS_LABEL[purchase.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
