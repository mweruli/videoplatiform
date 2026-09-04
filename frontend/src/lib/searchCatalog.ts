import type { BusinessDto, CampaignTargetingDto, ProductDto } from './api'
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

/**
 * Does this campaign's targeting earn the Sponsored tie-break in the
 * viewer's CURRENT browse/search context — never the item's own organic
 * category(ies)/location. See docs/decisions.md's "Phase 1b design pass:
 * self-serve advertiser campaign manager" entry, "What 'matches the
 * category/location the user is browsing' means, precisely" subsection,
 * which this implements verbatim:
 *
 * - `category_id: null` matches any context; a specific `category_id` only
 *   matches when the viewer currently has that category selected in
 *   `SearchFilters.categoryIds` (Search's category filter chips / Home's
 *   `?category=` link resolved into the same filter — see Search.tsx).
 * - `county: null` matches any context; a specific `county` only matches
 *   when the viewer's free-text `SearchFilters.location` is currently set
 *   AND names that county — same substring-match direction (does the
 *   county's full name contain what the viewer typed) as this file's own
 *   organic county/city location filter just above, for consistency.
 *
 * This function is deliberately only ever consulted from `rank()`'s
 * tie-break, AFTER `matchesTokens`/the category/location filters have
 * already decided whether an item is in the result set at all — it must
 * never be used to decide inclusion itself, which is exactly what would
 * turn a targeted tie-break into injecting irrelevant results.
 */
function campaignMatchesContext(campaign: CampaignTargetingDto, filters: SearchFilters): boolean {
  const categoryMatches = campaign.category_id === null || filters.categoryIds.has(campaign.category_id)
  const trimmedLocation = filters.location.trim().toLowerCase()
  const locationMatches =
    campaign.county === null || (trimmedLocation !== '' && campaign.county.toLowerCase().includes(trimmedLocation))
  return categoryMatches && locationMatches
}

/** OR of the two "is this sponsored" signals (manual `is_featured` and a context-matching active ad campaign) feeding the one shared Sponsored badge/tie-break — see docs/decisions.md: "the frontend's tie-break logic should simply OR the two signals together, not present them differently." */
export function isBusinessSponsored(business: BusinessDto, filters: SearchFilters): boolean {
  return business.is_featured || (business.active_campaign !== null && campaignMatchesContext(business.active_campaign, filters))
}

export function isProductSponsored(product: ProductDto, filters: SearchFilters): boolean {
  return product.is_featured || (product.active_campaign !== null && campaignMatchesContext(product.active_campaign, filters))
}

/**
 * The id of the active campaign actually responsible for a Sponsored render
 * in the current context, or `null` if this item either isn't sponsored at
 * all or is only sponsored via `is_featured` (no campaign involved). Used to
 * decide which campaign ids get an impression/click recorded — deliberately
 * NOT the same condition as `isBusiness/ProductSponsored` above, since a
 * campaign that exists but doesn't match the current context must never be
 * billed for an impression it didn't actually earn, even if the item is
 * separately sponsored via `is_featured`.
 */
export function matchingActiveCampaignId(
  target: { active_campaign: CampaignTargetingDto | null },
  filters: SearchFilters,
): string | null {
  const campaign = target.active_campaign
  if (!campaign) return null
  return campaignMatchesContext(campaign, filters) ? campaign.campaign_id : null
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
  return rank(matched, tokens, haystackOf, (b) => isBusinessSponsored(b, filters))
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
  return rank(matched, tokens, haystackOf, (p) => isProductSponsored(p, filters))
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
