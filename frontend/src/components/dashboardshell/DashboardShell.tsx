import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import BrandLockup from '../layout/BrandLockup'
import Icon from '../icons/Icon'
import type { IconName } from '../icons/Icon'
import { ROLE_META, STAFF_ROLE_META } from '../auth/roles'
import { useAuth } from '../../lib/auth'

export interface DashNavItem {
  id: string
  label: string
  icon: IconName
  /** Renders a muted "Soon" pill and disables the item — Analytics/Orders per the approved design. */
  soon?: boolean
  /** Renders an amber count pill (e.g. pending-review counts) when > 0. */
  count?: number
}

export interface DashStat {
  value: ReactNode
  label: string
  warn?: boolean
}

interface DashboardShellProps {
  /** Which console this is — drives the sidebar caption ("Business Console" vs "Staff Console"). */
  mode: 'business' | 'admin'
  navItems: DashNavItem[]
  activeSection: string
  onNavigate: (id: string) => void
  breadcrumb: string
  title: string
  stats?: DashStat[]
  children: ReactNode
}

/**
 * Shared internal-tool shell (sidebar + topbar + content + footer) for the
 * Business Dashboard and Admin Panel — a deliberately different layout
 * grammar from the consumer site's TopNav/BottomNav, per the approved
 * design pass (docs/design/prototype-v1.html's `.dash-*` rules,
 * ~lines 652-770/846-858, render logic ~lines 2482-2750) and the incident
 * write-up in docs/decisions.md ("Process incident: Business Dashboard
 * shipped without a design pass").
 *
 * Persistent on desktop (>=1024px, same breakpoint the rest of the app uses
 * for its own desktop reflow), a hamburger-triggered drawer below that.
 * Both surfaces render the exact same nav markup (`SidebarContent`) so
 * there's one source of truth for the nav, matching the prototype's
 * renderDashSidebar() writing identical HTML into both the inline aside and
 * the drawer.
 *
 * The consumer TopNav/BottomNav do not wrap this shell at all (see
 * App.tsx — /dashboard and /admin are routed outside <Layout>) — this shell
 * is the entire page chrome while inside it, matching the prototype's
 * "portal mode retires the consumer nav" behaviour.
 */
export default function DashboardShell({ mode, navItems, activeSection, onNavigate, breadcrumb, title, stats, children }: DashboardShellProps) {
  const navigate = useNavigate()
  const { user, openAuthModal } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  function handleNavigate(id: string, disabled?: boolean) {
    if (disabled) return
    setDrawerOpen(false)
    onNavigate(id)
  }

  function handleExit() {
    setDrawerOpen(false)
    navigate('/')
  }

  const meta = user ? (STAFF_ROLE_META as Record<string, { emoji: string }>)[user.role] ?? ROLE_META[user.role as keyof typeof ROLE_META] : null
  const accountLabel = user?.full_name || user?.email || user?.phone || 'Guest'

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* ---- topbar ---- */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-3.5 lg:px-7 lg:py-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/60 lg:hidden"
        >
          <Icon name="menu" size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold tracking-[0.09em] text-muted-foreground uppercase">{breadcrumb}</div>
          <h1 className="mt-0.5 truncate font-display text-[1.05rem] font-bold tracking-tight text-foreground">{title}</h1>
        </div>

        {stats && stats.length > 0 && (
          <div className="hidden items-center lg:flex">
            {stats.map((s, i) => (
              <div
                key={i}
                className={`flex flex-col items-end border-r border-border px-3 last:border-r-0 last:pr-0 ${i === 0 ? '' : ''}`}
              >
                <div className={`font-display text-base leading-none font-bold ${s.warn ? 'text-amber-ink dark:text-amber' : 'text-foreground'}`}>
                  {s.value}
                </div>
                <div className="mt-1 text-[10px] font-bold tracking-[0.05em] whitespace-nowrap text-muted-foreground uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => openAuthModal()}
          className="flex flex-none items-center gap-2 rounded-full border border-border bg-panel py-1 pr-3 pl-1 transition-colors duration-150 ease-brand hover:border-teal"
        >
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-brand text-sm text-white">
            {meta?.emoji ?? '🙂'}
          </span>
          <span className="max-w-[96px] truncate text-[13px] font-bold text-foreground">{accountLabel}</span>
        </button>
      </header>

      <div className="flex flex-1 items-start">
        {/* ---- persistent desktop sidebar ---- */}
        <aside
          className="sticky top-16 hidden max-h-[calc(100dvh-4rem)] w-[236px] flex-none self-start overflow-y-auto lg:flex"
          style={{ backgroundColor: '#0A0F1C', backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(16,52,166,.35), transparent 55%)' }}
        >
          <SidebarContent
            mode={mode}
            navItems={navItems}
            activeSection={activeSection}
            onNavigate={handleNavigate}
            onExit={handleExit}
          />
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-6">{children}</main>
      </div>

      {/* ---- footer ---- */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 text-[11px] text-muted-foreground lg:px-8">
        <div>
          Miles Tech {mode === 'admin' ? 'Staff Console' : 'Business Console'} — internal tool, not visible to shoppers
        </div>
        <div className="flex gap-3.5">
          <button type="button" className="font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground">
            Help
          </button>
          <button
            type="button"
            onClick={handleExit}
            className="font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground"
          >
            Back to Miles Tech
          </button>
        </div>
      </footer>

      {/* ---- mobile drawer + backdrop ---- */}
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-[90] bg-black/60 backdrop-blur-[2px] transition-opacity duration-[250ms] ease-brand motion-reduce:transition-none lg:hidden ${
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-[95] w-[250px] overflow-y-auto rounded-r-[20px] transition-transform duration-300 ease-brand motion-reduce:transition-none lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        style={{ backgroundColor: '#0A0F1C', backgroundImage: 'radial-gradient(circle at 15% 0%, rgba(16,52,166,.4), transparent 55%)' }}
      >
        <SidebarContent
          mode={mode}
          navItems={navItems}
          activeSection={activeSection}
          onNavigate={handleNavigate}
          onExit={handleExit}
        />
      </aside>
    </div>
  )
}

interface SidebarContentProps {
  mode: 'business' | 'admin'
  navItems: DashNavItem[]
  activeSection: string
  onNavigate: (id: string, disabled?: boolean) => void
  onExit: () => void
}

function SidebarContent({ mode, navItems, activeSection, onNavigate, onExit }: SidebarContentProps) {
  return (
    <div className="relative flex w-full flex-col overflow-hidden px-3.5 py-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
        style={{ backgroundImage: 'var(--texture-grain)' }}
        aria-hidden="true"
      />
      <div className="relative z-10 mb-5 flex items-center gap-2.5 px-1.5">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber" aria-hidden="true" />
        <div>
          <BrandLockup tone="onDark" />
          <small className="mt-0.5 block text-[10px] font-semibold tracking-[0.09em] text-white/50 uppercase">
            {mode === 'admin' ? 'Staff Console' : 'Business Console'}
          </small>
        </div>
      </div>

      <nav className="relative z-10 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.soon}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id, item.soon)}
              className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors duration-150 ease-brand ${
                item.soon
                  ? 'cursor-default text-white/45'
                  : active
                    ? 'bg-brand text-white shadow-[0_4px_14px_-4px_rgba(16,52,166,.65)]'
                    : 'text-white/66 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Icon name={item.icon} size={17} className={active ? 'opacity-100' : 'opacity-85'} />
              <span className="flex-1">{item.label}</span>
              {item.soon && (
                <span className="rounded-[5px] bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.03em] text-white/45 uppercase">
                  Soon
                </span>
              )}
              {!item.soon && Boolean(item.count) && (
                <span className="rounded-full bg-amber px-1.5 py-0.5 text-[10px] font-extrabold text-amber-ink">{item.count}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="relative z-10 mt-4 border-t border-white/10 pt-3.5">
        <button
          type="button"
          onClick={onExit}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px] font-bold text-white/55 transition-colors duration-150 ease-brand hover:bg-white/[0.07] hover:text-white"
        >
          <Icon name="logout" size={15} />
          Exit to Miles Tech
        </button>
      </div>
    </div>
  )
}
