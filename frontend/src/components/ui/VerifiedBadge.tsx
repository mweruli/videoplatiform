import Icon from '../icons/Icon'
import type { Business } from '../../data/types'

interface VerifiedBadgeProps {
  business: Pick<Business, 'verified' | 'pending'>
}

/** Teal check = verified by Miles Tech; grey clock = verification pending. */
export default function VerifiedBadge({ business }: VerifiedBadgeProps) {
  if (business.verified) {
    return (
      <span
        className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-teal text-white"
        title="Verified by Miles Tech"
      >
        <Icon name="check" size={9} strokeWidth={3} />
        <span className="sr-only">Verified by Miles Tech</span>
      </span>
    )
  }
  if (business.pending) {
    return (
      <span
        className="inline-flex h-[15px] w-[15px] flex-none items-center justify-center rounded-full bg-border text-muted-foreground"
        title="Verification pending"
      >
        <Icon name="clock" size={9} strokeWidth={3} />
        <span className="sr-only">Verification pending</span>
      </span>
    )
  }
  return null
}
