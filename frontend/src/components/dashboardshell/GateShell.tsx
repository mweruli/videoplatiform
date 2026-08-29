import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import BrandLockup from '../layout/BrandLockup'
import ThemeToggle from '../layout/ThemeToggle'

/**
 * Minimal chrome for the Business Dashboard / Admin Panel's pre-content gate
 * states (loading / signed-out / wrong-role) — a real sidebar with nav items
 * that don't do anything yet (no business selected, no access) would be
 * more confusing than helpful, so these states get just enough chrome to
 * orient (brand + theme toggle + a way back) rather than the full
 * DashboardShell. Once there's real content to navigate, the page renders
 * DashboardShell instead — see BusinessDashboard.tsx / Admin.tsx.
 */
export default function GateShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 lg:px-8">
        <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
          <BrandLockup tone="nav" />
        </button>
        <ThemeToggle variant="solid" />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 py-10">{children}</main>
    </div>
  )
}
