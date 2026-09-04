import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createFeaturedPurchase,
  getFeaturedPurchase,
  getFeaturedPricing,
  listFeaturedPurchases,
} from '../lib/api'
import type { FeaturedPurchaseCreatePayload, FeaturedPurchaseDto } from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * M-Pesa self-serve featured-placement hooks — the Business Dashboard's
 * "Feature your business" / "Feature this product" purchase flow. See
 * components/dashboard/FeatureCard.tsx (entry points) and
 * components/dashboard/FeaturedPurchaseModal.tsx (the picker → polling →
 * success/failed modal) for where these are consumed.
 */

/** Public, no auth required — pricing is the same for everyone. Rarely changes, so a longish staleTime avoids a re-fetch every time the modal reopens. */
export function useFeaturedPricing() {
  return useQuery({
    queryKey: ['featured', 'pricing'],
    queryFn: () => getFeaturedPricing(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateFeaturedPurchase() {
  const { token } = useAuth()
  return useMutation({
    mutationFn: ({ businessId, payload }: { businessId: string; payload: FeaturedPurchaseCreatePayload }) =>
      createFeaturedPurchase(token as string, businessId, payload),
  })
}

/**
 * Polls `GET /featured-purchases/{id}` while `status: 'pending'` — per
 * docs/decisions.md's guidance, every 2-3s is reasonable. Stops polling the
 * instant the row leaves `pending` (completed/failed are terminal) or when
 * the caller flips `enabled` off (e.g. the modal's own 2-minute timeout
 * gave up — see FeaturedPurchaseModal.tsx, which owns that timer since it's
 * a UI concern, not a data-fetching one).
 */
export function usePollFeaturedPurchase(purchaseId: string | undefined, enabled: boolean) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['featured-purchases', purchaseId],
    queryFn: () => getFeaturedPurchase(token as string, purchaseId as string),
    enabled: Boolean(token) && Boolean(purchaseId) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data as FeaturedPurchaseDto | undefined
      return data && data.status !== 'pending' ? false : 2500
    },
    refetchIntervalInBackground: true,
  })
}

export function useFeaturedPurchaseHistory(businessId: string | undefined, enabled: boolean) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['featured-purchases', 'history', businessId],
    queryFn: () => listFeaturedPurchases(token as string, businessId as string, { page_size: 10 }),
    enabled: Boolean(token) && Boolean(businessId) && enabled,
  })
}

/** Invalidates the caches a completed/failed purchase could affect, so the "Featured until…" card and public catalog reflect the new state without a page reload — same invalidation surface as useDashboard.ts's useInvalidateCatalog, kept local here to avoid a cross-file export just for this. */
export function useInvalidateAfterFeaturedPurchase() {
  const qc = useQueryClient()
  return (businessId: string) => {
    qc.invalidateQueries({ queryKey: ['businesses', 'mine'] })
    qc.invalidateQueries({ queryKey: ['businesses'] })
    qc.invalidateQueries({ queryKey: ['products', 'mine', businessId] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['business'] })
    qc.invalidateQueries({ queryKey: ['featured-purchases', 'history', businessId] })
  }
}
