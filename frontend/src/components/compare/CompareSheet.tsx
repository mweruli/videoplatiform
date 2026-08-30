import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import Icon from '../icons/Icon'
import Modal from '../ui/Modal'
import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { AVAILABILITY_LABEL } from '../../lib/availability'
import { useCompare } from '../../lib/compare'
import { formatPriceRange } from '../../lib/format'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'

/**
 * Side-by-side comparison table — up to 3 products, opened from
 * CompareTray.tsx or the bottom-nav "Compare" tab (BottomNav.tsx). Rows are
 * price, then the union of every spec key across the selected products
 * (blank cell if a given product doesn't have that spec), then warranty,
 * availability, supplier and location — matching
 * docs/design/prototype-v1.html's `renderCompareSheet` table shape, adapted
 * to real ProductRead fields.
 *
 * No "Rating" row: unlike the prototype's fixture data, the real Business
 * model has no rating field yet (see BusinessProfile.tsx's own note on this)
 * — the Supplier row's verification badge is the closest real signal, so
 * fabricating a star rating here would be dishonest rather than a fair
 * design adaptation.
 */
export default function CompareSheet() {
  const { items, isSheetOpen, closeSheet, remove, clear } = useCompare()

  if (items.length === 0) {
    return (
      <Modal open={isSheetOpen} onClose={closeSheet} title="Compare products">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Add 2–3 products from any listing to compare price, specs and warranty side by side.
        </p>
      </Modal>
    )
  }

  const specKeys = Array.from(new Set(items.flatMap((p) => Object.keys(p.specs))))
  // Some listings already carry a "Warranty" entry inside `specs` (free-form,
  // business-authored) rather than the dedicated `warranty_terms` field —
  // e.g. the AquaTank seed data. Only add the dedicated Warranty row when it
  // would say something the spec union doesn't already cover, so the table
  // doesn't show two "Warranty" rows where one is just dashes.
  const hasWarrantySpec = specKeys.some((key) => key.trim().toLowerCase() === 'warranty')
  const hasWarrantyTerms = items.some((p) => p.warranty_terms)

  const rows: { label: string; render: (p: (typeof items)[number]) => ReactNode }[] = [
    { label: 'Price', render: (p) => <b className="text-foreground">{formatPriceRange(p.price_min, p.price_max, p.currency)}</b> },
    ...specKeys.map((key) => ({
      label: key,
      render: (p: (typeof items)[number]) => p.specs[key] ?? '—',
    })),
    ...(!hasWarrantySpec && hasWarrantyTerms
      ? [{ label: 'Warranty', render: (p: (typeof items)[number]) => p.warranty_terms ?? '—' }]
      : []),
    { label: 'Availability', render: (p) => AVAILABILITY_LABEL[p.availability_status] },
    {
      label: 'Supplier',
      render: (p) => (
        <Link
          to={`/business/${p.business.slug}`}
          onClick={closeSheet}
          className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline"
        >
          {p.business.name}
          <VerificationStatusBadge status={p.business.verification_status} />
        </Link>
      ),
    },
    {
      label: 'Location',
      render: (p) => [p.city, p.county].filter(Boolean).join(', ') || '—',
    },
  ]

  return (
    <Modal open={isSheetOpen} onClose={closeSheet} title="Compare products" widthClassName="lg:max-w-[760px]">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">{items.length} of 3 selected</p>

      <div className="no-scrollbar -mx-5 overflow-x-auto px-5 lg:mx-0 lg:px-0">
        <table className="w-full min-w-[460px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-24 flex-none bg-surface" aria-hidden="true" />
              {items.map((p) => (
                <th key={p.id} className="w-[140px] px-2 pb-3 text-left align-top">
                  <Link to={`/product/${p.slug}`} onClick={closeSheet} className="relative block h-16 w-full overflow-hidden rounded-xl">
                    <span className="absolute inset-0" style={{ backgroundImage: gradientFor(gradIndexForId(p.id)) }} aria-hidden="true">
                      <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
                    </span>
                    {p.primary_image_url && (
                      <img src={p.primary_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </Link>
                  <Link
                    to={`/product/${p.slug}`}
                    onClick={closeSheet}
                    className="mt-1.5 block line-clamp-2 text-xs leading-tight font-bold text-foreground"
                  >
                    {p.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-danger transition-opacity duration-150 ease-brand hover:opacity-75"
                  >
                    <Icon name="close" size={10} /> Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-surface py-2.5 pr-2 align-top text-xs font-bold whitespace-nowrap text-muted-foreground">
                  {row.label}
                </td>
                {items.map((p) => (
                  <td key={p.id} className="px-2 py-2.5 align-top text-foreground">
                    {row.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={clear}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
      >
        Clear all
      </button>
    </Modal>
  )
}
