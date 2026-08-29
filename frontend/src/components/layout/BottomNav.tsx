import { NavLink } from 'react-router-dom'

import Icon from '../icons/Icon'
import type { IconName } from '../icons/Icon'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../lib/toast'

interface NavItemBase {
  label: string
}
interface NavLinkItem extends NavItemBase {
  kind: 'link'
  to: string
  end?: boolean
  icon: IconName
}
interface NavActionItem extends NavItemBase {
  kind: 'action'
  icon: IconName
  message: string
}
interface NavAccountItem extends NavItemBase {
  kind: 'account'
  icon: IconName
}
interface NavFabItem extends NavItemBase {
  kind: 'fab'
  to: string
}

type NavItem = NavLinkItem | NavActionItem | NavAccountItem | NavFabItem

const items: NavItem[] = [
  { kind: 'link', to: '/', end: true, icon: 'home', label: 'Home' },
  { kind: 'link', to: '/search', icon: 'search', label: 'Search' },
  { kind: 'fab', to: '/feed', label: 'Shorts' },
  { kind: 'action', icon: 'compare', label: 'Compare', message: 'Add products to compare from any listing first' },
  { kind: 'account', icon: 'user', label: 'Account' },
]

const itemButtonClass =
  'relative flex w-14 flex-col items-center gap-0.5 py-1 text-[10px] font-bold text-muted-foreground transition-[color,transform] duration-150 ease-brand active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100'

/**
 * Mobile bottom tab bar (<1024px) — frosted glass, matching the approved
 * prototype's bottomnav. Hidden entirely at the desktop breakpoint, where
 * TopNav takes over.
 */
export default function BottomNav() {
  const { showToast } = useToast()
  const { status, openAuthModal } = useAuth()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] flex h-[74px] items-center justify-around border-t border-glass-border bg-glass pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      aria-label="Primary"
    >
      {items.map((item) => {
        if (item.kind === 'fab') {
          return (
            <NavLink key={item.label} to={item.to} className="flex w-14 flex-col items-center" aria-label={item.label}>
              <span className="-mt-6 flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-amber/40 bg-[radial-gradient(circle_at_32%_28%,var(--color-brand-light),var(--color-brand)_70%)] text-amber shadow-[0_8px_20px_-6px_rgba(10,15,28,0.55),0_0_22px_-4px_rgba(250,189,46,0.55)] transition-transform duration-150 ease-brand active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100">
                <Icon name="play" size={18} />
              </span>
            </NavLink>
          )
        }
        if (item.kind === 'link') {
          return (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `${itemButtonClass} ${isActive ? 'text-brand dark:text-ice' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute -top-1.5 h-1 w-1 rounded-full bg-amber" aria-hidden="true" />}
                  <Icon name={item.icon} size={20} className={isActive ? 'stroke-amber' : ''} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        }
        if (item.kind === 'account') {
          const signedIn = status === 'authenticated'
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => openAuthModal()}
              className={`${itemButtonClass} ${signedIn ? 'text-brand dark:text-ice' : ''}`}
            >
              <Icon name={item.icon} size={20} className={signedIn ? 'stroke-amber' : ''} />
              <span>{item.label}</span>
            </button>
          )
        }
        return (
          <button key={item.label} type="button" onClick={() => showToast(item.message)} className={itemButtonClass}>
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
