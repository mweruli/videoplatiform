import { Link } from 'react-router-dom'

import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { SponsoredTag } from '../ui/Tags'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import type { BusinessDto } from '../../lib/api'

interface BusinessResultCardProps {
  business: BusinessDto
}

function locationLabel(business: BusinessDto): string | null {
  return [business.city, business.county].filter(Boolean).join(', ') || null
}

export default function BusinessResultCard({ business }: BusinessResultCardProps) {
  const location = locationLabel(business)
  const initial = business.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <Link
      to={`/business/${business.slug}`}
      className="group flex gap-3.5 rounded-2xl border border-border bg-surface p-3 shadow-soft transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span
        className="relative h-[76px] w-[76px] flex-none overflow-hidden rounded-xl text-xl font-bold text-white"
        style={{ backgroundImage: gradientFor(gradIndexForId(business.id)) }}
        aria-hidden="true"
      >
        <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        {business.logo_url ? (
          <img src={business.logo_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">{initial}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[0.9rem] font-bold text-foreground">{business.name}</span>
            <VerificationStatusBadge status={business.verification_status} />
          </div>
          {business.is_featured && <SponsoredTag className="flex-none" />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[business.category?.name, location].filter(Boolean).join(' · ') || 'Business'}
        </p>
        {business.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{business.description}</p>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {business.product_count} {business.product_count === 1 ? 'product' : 'products'}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-brand dark:text-ice">
            Visit showroom
            <span className="inline-block transition-transform duration-150 ease-brand group-hover:translate-x-0.5 motion-reduce:transition-none">
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  )
}
