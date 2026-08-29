import type { ReactNode } from 'react'

interface DashSectionProps {
  title?: string
  subtitle?: string
  action?: ReactNode
  tone?: 'default' | 'warn'
  children: ReactNode
  className?: string
}

/** Shared card wrapper for dashboard/admin content sections — see `.dash-section` in docs/design/prototype-v1.html. */
export default function DashSection({ title, subtitle, action, tone = 'default', children, className = '' }: DashSectionProps) {
  return (
    <div
      className={`mb-3.5 rounded-2xl border p-4 shadow-soft lg:p-5 ${
        tone === 'warn' ? 'border-sponsor-border bg-sponsor' : 'border-border bg-surface'
      } ${className}`}
    >
      {(title || action) && (
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-[0.95rem] font-bold tracking-tight text-foreground">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
