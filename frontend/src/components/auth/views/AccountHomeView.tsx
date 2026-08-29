import type { UserRead } from '../../../lib/api'
import { ROLE_META } from '../roles'
import Icon from '../../icons/Icon'
import { useToast } from '../../../lib/toast'

interface AccountHomeViewProps {
  user: UserRead
  onSignOut: () => void
}

const ROLE_QUICK_LINKS: Record<string, [string, string][]> = {
  general_user: [
    ['⭐', 'Saved businesses'],
    ['📄', 'My quote requests'],
  ],
  business_admin: [
    ['🏢', 'Manage my showroom'],
    ['🛡️', 'Verification status'],
  ],
  advertiser: [
    ['📢', 'Ad campaigns'],
    ['💳', 'Billing'],
  ],
  content_creator: [
    ['🎬', 'My uploads'],
    ['📈', 'Analytics'],
  ],
  publisher: [
    ['📚', 'My publications'],
    ['📝', 'Submissions'],
  ],
}

/** Signed-in state of the account sheet — identity, role, verification badge, role-specific quick links (stubbed for now — real destinations are a later sprint's build), and sign out. */
export default function AccountHomeView({ user, onSignOut }: AccountHomeViewProps) {
  const { showToast } = useToast()
  const meta = ROLE_META[user.role as keyof typeof ROLE_META] ?? ROLE_META.general_user
  const links = ROLE_QUICK_LINKS[user.role] ?? ROLE_QUICK_LINKS.general_user

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
        {links.map(([emoji, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => showToast('That module is a separate design/build pass — not in this sprint.')}
            className="flex items-center justify-between rounded-2xl border border-border bg-panel px-3.5 py-3 text-left transition-colors duration-150 ease-brand hover:border-teal"
          >
            <span className="flex items-center gap-3">
              <span className="text-lg">{emoji}</span>
              <span className="text-sm font-bold text-foreground">{label}</span>
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
