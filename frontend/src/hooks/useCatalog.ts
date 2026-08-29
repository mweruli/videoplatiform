import { useQuery } from '@tanstack/react-query'

import {
  getBusinessBySlug,
  getProductBySlug,
  listBusinesses,
  listCategories,
  listProducts,
} from '../lib/api'
import type { ListProductsParams } from '../lib/api'

/**
 * TanStack Query hooks over the real backend catalog endpoints
 * (categories/businesses/products) — see src/lib/api.ts. Search/Business
 * profile/Product detail all read through these rather than calling
 * apiFetch directly, so cache keys and staleness stay consistent.
 *
 * There's no search-indexing service (Meilisearch) wired up yet, so list
 * queries fetch a full page (page_size capped at the backend's max of 100)
 * and Search does its own client-side matching/filtering — see
 * src/lib/searchMatch.ts. Revisit once Meilisearch lands.
 */

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    staleTime: 5 * 60_000,
  })
}

export function useAllBusinesses() {
  return useQuery({
    queryKey: ['businesses', 'all'],
    queryFn: () => listBusinesses({ page_size: 100 }),
  })
}

export function useAllProducts(params: ListProductsParams = {}) {
  return useQuery({
    queryKey: ['products', 'all', params],
    queryFn: () => listProducts({ page_size: 100, ...params }),
  })
}

export function useBusinessBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['business', slug],
    queryFn: () => getBusinessBySlug(slug as string),
    enabled: Boolean(slug),
    retry: false,
  })
}

export function useBusinessProducts(businessId: string | undefined) {
  return useQuery({
    queryKey: ['products', 'by-business', businessId],
    queryFn: () => listProducts({ business_id: businessId, page_size: 100 }),
    enabled: Boolean(businessId),
  })
}

export function useProductBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => getProductBySlug(slug as string),
    enabled: Boolean(slug),
    retry: false,
  })
}
