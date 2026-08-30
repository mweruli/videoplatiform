import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createBusiness,
  createProduct,
  deactivateProduct,
  deactivateVideo,
  getMyBusinesses,
  listProducts,
  listVideos,
  submitBusinessForVerification,
  updateBusiness,
  updateProduct,
  uploadBusinessCoverImage,
  uploadBusinessLogo,
  uploadProductImages,
  uploadVideo,
} from '../lib/api'
import type {
  BusinessDto,
  BusinessUpdatePayload,
  BusinessWritePayload,
  ProductDto,
  ProductUpdatePayload,
  ProductWritePayload,
  VideoDto,
  VideoUploadPayload,
} from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * TanStack Query hooks for the Business Dashboard (`pages/BusinessDashboard.tsx`)
 * — the owner-facing counterpart to `hooks/useCatalog.ts`'s public read hooks.
 * Every query/mutation here requires a bearer token, so each is `enabled`
 * only once `useAuth()` reports an authenticated session.
 */

const MINE_KEY = ['businesses', 'mine'] as const

function myProductsKey(businessId: string | undefined) {
  return ['products', 'mine', businessId] as const
}

function myVideosKey(businessId: string | undefined) {
  return ['videos', 'mine', businessId] as const
}

export function useMyBusinesses() {
  const { token, status } = useAuth()
  return useQuery({
    queryKey: MINE_KEY,
    queryFn: () => getMyBusinesses(token as string),
    enabled: status === 'authenticated' && Boolean(token),
  })
}

/**
 * Owner's own products for one business, including pending/rejected ones the
 * public API hides. `is_active` (soft-delete) is always filtered server-side
 * regardless of `include_unapproved` — a removed product stays gone.
 */
export function useMyBusinessProducts(businessId: string | undefined) {
  const { token, status } = useAuth()
  return useQuery({
    queryKey: myProductsKey(businessId),
    queryFn: () =>
      listProducts({ business_id: businessId, include_unapproved: true, page_size: 100 }, token as string),
    enabled: status === 'authenticated' && Boolean(token) && Boolean(businessId),
  })
}

/** Invalidates every cache a business/product/video mutation could affect — the dashboard's own views plus the public Search/BusinessProfile/ProductDetail/VideoFeed caches, so a save is visible everywhere without a full reload. */
function useInvalidateCatalog() {
  const qc = useQueryClient()
  return (businessId?: string) => {
    qc.invalidateQueries({ queryKey: MINE_KEY })
    qc.invalidateQueries({ queryKey: ['products', 'mine', businessId] })
    qc.invalidateQueries({ queryKey: ['videos', 'mine', businessId] })
    qc.invalidateQueries({ queryKey: ['businesses'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['business'] })
    qc.invalidateQueries({ queryKey: ['videos'] })
  }
}

export function useCreateBusiness() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (payload: BusinessWritePayload) => createBusiness(token as string, payload),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateBusiness() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ businessId, payload }: { businessId: string; payload: BusinessUpdatePayload }) =>
      updateBusiness(token as string, businessId, payload),
    onSuccess: (data) => invalidate(data.id),
  })
}

export function useSubmitForVerification() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: (businessId: string) => submitBusinessForVerification(token as string, businessId),
    onSuccess: (data) => invalidate(data.id),
  })
}

export function useUploadBusinessLogo() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ businessId, file }: { businessId: string; file: File }) =>
      uploadBusinessLogo(token as string, businessId, file),
    onSuccess: (data) => invalidate(data.id),
  })
}

export function useUploadBusinessCover() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ businessId, file }: { businessId: string; file: File }) =>
      uploadBusinessCoverImage(token as string, businessId, file),
    onSuccess: (data) => invalidate(data.id),
  })
}

export function useCreateProduct() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ businessId, payload }: { businessId: string; payload: ProductWritePayload }) =>
      createProduct(token as string, businessId, payload),
    onSuccess: (data) => invalidate(data.business_id),
  })
}

export function useUpdateProduct() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ productId, payload }: { productId: string; payload: ProductUpdatePayload }) =>
      updateProduct(token as string, productId, payload),
    onSuccess: (data) => invalidate(data.business_id),
  })
}

export function useDeactivateProduct() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ productId }: { productId: string; businessId: string }) => deactivateProduct(token as string, productId),
    onSuccess: (_data, variables) => invalidate(variables.businessId),
  })
}

/**
 * Owner's own videos for one business, including pending/rejected ones the
 * public GET /videos hides — same shape as useMyBusinessProducts.
 */
export function useMyBusinessVideos(businessId: string | undefined) {
  const { token, status } = useAuth()
  return useQuery({
    queryKey: myVideosKey(businessId),
    queryFn: () => listVideos({ business_id: businessId, include_unapproved: true, page_size: 100 }, token as string),
    enabled: status === 'authenticated' && Boolean(token) && Boolean(businessId),
  })
}

export function useUploadVideo() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ businessId, payload }: { businessId: string; payload: VideoUploadPayload }) =>
      uploadVideo(token as string, businessId, payload),
    onSuccess: (data) => invalidate(data.business_id),
  })
}

/** Two-click soft-delete — see components/dashboard/VideoManageCard.tsx for the confirm-click UX, mirroring useDeactivateProduct exactly. */
export function useDeactivateVideo() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ videoId }: { videoId: string; businessId: string }) => deactivateVideo(token as string, videoId),
    onSuccess: (_data, variables) => invalidate(variables.businessId),
  })
}

export function useUploadProductImages() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ productId, files }: { productId: string; files: File[] }) =>
      uploadProductImages(token as string, productId, files),
    onSuccess: (data) => invalidate(data.business_id),
  })
}

export type { BusinessDto, ProductDto, VideoDto }
