import { useEffect, useState } from 'react'

import BusinessForm from '../components/dashboard/BusinessForm'
import BusinessPanel from '../components/dashboard/BusinessPanel'
import BusinessSwitcher from '../components/dashboard/BusinessSwitcher'
import ProductForm from '../components/dashboard/ProductForm'
import ProductsSection from '../components/dashboard/ProductsSection'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Skeleton from '../components/ui/Skeleton'
import {
  useCreateBusiness,
  useCreateProduct,
  useMyBusinesses,
  useMyBusinessProducts,
  useSubmitForVerification,
  useUpdateBusiness,
  useUpdateProduct,
  useUploadBusinessCover,
  useUploadBusinessLogo,
} from '../hooks/useDashboard'
import { ApiError } from '../lib/api'
import type { ProductDto } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

type ProductModalState = { mode: 'create' } | { mode: 'edit'; product: ProductDto } | null

/**
 * Business Dashboard — where a signed-in owner manages their business(es)
 * and products. Real backend throughout (GET /businesses/mine,
 * POST/PATCH /businesses, submit-for-verification, logo/cover upload, and
 * the matching product set) — see hooks/useDashboard.ts.
 *
 * Ownership note: the backend gates every write to "is the business's
 * owner, or a platform admin" (app/api/v1/endpoints/businesses.py's
 * `_can_manage`) — there is no role check requiring `role === 'business_admin'`
 * specifically, so this route is available to any signed-in user, matching
 * the backend rather than a narrower client-side assumption.
 */
export default function BusinessDashboard() {
  const { status, openAuthModal } = useAuth()

  // Prompt sign-in rather than a bare 403 — matches the brief's instruction
  // for an anonymous visitor landing on this route directly.
  useEffect(() => {
    if (status === 'anonymous') openAuthModal()
    // Only re-run on the anonymous transition itself, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (status === 'loading') return <DashboardSkeleton />

  if (status === 'anonymous') {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col px-5 py-16 lg:px-8">
        <EmptyState
          icon="🔐"
          title="Sign in to manage your business"
          subtitle="The Business Dashboard is where you manage your company profile, products and verification status."
        >
          <button
            type="button"
            onClick={() => openAuthModal()}
            className="rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-5 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
          >
            Sign in
          </button>
        </EmptyState>
      </div>
    )
  }

  return <DashboardContent />
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 lg:px-8 lg:py-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-9 w-full max-w-md" />
      <Skeleton className="mt-5 h-56 w-full" />
      <Skeleton className="mt-6 h-24 w-full" />
      <Skeleton className="mt-3 h-24 w-full" />
    </div>
  )
}

function DashboardContent() {
  const { showToast } = useToast()
  const businessesQuery = useMyBusinesses()
  const businesses = businessesQuery.data ?? []

  const [explicitSelectedId, setExplicitSelectedId] = useState<string | null>(null)
  const [showCreateBusiness, setShowCreateBusiness] = useState(false)
  const [editingBusiness, setEditingBusiness] = useState(false)
  const [productModal, setProductModal] = useState<ProductModalState>(null)
  const [verificationError, setVerificationError] = useState<string | null>(null)

  // Derived rather than synced via an effect: whichever business the owner
  // explicitly picked, falling back to the first one — recovers on its own
  // if the explicitly-selected business disappears from a refetch (e.g. it
  // was the one just deactivated), no extra render/effect round-trip needed.
  const selectedId =
    explicitSelectedId && businesses.some((b) => b.id === explicitSelectedId) ? explicitSelectedId : (businesses[0]?.id ?? null)

  const createBusinessMutation = useCreateBusiness()
  const updateBusinessMutation = useUpdateBusiness()
  const submitVerificationMutation = useSubmitForVerification()
  const uploadLogoMutation = useUploadBusinessLogo()
  const uploadCoverMutation = useUploadBusinessCover()
  const createProductMutation = useCreateProduct()
  const updateProductMutation = useUpdateProduct()

  const selectedBusiness = businesses.find((b) => b.id === selectedId) ?? null
  const productsQuery = useMyBusinessProducts(selectedBusiness?.id)

  if (businessesQuery.isLoading) return <DashboardSkeleton />

  if (businessesQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 lg:px-8">
        <EmptyState tone="error" title="Couldn't load your businesses" subtitle="Check your connection and try again.">
          <button
            type="button"
            onClick={() => businessesQuery.refetch()}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Retry
          </button>
        </EmptyState>
      </div>
    )
  }

  // No business yet — a focused onboarding step, not a modal, since this is the primary action on first visit.
  if (businesses.length === 0) {
    if (!showCreateBusiness) {
      return (
        <div className="mx-auto w-full max-w-lg px-5 py-16 lg:px-8">
          <EmptyState
            icon="🏢"
            title="Create your business profile"
            subtitle="Set up your digital showroom — add your details, list products, and submit for verification once you're ready."
          >
            <button
              type="button"
              onClick={() => setShowCreateBusiness(true)}
              className="rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-5 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
            >
              Create your business profile
            </button>
          </EmptyState>
        </div>
      )
    }
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-8 lg:px-8 lg:py-10">
        <button
          type="button"
          onClick={() => setShowCreateBusiness(false)}
          className="mb-3 text-sm font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground"
        >
          &larr; Back
        </button>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Create your business profile</h1>
        <p className="mt-1.5 mb-5 text-sm text-muted-foreground">
          This becomes your public showroom once verified — you can keep editing it any time.
        </p>
        <BusinessForm
          onSubmit={async (payload) => {
            const business = await createBusinessMutation.mutateAsync(payload)
            setExplicitSelectedId(business.id)
          }}
          onDone={() => {
            setShowCreateBusiness(false)
            showToast('Business profile created')
          }}
          submitLabel="Create business"
          submittingLabel="Creating…"
        />
      </div>
    )
  }

  function handleSubmitVerification() {
    if (!selectedBusiness) return
    setVerificationError(null)
    submitVerificationMutation.mutate(selectedBusiness.id, {
      onSuccess: () => showToast('Submitted for verification'),
      onError: (err) => setVerificationError(err instanceof ApiError ? err.message : 'Could not submit for verification.'),
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 lg:px-8 lg:py-10">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Business Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your company profile, products and verification status.</p>
      </header>

      <div className="mt-5">
        <BusinessSwitcher
          businesses={businesses}
          selectedId={selectedId}
          onSelect={(id) => {
            setExplicitSelectedId(id)
            setVerificationError(null)
          }}
          onAddNew={() => setShowCreateBusiness(true)}
        />
      </div>

      {selectedBusiness && (
        <>
          <BusinessPanel
            business={selectedBusiness}
            onEdit={() => setEditingBusiness(true)}
            onUploadLogo={(file) =>
              uploadLogoMutation.mutate(
                { businessId: selectedBusiness.id, file },
                {
                  onSuccess: () => showToast('Logo updated'),
                  onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not upload logo.'),
                },
              )
            }
            onUploadCover={(file) =>
              uploadCoverMutation.mutate(
                { businessId: selectedBusiness.id, file },
                {
                  onSuccess: () => showToast('Cover photo updated'),
                  onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not upload cover photo.'),
                },
              )
            }
            logoUploading={uploadLogoMutation.isPending}
            coverUploading={uploadCoverMutation.isPending}
            onSubmitVerification={handleSubmitVerification}
            submittingVerification={submitVerificationMutation.isPending}
            verificationError={verificationError}
          />

          <ProductsSection
            productsQuery={productsQuery}
            onAdd={() => setProductModal({ mode: 'create' })}
            onEditProduct={(product) => setProductModal({ mode: 'edit', product })}
          />
        </>
      )}

      <Modal open={showCreateBusiness} onClose={() => setShowCreateBusiness(false)} title="Add another business">
        <BusinessForm
          onSubmit={async (payload) => {
            const business = await createBusinessMutation.mutateAsync(payload)
            setExplicitSelectedId(business.id)
          }}
          onDone={() => {
            setShowCreateBusiness(false)
            showToast('Business profile created')
          }}
          submitLabel="Create business"
          submittingLabel="Creating…"
        />
      </Modal>

      <Modal open={editingBusiness} onClose={() => setEditingBusiness(false)} title="Edit business details">
        {selectedBusiness && (
          <BusinessForm
            initial={selectedBusiness}
            onSubmit={(payload) => updateBusinessMutation.mutateAsync({ businessId: selectedBusiness.id, payload })}
            onDone={() => {
              setEditingBusiness(false)
              showToast('Business details updated')
            }}
            submitLabel="Save changes"
            submittingLabel="Saving…"
          />
        )}
      </Modal>

      <Modal
        open={productModal !== null}
        onClose={() => setProductModal(null)}
        title={productModal?.mode === 'edit' ? 'Edit listing' : 'Add product or service'}
        widthClassName="lg:max-w-[640px]"
      >
        {productModal && selectedBusiness && (
          <ProductForm
            initial={productModal.mode === 'edit' ? productModal.product : undefined}
            showReReviewNotice={productModal.mode === 'edit' && productModal.product.moderation_status === 'approved'}
            onSubmit={(payload) =>
              productModal.mode === 'edit'
                ? updateProductMutation.mutateAsync({ productId: productModal.product.id, payload })
                : createProductMutation.mutateAsync({ businessId: selectedBusiness.id, payload })
            }
            onDone={() => {
              const wasEdit = productModal.mode === 'edit'
              setProductModal(null)
              showToast(wasEdit ? 'Listing updated' : 'Listing created — pending review')
            }}
            submitLabel={productModal.mode === 'edit' ? 'Save changes' : 'Add listing'}
            submittingLabel={productModal.mode === 'edit' ? 'Saving…' : 'Creating…'}
          />
        )}
      </Modal>
    </div>
  )
}
