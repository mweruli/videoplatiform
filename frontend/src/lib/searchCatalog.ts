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

/**
 * Judgment call (documented per docs/PROJECT_BRIEF.md's manual-featured-
 * placement scope, no explicit spec either way): featured/sponsored items
 * get a same-relevance-tier ranking boost, not just a visual badge. Rationale
 * — DEVELOPMENT_PLAN.md itself describes this feature as "manual 'featured'
 * placement, clearly labelled sponsored," and a sponsored placement that
 * never actually surfaces any higher than an identical organic result isn't
 * really a placement, just a label. This is a *tie-break*, not a relevance
 * override: a featured item never outranks a genuinely better keyword match
 * (score is still primary whenever there's an active query), it only wins
 * ties within the same score bucket — including the "no query yet" browse
 * case, where every item ties at score 0 and this is the only ordering
 * signal beyond the API's own return order. `Array.sort` is stable, so
 * non-featured items keep their relative order among themselves either way.
 */
function rank<T>(
  items: T[],
  tokens: string[],
  haystackOf: (item: T) => (string | null | undefined)[],
  isFeaturedOf: (item: T) => boolean = () => false,
): T[] {
  const withScore = items.map((item) => ({
    item,
    score: scoreTokens(haystackOf(item), tokens),
    featured: isFeaturedOf(item),
  }))
  return withScore
    .sort((a, b) => {
      const scoreDiff = b.score - a.score
      if (scoreDiff !== 0) return scoreDiff
      if (a.featured !== b.featured) return a.featured ? -1 : 1
      return 0
    })
    .map((x) => x.item)
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
  return rank(matched, tokens, haystackOf, (b) => b.is_featured)
}

export function filterProducts(items: ProductDto[], tokens: string[], filters: SearchFilters): ProductDto[] {
  const haystackOf = (p: ProductDto) => [
    p.name,
    p.description,
    ...p.categories.map((c) => c.name),
    p.business.name,
    ...Object.values(p.specs),
  ]
  const matched = items.filter((p) => {
    if (!matchesTokens(haystackOf(p), tokens)) return false
    // A product with 2+ categories matches a category filter on ANY one of them — mirrors the backend's
    // GET /products?category_id= "has this category among its categories" semantics (docs/decisions.md).
    if (filters.categoryIds.size > 0 && !p.categories.some((c) => filters.categoryIds.has(c.id))) return false
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
  return rank(matched, tokens, haystackOf, (p) => p.is_featured)
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
