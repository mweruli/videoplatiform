import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  adminListBusinesses,
  adminListProducts,
  adminListVideos,
  approveBusinessAdmin,
  approveProductAdmin,
  approveVideoAdmin,
  rejectBusinessAdmin,
  rejectProductAdmin,
  rejectVideoAdmin,
} from '../lib/api'
import type { ModerationStatus, VerificationStatus } from '../lib/api'
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
