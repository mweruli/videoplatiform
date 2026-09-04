import { useEffect, useState } from 'react'

import BusinessAnalytics from '../components/dashboard/BusinessAnalytics'
import BusinessForm from '../components/dashboard/BusinessForm'
import BusinessPanel from '../components/dashboard/BusinessPanel'
import BusinessSwitcher from '../components/dashboard/BusinessSwitcher'
import CampaignsSection from '../components/dashboard/CampaignsSection'
import ProductForm from '../components/dashboard/ProductForm'
import ProductManageCard from '../components/dashboard/ProductManageCard'
import ProductsSection from '../components/dashboard/ProductsSection'
import VideoUploadForm from '../components/dashboard/VideoUploadForm'
import VideosSection from '../components/dashboard/VideosSection'
import DashboardShell from '../components/dashboardshell/DashboardShell'
import type { DashNavItem } from '../components/dashboardshell/DashboardShell'
import DashSection from '../components/dashboardshell/DashSection'
import GateShell from '../components/dashboardshell/GateShell'
import KpiCard from '../components/dashboardshell/KpiCard'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import Skeleton from '../components/ui/Skeleton'
import {
  useCreateBusiness,
  useCreateProduct,
  useMyBusinesses,
  useMyBusinessProducts,
  useMyBusinessVideos,
  useSubmitForVerification,
  useUpdateBusiness,
  useUpdateProduct,
  useUpdateVideo,
  useUploadBusinessCover,
  useUploadBusinessLogo,
  useUploadVideo,
} from '../hooks/useDashboard'
import { ApiError } from '../lib/api'
import type { ProductDto, VideoDto } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

type ProductModalState = { mode: 'create' } | { mode: 'edit'; product: ProductDto } | null
type VideoModalState = { mode: 'create' } | { mode: 'edit'; video: VideoDto } | null
type DashSectionId = 'overview' | 'profile' | 'products' | 'videos' | 'campaigns' | 'analytics'

const NAV_ITEMS: DashNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'profile', label: 'Business Profile', icon: 'building' },
  { id: 'products', label: 'Products', icon: 'box' },
  { id: 'videos', label: 'Videos', icon: 'video' },
  { id: 'campaigns', label: 'Ad Campaigns', icon: 'megaphone' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'orders', label: 'Orders', icon: 'truck', soon: true },
]

const SECTION_TITLES: Record<DashSectionId, string> = {
  overview: 'Overview',
  profile: 'Business Profile',
  products: 'Products',
  videos: 'Videos',
  campaigns: 'Ad Campaigns',
  analytics: 'Analytics',
}

/**
 * Business Dashboard — where a signed-in owner manages their business(es)
 * and products. Real backend throughout (GET /businesses/mine,
 * POST/PATCH /businesses, submit-for-verification, logo/cover upload, and
 * the matching product set) — see hooks/useDashboard.ts. Data-fetching and
 * mutation logic is unchanged from the previous build; this pass rehouses
 * it inside DashboardShell (sidebar + topbar + footer), the shared
 * internal-tool layout also used by the Admin Panel — see
 * docs/decisions.md's "Process incident" entry for why that rebuild
 * happened.
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

  if (status === 'loading') return <GateShell><DashboardGateSkeleton /></GateShell>

  if (status === 'anonymous') {
    return (
      <GateShell>
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
      </GateShell>
    )
  }

  return <DashboardContent />
}

function DashboardGateSkeleton() {
  return (
    <div className="w-full max-w-lg">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-9 w-full" />
      <Skeleton className="mt-5 h-40 w-full" />
    </div>
  )
}

function DashboardContent() {
  const { showToast } = useToast()
  const businessesQuery = useMyBusinesses()
  const businesses = businessesQuery.data ?? []

  const [dashSection, setDashSection] = useState<DashSectionId>('overview')
  const [explicitSelectedId, setExplicitSelectedId] = useState<string | null>(null)
  const [showCreateBusiness, setShowCreateBusiness] = useState(false)
  const [editingBusiness, setEditingBusiness] = useState(false)
  const [productModal, setProductModal] = useState<ProductModalState>(null)
  const [videoModal, setVideoModal] = useState<VideoModalState>(null)
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
  const uploadVideoMutation = useUploadVideo()
  const updateVideoMutation = useUpdateVideo()

  const selectedBusiness = businesses.find((b) => b.id === selectedId) ?? null
  const productsQuery = useMyBusinessProducts(selectedBusiness?.id)
  const products = productsQuery.data?.items ?? []
  const ownPending = products.filter((p) => p.moderation_status === 'pending').length
  const videosQuery = useMyBusinessVideos(selectedBusiness?.id)

  const statusLabel = !selectedBusiness
    ? '—'
    : selectedBusiness.verification_status === 'verified'
      ? 'Verified'
      : selectedBusiness.verification_status === 'pending'
        ? 'Pending'
        : selectedBusiness.verification_status === 'rejected'
          ? 'Rejected'
          : 'Unverified'

  const stats = [
    { value: ownPending, label: 'Pending', warn: ownPending > 0 },
    { value: statusLabel, label: 'Status' },
  ]

  function handleSubmitVerification() {
    if (!selectedBusiness) return
    setVerificationError(null)
    submitVerificationMutation.mutate(selectedBusiness.id, {
      onSuccess: () => showToast('Submitted for verification'),
      onError: (err) => setVerificationError(err instanceof ApiError ? err.message : 'Could not submit for verification.'),
    })
  }

  if (businessesQuery.isLoading) {
    return (
      <GateShell>
        <DashboardGateSkeleton />
      </GateShell>
    )
  }

  if (businessesQuery.isError) {
    return (
      <GateShell>
        <EmptyState tone="error" title="Couldn't load your businesses" subtitle="Check your connection and try again.">
          <button
            type="button"
            onClick={() => businessesQuery.refetch()}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Retry
          </button>
        </EmptyState>
      </GateShell>
    )
  }

  // No business yet — a focused onboarding step inside the same shell, since
  // the Business Console is still the right context (an owner who just
  // registered), just without a business to navigate between sections for
  // yet.
  if (businesses.length === 0) {
    return (
      <DashboardShell
        mode="business"
        navItems={NAV_ITEMS}
        activeSection="overview"
        onNavigate={() => {}}
        breadcrumb="Business Dashboard"
        title="Overview"
      >
        {!showCreateBusiness ? (
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
        ) : (
          <div className="mx-auto w-full max-w-xl">
            <button
              type="button"
              onClick={() => setShowCreateBusiness(false)}
              className="mb-3 text-sm font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:text-foreground"
            >
              &larr; Back
            </button>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Create your business profile</h2>
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
        )}
      </DashboardShell>
    )
  }

  return (
    <DashboardShell
      mode="business"
      navItems={NAV_ITEMS}
      activeSection={dashSection}
      onNavigate={(id) => setDashSection(id as DashSectionId)}
      breadcrumb="Business Dashboard"
      title={SECTION_TITLES[dashSection]}
      stats={stats}
    >
      <BusinessSwitcher
        businesses={businesses}
        selectedId={selectedId}
        onSelect={(id) => {
          setExplicitSelectedId(id)
          setVerificationError(null)
        }}
        onAddNew={() => setShowCreateBusiness(true)}
      />

      {selectedBusiness && dashSection === 'overview' && (
        <div className="mt-4">
          <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KpiCard value={selectedBusiness.product_count} label="Product Listings" />
            <KpiCard value={ownPending} label="Pending Review" accent={ownPending > 0} />
            <KpiCard value={statusLabel} label="Verification" />
            <KpiCard value={selectedBusiness.is_active ? 'Active' : 'Inactive'} label="Listing Status" />
          </div>

          {selectedBusiness.verification_status === 'pending' && (
            <DashSection tone="warn">
              <div className="flex items-start gap-3">
                <span className="text-lg" aria-hidden="true">⏳</span>
                <div>
                  <h2 className="font-display text-[0.95rem] font-bold tracking-tight text-foreground">Verification pending</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Your submission is in the moderation queue — most reviews complete within a few business days.
                  </p>
                </div>
              </div>
            </DashSection>
          )}

          <DashSection
            title={selectedBusiness.name}
            subtitle={[selectedBusiness.category?.name, [selectedBusiness.city, selectedBusiness.county].filter(Boolean).join(', ')]
              .filter(Boolean)
              .join(' · ')}
          >
            {selectedBusiness.description && (
              <p className="mb-3.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{selectedBusiness.description}</p>
            )}
            <button
              type="button"
              onClick={() => setDashSection('profile')}
              className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
            >
              Manage profile
            </button>
          </DashSection>

          <DashSection
            title="Recent listings"
            subtitle={`${products.length} product${products.length === 1 ? '' : 's'} in your showroom`}
            action={
              <button
                type="button"
                onClick={() => setDashSection('products')}
                className="flex-none rounded-full bg-panel px-3.5 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-border/70"
              >
                View all
              </button>
            }
          >
            {productsQuery.isLoading && (
              <div className="flex flex-col gap-2.5">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            {!productsQuery.isLoading && products.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No products yet — add your first listing.</p>
            )}
            {!productsQuery.isLoading && products.length > 0 && (
              <div className="flex flex-col gap-2.5">
                {products.slice(0, 4).map((product) => (
                  <ProductManageCard
                    key={product.id}
                    product={product}
                    onEdit={() => setProductModal({ mode: 'edit', product })}
                    businessPhone={selectedBusiness.phone}
                  />
                ))}
              </div>
            )}
          </DashSection>
        </div>
      )}

      {selectedBusiness && dashSection === 'profile' && (
        <div className="mt-4">
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
        </div>
      )}

      {selectedBusiness && dashSection === 'products' && (
        <div className="mt-4">
          <ProductsSection
            productsQuery={productsQuery}
            onAdd={() => setProductModal({ mode: 'create' })}
            onEditProduct={(product) => setProductModal({ mode: 'edit', product })}
            businessPhone={selectedBusiness.phone}
          />
        </div>
      )}

      {selectedBusiness && dashSection === 'videos' && (
        <div className="mt-4">
          <VideosSection
            videosQuery={videosQuery}
            onUpload={() => setVideoModal({ mode: 'create' })}
            onEditVideo={(video) => setVideoModal({ mode: 'edit', video })}
          />
        </div>
      )}

      {selectedBusiness && dashSection === 'campaigns' && (
        <div className="mt-4">
          <CampaignsSection business={selectedBusiness} products={products} />
        </div>
      )}

      {selectedBusiness && dashSection === 'analytics' && (
        <div className="mt-4">
          <BusinessAnalytics businessId={selectedBusiness.id} />
        </div>
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

      <Modal
        open={videoModal !== null}
        onClose={() => setVideoModal(null)}
        title={videoModal?.mode === 'edit' ? 'Edit video' : 'Upload a video'}
        widthClassName="lg:max-w-[640px]"
      >
        {videoModal?.mode === 'edit' && selectedBusiness && (
          <VideoUploadForm
            mode="edit"
            initial={videoModal.video}
            products={products}
            showReReviewNotice={videoModal.video.moderation_status === 'approved'}
            onSubmit={(payload) => updateVideoMutation.mutateAsync({ videoId: videoModal.video.id, payload })}
            onDone={() => {
              setVideoModal(null)
              showToast('Video updated')
            }}
          />
        )}
        {videoModal?.mode === 'create' && selectedBusiness && (
          <VideoUploadForm
            products={products}
            onSubmit={(payload) => uploadVideoMutation.mutateAsync({ businessId: selectedBusiness.id, payload })}
            onDone={() => {
              setVideoModal(null)
              showToast('Video submitted for review — most reviews complete within 2 business days.')
            }}
          />
        )}
      </Modal>
    </DashboardShell>
  )
}
