/**
 * Home-screen-specific ordering/curation. Categories and featured businesses
 * are real API data now (useCatalog.ts) — FEATURED_BIZ_ORDER and
 * HOME_CATEGORY_ORDER (which referenced fixture ids) are gone; see
 * FeaturedBusinesses.tsx and CategoryRail.tsx for how each now
 * selects/curates real rows instead. TRENDING_ORDER is gone too —
 * TrendingVideos.tsx reads the real GET /videos feed directly now.
 */

/** Full Shorts feed order — ported from the approved prototype's FEED_ORDER. */
export const FEED_ORDER: string[] = ['v3', 'v1', 'v5', 'v2', 'v6', 'v4', 'v7']

/**
 * Curated subset of real category slugs shown in the mobile rail (the full
 * 18 live in CategoryGrid below). Slugs must match backend/app/db/seed.py's
 * slugify() output — 'beauty-lifestyle', not the old fixture id 'beauty'.
 */
export const HOME_CATEGORY_SLUGS: string[] = [
  'manufacturing',
  'agriculture',
  'construction',
  'energy',
  'automotive',
  'health',
  'technology',
  'retail',
  'beauty-lifestyle',
  'diy',
]

export const SEARCH_SUGGESTIONS: string[] = [
  'water tank suppliers near Nairobi',
  'solar irrigation systems',
  'steel fabricators',
  'car spare parts Mombasa',
]
