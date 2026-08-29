export function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`
}

/**
 * Product price formatting for real backend data, where `price_min`/
 * `price_max` are optional decimal strings and may form a genuine range
 * (see backend Product model docstring) rather than the fixture data's
 * single `price` number.
 */
export function formatPriceRange(
  priceMin: string | null,
  priceMax: string | null,
  currency = 'KES',
): string {
  const min = priceMin !== null ? Number(priceMin) : null
  const max = priceMax !== null ? Number(priceMax) : null
  const fmt = (n: number) => `${currency} ${n.toLocaleString('en-KE')}`

  if (min === null && max === null) return 'Price on request'
  if (min !== null && max !== null && min !== max) return `${fmt(min)} – ${fmt(max)}`
  return fmt(min ?? max ?? 0)
}

/** Absolute date, e.g. "29 Aug 2026" — used wherever a moderator needs the exact submission date, not just "3d ago". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Coarse relative time for a moderation queue's "submitted…" line — precision beyond days doesn't help a reviewer decide what's stale. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return `${Math.floor(diffMonths / 12)}y ago`
}

export function formatViews(count: number): string {
  if (count >= 1000) {
    const value = count / 1000
    return `${count % 1000 === 0 ? value.toFixed(0) : value.toFixed(1)}K`
  }
  return String(count)
}
