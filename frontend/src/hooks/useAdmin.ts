import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  adminGetUser,
  adminListBusinesses,
  adminListCampaigns,
  adminListCategories,
  adminListProducts,
  adminListUsers,
  adminListVideos,
  adminUpdateUser,
  approveBusinessAdmin,
  approveCampaignAdmin,
  approveProductAdmin,
  approveVideoAdmin,
  createCategoryAdmin,
  rejectBusinessAdmin,
  rejectCampaignAdmin,
  rejectProductAdmin,
  rejectVideoAdmin,
  updateCategoryAdmin,
} from '../lib/api'
import type {
  AdminListUsersParams,
  CampaignStatus,
  CategoryCreatePayload,
  CategoryUpdatePayload,
  ModerationStatus,
  VerificationStatus,
} from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * TanStack Query hooks for the Admin moderation queue (`pages/Admin.tsx`) —
 * the staff-facing counterpart to `hooks/useDashboard.ts`'s owner hooks.
 * Every query/mutation requires a bearer token AND a staff role
 * (platform_admin/content_moderator) — enabled only once both hold, so an
 * unauthorized user never even fires the request (the backend would 403 it
 * anyway, but there's no reason to round-trip for a screen that already
 * knows it can't render the real content).
 */

const BUSINESS_STATUSES: VerificationStatus[] = ['pending', 'verified', 'rejected', 'unverified']
const PRODUCT_STATUSES: ModerationStatus[] = ['pending', 'approved', 'rejected']
const VIDEO_STATUSES: ModerationStatus[] = ['pending', 'approved', 'rejected']

function useIsStaff(): boolean {
  const { status, user } = useAuth()
  return status === 'authenticated' && (user?.role === 'platform_admin' || user?.role === 'content_moderator')
}

export function useAdminBusinesses(statusFilter: VerificationStatus) {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'businesses', statusFilter],
    queryFn: () => adminListBusinesses(token as string, { status: statusFilter, page_size: 100 }),
    enabled: isStaff && Boolean(token),
  })
}

export function useAdminProducts(statusFilter: ModerationStatus) {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'products', statusFilter],
    queryFn: () => adminListProducts(token as string, { status: statusFilter, page_size: 100 }),
    enabled: isStaff && Boolean(token),
  })
}

export function useAdminVideos(statusFilter: ModerationStatus) {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'videos', statusFilter],
    queryFn: () => adminListVideos(token as string, { status: statusFilter, page_size: 100 }),
    enabled: isStaff && Boolean(token),
  })
}

/**
 * At-a-glance counts across every status, independent of which tab is
 * active — this is what powers the "3 pending businesses" banner. Cheap:
 * `page_size: 1` means each call only pays for the `total`, not the rows.
 */
export function useAdminBusinessCounts() {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'businesses', 'counts'],
    queryFn: async () => {
      const results = await Promise.all(
        BUSINESS_STATUSES.map((s) => adminListBusinesses(token as string, { status: s, page_size: 1 })),
      )
      return Object.fromEntries(BUSINESS_STATUSES.map((s, i) => [s, results[i].total])) as Record<VerificationStatus, number>
    },
    enabled: isStaff && Boolean(token),
  })
}

export function useAdminProductCounts() {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'products', 'counts'],
    queryFn: async () => {
      const results = await Promise.all(
        PRODUCT_STATUSES.map((s) => adminListProducts(token as string, { status: s, page_size: 1 })),
      )
      return Object.fromEntries(PRODUCT_STATUSES.map((s, i) => [s, results[i].total])) as Record<ModerationStatus, number>
    },
    enabled: isStaff && Boolean(token),
  })
}

export function useAdminVideoCounts() {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'videos', 'counts'],
    queryFn: async () => {
      const results = await Promise.all(
        VIDEO_STATUSES.map((s) => adminListVideos(token as string, { status: s, page_size: 1 })),
      )
      return Object.fromEntries(VIDEO_STATUSES.map((s, i) => [s, results[i].total])) as Record<ModerationStatus, number>
    },
    enabled: isStaff && Boolean(token),
  })
}

/**
 * Invalidates every cache a moderation decision could affect: the admin
 * queue's own views (all statuses + counts) plus the public Search/
 * BusinessProfile/ProductDetail/VideoFeed caches — an approval needs to show
 * up on the public side without a full reload, same rationale as
 * useDashboard.ts's useInvalidateCatalog.
 */
function useInvalidateAdmin() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['admin'] })
    qc.invalidateQueries({ queryKey: ['businesses'] })
    qc.invalidateQueries({ queryKey: ['business'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['product'] })
    qc.invalidateQueries({ queryKey: ['videos'] })
    qc.invalidateQueries({ queryKey: ['campaigns'] })
  }
}

export function useApproveBusiness() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (businessId: string) => approveBusinessAdmin(token as string, businessId),
    onSuccess: () => invalidate(),
  })
}

export function useRejectBusiness() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ businessId, reason }: { businessId: string; reason: string }) =>
      rejectBusinessAdmin(token as string, businessId, { reason }),
    onSuccess: () => invalidate(),
  })
}

export function useApproveProduct() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (productId: string) => approveProductAdmin(token as string, productId),
    onSuccess: () => invalidate(),
  })
}

export function useRejectProduct() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ productId, reason }: { productId: string; reason: string }) =>
      rejectProductAdmin(token as string, productId, { reason }),
    onSuccess: () => invalidate(),
  })
}

export function useApproveVideo() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (videoId: string) => approveVideoAdmin(token as string, videoId),
    onSuccess: () => invalidate(),
  })
}

export function useRejectVideo() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ videoId, reason }: { videoId: string; reason: string }) =>
      rejectVideoAdmin(token as string, videoId, { reason }),
    onSuccess: () => invalidate(),
  })
}

/**
 * Admin Campaign Moderation (`pages/Admin.tsx`'s "campaigns" section).
 * `CampaignStatus` has 7 reachable values (see docs/decisions.md's Phase 1b
 * design pass) — too many for StatusTabs' usual one-tab-per-status model, so
 * this groups them into 4 tabs the way a moderator actually thinks about
 * them: still needs a first look, currently live in some form (including
 * paused/exhausted — a moderator reviewing "what's live" wants to see all of
 * it, not just the actively-spending subset), formally rejected, and the
 * advertiser's own closed-out campaigns. `GET /admin/campaigns` only accepts
 * one `status` at a time, so a multi-status tab is assembled client-side from
 * parallel calls — same Promise.all pattern as useAdminBusinessCounts below.
 */
export type AdminCampaignTab = 'needs_review' | 'live' | 'rejected' | 'completed'

export const ADMIN_CAMPAIGN_TAB_STATUSES: Record<AdminCampaignTab, CampaignStatus[]> = {
  needs_review: ['pending_review'],
  live: ['approved', 'active', 'paused', 'exhausted'],
  rejected: ['rejected'],
  completed: ['completed'],
}

const ALL_CAMPAIGN_STATUSES: CampaignStatus[] = [
  'pending_review',
  'approved',
  'active',
  'paused',
  'exhausted',
  'rejected',
  'completed',
]

/** Cheap per-status totals (page_size:1, so only `total` is paid for) — powers both the tab-count pills and the per-status breakdown a moderator might want on Overview. */
export function useAdminCampaignCounts() {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'campaigns', 'counts'],
    queryFn: async () => {
      const results = await Promise.all(
        ALL_CAMPAIGN_STATUSES.map((s) => adminListCampaigns(token as string, { status: s, page_size: 1 })),
      )
      return Object.fromEntries(ALL_CAMPAIGN_STATUSES.map((s, i) => [s, results[i].total])) as Record<CampaignStatus, number>
    },
    enabled: isStaff && Boolean(token),
  })
}

/** Fetches every status belonging to `tab`, merges, and sorts newest-first — the multi-status tab's real row list. */
export function useAdminCampaigns(tab: AdminCampaignTab) {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  const statuses = ADMIN_CAMPAIGN_TAB_STATUSES[tab]
  return useQuery({
    queryKey: ['admin', 'campaigns', 'tab', tab],
    queryFn: async () => {
      const results = await Promise.all(
        statuses.map((s) => adminListCampaigns(token as string, { status: s, page_size: 100 })),
      )
      const items = results.flatMap((r) => r.items).sort((a, b) => b.created_at.localeCompare(a.created_at))
      return { items, total: results.reduce((sum, r) => sum + r.total, 0) }
    },
    enabled: isStaff && Boolean(token),
  })
}

export function useApproveCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (campaignId: string) => approveCampaignAdmin(token as string, campaignId),
    onSuccess: () => invalidate(),
  })
}

export function useRejectCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ campaignId, reason }: { campaignId: string; reason: string }) =>
      rejectCampaignAdmin(token as string, campaignId, { reason }),
    onSuccess: () => invalidate(),
  })
}

/**
 * Category Management (`pages/Admin.tsx`'s "categories" section). Unlike the
 * public `useCategories()` (hooks/useCatalog.ts), this returns inactive
 * categories too plus usage counts — see AdminCategoryRead's docstring.
 */
export function useAdminCategories() {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => adminListCategories(token as string),
    enabled: isStaff && Boolean(token),
  })
}

/** A new/renamed/(de)activated category can change what the public category pickers (Home's grid, video upload's select) show — invalidate both the admin list and the public `useCategories()` cache. */
function useInvalidateCategories() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['admin', 'categories'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }
}

export function useCreateCategory() {
  const { token } = useAuth()
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (payload: CategoryCreatePayload) => createCategoryAdmin(token as string, payload),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateCategory() {
  const { token } = useAuth()
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ categoryId, payload }: { categoryId: number; payload: CategoryUpdatePayload }) =>
      updateCategoryAdmin(token as string, categoryId, payload),
    onSuccess: () => invalidate(),
  })
}

/**
 * User Management (`pages/Admin.tsx`'s "users" section). `keepPreviousData`
 * keeps the current page's rows on screen while a new page/filter loads
 * instead of flashing to a loading state — a paginated table reads much
 * better that way than the moderation queues' full-replace loading skeletons.
 */
export function useAdminUsers(params: AdminListUsersParams) {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminListUsers(token as string, params),
    enabled: isStaff && Boolean(token),
    placeholderData: keepPreviousData,
  })
}

/** Fetched lazily, only once a row is expanded — `GET /admin/users` (the list) doesn't include owned businesses, only `GET /admin/users/{id}` does. */
export function useAdminUserDetail(userId: string | null) {
  const { token } = useAuth()
  const isStaff = useIsStaff()
  return useQuery({
    queryKey: ['admin', 'users', 'detail', userId],
    queryFn: () => adminGetUser(token as string, userId as string),
    enabled: isStaff && Boolean(token) && Boolean(userId),
  })
}

export function useUpdateUserActive() {
  const { token } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminUpdateUser(token as string, userId, { is_active: isActive }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'users', 'detail', variables.userId] })
    },
  })
}
