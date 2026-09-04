import Icon from '../icons/Icon'
import type { IconName } from '../icons/Icon'
import type { CampaignStatus } from '../../lib/api'

/**
 * Campaign lifecycle status pill — 7 reachable states (see
 * app/models/campaign.py's `CampaignStatus` docstring / docs/decisions.md's
 * "Phase 1b design pass" entry), each given a distinct color/icon rather than
 * forcing the product/video moderation queue's 3-value red/grey/teal palette
 * onto a richer state machine:
 *
 * - `pending_review` — neutral/waiting, same grey+clock language as
 *   ModerationStatusBadge's "Pending review" for visual consistency across
 *   the app's moderation systems.
 * - `approved` — brand blue: reviewed and cleared, but not (yet, or no
 *   longer) sufficiently funded to actually serve. A holding state, kept
 *   visually distinct from `active` so an owner doesn't mistake "approved"
 *   for "running."
 * - `active` — teal, this app's one consistent "live/good" color.
 * - `paused` — a soft amber outline (owner's own deliberate, reversible
 *   pause — calmer than `exhausted`'s warning treatment since nothing is
 *   wrong, the owner just chose to stop spending for now).
 * - `exhausted` — a stronger, filled amber warning treatment (budget ran
 *   out — needs the owner's attention to top up) with an alert icon,
 *   visually escalated relative to `paused` even though both are
 *   amber-family, per the design brief's "amber/neutral" vs "amber-warning"
 *   distinction.
 * - `rejected` — danger red, matching every other moderation surface's
 *   rejection color.
 * - `completed` — neutral-done grey with a check (not celebratory teal) —
 *   distinct from `pending_review`'s clock so "finished" and "waiting" never
 *   read as the same state at a glance.
 */
const STATUS_META: Record<CampaignStatus, { label: string; icon: IconName; className: string }> = {
  pending_review: { label: 'Pending review', icon: 'clock', className: 'bg-panel text-muted-foreground' },
  approved: { label: 'Approved', icon: 'check', className: 'bg-brand/10 text-brand dark:bg-ice/10 dark:text-ice' },
  active: { label: 'Active', icon: 'play', className: 'bg-teal/10 text-teal' },
  paused: { label: 'Paused', icon: 'pause', className: 'border border-amber/35 bg-amber/[0.06] text-amber-ink dark:text-amber' },
  exhausted: { label: 'Exhausted', icon: 'alertTriangle', className: 'border border-amber/60 bg-amber/20 text-amber-ink dark:text-amber' },
  rejected: { label: 'Rejected', icon: 'close', className: 'bg-danger/10 text-danger' },
  completed: { label: 'Completed', icon: 'check', className: 'bg-panel text-muted-foreground' },
}

export default function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.className}`}>
      <Icon name={meta.icon} size={11} strokeWidth={3} />
      {meta.label}
    </span>
  )
}
