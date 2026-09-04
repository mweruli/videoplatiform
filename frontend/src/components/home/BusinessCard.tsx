import { Link } from 'react-router-dom'

import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { FeaturedTag } from '../ui/Tags'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import type { BusinessDto } from '../../lib/api'

interface BusinessCardProps {
  business: BusinessDto
  /** 'onDark' = frosted-glass variant for the dark "showroom" band. */
  tone?: 'light' | 'onDark'
}

function locationLabel(business: BusinessDto): string | null {
  return [business.city, business.county].filter(Boolean).join(', ') || null
}

/**
 * Real business card for Home's featured rail (GET /api/v1/businesses —
 * verified/active only, backend-enforced). `is_featured` is a real
 * platform-controlled flag now (docs/decisions.md's "Phase 1a: manual
 * featured placement" entry) — every row this card renders on
 * FeaturedBusinesses.tsx's rail is featured by construction (the query
 * itself filters to `is_featured=true`), so the badge is shown
 * unconditionally there; it's still gated on the flag here (rather than
 * always-on) so this card stays correct if it's ever reused somewhere that
 * mixes featured and non-featured businesses. Verified-status badge is real.
 */
export default function BusinessCard({ business, tone = 'light' }: BusinessCardProps) {
  const onDark = tone === 'onDark'
  const location = locationLabel(business)
  const initial = business.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <Link
      to={`/business/${business.slug}`}
      className={`group relative w-[180px] flex-none rounded-2xl border p-3.5 text-left transition-[transform,box-shadow,background-color,border-color] duration-150 ease-brand hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:w-full ${
        onDark
          ? 'border-white/15 bg-white/[0.06] shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md hover:border-amber/40 hover:bg-white/[0.09]'
          : 'border-border bg-surface shadow-soft hover:shadow-elevated'
      }`}
    >
      {business.is_featured && (
        <span className="absolute top-2.5 right-2.5 z-10">
          <FeaturedTag tone={onDark ? 'onDark' : 'default'} />
        </span>
      )}
      <span
        className="relative mb-2.5 flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-xl text-[1.1rem] font-bold text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]"
        style={{ backgroundImage: gradientFor(gradIndexForId(business.id)) }}
        aria-hidden="true"
      >
        <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        {business.logo_url ? (
          <img src={business.logo_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="relative">{initial}</span>
        )}
      </span>

      <span className={`flex items-center gap-1.5 text-[0.86rem] leading-tight font-bold ${onDark ? 'text-ice' : 'text-foreground'}`}>
        <span className="truncate">{business.name}</span>
        <VerificationStatusBadge status={business.verification_status} />
      </span>
      <span className={`mt-1 block truncate text-xs ${onDark ? 'text-ice/60' : 'text-muted-foreground'}`}>
        {[business.category?.name, location].filter(Boolean).join(' · ') || 'Business'}
      </span>
      <span className={`mt-1.5 block text-xs font-semibold ${onDark ? 'text-ice/60' : 'text-muted-foreground'}`}>
        {business.product_count} {business.product_count === 1 ? 'product' : 'products'}
      </span>
    </Link>
  )
}
