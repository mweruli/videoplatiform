import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCampaign,
  createCampaignFunding,
  completeCampaign,
  getCampaign,
  getCampaignFunding,
  getCampaignPricing,
  getCampaignStatsTimeseries,
  listBusinessCampaigns,
  listCampaignFundings,
  pauseCampaign,
  resumeCampaign,
  updateCampaign,
} from '../lib/api'
import type {
  CampaignCreatePayload,
  CampaignFundingCreatePayload,
  CampaignFundingDto,
  CampaignUpdatePayload,
} from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * TanStack Query hooks for the Business Dashboard's "Campaigns" screen — the
 * self-serve advertiser campaign manager (Phase 1b). Mirrors
 * hooks/useFeaturedPurchase.ts's shape closely (same pricing/create/poll/
 * history pattern), since `POST /campaigns/{id}/funding` is the identical
 * STK-push-then-poll flow adapted from FeaturedPurchaseModal.tsx — see
 * docs/decisions.md's "Phase 1b design pass: self-serve advertiser campaign
 * manager" entry.
 */

/** Public, no auth required — pricing is the same for everyone. Rarely changes, so a longish staleTime avoids a re-fetch every time the fund modal reopens. */
export function useCampaignPricing() {
  return useQuery({
    queryKey: ['campaigns', 'pricing'],
    queryFn: () => getCampaignPricing(),
    staleTime: 5 * 60_000,
  })
}

function myCampaignsKey(businessId: string | undefined) {
  return ['campaigns', 'mine', businessId] as const
}

export function useBusinessCampaigns(businessId: string | undefined) {
  const { token, status } = useAuth()
  return useQuery({
    queryKey: myCampaignsKey(businessId),
    queryFn: () => listBusinessCampaigns(token as string, businessId as string, { page_size: 100 }),
    enabled: status === 'authenticated' && Boolean(token) && Boolean(businessId),
  })
}

export function useCampaign(campaignId: string | undefined) {
  const { token, status } = useAuth()
  return useQuery({
    queryKey: ['campaigns', 'detail', campaignId],
    queryFn: () => getCampaign(token as string, campaignId as string),
    enabled: status === 'authenticated' && Boolean(token) && Boolean(campaignId),
  })
}

/** Invalidates every cache a campaign mutation could affect — the dashboard's own list/detail views plus the public Search catalog (a campaign going active/inactive changes `active_campaign` on the business/product it targets), matching useDashboard.ts's useInvalidateCatalog convention. */
function useInvalidateCampaigns() {
  const qc = useQueryClient()
  return (businessId?: string, campaignId?: string) => {
    qc.invalidateQueries({ queryKey: myCampaignsKey(businessId) })
    qc.invalidateQueries({ queryKey: ['campaigns'] })
    qc.invalidateQueries({ queryKey: ['businesses'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['business'] })
    if (campaignId) qc.invalidateQueries({ queryKey: ['campaigns', 'detail', campaignId] })
  }
}

export function useCreateCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: ({ businessId, payload }: { businessId: string; payload: CampaignCreatePayload }) =>
      createCampaign(token as string, businessId, payload),
    onSuccess: (data) => invalidate(data.business_id),
  })
}

export function useUpdateCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: ({ campaignId, payload }: { campaignId: string; payload: CampaignUpdatePayload }) =>
      updateCampaign(token as string, campaignId, payload),
    onSuccess: (data) => invalidate(data.business_id, data.id),
  })
}

export function usePauseCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: (campaignId: string) => pauseCampaign(token as string, campaignId),
    onSuccess: (data) => invalidate(data.business_id, data.id),
  })
}

export function useResumeCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: (campaignId: string) => resumeCampaign(token as string, campaignId),
    onSuccess: (data) => invalidate(data.business_id, data.id),
  })
}

export function useCompleteCampaign() {
  const { token } = useAuth()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: (campaignId: string) => completeCampaign(token as string, campaignId),
    onSuccess: (data) => invalidate(data.business_id, data.id),
  })
}

export function useCreateCampaignFunding() {
  const { token } = useAuth()
  return useMutation({
    mutationFn: ({ campaignId, payload }: { campaignId: string; payload: CampaignFundingCreatePayload }) =>
      createCampaignFunding(token as string, campaignId, payload),
  })
}

/**
 * Polls `GET /campaign-fundings/{id}` while `status: 'pending'` — identical
 * cadence/stop-condition to usePollFeaturedPurchase. Stops the instant the
 * row leaves `pending` or when the caller flips `enabled` off (the modal's
 * own 2-minute timeout — see CampaignFundingModal.tsx).
 */
export function usePollCampaignFunding(fundingId: string | undefined, enabled: boolean) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['campaign-fundings', fundingId],
    queryFn: () => getCampaignFunding(token as string, fundingId as string),
    enabled: Boolean(token) && Boolean(fundingId) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data as CampaignFundingDto | undefined
      return data && data.status !== 'pending' ? false : 2500
    },
    refetchIntervalInBackground: true,
  })
}

/**
 * Per-campaign spend trend + budget-exhaustion projection — same
 * "collapsed by default, only fetch once expanded" pattern as
 * useCampaignFundingHistory below (see CampaignFundingHistory.tsx),
 * mirrored onto CampaignPerformance.tsx.
 */
export function useCampaignStatsTimeseries(campaignId: string | undefined, days: number, enabled: boolean) {
  const { token, status } = useAuth()
  return useQuery({
    queryKey: ['campaigns', 'stats', 'timeseries', campaignId, days],
    queryFn: () => getCampaignStatsTimeseries(token as string, campaignId as string, days),
    enabled: status === 'authenticated' && Boolean(token) && Boolean(campaignId) && enabled,
  })
}

export function useCampaignFundingHistory(campaignId: string | undefined, enabled: boolean) {
  const { token } = useAuth()
  return useQuery({
    queryKey: ['campaign-fundings', 'history', campaignId],
    queryFn: () => listCampaignFundings(token as string, campaignId as string, { page_size: 10 }),
    enabled: Boolean(token) && Boolean(campaignId) && enabled,
  })
}

/** Invalidates the caches a completed/failed funding could affect, same rationale as useFeaturedPurchase.ts's useInvalidateAfterFeaturedPurchase. */
export function useInvalidateAfterCampaignFunding() {
  const qc = useQueryClient()
  return (businessId: string, campaignId: string) => {
    qc.invalidateQueries({ queryKey: myCampaignsKey(businessId) })
    qc.invalidateQueries({ queryKey: ['campaigns', 'detail', campaignId] })
    qc.invalidateQueries({ queryKey: ['campaign-fundings', 'history', campaignId] })
    qc.invalidateQueries({ queryKey: ['businesses'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['business'] })
  }
}
