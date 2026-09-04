import { useState } from 'react'

import Icon from '../icons/Icon'
import { useCampaignFundingHistory } from '../../hooks/useCampaigns'
import { formatDate, formatKES } from '../../lib/format'
import type { CampaignFundingStatus } from '../../lib/api'

const STATUS_STYLE: Record<CampaignFundingStatus, string> = {
  completed: 'bg-teal/15 text-teal',
  pending: 'bg-panel text-muted-foreground',
  failed: 'bg-danger/15 text-danger',
}

const STATUS_LABEL: Record<CampaignFundingStatus, string> = {
  completed: 'Completed',
  pending: 'Pending',
  failed: 'Failed',
}

interface CampaignFundingHistoryProps {
  campaignId: string
  className?: string
}

/** Collapsed-by-default top-up history disclosure — same pattern as FeaturedPurchaseHistory.tsx, only fetches once expanded. */
export default function CampaignFundingHistory({ campaignId, className = '' }: CampaignFundingHistoryProps) {
  const [expanded, setExpanded] = useState(false)
  const historyQuery = useCampaignFundingHistory(campaignId, expanded)
  const fundings = historyQuery.data?.items ?? []

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground"
      >
        <Icon name="chevronRight" size={11} className={`transition-transform duration-150 ease-brand ${expanded ? 'rotate-90' : ''}`} />
        Funding history
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5">
          {historyQuery.isLoading && <div className="h-10 animate-pulse rounded-lg bg-panel" />}
          {historyQuery.isError && <p className="text-xs text-danger">Couldn&apos;t load funding history.</p>}
          {!historyQuery.isLoading && !historyQuery.isError && fundings.length === 0 && (
            <p className="text-xs text-muted-foreground">No top-ups yet.</p>
          )}
          {fundings.map((funding) => (
            <div key={funding.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-xs">
              <span className="font-semibold text-foreground">{formatKES(Number(funding.amount_kes))}</span>
              <div className="flex flex-none items-center gap-2">
                <span className="text-muted-foreground">{formatDate(funding.created_at)}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[funding.status]}`}>
                  {STATUS_LABEL[funding.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
