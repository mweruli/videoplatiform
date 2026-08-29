import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ProductTile from '../components/business/ProductTile'
import Icon from '../components/icons/Icon'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import VerificationStatusBadge from '../components/ui/VerificationStatusBadge'
import { useProductBySlug } from '../hooks/useCatalog'
import { formatPriceRange } from '../lib/format'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../lib/thumbTreatment'
import { useToast } from '../lib/toast'
import type { AvailabilityStatus } from '../lib/api'

const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  in_stock: 'In stock',
  made_to_order: 'Made to order',
  out_of_stock: 'Out of stock',
  discontinued: 'Discontinued',
}

const AVAILABILITY_TONE: Record<AvailabilityStatus, string> = {
  in_stock: 'bg-teal/15 text-teal border-teal/30',
  made_to_order: 'bg-amber/15 text-amber-ink border-amber/40 dark:text-amber',
  out_of_stock: 'bg-border text-muted-foreground border-border',
  discontinued: 'bg-border text-muted-foreground border-border',
}

/**
 * Product detail — real backend (GET /products/slug/{slug}). Related
 * products come from the same response (`related_products`, curated by the
 * business, falling back to same-business products server-side — see
 * app/api/v1/endpoints/products.py).
 */
export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [activeImage, setActiveImage] = useState(0)

  const productQuery = useProductBySlug(slug)
  const product = productQuery.data

  if (productQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 lg:px-14 lg:py-10">
        <div className="lg:flex lg:gap-10">
          <Skeleton className="h-[320px] w-full lg:h-[420px] lg:w-[420px] lg:flex-none" />
          <div className="mt-5 flex-1 lg:mt-0">
            <Skeleton className="h-[280px] w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (productQuery.isError || !product) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 lg:px-8">
        <EmptyState
          tone="error"
          title="Product not found"
          subtitle="This listing may have been removed, or the link is out of date."
        >
          <Link
            to="/search"
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Back to search
          </Link>
        </EmptyState>
      </div>
    )
  }

  const grad = gradIndexForId(product.id)
  const hasImages = product.images.length > 0
  const specEntries = Object.entries(product.specs)

  return (
    <div>
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-glass-border bg-glass px-5 py-3 backdrop-blur-xl backdrop-saturate-150 lg:px-14">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors duration-150 ease-brand hover:border-teal"
        >
          <Icon name="back" size={17} />
        </button>
        <Link
          to={`/business/${product.business.slug}`}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate text-sm font-bold text-foreground"
        >
          <span className="truncate">{product.business.name}</span>
          <VerificationStatusBadge status={product.business.verification_status} />
        </Link>
        <button
          type="button"
          onClick={() => showToast('Share sheet lands with the native Share API at build time')}
          aria-label="Share"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors duration-150 ease-brand hover:border-teal"
        >
          <Icon name="share" size={16} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pt-5 pb-28 lg:px-14 lg:pt-8 lg:pb-16">
        <div className="lg:flex lg:items-start lg:gap-10">
          {/* Gallery */}
          <div className="lg:sticky lg:top-24 lg:w-[420px] lg:flex-none">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
              <span
                className="absolute inset-0"
                style={{ backgroundImage: gradientFor(grad) }}
                aria-hidden="true"
              >
                <span className="absolute inset-0 opacity-70 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
              </span>
              {hasImages && (
                <img
                  key={product.images[activeImage]}
                  src={product.images[activeImage]}
                  alt={product.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            {product.images.length > 1 && (
              <div className="mt-2.5 flex gap-2 overflow-x-auto">
                {product.images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={`Show image ${i + 1}`}
                    aria-current={activeImage === i}
                    className={`h-14 w-14 flex-none overflow-hidden rounded-lg border-2 transition-colors duration-150 ease-brand ${
                      activeImage === i ? 'border-amber' : 'border-transparent'
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="mt-5 min-w-0 flex-1 lg:mt-0">
            <div className="flex flex-wrap items-center gap-2">
              {product.category && (
                <span className="rounded-full border border-border bg-panel px-2.5 py-1 text-xs font-bold text-foreground">
                  {product.category.name}
                </span>
              )}
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${AVAILABILITY_TONE[product.availability_status]}`}
              >
                {AVAILABILITY_LABEL[product.availability_status]}
              </span>
            </div>

            <h1 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
              {product.name}
            </h1>

            {product.availability_note && (
              <p className="mt-1 text-sm text-muted-foreground">{product.availability_note}</p>
            )}

            <p className="mt-3 font-display text-[1.6rem] font-bold tracking-tight text-foreground">
              {formatPriceRange(product.price_min, product.price_max, product.currency)}
            </p>

            <button
              type="button"
              onClick={() => showToast('Comparison lands in a later release — this is where you’ll add products to compare')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
            >
              <Icon name="plus" size={14} /> Add to compare
            </button>

            {product.description && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            )}

            {specEntries.length > 0 && (
              <table className="mt-5 w-full overflow-hidden rounded-2xl border border-border text-sm">
                <tbody>
                  {specEntries.map(([label, value]) => (
                    <tr key={label} className="border-b border-border last:border-0 odd:bg-panel/60">
                      <td className="w-2/5 px-4 py-2.5 font-semibold text-muted-foreground">{label}</td>
                      <td className="px-4 py-2.5 text-foreground">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {product.warranty_terms && (
              <p className="mt-3 text-xs text-muted-foreground">Warranty: {product.warranty_terms}</p>
            )}

            <Link
              to={`/business/${product.business.slug}`}
              className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-soft transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span
                className="relative h-11 w-11 flex-none overflow-hidden rounded-xl text-sm font-bold text-white"
                style={{ backgroundImage: gradientFor(gradIndexForId(product.business.id)) }}
              >
                <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
                {product.business.logo_url ? (
                  <img src={product.business.logo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    {product.business.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">
                  {product.business.name}
                  <VerificationStatusBadge status={product.business.verification_status} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[product.business.city, product.business.county].filter(Boolean).join(', ') || 'Supplier'}
                </span>
              </span>
              <Icon name="chevronRight" size={16} className="flex-none text-muted-foreground" />
            </Link>

            {product.related_products.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-[11px] font-extrabold tracking-[0.14em] text-muted-foreground uppercase">
                  More from {product.business.name}
                </h2>
                <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                  {product.related_products.map((r) => (
                    <ProductTile key={r.id} product={r} compact />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky CTA bar — sits flush at the bottom edge since the
          bottom tab bar hides on this route (see Layout.tsx), matching the
          approved prototype's immersive product screen. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-glass-border bg-glass px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <Link
          to={`/business/${product.business.slug}`}
          className="flex flex-1 items-center justify-center rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground"
        >
          View showroom
        </Link>
        <button
          type="button"
          onClick={() => showToast('Comparison lands in a later release — this is where you’ll add products to compare')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber"
        >
          <Icon name="plus" size={14} /> Add to compare
        </button>
      </div>
    </div>
  )
}
