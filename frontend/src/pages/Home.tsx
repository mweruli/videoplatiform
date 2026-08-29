import CategoryGrid from '../components/home/CategoryGrid'
import CategoryRail from '../components/home/CategoryRail'
import FeaturedBusinesses from '../components/home/FeaturedBusinesses'
import Hero from '../components/home/Hero'
import StatsBand from '../components/home/StatsBand'
import TrendingVideos from '../components/home/TrendingVideos'

/**
 * Home screen — matches the approved prototype (docs/design/prototype-v1.html,
 * commit dff26d9) at both the mobile and >=1024px desktop breakpoints.
 *
 * Categories (CategoryRail/CategoryGrid) and featured businesses
 * (FeaturedBusinesses) are real backend data now, via the same
 * hooks/useCatalog.ts hooks Search.tsx uses — see those components for the
 * "no real `featured` field yet" substitute and loading/empty/error
 * handling. TrendingVideos is still fixture-backed (src/data/videos.ts) —
 * there is no video backend yet (see VideoFeed.tsx). Section
 * order/curation for the still-fixture-backed video rail lives in
 * src/data/home.ts.
 */
export default function Home() {
  return (
    <div>
      <Hero />
      <CategoryRail />
      <TrendingVideos />
      <FeaturedBusinesses />
      <CategoryGrid />
      <StatsBand />
      <div className="h-10 bg-ink lg:h-4" aria-hidden="true" />
    </div>
  )
}
