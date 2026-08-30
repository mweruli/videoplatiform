import { Link } from 'react-router-dom'

import Icon from '../icons/Icon'
import { useCompare } from '../../lib/compare'
import type { CompareProduct } from '../../lib/compare'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { formatPriceRange } from '../../lib/format'

/** Minimal shape both ProductDto and ProductSummaryDto satisfy structurally — this tile doesn't need the full product record. */
export interface ProductTileData {
  id: string
  slug: string
  name: string
  price_min: string | null
  price_max: string | null
  currency: string
  primary_image_url: string | null
}

interface ProductTileProps {
  product: ProductTileData
  /** Compact = smaller horizontal-rail card (used for "related products" and "more from this supplier"). */
  compact?: boolean
  /**
   * Full comparison snapshot — only passed by callers that have a full
   * ProductDto in hand (e.g. BusinessProfile's product grid). Compact rail
   * tiles are built from ProductSummaryDto (no specs/business on that type),
   * so they never render the Add-to-compare button regardless of `compact`.
   */
  compareProduct?: CompareProduct
}

export default function ProductTile({ product, compact, compareProduct }: ProductTileProps) {
  const { isSelected, toggle } = useCompare()
  const added = compareProduct ? isSelected(compareProduct.id) : false

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        compact ? 'w-[150px] flex-none' : ''
      }`}
    >
      <Link to={`/product/${product.slug}`} className={`relative block ${compact ? 'h-[100px]' : 'h-[130px]'}`}>
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
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link to={`/product/${product.slug}`} className="line-clamp-2 text-[0.83rem] leading-tight font-bold text-foreground">
          {product.name}
        </Link>
        <p className="text-sm font-extrabold text-foreground">
          {formatPriceRange(product.price_min, product.price_max, product.currency)}
        </p>
        {!compact && compareProduct && (
          <button
            type="button"
            onClick={() => toggle(compareProduct)}
            aria-pressed={added}
            className={`mt-auto inline-flex items-center justify-center gap-1 self-start rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-150 ease-brand ${
              added
                ? 'border-brand bg-brand/10 text-brand dark:border-brand dark:bg-brand/20 dark:text-ice'
                : 'border-border text-foreground hover:border-brand hover:text-brand dark:hover:text-ice'
            }`}
          >
            <Icon name={added ? 'check' : 'plus'} size={11} /> {added ? 'Added to compare' : 'Add to compare'}
          </button>
        )}
      </div>
    </div>
  )
}
