import { useEffect, useState } from 'react'

import BusinessModerationCard from '../components/admin/BusinessModerationCard'
import CampaignModerationCard from '../components/admin/CampaignModerationCard'
import CategoryManagement from '../components/admin/CategoryManagement'
import ProductModerationCard from '../components/admin/ProductModerationCard'
import StatusTabs from '../components/admin/StatusTabs'
import UserManagement from '../components/admin/UserManagement'
import VideoModerationCard from '../components/admin/VideoModerationCard'
import DashboardShell from '../components/dashboardshell/DashboardShell'
import type { DashNavItem } from '../components/dashboardshell/DashboardShell'
import DashSection from '../components/dashboardshell/DashSection'
import GateShell from '../components/dashboardshell/GateShell'
import KpiCard from '../components/dashboardshell/KpiCard'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import {
  useAdminBusinessCounts,
  useAdminBusinesses,
  useAdminCampaignCounts,
  useAdminCampaigns,
  useAdminProductCounts,
  useAdminProducts,
  useAdminUsers,
  useAdminVideoCounts,
  useAdminVideos,
} from '../hooks/useAdmin'
import type { AdminCampaignTab } from '../hooks/useAdmin'
import { useCategories } from '../hooks/useCatalog'
import type { ModerationStatus, VerificationStatus } from '../lib/api'
import { useAuth } from '../lib/auth'

type AdminSectionId = 'overview' | 'bizmod' | 'prodmod' | 'vidmod' | 'campmod' | 'categories' | 'users'

const BUSINESS_STATUS_OPTIONS: { id: VerificationStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'verified', label: 'Verified' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'unverified', label: 'Unverified' },
]

const PRODUCT_STATUS_OPTIONS: { id: ModerationStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

const VIDEO_STATUS_OPTIONS: { id: ModerationStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
]

const CAMPAIGN_TAB_OPTIONS: { id: AdminCampaignTab; label: string }[] = [
  { id: 'needs_review', label: 'Needs review' },
  { id: 'live', label: 'Live' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'completed', label: 'Completed' },
]

const SECTION_TITLES: Record<AdminSectionId, string> = {
  overview: 'Overview',
  bizmod: 'Business Moderation',
  prodmod: 'Product Moderation',
  vidmod: 'Video Moderation',
  campmod: 'Campaign Moderation',
  categories: 'Category Management',
  users: 'User Management',
}

/**
 * Admin Panel — the moderation queue for platform staff (platform_admin /
 * content_moderator, gated server-side by app.api.deps.require_moderator on
 * every /admin/* route this screen calls). Real backend throughout: see
 * hooks/useAdmin.ts. Data-fetching/mutation logic is unchanged from the
 * previous build; this pass rehouses it inside DashboardShell, the same
 * shared internal-tool layout the Business Dashboard uses — see
 * docs/decisions.md's "Process incident" entry.
 *
 * Access model mirrors BusinessDashboard's shape (loading/anonymous/content
 * states) with one addition: an authenticated-but-wrong-role visitor gets a
 * dedicated "no access" empty state rather than either a raw 403 or being
 * silently redirected — this is a real, expected case (any general_user or
 * business_admin landing on /admin), not an error condition. Gate states use
 * the minimal GateShell rather than the full sidebar shell — there's nothing
 * to navigate yet at that point.
 */
export default function Admin() {
  const { status, user, openAuthModal } = useAuth()

  useEffect(() => {
    if (status === 'anonymous') openAuthModal()
    // Only re-run on the anonymous transition itself, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (status === 'loading') {
    return (
      <GateShell>
        <div className="w-full max-w-lg">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-3 h-14 w-full" />
          <Skeleton className="mt-4 h-28 w-full" />
        </div>
      </GateShell>
    )
  }

  if (status === 'anonymous') {
    return (
      <GateShell>
        <EmptyState icon="🔐" title="Sign in to continue" subtitle="The Admin Panel is restricted to platform staff.">
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

  const isStaff = user?.role === 'platform_admin' || user?.role === 'content_moderator'
  if (!isStaff) {
    return (
      <GateShell>
        <EmptyState
          icon="🚫"
          title="You don't have access to this area"
          subtitle="The Admin Panel is restricted to Platform Administrators and Content Moderators. You're signed in with a different role."
        />
      </GateShell>
    )
  }

  return <AdminContent />
}

function AdminContent() {
  const [adminSection, setAdminSection] = useState<AdminSectionId>('overview')
  const [businessStatus, setBusinessStatus] = useState<VerificationStatus>('pending')
  const [productStatus, setProductStatus] = useState<ModerationStatus>('pending')
  const [videoStatus, setVideoStatus] = useState<ModerationStatus>('pending')
  const [campaignTab, setCampaignTab] = useState<AdminCampaignTab>('needs_review')

  const businessCounts = useAdminBusinessCounts()
  const productCounts = useAdminProductCounts()
  const videoCounts = useAdminVideoCounts()
  const campaignCounts = useAdminCampaignCounts()
  const categoriesQuery = useCategories()
  // Cheap counts for the Overview's two extra KPI cards (Total Businesses,
  // Platform Users) — no dedicated count endpoint needed: businessCounts
  // already sums to a total across every verification status, and a
  // page_size:1 users call only pays for `total`, not the rows (same
  // "cheap aggregate" pattern as useAdminBusinessCounts/useAdminProductCounts).
  const userCountQuery = useAdminUsers({ page: 1, page_size: 1 })

  const pendingBusinessesQuery = useAdminBusinesses('pending')
  const pendingProductsQuery = useAdminProducts('pending')
  const pendingVideosQuery = useAdminVideos('pending')
  const pendingCampaignsQuery = useAdminCampaigns('needs_review')
  const businessesQuery = useAdminBusinesses(businessStatus)
  const productsQuery = useAdminProducts(productStatus)
  const videosQuery = useAdminVideos(videoStatus)
  const campaignsQuery = useAdminCampaigns(campaignTab)

  const businesses = businessesQuery.data?.items ?? []
  const products = productsQuery.data?.items ?? []
  const videos = videosQuery.data?.items ?? []
  const campaigns = campaignsQuery.data?.items ?? []

  const pendingBusinesses = businessCounts.data?.pending ?? 0
  const pendingProducts = productCounts.data?.pending ?? 0
  const pendingVideos = videoCounts.data?.pending ?? 0
  const pendingCampaigns = campaignCounts.data?.pending_review ?? 0
  // Tab-level counts assembled from the per-status totals — mirrors
  // ADMIN_CAMPAIGN_TAB_STATUSES' grouping so the pill on each tab always
  // matches what that tab actually shows.
  const campaignTabCounts: Partial<Record<AdminCampaignTab, number>> | undefined = campaignCounts.data
    ? {
        needs_review: campaignCounts.data.pending_review,
        live: campaignCounts.data.approved + campaignCounts.data.active + campaignCounts.data.paused + campaignCounts.data.exhausted,
        rejected: campaignCounts.data.rejected,
        completed: campaignCounts.data.completed,
      }
    : undefined

  const navItems: DashNavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'bizmod', label: 'Business Moderation', icon: 'building', count: pendingBusinesses },
    { id: 'prodmod', label: 'Product Moderation', icon: 'box', count: pendingProducts },
    { id: 'vidmod', label: 'Video Moderation', icon: 'video', count: pendingVideos },
    { id: 'campmod', label: 'Campaign Moderation', icon: 'megaphone', count: pendingCampaigns },
    { id: 'categories', label: 'Category Management', icon: 'tag' },
    { id: 'users', label: 'User Management', icon: 'user' },
  ]

  const stats = [
    { value: pendingBusinesses, label: 'Pending Biz', warn: pendingBusinesses > 0 },
    { value: pendingProducts, label: 'Pending Prod', warn: pendingProducts > 0 },
    { value: pendingVideos, label: 'Pending Vid', warn: pendingVideos > 0 },
    { value: pendingCampaigns, label: 'Pending Camp', warn: pendingCampaigns > 0 },
  ]

  // Oldest submissions first, businesses/products/videos/campaigns
  // interleaved by `created_at` — one queue to work through, not four
  // separate lists to remember to check.
  const needsReview = [
    ...(pendingBusinessesQuery.data?.items ?? []).map((item) => ({ type: 'business' as const, item })),
    ...(pendingProductsQuery.data?.items ?? []).map((item) => ({ type: 'product' as const, item })),
    ...(pendingVideosQuery.data?.items ?? []).map((item) => ({ type: 'video' as const, item })),
    ...(pendingCampaignsQuery.data?.items ?? []).map((item) => ({ type: 'campaign' as const, item })),
  ].sort((a, b) => a.item.created_at.localeCompare(b.item.created_at))
  const reviewLoading =
    pendingBusinessesQuery.isLoading || pendingProductsQuery.isLoading || pendingVideosQuery.isLoading || pendingCampaignsQuery.isLoading

  return (
    <DashboardShell
      mode="admin"
      navItems={navItems}
      activeSection={adminSection}
      onNavigate={(id) => setAdminSection(id as AdminSectionId)}
      breadcrumb="Admin Panel"
      title={SECTION_TITLES[adminSection]}
      stats={stats}
    >
      {adminSection === 'overview' && (
        <div>
          <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KpiCard value={businessCounts.isSuccess ? pendingBusinesses : '…'} label="Pending Businesses" accent={pendingBusinesses > 0} />
            <KpiCard value={productCounts.isSuccess ? pendingProducts : '…'} label="Pending Products" accent={pendingProducts > 0} />
            <KpiCard value={videoCounts.isSuccess ? pendingVideos : '…'} label="Pending Videos" accent={pendingVideos > 0} />
            <KpiCard value={campaignCounts.isSuccess ? pendingCampaigns : '…'} label="Pending Campaigns" accent={pendingCampaigns > 0} />
            <KpiCard value={businessCounts.data?.verified ?? '…'} label="Verified Businesses" />
            <KpiCard value={categoriesQuery.data?.length ?? '…'} label="Live Categories" />
            <KpiCard
              value={businessCounts.isSuccess ? Object.values(businessCounts.data).reduce((a, b) => a + b, 0) : '…'}
              label="Total Businesses"
            />
            <KpiCard value={userCountQuery.data?.total ?? '…'} label="Platform Users" />
          </div>

          <DashSection title="Needs your review" subtitle="Oldest submissions first.">
            {reviewLoading && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}
            {!reviewLoading && needsReview.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="text-2xl" aria-hidden="true">✅</span>
                <p className="text-sm font-semibold text-muted-foreground">Nothing waiting on you — you're all caught up.</p>
              </div>
            )}
            {!reviewLoading && needsReview.length > 0 && (
              <div className="flex flex-col gap-3">
                {needsReview.map((entry) =>
                  entry.type === 'business' ? (
                    <BusinessModerationCard key={`b-${entry.item.id}`} business={entry.item} />
                  ) : entry.type === 'product' ? (
                    <ProductModerationCard key={`p-${entry.item.id}`} product={entry.item} />
                  ) : entry.type === 'video' ? (
                    <VideoModerationCard key={`v-${entry.item.id}`} video={entry.item} />
                  ) : (
                    <CampaignModerationCard key={`c-${entry.item.id}`} campaign={entry.item} />
                  ),
                )}
              </div>
            )}
          </DashSection>
        </div>
      )}

      {adminSection === 'bizmod' && (
        <DashSection>
          <StatusTabs active={businessStatus} options={BUSINESS_STATUS_OPTIONS} counts={businessCounts.data} onChange={setBusinessStatus} />
          <div className="mt-4 flex flex-col gap-3">
            {businessesQuery.isLoading && (
              <>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            )}
            {businessesQuery.isError && (
              <EmptyState tone="error" title="Couldn't load businesses" subtitle="Check your connection and try again.">
                <button
                  type="button"
                  onClick={() => businessesQuery.refetch()}
                  className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
                >
                  Retry
                </button>
              </EmptyState>
            )}
            {!businessesQuery.isLoading && !businessesQuery.isError && businesses.length === 0 && (
              <EmptyState
                icon="📭"
                title={`No ${businessStatus} businesses`}
                subtitle="Nothing in this status right now — check another tab, or come back later."
              />
            )}
            {businesses.map((business) => (
              <BusinessModerationCard key={business.id} business={business} />
            ))}
          </div>
        </DashSection>
      )}

      {adminSection === 'prodmod' && (
        <DashSection>
          <StatusTabs active={productStatus} options={PRODUCT_STATUS_OPTIONS} counts={productCounts.data} onChange={setProductStatus} />
          <div className="mt-4 flex flex-col gap-3">
            {productsQuery.isLoading && (
              <>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            )}
            {productsQuery.isError && (
              <EmptyState tone="error" title="Couldn't load products" subtitle="Check your connection and try again.">
                <button
                  type="button"
                  onClick={() => productsQuery.refetch()}
                  className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
                >
                  Retry
                </button>
              </EmptyState>
            )}
            {!productsQuery.isLoading && !productsQuery.isError && products.length === 0 && (
              <EmptyState
                icon="📭"
                title={`No ${productStatus} products`}
                subtitle="Nothing in this status right now — check another tab, or come back later."
              />
            )}
            {products.map((product) => (
              <ProductModerationCard key={product.id} product={product} />
            ))}
          </div>
        </DashSection>
      )}

      {adminSection === 'vidmod' && (
        <DashSection>
          <StatusTabs active={videoStatus} options={VIDEO_STATUS_OPTIONS} counts={videoCounts.data} onChange={setVideoStatus} />
          <div className="mt-4 flex flex-col gap-3">
            {videosQuery.isLoading && (
              <>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            )}
            {videosQuery.isError && (
              <EmptyState tone="error" title="Couldn't load videos" subtitle="Check your connection and try again.">
                <button
                  type="button"
                  onClick={() => videosQuery.refetch()}
                  className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
                >
                  Retry
                </button>
              </EmptyState>
            )}
            {!videosQuery.isLoading && !videosQuery.isError && videos.length === 0 && (
              <EmptyState
                icon="📭"
                title={`No ${videoStatus} videos`}
                subtitle="Nothing in this status right now — check another tab, or come back later."
              />
            )}
            {videos.map((video) => (
              <VideoModerationCard key={video.id} video={video} />
            ))}
          </div>
        </DashSection>
      )}

      {adminSection === 'campmod' && (
        <DashSection>
          <StatusTabs active={campaignTab} options={CAMPAIGN_TAB_OPTIONS} counts={campaignTabCounts} onChange={setCampaignTab} />
          <div className="mt-4 flex flex-col gap-3">
            {campaignsQuery.isLoading && (
              <>
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            )}
            {campaignsQuery.isError && (
              <EmptyState tone="error" title="Couldn't load campaigns" subtitle="Check your connection and try again.">
                <button
                  type="button"
                  onClick={() => campaignsQuery.refetch()}
                  className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
                >
                  Retry
                </button>
              </EmptyState>
            )}
            {!campaignsQuery.isLoading && !campaignsQuery.isError && campaigns.length === 0 && (
              <EmptyState
                icon="📣"
                title="Nothing here"
                subtitle="Nothing in this tab right now — check another tab, or come back later."
              />
            )}
            {campaigns.map((campaign) => (
              <CampaignModerationCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        </DashSection>
      )}

      {adminSection === 'categories' && <CategoryManagement />}

      {adminSection === 'users' && <UserManagement />}
    </DashboardShell>
  )
}
