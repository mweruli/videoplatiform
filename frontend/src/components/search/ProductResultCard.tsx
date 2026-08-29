import { Link } from 'react-router-dom'

import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import Icon from '../icons/Icon'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { formatPriceRange } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { ProductDto } from '../../lib/api'

interface ProductResultCardProps {
  product: ProductDto
}

const firstSpec = (specs: Record<string, string>): string | null => {
  const entry = Object.entries(specs)[0]
  return entry ? `${entry[0]}: ${entry[1]}` : null
}

/**
 * Compare is a separate module (manual product comparison, DEVELOPMENT_PLAN
 * Sprint 4) not built as part of this task — this button matches the app's
 * existing stub pattern (TopNav/BottomNav's "Compare" toast) rather than a
 * dead affordance or a half-built comparison tray.
 */
export default function ProductResultCard({ product }: ProductResultCardProps) {
  const { showToast } = useToast()
  const spec = firstSpec(product.specs)

  return (
    <div className="group flex gap-3.5 rounded-2xl border border-border bg-surface p-3 shadow-soft transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Link to={`/product/${product.slug}`} className="relative h-[76px] w-[76px] flex-none overflow-hidden rounded-xl">
        <span
          className="absolute inset-0"
          style={{ backgroundImage: gradientFor(gradIndexForId(product.id)) }}
          aria-hidden="true"
        >
          <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        </span>
        {product.primary_image_url && (
          <img
            src={product.primary_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/product/${product.slug}`} className="block truncate text-[0.9rem] font-bold text-foreground">
          {product.name}
        </Link>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          {product.business.name}
          <VerificationStatusBadge status={product.business.verification_status} />
        </p>
        <p className="mt-1 text-[0.95rem] font-extrabold text-foreground">
          {formatPriceRange(product.price_min, product.price_max, product.currency)}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{spec ?? ''}</span>
          <button
            type="button"
            onClick={() => showToast('Comparison lands in a later release — this is where you’ll add products to compare')}
            className="inline-flex flex-none items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-foreground transition-colors duration-150 ease-brand hover:border-brand hover:text-brand dark:hover:text-ice"
          >
            <Icon name="plus" size={11} /> Compare
          </button>
        </div>
      </div>
    </div>
  )
}
