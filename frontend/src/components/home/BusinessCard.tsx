import Stars from '../ui/Stars'
import VerifiedBadge from '../ui/VerifiedBadge'
import { FeaturedTag } from '../ui/Tags'
import { gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import type { Business } from '../../data/types'
import { useToast } from '../../lib/toast'

interface BusinessCardProps {
  business: Business
  /** 'onDark' = frosted-glass variant for the dark "showroom" band. */
  tone?: 'light' | 'onDark'
}

/**
 * Business profile pages aren't built yet (later session per the brief) —
 * this stays a real, keyboard-operable button with honest feedback rather
 * than a dead link or a fake href.
 */
export default function BusinessCard({ business, tone = 'light' }: BusinessCardProps) {
  const { showToast } = useToast()
  const onDark = tone === 'onDark'

  return (
    <button
      type="button"
      onClick={() => showToast('Business profiles are coming in the next release')}
      className={`group relative w-[180px] flex-none rounded-2xl border p-3.5 text-left transition-[transform,box-shadow,background-color,border-color] duration-150 ease-brand hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:w-full ${
        onDark
          ? 'border-white/15 bg-white/[0.06] shadow-[0_12px_28px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md hover:border-amber/40 hover:bg-white/[0.09]'
          : 'border-border bg-surface shadow-soft hover:shadow-elevated'
      }`}
    >
      {business.featured && (
        <span className="absolute top-2.5 right-2.5">
          {onDark ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber/40 bg-amber/15 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-amber uppercase">
              <span className="h-[5px] w-[5px] flex-none rounded-full bg-amber" />
              Featured
            </span>
          ) : (
            <FeaturedTag />
          )}
        </span>
      )}

      <span
        className="relative mb-2.5 flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-xl text-[1.3rem] text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]"
        style={{ backgroundImage: gradientFor(business.grad) }}
        aria-hidden="true"
      >
        <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        <span className="relative">{business.icon}</span>
      </span>

      <span className={`flex items-center gap-1.5 text-[0.86rem] leading-tight font-bold ${onDark ? 'text-ice' : 'text-foreground'}`}>
        {business.name}
        <VerifiedBadge business={business} />
      </span>
      <span className={`mt-1 block text-xs ${onDark ? 'text-ice/60' : 'text-muted-foreground'}`}>
        {business.categories[0]} · {business.location}
      </span>
      <span className={`mt-1.5 flex items-center gap-1.5 text-xs ${onDark ? 'text-ice/60' : 'text-muted-foreground'}`}>
        <Stars rating={business.rating} />
        {business.rating}
      </span>
    </button>
  )
}
