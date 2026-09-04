import { useState } from 'react'
import { Link } from 'react-router-dom'

import Icon from '../icons/Icon'
import ModerationStatusBadge from '../dashboard/ModerationStatusBadge'
import CategoryChips from '../ui/CategoryChips'
import RejectModal from './RejectModal'
import { useApproveProduct, useRejectProduct } from '../../hooks/useAdmin'
import { ApiError } from '../../lib/api'
import type { ProductDto } from '../../lib/api'
import { formatDate, formatPriceRange, formatRelativeTime } from '../../lib/format'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { useToast } from '../../lib/toast'

interface ProductModerationCardProps {
  product: ProductDto
}

/**
 * One product/listing in the moderation queue — name, owning business,
 * price and a specs summary (enough to judge without opening the public
 * listing), plus approve/reject for `pending` items. Same read-only
 * treatment as BusinessModerationCard for non-pending statuses.
 *
 * The full description, complete image gallery and a link to the real public
 * listing are one click away behind a "Show details" disclosure (same
 * expand/collapse pattern as UserManagement's row expansion) rather than
 * always-on, so a queue of several pending items doesn't turn into a wall of
 * galleries — but the underlying information is never hidden away entirely.
 */
export default function ProductModerationCard({ product }: ProductModerationCardProps) {
  const { showToast } = useToast()
  const approveMutation = useApproveProduct()
  const rejectMutation = useRejectProduct()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [activeImage, setActiveImage] = useState(0)

  const pending = product.moderation_status === 'pending'
  const specEntries = Object.entries(product.specs).slice(0, 3)
  const grad = gradIndexForId(product.id)

  function handleApprove() {
    setError(null)
    approveMutation.mutate(product.id, {
      onSuccess: () => showToast(`${product.name} approved — now live`),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not approve this listing.'),
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl bg-panel">
          <span className="absolute inset-0" style={{ backgroundImage: gradientFor(grad) }}>
            <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
          </span>
          {product.primary_image_url && (
            <img src={product.primary_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-foreground">{product.name}</h3>
            <ModerationStatusBadge status={product.moderation_status} />
          </div>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{product.business.name}</p>
          <p className="mt-0.5 text-sm font-extrabold text-foreground">
            {formatPriceRange(product.price_min, product.price_max, product.currency)}
          </p>
        </div>
      </div>

      <CategoryChips categories={product.categories} size="sm" className="mt-3" />

      {specEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {specEntries.map(([k, v]) => (
            <span key={k} className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {k}: {v}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
        <span title={formatDate(product.created_at)}>Submitted {formatRelativeTime(product.created_at)}</span>
        {product.county && <span className="inline-flex items-center gap-1"><Icon name="pin" size={11} />{product.county}</span>}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label="Full product details"
        className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-teal transition-colors duration-150 ease-brand hover:text-teal/80"
      >
        <Icon name="chevronRight" size={12} strokeWidth={3} className={`transition-transform duration-150 ease-brand ${expanded ? 'rotate-90' : ''}`} />
        {expanded ? 'Hide full details' : 'Show full details'}
      </button>

      {expanded && (
        <div className="mt-3 rounded-xl border border-border bg-panel/50 p-3.5">
          {product.description && (
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">{product.description}</p>
          )}

          {product.images.length > 0 && (
            <div className={product.description ? 'mt-3.5' : ''}>
              <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg bg-surface">
                <img
                  key={product.images[activeImage]}
                  src={product.images[activeImage]}
                  alt={`${product.name} — image ${activeImage + 1}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              {product.images.length > 1 && (
                <div className="no-scrollbar mt-2 flex max-w-sm gap-1.5 overflow-x-auto">
                  {product.images.map((src, i) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setActiveImage(i)}
                      aria-label={`Show image ${i + 1}`}
                      aria-current={activeImage === i}
                      className={`h-11 w-11 flex-none overflow-hidden rounded-md border-2 transition-colors duration-150 ease-brand ${
                        activeImage === i ? 'border-amber' : 'border-transparent'
                      }`}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Link
            to={`/product/${product.slug}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline dark:text-ice ${
              product.description || product.images.length > 0 ? 'mt-3.5' : ''
            }`}
          >
            View public listing
            <Icon name="externalLink" size={12} />
          </Link>
        </div>
      )}

      {product.moderation_status === 'rejected' && product.moderation_note && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-snug text-danger">
          <span className="font-bold">Rejection reason: </span>
          {product.moderation_note}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      {pending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-bold text-white transition-opacity duration-150 ease-brand hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="check" size={13} strokeWidth={3} />
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={rejectMutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-danger px-4 py-2 text-sm font-bold text-danger transition-colors duration-150 ease-brand hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="close" size={13} strokeWidth={3} />
            Reject
          </button>
        </div>
      )}

      <RejectModal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject listing"
        itemName={product.name}
        onSubmit={(reason) =>
          rejectMutation.mutateAsync({ productId: product.id, reason }).then(() => showToast(`${product.name} rejected`))
        }
      />
    </div>
  )
}
