import { NavLink, useNavigate } from 'react-router-dom'

import BrandLockup from './BrandLockup'
import ThemeToggle from './ThemeToggle'
import Icon from '../icons/Icon'
import { Pill } from '../ui/Pill'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../lib/toast'

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Search', end: false },
  { to: '/feed', label: 'Shorts', end: false },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-bold transition-colors duration-150 ease-brand ${
    isActive ? 'bg-panel text-foreground' : 'text-muted-foreground hover:bg-panel hover:text-foreground'
  }`

/**
 * Persistent desktop top nav (>=1024px, matching the approved prototype's
 * breakpoint) — replaces the phone bezel's status bar + bottom tab bar
 * entirely at this width, per the architecture's "web application" vs.
 * "mobile-first responsive interface" distinction.
 */
export default function TopNav() {
  const { showToast } = useToast()
  const { status, user, openAuthModal } = useAuth()
  const navigate = useNavigate()
  const isStaff = status === 'authenticated' && (user?.role === 'platform_admin' || user?.role === 'content_moderator')

  // A signed-in visitor clicking "List your business" already has an account
  // — send them straight to the dashboard rather than back through Register.
  // Only an anonymous visitor needs the register-with-role-preset flow.
  function handleListYourBusiness() {
    if (status === 'authenticated') navigate('/dashboard')
    else openAuthModal({ forceRegisterRole: 'business_admin' })
  }

  return (
    <nav className="sticky top-0 z-50 hidden items-center justify-between gap-6 border-b border-glass-border bg-glass px-8 py-3.5 backdrop-blur-xl backdrop-saturate-150 lg:flex">
      <div className="flex items-center gap-8">
        <NavLink to="/" className="shrink-0">
          <BrandLockup tone="nav" />
        </NavLink>
        <div className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass}>
              {link.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => showToast('Add products to compare from any listing first')}
            className="rounded-full px-3.5 py-2 text-sm font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:bg-panel hover:text-foreground"
          >
            Compare
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => showToast('Location picker — Nairobi is set as the default for now')}
          className="flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-2 text-xs font-semibold text-foreground transition-colors duration-150 ease-brand hover:border-teal"
        >
          <Icon name="pin" size={14} className="text-teal" />
          Nairobi
        </button>
        <ThemeToggle variant="solid" />
        <Pill variant="outline" size="sm" onClick={() => openAuthModal()}>
          {status === 'authenticated' && user ? (user.full_name?.split(' ')[0] ?? 'Account') : 'Account'}
        </Pill>
        {isStaff && (
          <Pill variant="outline" size="sm" onClick={() => navigate('/admin')}>
            Admin
          </Pill>
        )}
        <Pill variant="amber" size="sm" onClick={handleListYourBusiness}>
          {status === 'authenticated' ? 'My business' : 'List your business'}
        </Pill>
      </div>
    </nav>
  )
}
