import { useEffect, useRef, useState } from 'react'

import Icon from '../icons/Icon'
import FeatureCard from './FeatureCard'
import FeaturedPurchaseModal from './FeaturedPurchaseModal'
import ModerationStatusBadge from './ModerationStatusBadge'
import CategoryChips from '../ui/CategoryChips'
import { useDeactivateProduct, useUploadProductImages } from '../../hooks/useDashboard'
import { formatPriceRange } from '../../lib/format'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { useToast } from '../../lib/toast'
import type { ProductDto } from '../../lib/api'
import { ApiError } from '../../lib/api'

interface ProductManageCardProps {
  product: ProductDto
  onEdit: () => void
  /** The owning business's own contact phone, for pre-filling the featured-purchase modal's M-Pesa number field — ProductDto's embedded `business` is the slim BusinessSummaryDto, which doesn't carry `phone`, so the parent (which already holds the full BusinessDto) passes it down explicitly. */
  businessPhone?: string | null
}

/**
 * One row in the dashboard's product list — thumbnail, name/price, real
 * moderation status (pending/approved/rejected — the owner's own view,
 * unlike the public catalog which just hides non-approved items), and the
 * three actions an owner needs per listing: edit, add photos, remove.
 */
export default function ProductManageCard({ product, onEdit, businessPhone = null }: ProductManageCardProps) {
  const { showToast } = useToast()
  const deactivateMutation = useDeactivateProduct()
  const uploadImagesMutation = useUploadProductImages()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [featureModalOpen, setFeatureModalOpen] = useState(false)
  const confirmTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(confirmTimerRef.current), [])

  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      window.clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = window.setTimeout(() => setConfirmingDelete(false), 4000)
      return
    }
    window.clearTimeout(confirmTimerRef.current)
    deactivateMutation.mutate(
      { productId: product.id, businessId: product.business_id },
      {
        onSuccess: () => showToast(`${product.name} removed from your listings`),
        onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not remove this listing.'),
      },
    )
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return
    uploadImagesMutation.mutate(
      { productId: product.id, files: Array.from(files) },
      {
        onSuccess: () => showToast('Photos uploaded'),
        onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not upload those photos.'),
      },
    )
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const grad = gradIndexForId(product.id)

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-soft">
      <div className="relative h-20 w-20 flex-none overflow-hidden rounded-xl bg-panel">
        <span className="absolute inset-0" style={{ backgroundImage: gradientFor(grad) }}>
          <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        </span>
        {product.primary_image_url && (
          <img src={product.primary_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        )}
        {product.images.length > 1 && (
          <span className="absolute right-1 bottom-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
            +{product.images.length - 1}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-1 text-sm font-bold text-foreground">{product.name}</h4>
          <ModerationStatusBadge status={product.moderation_status} />
        </div>
        <p className="mt-0.5 text-sm font-extrabold text-foreground">
          {formatPriceRange(product.price_min, product.price_max, product.currency)}
        </p>
        {product.moderation_status === 'rejected' && product.moderation_note && (
          <p className="mt-1 text-xs leading-snug text-danger">{product.moderation_note}</p>
        )}

        <CategoryChips categories={product.categories} size="sm" className="mt-1.5" />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-brand hover:text-brand dark:hover:text-ice"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadImagesMutation.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-teal hover:text-teal disabled:opacity-60"
          >
            {uploadImagesMutation.isPending ? 'Uploading…' : 'Add photos'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <FeatureCard
            variant="inline"
            target="product"
            isFeatured={product.is_featured}
            featuredUntil={product.featured_until}
            onOpen={() => setFeatureModalOpen(true)}
          />
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deactivateMutation.isPending}
            className={`ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-150 ease-brand disabled:opacity-60 ${
              confirmingDelete
                ? 'border-danger bg-danger text-white'
                : 'border-border text-muted-foreground hover:border-danger hover:text-danger'
            }`}
          >
            <Icon name="close" size={11} />
            {deactivateMutation.isPending ? 'Removing…' : confirmingDelete ? 'Confirm remove?' : 'Remove'}
          </button>
        </div>
      </div>

      <FeaturedPurchaseModal
        open={featureModalOpen}
        onClose={() => setFeatureModalOpen(false)}
        businessId={product.business_id}
        businessPhone={businessPhone}
        target={{ kind: 'product', productId: product.id, label: product.name }}
      />
    </div>
  )
}
