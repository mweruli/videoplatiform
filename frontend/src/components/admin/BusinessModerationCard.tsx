import { useState } from 'react'

import Icon from '../icons/Icon'
import RejectModal from './RejectModal'
import ToggleSwitch from '../ui/ToggleSwitch'
import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { useApproveBusiness, useRejectBusiness } from '../../hooks/useAdmin'
import { ApiError } from '../../lib/api'
import type { BusinessDto } from '../../lib/api'
import { formatDate, formatRelativeTime } from '../../lib/format'
import { useToast } from '../../lib/toast'

interface BusinessModerationCardProps {
  business: BusinessDto
}

/**
 * One business in the moderation queue — enough to make a real decision
 * (name, category, location, description, submitted-when), not just a bare
 * name. Action shown depends on current status: `pending` gets the original
 * approve/reject pair; `verified` gets a "pull down" reject (backend now
 * permits reject from `verified`, see docs/decisions.md's approve/reject-
 * can-act-on-already-reviewed-content follow-up); `rejected` gets a
 * reversing approve. `unverified` businesses stay read-only here — the
 * backend still only allows approve/reject from pending/rejected/verified
 * (see admin.py's approve_business/reject_business), never from unverified.
 */
export default function BusinessModerationCard({ business }: BusinessModerationCardProps) {
  const { showToast } = useToast()
  const approveMutation = useApproveBusiness()
  const rejectMutation = useRejectBusiness()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = business.verification_status === 'pending'
  const verified = business.verification_status === 'verified'
  const rejected = business.verification_status === 'rejected'
  const location = [business.city, business.county].filter(Boolean).join(', ')

  function handleApprove() {
    setError(null)
    approveMutation.mutate(business.id, {
      onSuccess: () =>
        showToast(rejected ? `${business.name} approved — reinstated and live again` : `${business.name} approved — now live in search`),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not approve this business.'),
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-xl bg-panel text-base font-extrabold text-muted-foreground">
            {business.logo_url ? (
              <img src={business.logo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              business.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-foreground">{business.name}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {business.category && <span>{business.category.name}</span>}
              {location && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="pin" size={11} />
                  {location}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <VerificationStatusBadge status={business.verification_status} withLabel className="flex-none" />
          {(verified || rejected) && (
            <ToggleSwitch
              on={verified}
              onToggle={verified ? () => setRejecting(true) : handleApprove}
              label={verified ? `Pull down ${business.name}` : `Restore ${business.name}`}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            />
          )}
        </div>
      </div>

      {business.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{business.description}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
        <span title={formatDate(business.created_at)}>Submitted {formatRelativeTime(business.created_at)}</span>
        {business.phone && <span>{business.phone}</span>}
      </div>

      {business.verification_status === 'rejected' && business.verification_note && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-snug text-danger">
          <span className="font-bold">Rejection reason: </span>
          {business.verification_note}
        </p>
      )}
      {business.verification_status === 'verified' && business.verification_note && (
        <p className="mt-2 rounded-lg bg-teal/10 px-3 py-2 text-xs leading-snug text-teal">{business.verification_note}</p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      {pending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-bold text-white transition-opacity duration-150 ease-brand hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="check" size={13} strokeWidth={3} />
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={rejectMutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-danger px-4 py-2 text-sm font-bold text-danger transition-colors duration-150 ease-brand hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="close" size={13} strokeWidth={3} />
            Reject
          </button>
        </div>
      )}

      <RejectModal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={verified ? 'Pull down business' : 'Reject business'}
        itemName={business.name}
        description={
          verified ? (
            <>
              <span className="font-bold text-foreground">{business.name}</span> is currently verified and live in search. Pulling it
              down removes it immediately and shows the owner why.
            </>
          ) : undefined
        }
        confirmLabel={verified ? 'Confirm pull-down' : undefined}
        pendingLabel={verified ? 'Pulling down…' : undefined}
        onSubmit={(reason) =>
          rejectMutation
            .mutateAsync({ businessId: business.id, reason })
            .then(() => showToast(verified ? `${business.name} pulled down` : `${business.name} rejected`))
        }
      />
    </div>
  )
}
