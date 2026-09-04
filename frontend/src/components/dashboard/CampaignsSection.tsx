import { useState } from 'react'

import CampaignCard from './CampaignCard'
import CreateCampaignModal from './CreateCampaignModal'
import Icon from '../icons/Icon'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'
import { useBusinessCampaigns } from '../../hooks/useCampaigns'
import type { BusinessDto, ProductDto } from '../../lib/api'
import { useToast } from '../../lib/toast'

interface CampaignsSectionProps {
  business: BusinessDto
  products: ProductDto[]
}

/**
 * Business Dashboard "Campaigns" screen — the self-serve advertiser campaign
 * manager (Phase 1b). Mirrors ProductsSection.tsx's list/add-button/empty-
 * state shape; per-campaign lifecycle actions and funding live on
 * CampaignCard. See docs/decisions.md's "Phase 1b design pass: self-serve
 * advertiser campaign manager" entry for the full design this implements.
 */
export default function CampaignsSection({ business, products }: CampaignsSectionProps) {
  const { showToast } = useToast()
  const campaignsQuery = useBusinessCampaigns(business.id)
  const campaigns = campaignsQuery.data?.items ?? []
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-foreground">Ad campaigns</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Target a category or location with a Sponsored placement in Search — billed per impression against a prepaid budget.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex flex-none items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
        >
          <Icon name="plus" size={13} /> New campaign
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {campaignsQuery.isLoading && (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}

        {campaignsQuery.isError && (
          <EmptyState tone="error" title="Couldn't load your campaigns" subtitle="Check your connection and try again." />
        )}

        {!campaignsQuery.isLoading && !campaignsQuery.isError && campaigns.length === 0 && (
          <EmptyState
            icon="📣"
            title="No ad campaigns yet"
            subtitle="Target shoppers browsing a specific category or location with a Sponsored placement in Search results."
          >
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-5 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
            >
              Create your first campaign
            </button>
          </EmptyState>
        )}

        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} businessPhone={business.phone} />
        ))}
      </div>

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        businessId={business.id}
        businessName={business.name}
        products={products}
        onCreated={() => showToast('Campaign created — pending review')}
      />
    </div>
  )
}
