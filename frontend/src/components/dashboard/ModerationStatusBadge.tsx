import Icon from '../icons/Icon'
import type { ModerationStatus } from '../../lib/api'

/**
 * Per-product moderation status, shown only to the owner (the public API
 * hides pending/rejected products entirely — see products.py's
 * `include_unapproved` gate) — this is real information an owner needs
 * ("why isn't my new listing showing up in Search yet"), so it's rendered
 * plainly rather than tucked away. Same visual language as
 * VerificationStatusBadge (teal=good, grey=waiting, red=needs action) for
 * consistency across the two status systems the dashboard surfaces.
 */
export default function ModerationStatusBadge({ status }: { status: ModerationStatus }) {
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal">
        <Icon name="check" size={11} strokeWidth={3} />
        Live
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger">
        <Icon name="close" size={11} strokeWidth={3} />
        Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
      <Icon name="clock" size={11} strokeWidth={3} />
      Pending review
    </span>
  )
}
