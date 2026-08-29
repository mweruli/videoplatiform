import SectionHeading from '../ui/SectionHeading'
import BusinessCard from './BusinessCard'
import { bizById } from '../../data/businesses'
import { FEATURED_BIZ_ORDER } from '../../data/home'
import { GRAIN_TEXTURE } from '../../lib/thumbTreatment'

/**
 * The dark "digital showroom" band — restores the brand doc's alternating
 * dark/light section rhythm rather than letting the page read as one flat
 * scroll. Uses the fixed `ink` token (not the theme-flipping `foreground`),
 * so it stays a deliberate dark accent in both light and dark app themes.
 */
export default function FeaturedBusinesses() {
  const businesses = FEATURED_BIZ_ORDER.map(bizById).filter((b): b is NonNullable<typeof b> => Boolean(b))

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
      <div className="no-scrollbar relative z-10 flex gap-3 overflow-x-auto px-5 pb-1.5 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-14">
        {businesses.map((business) => (
          <BusinessCard key={business.id} business={business} tone="onDark" />
        ))}
      </div>
    </section>
  )
}
