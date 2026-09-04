import Icon from '../icons/Icon'
import { FeaturedTag } from '../ui/Tags'
import { formatDate } from '../../lib/format'

interface FeatureCardProps {
  /** Which copy to show — a business features onto Home's rail + a Search badge; a product only gets the Search badge. */
  target: 'business' | 'product'
  isFeatured: boolean
  featuredUntil: string | null
  onOpen: () => void
  /**
   * Compact inline treatment for ProductManageCard's action row (a pill
   * matching Edit/Add photos/Remove) instead of the full explainer card used
   * on the Business Profile section — same state logic, different chrome so
   * it fits naturally into whichever surface it's rendered on.
   */
  variant?: 'card' | 'inline'
}

/**
 * Current-state-vs-CTA for self-serve featured placement (M-Pesa purchase
 * flow) — shared between the Business Profile section (variant="card") and
 * each product row in the Products section (variant="inline"). See
 * docs/decisions.md's "Phase 1b design pass: M-Pesa self-serve payments"
 * entry for what "featured" actually does: a business shows in Home's
 * Featured rail (components/home/FeaturedBusinesses.tsx) and both
 * businesses and products get a Sponsored badge in Search results
 * (components/search/BusinessResultCard.tsx / ProductResultCard.tsx).
 */
export default function FeatureCard({ target, isFeatured, featuredUntil, onOpen, variant = 'card' }: FeatureCardProps) {
  const benefitCopy =
    target === 'business'
      ? "Shows in Home's Featured rail and carries a Sponsored badge in Search results."
      : 'Carries a Sponsored badge in Search results, helping it stand out from organic listings.'

  if (variant === 'inline') {
    return isFeatured ? (
      <div className="flex items-center gap-2">
        <FeaturedTag />
        {featuredUntil && <span className="text-[11px] font-semibold text-muted-foreground">until {formatDate(featuredUntil)}</span>}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-amber hover:text-amber"
        >
          Extend
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-amber hover:text-amber"
      >
        <Icon name="sparkle" size={12} />
        Feature this product
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber/30 bg-amber/[0.06] p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-amber/15 text-amber">
          <Icon name="sparkle" size={14} />
        </span>
        <div>
          {isFeatured ? (
            <div className="flex flex-wrap items-center gap-2">
              <FeaturedTag />
              {featuredUntil ? (
                <span className="text-sm font-bold text-foreground">Featured until {formatDate(featuredUntil)}</span>
              ) : (
                <span className="text-sm font-bold text-foreground">Featured</span>
              )}
            </div>
          ) : (
            <p className="text-sm font-bold text-foreground">Feature your business</p>
          )}
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{benefitCopy}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex flex-none items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
      >
        {isFeatured ? 'Buy more time' : 'Feature your business'}
      </button>
    </div>
  )
}
