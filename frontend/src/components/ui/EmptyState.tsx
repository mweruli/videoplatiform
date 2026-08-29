import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: string
  title: string
  subtitle?: string
  children?: ReactNode
  tone?: 'default' | 'error'
}

/**
 * Shared empty/error-state block — the backend has no data seeded beyond
 * migrations in most environments, so an empty catalog is a real case, not
 * an edge case. Used for empty search results, an empty business products
 * tab, a 404 business/product, and network errors alike (tone='error' just
 * swaps the icon/copy role, not a separate visual language).
 */
export default function EmptyState({ icon = '🔍', title, subtitle, children, tone = 'default' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <span className="text-3xl" aria-hidden="true">
        {tone === 'error' ? '⚠️' : icon}
      </span>
      <h3 className="font-display text-base font-bold tracking-tight text-foreground">{title}</h3>
      {subtitle && <p className="max-w-[42ch] text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}
