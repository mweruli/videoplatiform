import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import BusinessResultCard from '../components/search/BusinessResultCard'
import FilterPanel from '../components/search/FilterPanel'
import ProductResultCard from '../components/search/ProductResultCard'
import TabsRow from '../components/search/TabsRow'
import type { SearchTab } from '../components/search/TabsRow'
import VideoResultCard from '../components/search/VideoResultCard'
import { cloneFilters, emptyFilters, filtersActiveCount } from '../components/search/filterState'
import type { SearchFilters } from '../components/search/filterState'
import BottomSheet from '../components/ui/BottomSheet'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import Icon from '../components/icons/Icon'
import { useAllBusinesses, useAllProducts, useCategories } from '../hooks/useCatalog'
import { SEARCH_SUGGESTIONS } from '../data/home'
import { VIDEOS } from '../data/videos'
import { filterBusinesses, filterProducts, filterVideos } from '../lib/searchCatalog'
import { tokenize } from '../lib/searchMatch'

/** How long to wait after the visitor stops typing before a live search re-runs — long enough to not thrash on every keystroke, short enough to feel instant. Submitting the form (Enter/tap Search) still applies immediately, bypassing this. */
const SEARCH_DEBOUNCE_MS = 280

/**
 * Search & Discovery — unified results across businesses and products (real
 * backend: GET /businesses, GET /products, GET /categories) plus videos
 * (fixture data — no video backend yet, see VideoFeed.tsx). There's no
 * search-indexing service wired up yet either (Meilisearch lands Sprint 4
 * per DEVELOPMENT_PLAN.md), so this fetches one full page from each real
 * endpoint and matches/ranks client-side — see src/lib/searchCatalog.ts.
 *
 * Businesses/products carry a real `is_featured` flag now (see
 * docs/decisions.md's "Phase 1a: manual featured placement" entry) —
 * BusinessResultCard/ProductResultCard show the same amber SponsoredTag used
 * elsewhere for that flag, and lib/searchCatalog.ts's `rank()` gives featured
 * items a same-relevance-tier ranking boost (documented there). Videos stay
 * fixture-only (a fixture `sponsored` flag) since there's no video backend
 * field or endpoint for it yet.
 */
export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialQuery] = useState(() => searchParams.get('q') ?? '')
  const [initialCategoryParam] = useState(() => searchParams.get('category'))

  const [queryInput, setQueryInput] = useState(initialQuery)
  const [activeQuery, setActiveQuery] = useState(initialQuery)
  const [activeTab, setActiveTab] = useState<SearchTab>('all')
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(emptyFilters)
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(emptyFilters)
  const [sheetOpen, setSheetOpen] = useState(false)
  const appliedInitialCategory = useRef(false)

  const categoriesQuery = useCategories()
  const businessesQuery = useAllBusinesses()
  const productsQuery = useAllProducts()

  // Resolve Home's `?category=<slug>` link (CategoryChip/CategoryTile) to a
  // real backend category id, once categories have loaded. A handful of
  // fixture category ids don't match the seeded slug 1:1 (e.g. 'beauty' vs
  // 'beauty-lifestyle') — prefix-match covers those without hardcoding a
  // translation table that would silently rot if either list changes.
  useEffect(() => {
    if (appliedInitialCategory.current || !initialCategoryParam || !categoriesQuery.data) return
    const param = initialCategoryParam.toLowerCase()
    const match =
      categoriesQuery.data.find((c) => c.slug === param) ??
      categoriesQuery.data.find((c) => c.slug.startsWith(param))
    if (match) {
      const apply = (f: SearchFilters) => ({ ...cloneFilters(f), categoryIds: new Set([match.id]) })
      setAppliedFilters(apply)
      setDraftFilters(apply)
    }
    appliedInitialCategory.current = true
  }, [categoriesQuery.data, initialCategoryParam])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = queryInput.trim()
    setActiveQuery(trimmed)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (trimmed) next.set('q', trimmed)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }

  // Live search: re-run automatically shortly after the visitor stops
  // typing, rather than only on Enter/submit. Bails out immediately once
  // `queryInput` already matches `activeQuery` (e.g. right after
  // handleSubmit/runSuggestion already applied it), so this never fights
  // with — or double-fires behind — an explicit submit.
  useEffect(() => {
    const trimmed = queryInput.trim()
    if (trimmed === activeQuery) return
    const timeout = window.setTimeout(() => {
      setActiveQuery(trimmed)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (trimmed) next.set('q', trimmed)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput, activeQuery])

  function runSuggestion(suggestion: string) {
    setQueryInput(suggestion)
    setActiveQuery(suggestion)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('q', suggestion)
      return next
    })
  }

  const tokens = useMemo(() => tokenize(activeQuery), [activeQuery])

  const locations = useMemo(() => {
    const set = new Set<string>()
    for (const b of businessesQuery.data?.items ?? []) if (b.county) set.add(b.county)
    for (const p of productsQuery.data?.items ?? []) if (p.county) set.add(p.county)
    if (set.size === 0) return ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret']
    return Array.from(set).sort()
  }, [businessesQuery.data, productsQuery.data])

  const selectedCategoryNames = useMemo(() => {
    if (!categoriesQuery.data) return []
    return categoriesQuery.data
      .filter((c) => appliedFilters.categoryIds.has(c.id))
      .map((c) => c.name.toLowerCase())
  }, [categoriesQuery.data, appliedFilters.categoryIds])

  const businesses = useMemo(
    () => filterBusinesses(businessesQuery.data?.items ?? [], tokens, appliedFilters),
    [businessesQuery.data, tokens, appliedFilters],
  )
  const products = useMemo(
    () => filterProducts(productsQuery.data?.items ?? [], tokens, appliedFilters),
    [productsQuery.data, tokens, appliedFilters],
  )
  const videos = useMemo(
    () => filterVideos(VIDEOS, tokens, selectedCategoryNames),
    [tokens, selectedCategoryNames],
  )

  const counts: Record<SearchTab, number> = {
    all: businesses.length + products.length + videos.length,
    businesses: businesses.length,
    products: products.length,
    videos: videos.length,
  }

  const isLoading = businessesQuery.isLoading || productsQuery.isLoading
  const isError = businessesQuery.isError || productsQuery.isError

  function toggleCategory(id: number) {
    setDraftFilters((f) => {
      const next = cloneFilters(f)
      if (next.categoryIds.has(id)) next.categoryIds.delete(id)
      else next.categoryIds.add(id)
      return next
    })
  }
  function toggleLocation(location: string) {
    setDraftFilters((f) => ({ ...cloneFilters(f), location: f.location === location ? '' : location }))
  }
  function applyFilters() {
    setAppliedFilters(cloneFilters(draftFilters))
    setSheetOpen(false)
  }
  function resetFilters() {
    setDraftFilters(emptyFilters())
    setAppliedFilters(emptyFilters())
  }

  const showBusinesses = activeTab === 'all' || activeTab === 'businesses'
  const showProducts = activeTab === 'all' || activeTab === 'products'
  const showVideos = activeTab === 'all' || activeTab === 'videos'
  const hasAnyResults = counts.all > 0

  const emptyTitle = activeQuery
    ? `No results for "${activeQuery}"`
    : filtersActiveCount(appliedFilters) > 0
      ? 'Nothing matches these filters yet'
      : 'No results yet'

  const filterPanelProps = {
    categories: categoriesQuery.data ?? [],
    locations,
    draft: draftFilters,
    onToggleCategory: toggleCategory,
    onToggleLocation: toggleLocation,
    onPriceMinChange: (value: string) => setDraftFilters((f) => ({ ...cloneFilters(f), priceMin: value })),
    onPriceMaxChange: (value: string) => setDraftFilters((f) => ({ ...cloneFilters(f), priceMax: value })),
    onApply: applyFilters,
    onReset: resetFilters,
  }

  const activeFilterCount = filtersActiveCount(appliedFilters)

  return (
    <div>
      {/* Mobile sticky search header */}
      <div className="sticky top-0 z-30 border-b border-glass-border bg-glass px-5 pt-4 pb-3 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-2.5">
            <Icon name="search" size={16} className="flex-none text-muted-foreground" />
            <label htmlFor="search-input-mobile" className="sr-only">
              Search products, businesses, videos
            </label>
            <input
              id="search-input-mobile"
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search products, businesses, videos…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Filters"
            className="relative flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-border bg-surface text-foreground transition-colors duration-150 ease-brand hover:border-teal"
          >
            <Icon name="filter" size={17} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber text-[9px] font-extrabold text-amber-ink">
                {activeFilterCount}
              </span>
            )}
          </button>
        </form>
        <div className="mt-3">
          <TabsRow active={activeTab} counts={counts} onChange={setActiveTab} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 py-5 lg:px-14 lg:py-8">
        {/* Desktop header */}
        <div className="mb-6 hidden lg:block">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.18em] text-muted-foreground uppercase">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber" aria-hidden="true" />
            Search &amp; discovery
          </div>
          <h1 className="font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-foreground">
            {activeQuery ? `Results for "${activeQuery}"` : 'Search products, businesses & videos'}
          </h1>
          <form onSubmit={handleSubmit} className="mt-4 flex max-w-xl items-center gap-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-soft">
              <Icon name="search" size={16} className="flex-none text-muted-foreground" />
              <label htmlFor="search-input-desktop" className="sr-only">
                Search products, businesses, videos
              </label>
              <input
                id="search-input-desktop"
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search products, businesses, videos…"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              className="flex-none rounded-2xl bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-5 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
            >
              Search
            </button>
          </form>
          <div className="mt-5">
            <TabsRow active={activeTab} counts={counts} onChange={setActiveTab} />
          </div>
        </div>

        <div className="lg:flex lg:items-start lg:gap-8">
          <aside className="hidden lg:block lg:w-72 lg:flex-none">
            <div className="sticky top-24 rounded-2xl border border-border bg-surface p-5 shadow-soft">
              <FilterPanel {...filterPanelProps} />
            </div>
          </aside>

          <div className="mt-4 min-w-0 flex-1 lg:mt-0">
            {isError ? (
              <EmptyState
                tone="error"
                title="Couldn't load results"
                subtitle="The catalog service didn't respond. Check your connection and try again."
              >
                <button
                  type="button"
                  onClick={() => {
                    businessesQuery.refetch()
                    productsQuery.refetch()
                  }}
                  className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
                >
                  Try again
                </button>
              </EmptyState>
            ) : isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-[100px]" />
                <Skeleton className="h-[100px]" />
                <Skeleton className="h-[100px]" />
              </div>
            ) : !hasAnyResults ? (
              <EmptyState icon="🔍" title={emptyTitle} subtitle="Try one of these, or browse a category from the home screen.">
                {SEARCH_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => runSuggestion(s)}
                    className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors duration-150 ease-brand hover:border-teal"
                  >
                    {s}
                  </button>
                ))}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-6">
                {showBusinesses && businesses.length > 0 && (
                  <section className="flex flex-col gap-3">
                    {activeTab === 'all' && (
                      <h2 className="text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
                        Businesses
                      </h2>
                    )}
                    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
                      {businesses.map((b) => (
                        <BusinessResultCard key={b.id} business={b} />
                      ))}
                    </div>
                  </section>
                )}
                {showProducts && products.length > 0 && (
                  <section className="flex flex-col gap-3">
                    {activeTab === 'all' && (
                      <h2 className="text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
                        Products
                      </h2>
                    )}
                    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
                      {products.map((p) => (
                        <ProductResultCard key={p.id} product={p} />
                      ))}
                    </div>
                  </section>
                )}
                {showVideos && videos.length > 0 && (
                  <section className="flex flex-col gap-3">
                    {activeTab === 'all' && (
                      <h2 className="text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
                        Videos
                      </h2>
                    )}
                    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
                      {videos.map((v) => (
                        <VideoResultCard key={v.id} video={v} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter results">
        <FilterPanel {...filterPanelProps} />
      </BottomSheet>
    </div>
  )
}
