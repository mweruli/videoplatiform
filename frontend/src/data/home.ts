/**
 * Home-screen-specific ordering/curation of the shared fixtures — ported
 * from the approved prototype's FEED_ORDER/TRENDING_ORDER/FEATURED_BIZ_ORDER/
 * HOME_CATS/SUGGESTIONS constants. Kept separate from the raw entity fixtures
 * since "what shows on Home, in what order" is presentation curation, not
 * source data (a rule-based/recommendation engine replaces this ordering
 * later per DEVELOPMENT_PLAN.md, without touching the entity fixtures).
 */
export const TRENDING_ORDER: string[] = ['v1', 'v2', 'v3', 'v7']

/** Full Shorts feed order — ported from the approved prototype's FEED_ORDER. */
export const FEED_ORDER: string[] = ['v3', 'v1', 'v5', 'v2', 'v6', 'v4', 'v7']

export const FEATURED_BIZ_ORDER: string[] = ['solaris', 'aquatank', 'sunflow', 'nairobisteel']

export const HOME_CATEGORY_ORDER: string[] = [
  'manufacturing',
  'agriculture',
  'construction',
  'energy',
  'automotive',
  'health',
  'technology',
  'retail',
  'beauty',
  'diy',
]

export const SEARCH_SUGGESTIONS: string[] = [
  'water tank suppliers near Nairobi',
  'solar irrigation systems',
  'steel fabricators',
  'car spare parts Mombasa',
]

export const PLATFORM_STATS: { value: string; label: string }[] = [
  { value: '1,240+', label: 'Verified businesses' },
  { value: '8,600+', label: 'Product listings' },
  { value: '18', label: 'Categories live' },
]
