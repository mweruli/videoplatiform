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

/**
 * Presents a `views / impressions` conversion rate (`BusinessStatsDto`'s
 * `business_view_conversion_rate`/`product_view_conversion_rate`) as both a
 * percentage and a natural-language ratio — "1 in 8" reads more concretely
 * than "12.5%" at a glance, so BusinessAnalytics.tsx shows both. `null`
 * means zero impressions recorded yet (never a misleading 0% or a
 * divide-by-zero) — the caller renders an explicit "not enough data" state
 * for that case rather than treating it as a real 0.
 */
export function formatConversionRate(rate: number | null): { pct: string; ratio: string | null } {
  if (rate === null) return { pct: '—', ratio: null }
  const pct = `${(rate * 100).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`
  if (rate <= 0) return { pct, ratio: null }
  const oneIn = Math.round(1 / rate)
  return { pct, ratio: oneIn <= 1 ? 'nearly every impression converts' : `about 1 in ${oneIn} impressions` }
}

export function formatViews(count: number): string {
  if (count >= 1000) {
    const value = count / 1000
    return `${count % 1000 === 0 ? value.toFixed(0) : value.toFixed(1)}K`
  }
  return String(count)
}

/**
 * mm:ss duration badge, or `undefined` when the backend hasn't extracted one
 * yet — `ObjectStorageVideoBackend` (dev/object-storage default, no ffmpeg dependency) always
 * returns `duration_seconds: null`, so every real-video component needs to
 * treat this as optional, not assume the fixture data's always-present
 * string duration.
 */
export function formatDuration(totalSeconds: number | null | undefined): string | undefined {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds <= 0) return undefined
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
