import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createBusiness,
  createProduct,
  deactivateProduct,
  getMyBusinesses,
  listProducts,
  submitBusinessForVerification,
  updateBusiness,
  updateProduct,
  uploadBusinessCoverImage,
  uploadBusinessLogo,
  uploadProductImages,
} from '../lib/api'
import type {
  BusinessDto,
  BusinessUpdatePayload,
  BusinessWritePayload,
  ProductDto,
  ProductUpdatePayload,
  ProductWritePayload,
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

/** Invalidates every cache a business/product mutation could affect — the dashboard's own views plus the public Search/BusinessProfile/ProductDetail caches, so a save is visible everywhere without a full reload. */
function useInvalidateCatalog() {
  const qc = useQueryClient()
  return (businessId?: string) => {
    qc.invalidateQueries({ queryKey: MINE_KEY })
    qc.invalidateQueries({ queryKey: ['products', 'mine', businessId] })
    qc.invalidateQueries({ queryKey: ['businesses'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['business'] })
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

export function useUploadProductImages() {
  const { token } = useAuth()
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ productId, files }: { productId: string; files: File[] }) =>
      uploadProductImages(token as string, productId, files),
    onSuccess: (data) => invalidate(data.business_id),
  })
}

export type { BusinessDto, ProductDto }
