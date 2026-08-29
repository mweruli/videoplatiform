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

export function formatViews(count: number): string {
  if (count >= 1000) {
    const value = count / 1000
    return `${count % 1000 === 0 ? value.toFixed(0) : value.toFixed(1)}K`
  }
  return String(count)
}
