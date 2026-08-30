import { useLocation } from 'react-router-dom'

import Icon from '../icons/Icon'
import { useCompare } from '../../lib/compare'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'

/**
 * Persistent floating "Compare (N)" pill — appears once 1+ products are
 * selected, visible across screens (not just the page a product was added
 * from), matching docs/design/prototype-v1.html's `renderCompareTray`.
 * Mounted once in components/Layout.tsx so it survives navigation between
 * Search/Product detail/Business profile/Home.
 *
 * Hidden on the Shorts feed — that's a full-bleed vertical video surface
 * with its own dense bottom-right rail (FeedSlide.tsx), and videos aren't a
 * comparable entity, so a floating pill there would just be visual noise.
 * Raised clear of Product detail's mobile sticky "Contact supplier" bar
 * (ProductDetail.tsx) so the two never overlap.
 */
export default function CompareTray() {
  const { items, count, openSheet, clear } = useCompare()
  const { pathname } = useLocation()

  if (pathname.startsWith('/feed') || count === 0) return null

  const raised = pathname.startsWith('/product/')

  return (
    <div
      className={`fixed inset-x-4 z-[80] flex justify-center transition-transform duration-300 ease-brand motion-reduce:transition-none sm:inset-x-auto sm:right-auto sm:left-5 lg:left-8 lg:bottom-8 ${
        raised
          ? 'bottom-[calc(100px_+_env(safe-area-inset-bottom))]'
          : 'bottom-[calc(90px_+_env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="flex items-center gap-1 rounded-full border border-amber/30 bg-gradient-to-br from-ink-light to-ink py-1.5 pr-1.5 pl-3 text-ice shadow-elevated">
        <span className="flex -space-x-2.5" aria-hidden="true">
          {items.slice(0, 3).map((p) => (
            <span
              key={p.id}
              className="relative h-6 w-6 flex-none overflow-hidden rounded-full border-2 border-ink"
              style={{ backgroundImage: gradientFor(gradIndexForId(p.id)) }}
            >
              <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
              {p.primary_image_url && (
                <img src={p.primary_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={openSheet}
          className="flex items-center gap-1.5 rounded-full py-1 pr-2 pl-2 text-sm font-bold transition-colors duration-150 ease-brand hover:bg-white/10"
        >
          Compare <b className="text-amber">({count})</b>
          <Icon name="chevronRight" size={14} />
        </button>
        <button
          type="button"
          onClick={clear}
          aria-label="Clear comparison"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-ice/70 transition-colors duration-150 ease-brand hover:bg-white/10 hover:text-ice"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  )
}
