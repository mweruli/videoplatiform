import CategoryGrid from '../components/home/CategoryGrid'
import CategoryRail from '../components/home/CategoryRail'
import FeaturedBusinesses from '../components/home/FeaturedBusinesses'
import Hero from '../components/home/Hero'
import StatsBand from '../components/home/StatsBand'
import TrendingVideos from '../components/home/TrendingVideos'

/**
 * Home screen — matches the approved prototype (docs/design/prototype-v1.html,
 * commit dff26d9) at both the mobile and >=1024px desktop breakpoints. Data
 * is the prototype's fixtures (src/data/*) until the Search/Business/Product
 * endpoints land; ordering/curation lives in src/data/home.ts.
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
