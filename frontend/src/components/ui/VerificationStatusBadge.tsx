import Icon from '../icons/Icon'
import type { VerificationStatus } from '../../lib/api'

interface VerificationStatusBadgeProps {
  status: VerificationStatus
  /** Adds the trailing label text next to the icon — off by default to match
   * the compact inline badge used next to business names (VerifiedBadge). */
  withLabel?: boolean
  className?: string
}

/**
 * Same teal-check / grey-clock visual language as VerifiedBadge, but reads
 * the real `verification_status` enum from the backend (unverified / pending
 * / verified / rejected) instead of the fixture data's `verified`/`pending`
 * booleans. Used anywhere a real Business record is rendered (Search
 * results, Business profile, Product detail's supplier card).
 */
export default function VerificationStatusBadge({
  status,
  withLabel,
  className = '',
}: VerificationStatusBadgeProps) {
  if (status === 'verified') {
    return (
      <span
        className={`inline-flex items-center gap-1 ${className}`}
        title="Verified by Miles Tech"
      >
        <span className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-teal text-white">
          <Icon name="check" size={9} strokeWidth={3} />
        </span>
        {withLabel && <span className="text-xs font-semibold text-teal">Verified</span>}
        <span className="sr-only">Verified by Miles Tech</span>
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`} title="Verification pending">
        <span className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-border text-muted-foreground">
          <Icon name="clock" size={9} strokeWidth={3} />
        </span>
        {withLabel && <span className="text-xs font-semibold text-muted-foreground">Pending verification</span>}
        <span className="sr-only">Verification pending</span>
      </span>
    )
  }
  if (status === 'rejected') {
    return withLabel ? (
      <span className={`text-xs font-semibold text-danger ${className}`}>Verification rejected</span>
    ) : null
  }
  // 'unverified' — no badge in the compact form; callers that need to say
  // something (About tab, business profile) opt in via withLabel.
  return withLabel ? (
    <span className={`text-xs font-semibold text-muted-foreground ${className}`}>Not yet verified</span>
  ) : null
}
