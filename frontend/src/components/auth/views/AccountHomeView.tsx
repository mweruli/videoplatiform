import { useNavigate } from 'react-router-dom'

import type { UserRead } from '../../../lib/api'
import { ROLE_META } from '../roles'
import Icon from '../../icons/Icon'
import { useToast } from '../../../lib/toast'

interface AccountHomeViewProps {
  user: UserRead
  onSignOut: () => void
  /** Closes the auth modal — used when a quick link navigates to a real route (e.g. the dashboard) rather than staying inside the sheet. */
  onNavigateAway: () => void
}

interface QuickLink {
  emoji: string
  label: string
  /** Real route — present once the destination actually exists. Absent entries fall back to a "not built yet" toast rather than a dead link. */
  to?: string
}

const ROLE_QUICK_LINKS: Record<string, QuickLink[]> = {
  general_user: [
    { emoji: '⭐', label: 'Saved businesses' },
    { emoji: '📄', label: 'My quote requests' },
  ],
  business_admin: [
    { emoji: '🏢', label: 'Manage my showroom', to: '/dashboard' },
    { emoji: '🛡️', label: 'Verification status', to: '/dashboard' },
  ],
  advertiser: [
    { emoji: '📢', label: 'Ad campaigns' },
    { emoji: '💳', label: 'Billing' },
  ],
  content_creator: [
    { emoji: '🎬', label: 'My uploads' },
    { emoji: '📈', label: 'Analytics' },
  ],
  publisher: [
    { emoji: '📚', label: 'My publications' },
    { emoji: '📝', label: 'Submissions' },
  ],
}

/** Signed-in state of the account sheet — identity, role, verification badge, role-specific quick links (business_admin's link to a real destination now that the Business Dashboard exists; the rest stubbed until their own screens are built), and sign out. */
export default function AccountHomeView({ user, onSignOut, onNavigateAway }: AccountHomeViewProps) {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const meta = ROLE_META[user.role as keyof typeof ROLE_META] ?? ROLE_META.general_user
  const links = ROLE_QUICK_LINKS[user.role] ?? ROLE_QUICK_LINKS.general_user

  function handleLinkClick(link: QuickLink) {
    if (link.to) {
      navigate(link.to)
      onNavigateAway()
    } else {
      showToast('That module is a separate design/build pass — not in this sprint.')
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3.5">
        <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl bg-brand text-2xl shadow-soft">
          {meta.emoji}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{user.full_name || 'Miles Tech user'}</h2>
          <p className="text-sm text-muted-foreground">{user.email || user.phone}</p>
        </div>
      </div>

      <div className="my-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-bold text-brand dark:text-ice">
          {meta.emoji} {meta.label}
        </span>
        {user.is_verified && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal px-3 py-1 text-xs font-bold text-teal">
            <Icon name="check" size={11} /> Verified
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {links.map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={() => handleLinkClick(link)}
            className="flex items-center justify-between rounded-2xl border border-border bg-panel px-3.5 py-3 text-left transition-colors duration-150 ease-brand hover:border-teal"
          >
            <span className="flex items-center gap-3">
              <span className="text-lg">{link.emoji}</span>
              <span className="text-sm font-bold text-foreground">{link.label}</span>
            </span>
            <Icon name="chevronRight" size={15} className="text-muted-foreground" />
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 w-full rounded-full border-[1.5px] border-foreground py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
      >
        Sign out
      </button>
    </div>
  )
}
