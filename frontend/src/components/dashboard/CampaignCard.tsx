import { useState } from 'react'

import CampaignFundingHistory from './CampaignFundingHistory'
import CampaignFundingModal from './CampaignFundingModal'
import CampaignStatusBadge from './CampaignStatusBadge'
import Icon from '../icons/Icon'
import { useCompleteCampaign, usePauseCampaign, useResumeCampaign } from '../../hooks/useCampaigns'
import { ApiError } from '../../lib/api'
import type { CampaignDto } from '../../lib/api'
import { formatKES } from '../../lib/format'
import { useToast } from '../../lib/toast'

interface CampaignCardProps {
  campaign: CampaignDto
  businessPhone: string | null
}

/**
 * One campaign row in the Business Dashboard's Campaigns list — target,
 * status, a spend progress bar (reads better than bare "KES X of Y" numbers
 * for a prepaid-budget model, per the design brief), impression/click counts,
 * and pause/resume/complete actions gated to exactly the states the backend
 * itself allows (`CampaignStatus`'s transition table) so a disabled/hidden
 * action never round-trips to a 409 the owner has to interpret — mirrors the
 * PM's "don't show an action the backend will reject" precedent from every
 * other moderation/lifecycle surface in this codebase.
 */
export default function CampaignCard({ campaign, businessPhone }: CampaignCardProps) {
  const { showToast } = useToast()
  const pauseMutation = usePauseCampaign()
  const resumeMutation = useResumeCampaign()
  const completeMutation = useCompleteCampaign()
  const [fundOpen, setFundOpen] = useState(false)
  const [confirmingComplete, setConfirmingComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const budget = Number(campaign.budget_kes)
  const spent = Number(campaign.spent_kes)
  const spendPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  const targetLabel = campaign.product ? campaign.product.name : `${campaign.business.name} (business)`

  const canPause = campaign.status === 'active'
  const canResume = campaign.status === 'paused'
  const canComplete = campaign.status !== 'completed'
  const canFund = campaign.status !== 'completed'

  function runAction(action: 'pause' | 'resume' | 'complete') {
    setError(null)
    const mutation = action === 'pause' ? pauseMutation : action === 'resume' ? resumeMutation : completeMutation
    mutation.mutate(campaign.id, {
      onSuccess: () => {
        showToast(action === 'pause' ? 'Campaign paused' : action === 'resume' ? 'Campaign resumed' : 'Campaign completed')
        if (action === 'complete') setConfirmingComplete(false)
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : `Could not ${action} this campaign.`),
    })
  }

  const anyActionPending = pauseMutation.isPending || resumeMutation.isPending || completeMutation.isPending

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{campaign.name}</h3>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
            Promoting {targetLabel}
            {campaign.category && ` · ${campaign.category.name}`}
            {campaign.county && ` · ${campaign.county}`}
          </p>
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </div>

      <div className="mt-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-foreground">
            {formatKES(spent)} <span className="font-semibold text-muted-foreground">of {formatKES(budget)} spent</span>
          </span>
          <span className="font-bold text-muted-foreground">{formatKES(Number(campaign.remaining_kes))} left</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-panel">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-brand ${
              campaign.status === 'exhausted' ? 'bg-amber' : 'bg-teal'
            }`}
            style={{ width: `${spendPct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-y border-border py-3 text-center">
        <div>
          <div className="font-display text-base font-bold text-foreground">{campaign.impression_count.toLocaleString()}</div>
          <div className="text-[10px] font-bold tracking-[0.05em] text-muted-foreground uppercase">Impressions</div>
        </div>
        <div>
          <div className="font-display text-base font-bold text-foreground">{campaign.click_count.toLocaleString()}</div>
          <div className="text-[10px] font-bold tracking-[0.05em] text-muted-foreground uppercase">Clicks</div>
        </div>
      </div>

      {campaign.status === 'pending_review' && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-panel px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <Icon name="clock" size={13} className="mt-0.5 flex-none text-teal" />
          Awaiting Miles Tech&apos;s review — you can still fund it now, it&apos;ll start serving the moment it&apos;s approved.
        </p>
      )}
      {campaign.status === 'rejected' && campaign.moderation_note && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-snug text-danger">
          <span className="font-bold">Rejection reason: </span>
          {campaign.moderation_note}
        </p>
      )}
      {campaign.status === 'exhausted' && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs leading-relaxed text-amber-ink dark:text-amber">
          <Icon name="alertTriangle" size={13} className="mt-0.5 flex-none" />
          Budget fully spent — top up to keep this campaign active.
        </p>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {canFund && (
          <button
            type="button"
            onClick={() => setFundOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-3.5 py-2 text-xs font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
          >
            <Icon name="sparkle" size={12} /> Fund
          </button>
        )}
        {canPause && (
          <button
            type="button"
            onClick={() => runAction('pause')}
            disabled={anyActionPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-amber hover:text-amber-ink disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="pause" size={12} /> Pause
          </button>
        )}
        {canResume && (
          <button
            type="button"
            onClick={() => runAction('resume')}
            disabled={anyActionPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-teal hover:text-teal disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="play" size={12} /> Resume
          </button>
        )}
        {canComplete && !confirmingComplete && (
          <button
            type="button"
            onClick={() => setConfirmingComplete(true)}
            disabled={anyActionPending}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:border-danger hover:text-danger disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="close" size={12} /> Complete
          </button>
        )}
        {canComplete && confirmingComplete && (
          <div className="inline-flex items-center gap-2 rounded-full border border-danger/40 bg-danger/5 px-3 py-1.5 text-xs">
            <span className="font-semibold text-danger">End this campaign for good?</span>
            <button
              type="button"
              onClick={() => runAction('complete')}
              disabled={anyActionPending}
              className="font-bold text-danger underline decoration-danger/40 underline-offset-2 disabled:opacity-60"
            >
              {completeMutation.isPending ? 'Ending…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingComplete(false)}
              className="font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <CampaignFundingHistory campaignId={campaign.id} className="mt-3" />

      <CampaignFundingModal
        open={fundOpen}
        onClose={() => setFundOpen(false)}
        businessId={campaign.business_id}
        businessPhone={businessPhone}
        campaignId={campaign.id}
        campaignName={campaign.name}
      />
    </div>
  )
}
