import { Outlet, useLocation } from 'react-router-dom'

import BottomNav from './layout/BottomNav'
import TopNav from './layout/TopNav'

/**
 * Shared app shell: desktop persistent top nav OR mobile bottom tab bar
 * (never both — see TopNav/BottomNav's own breakpoint classes), wrapping
 * every role-gated route (public site, business dashboard, admin).
 *
 * The mobile bottom tab bar hides on the Shorts feed and product detail
 * screens — matching the approved prototype (`bottomnav.hidden` toggled for
 * `feed`/`product`) — since both are meant to feel like full-bleed,
 * immersive surfaces rather than a tab destination with chrome around it.
 */
export default function Layout() {
  const { pathname } = useLocation()
  const immersive = pathname.startsWith('/feed') || pathname.startsWith('/product/')

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className={immersive ? '' : 'pb-[74px] lg:pb-0'}>
        <Outlet />
      </main>
      {!immersive && <BottomNav />}
    </div>
  )
}
