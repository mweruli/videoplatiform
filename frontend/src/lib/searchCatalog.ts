import type { BusinessDto, ProductDto } from './api'
import type { Video } from '../data/types'
import { matchesTokens, scoreTokens } from './searchMatch'
import type { SearchFilters } from '../components/search/filterState'

/**
 * Pure filter/rank helpers behind Search.tsx — kept separate from the
 * component so the "how do we match/rank a business, product or video
 * against the current query + filters" logic is unit-testable and doesn't
 * get tangled with render/query-state concerns.
 */

function rank<T>(items: T[], tokens: string[], haystackOf: (item: T) => (string | null | undefined)[]): T[] {
  const withScore = items.map((item) => ({ item, score: scoreTokens(haystackOf(item), tokens) }))
  if (tokens.length === 0) return withScore.map((x) => x.item)
  return withScore.sort((a, b) => b.score - a.score).map((x) => x.item)
}

export function filterBusinesses(items: BusinessDto[], tokens: string[], filters: SearchFilters): BusinessDto[] {
  const haystackOf = (b: BusinessDto) => [b.name, b.description, b.category?.name, b.county, b.city]
  const matched = items.filter((b) => {
    if (!matchesTokens(haystackOf(b), tokens)) return false
    if (filters.categoryIds.size > 0 && !(b.category && filters.categoryIds.has(b.category.id))) return false
    if (filters.location) {
      const loc = filters.location.toLowerCase()
      const hit = b.county?.toLowerCase().includes(loc) || b.city?.toLowerCase().includes(loc)
      if (!hit) return false
    }
    return true
  })
  return rank(matched, tokens, haystackOf)
}

export function filterProducts(items: ProductDto[], tokens: string[], filters: SearchFilters): ProductDto[] {
  const haystackOf = (p: ProductDto) => [
    p.name,
    p.description,
    p.category?.name,
    p.business.name,
    ...Object.values(p.specs),
  ]
  const matched = items.filter((p) => {
    if (!matchesTokens(haystackOf(p), tokens)) return false
    if (filters.categoryIds.size > 0 && !(p.category && filters.categoryIds.has(p.category.id))) return false
    if (filters.location) {
      const loc = filters.location.toLowerCase()
      const hit = p.county?.toLowerCase().includes(loc) || p.city?.toLowerCase().includes(loc)
      if (!hit) return false
    }
    const min = filters.priceMin ? Number(filters.priceMin) : null
    const max = filters.priceMax ? Number(filters.priceMax) : null
    const priceMax = p.price_max !== null ? Number(p.price_max) : null
    const priceMin = p.price_min !== null ? Number(p.price_min) : null
    if (min !== null && priceMax !== null && priceMax < min) return false
    if (max !== null && priceMin !== null && priceMin > max) return false
    return true
  })
  return rank(matched, tokens, haystackOf)
}

/**
 * Videos stay on fixture data (no real video backend yet — see
 * VideoFeed.tsx) and use category *names* rather than ids, since the fixture
 * shape predates the real Category model.
 */
export function filterVideos(items: Video[], tokens: string[], selectedCategoryNames: string[]): Video[] {
  const haystackOf = (v: Video) => [v.title, v.category, v.creator]
  const matched = items.filter((v) => {
    if (!matchesTokens(haystackOf(v), tokens)) return false
    if (selectedCategoryNames.length > 0) {
      const category = v.category.toLowerCase()
      if (!selectedCategoryNames.some((name) => category.includes(name))) return false
    }
    return true
  })
  return rank(matched, tokens, haystackOf)
}
