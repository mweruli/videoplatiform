import { Outlet } from 'react-router-dom'

import BottomNav from './layout/BottomNav'
import TopNav from './layout/TopNav'

/**
 * Shared app shell: desktop persistent top nav OR mobile bottom tab bar
 * (never both — see TopNav/BottomNav's own breakpoint classes), wrapping
 * every role-gated route (public site, business dashboard, admin).
 */
export default function Layout() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="pb-[74px] lg:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
