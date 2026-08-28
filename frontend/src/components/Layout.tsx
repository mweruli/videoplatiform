import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Home', end: true },
  { to: '/search', label: 'Search & Discovery' },
  { to: '/feed', label: 'Video Feed' },
  { to: '/dashboard', label: 'Business Dashboard' },
  { to: '/admin', label: 'Admin' },
]

export default function Layout() {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-lg">Miles Tech</span>
          <nav className="flex gap-4 text-sm">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? 'font-medium text-[var(--color-brand-600)]'
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
