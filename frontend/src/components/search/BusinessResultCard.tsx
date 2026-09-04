import { Link } from 'react-router-dom'

import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { SponsoredTag } from '../ui/Tags'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { recordCampaignClicks } from '../../lib/api'
import type { BusinessDto } from '../../lib/api'

interface BusinessResultCardProps {
  business: BusinessDto
  /** Whether the Sponsored badge/tie-break applies to this card in the CURRENT browse/search context — computed by the caller via lib/searchCatalog.ts's `isBusinessSponsored()` (ORs `is_featured` with a context-matching active ad campaign), not read directly off `business.is_featured` here, since campaign-driven sponsorship depends on the viewer's current filters, not just the business's own data. Defaults to `business.is_featured` for any caller that hasn't been updated to pass the real context (there are none left in this app, but this keeps the prop optional rather than a breaking API change). */
  sponsored?: boolean
  /** The active campaign actually responsible for `sponsored` being true in this context — see lib/searchCatalog.ts's `matchingActiveCampaignId()`. Null when this card isn't sponsored, or is sponsored via `is_featured` alone (no campaign to bill a click against). Fires `POST /campaigns/clicks` on click-through, fire-and-forget, same as the impression batch. */
  campaignId?: string | null
}

function locationLabel(business: BusinessDto): string | null {
  return [business.city, business.county].filter(Boolean).join(', ') || null
}

export default function BusinessResultCard({ business, sponsored = business.is_featured, campaignId = null }: BusinessResultCardProps) {
  const location = locationLabel(business)
  const initial = business.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <Link
      to={`/business/${business.slug}`}
      onClick={() => {
        if (campaignId) recordCampaignClicks([campaignId]).catch(() => {})
      }}
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
          {sponsored && <SponsoredTag className="flex-none" />}
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
