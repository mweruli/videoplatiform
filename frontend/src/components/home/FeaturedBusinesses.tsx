import SectionHeading from '../ui/SectionHeading'
import Skeleton from '../ui/Skeleton'
import BusinessCard from './BusinessCard'
import { useFeaturedBusinesses } from '../../hooks/useCatalog'
import { GRAIN_TEXTURE } from '../../lib/thumbTreatment'

/** Loading-state skeleton count only — not a claim about how many featured
 * businesses actually exist (that's whatever the API returns, could be
 * fewer). */
const SKELETON_COUNT = 4

/**
 * The dark "digital showroom" band — restores the brand doc's alternating
 * dark/light section rhythm rather than letting the page read as one flat
 * scroll.
 *
 * Real featured businesses now (`GET /api/v1/businesses?is_featured=true`,
 * verified+active only, backend-enforced) — see docs/decisions.md's "Phase
 * 1a: manual featured placement" entry. This is the platform-curated set
 * only; it does NOT pad with non-featured rows if fewer than 4 come back
 * (currently just Solaris Power Kenya), so the rail can legitimately render
 * 1–N cards.
 */
export default function FeaturedBusinesses() {
  const businessesQuery = useFeaturedBusinesses()
  const businesses = businessesQuery.data?.items ?? []

  return (
    <section
      className="relative overflow-hidden py-7 lg:py-11"
      style={{
        background: 'radial-gradient(circle at 85% 0%, rgba(28,138,168,.4), transparent 45%), linear-gradient(180deg, #070A12, var(--color-ink) 60%, #070A12)',
      }}
    >
      <div className="absolute inset-0 opacity-45 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} aria-hidden="true" />
      <div className="relative z-10 mb-4 px-5 lg:px-14">
        <SectionHeading eyebrow="Digital showrooms" title="Featured businesses" tone="onDark" />
      </div>

      {businessesQuery.isLoading ? (
        <div className="relative z-10 flex gap-3 px-5 lg:grid lg:grid-cols-4 lg:gap-5 lg:px-14">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <Skeleton key={i} className="h-[132px] w-[180px] flex-none bg-white/[0.06] lg:w-full" />
          ))}
        </div>
      ) : businessesQuery.isError ? (
        <div className="relative z-10 px-5 lg:px-14">
          <p className="text-sm text-ice/60">Couldn&apos;t load featured businesses right now.</p>
          <button
            type="button"
            onClick={() => businessesQuery.refetch()}
            className="mt-3 rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-ice transition-colors duration-150 ease-brand hover:border-amber/50"
          >
            Try again
          </button>
        </div>
      ) : businesses.length === 0 ? (
        <div className="relative z-10 px-5 lg:px-14">
          <p className="text-sm text-ice/60">
            No featured businesses right now — check back soon.
          </p>
        </div>
      ) : (
        <div className="no-scrollbar relative z-10 flex gap-3 overflow-x-auto px-5 pb-1.5 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-14">
          {businesses.map((business) => (
            <BusinessCard key={business.id} business={business} tone="onDark" />
          ))}
        </div>
      )}
    </section>
  )
}
