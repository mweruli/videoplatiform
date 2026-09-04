import { useState } from 'react'

import CampaignStatusBadge from '../dashboard/CampaignStatusBadge'
import Icon from '../icons/Icon'
import RejectModal from './RejectModal'
import ToggleSwitch from '../ui/ToggleSwitch'
import { useApproveCampaign, useRejectCampaign } from '../../hooks/useAdmin'
import { ApiError } from '../../lib/api'
import type { CampaignDto } from '../../lib/api'
import { formatKES, formatRelativeTime } from '../../lib/format'
import { useToast } from '../../lib/toast'

interface CampaignModerationCardProps {
  campaign: CampaignDto
}

/**
 * One campaign in the moderation queue — full targeting + budget/spend
 * detail visible up front (no "approve blind" disclosure gate, same
 * principle as the recent moderation-content-preview fix for products/
 * videos), plus a decision action appropriate to its current status. Unlike
 * Product/VideoModerationCard's binary approved/rejected, a campaign has
 * `approved`/`active`/`paused`/`exhausted` as its "already reviewed and
 * live in some form" group — all four get the same "pull down" toggle,
 * since a moderator finding a problem doesn't care which of those four a
 * campaign happens to be in right now. `completed` gets no action at all —
 * it's the advertiser's own terminal choice, not something moderation acts
 * on (see `CampaignStatus`'s docstring).
 */
export default function CampaignModerationCard({ campaign }: CampaignModerationCardProps) {
  const { showToast } = useToast()
  const approveMutation = useApproveCampaign()
  const rejectMutation = useRejectCampaign()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = campaign.status === 'pending_review'
  const rejected = campaign.status === 'rejected'
  const completed = campaign.status === 'completed'
  const live = !pending && !rejected && !completed
  const targetLabel = campaign.product ? campaign.product.name : `${campaign.business.name} (business)`
  const budget = Number(campaign.budget_kes)
  const spent = Number(campaign.spent_kes)
  const spendPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0

  function handleApprove() {
    setError(null)
    approveMutation.mutate(campaign.id, {
      onSuccess: () => showToast(rejected ? `${campaign.name} approved — reinstated` : `${campaign.name} approved`),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not approve this campaign.'),
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{campaign.name}</h3>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{campaign.business.name}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <CampaignStatusBadge status={campaign.status} />
          {(live || rejected) && (
            <ToggleSwitch
              on={live}
              onToggle={live ? () => setRejecting(true) : handleApprove}
              label={live ? `Pull down ${campaign.name}` : `Restore ${campaign.name}`}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            />
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Promotes {targetLabel}</span>
        <span className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {campaign.category ? campaign.category.name : 'All categories'}
        </span>
        <span className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {campaign.county ?? 'All locations'}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-foreground">
            {formatKES(spent)} <span className="font-semibold text-muted-foreground">of {formatKES(budget)}</span>
          </span>
          <span className="font-semibold text-muted-foreground">
            {campaign.impression_count.toLocaleString()} impr · {campaign.click_count.toLocaleString()} clicks
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-panel">
          <div
            className={`h-full rounded-full ${campaign.status === 'exhausted' ? 'bg-amber' : 'bg-teal'}`}
            style={{ width: `${spendPct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
        <span>Submitted {formatRelativeTime(campaign.created_at)}</span>
        <span>CPM {formatKES(Number(campaign.cpm_kes))}</span>
      </div>

      {rejected && campaign.moderation_note && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-snug text-danger">
          <span className="font-bold">Rejection reason: </span>
          {campaign.moderation_note}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      {pending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-teal px-3.5 py-1.5 text-xs font-bold text-white transition-opacity duration-150 ease-brand hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="check" size={11} strokeWidth={3} />
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={rejectMutation.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-danger px-3.5 py-1.5 text-xs font-bold text-danger transition-colors duration-150 ease-brand hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="close" size={11} strokeWidth={3} />
            Reject
          </button>
        </div>
      )}

      <RejectModal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={live ? 'Pull down campaign' : 'Reject campaign'}
        itemName={campaign.name}
        description={
          live ? (
            <>
              <span className="font-bold text-foreground">{campaign.name}</span> is currently {campaign.status} and may be spending
              budget. Pulling it down stops it immediately and shows the advertiser why.
            </>
          ) : undefined
        }
        confirmLabel={live ? 'Confirm pull-down' : undefined}
        pendingLabel={live ? 'Pulling down…' : undefined}
        onSubmit={(reason) =>
          rejectMutation
            .mutateAsync({ campaignId: campaign.id, reason })
            .then(() => showToast(live ? `${campaign.name} pulled down` : `${campaign.name} rejected`))
        }
      />
    </div>
  )
}
