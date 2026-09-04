import { Link } from 'react-router-dom'

import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { SponsoredTag } from '../ui/Tags'
import Icon from '../icons/Icon'
import { toCompareProduct, useCompare } from '../../lib/compare'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { formatPriceRange } from '../../lib/format'
import type { ProductDto } from '../../lib/api'

interface ProductResultCardProps {
  product: ProductDto
}

const firstSpec = (specs: Record<string, string>): string | null => {
  const entry = Object.entries(specs)[0]
  return entry ? `${entry[0]}: ${entry[1]}` : null
}

export default function ProductResultCard({ product }: ProductResultCardProps) {
  const { isSelected, toggle } = useCompare()
  const spec = firstSpec(product.specs)
  const added = isSelected(product.id)

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
        <div className="flex items-center justify-between gap-2">
          <Link to={`/product/${product.slug}`} className="block min-w-0 truncate text-[0.9rem] font-bold text-foreground">
            {product.name}
          </Link>
          {product.is_featured && <SponsoredTag className="flex-none" />}
        </div>
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
            onClick={() => toggle(toCompareProduct(product))}
            aria-pressed={added}
            className={`inline-flex flex-none items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ease-brand ${
              added
                ? 'border-brand bg-brand/10 text-brand dark:border-brand dark:bg-brand/20 dark:text-ice'
                : 'border-border text-foreground hover:border-brand hover:text-brand dark:hover:text-ice'
            }`}
          >
            <Icon name={added ? 'check' : 'plus'} size={11} /> {added ? 'Added' : 'Compare'}
          </button>
        </div>
      </div>
    </div>
  )
}
