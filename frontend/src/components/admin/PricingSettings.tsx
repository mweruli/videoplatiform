import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import Icon from '../icons/Icon'
import DashSection from '../dashboardshell/DashSection'
import EmptyState from '../ui/EmptyState'
import { Field, TextInput } from '../ui/FormControls'
import Modal from '../ui/Modal'
import Skeleton from '../ui/Skeleton'
import ToggleSwitch from '../ui/ToggleSwitch'
import {
  useAdminFeaturedPricingTiers,
  useCreateFeaturedPricingTier,
  useUpdateCampaignPricing,
  useUpdateFeaturedPricingTier,
} from '../../hooks/useAdmin'
import { useCampaignPricing } from '../../hooks/useCampaigns'
import { ApiError } from '../../lib/api'
import type { AdminFeaturedPricingTierDto } from '../../lib/api'
import { formatKES } from '../../lib/format'
import { useToast } from '../../lib/toast'

/**
 * A brief, prominent reminder that a price change here is forward-looking
 * only — the single most important thing an admin needs to understand about
 * this screen (see docs/decisions.md's "Admin-editable pricing" entry:
 * FeaturedPurchase/Campaign both snapshot their price at creation time and
 * never re-read this live rate afterward). Shown inline in each section
 * rather than as a one-time dismissible banner, since it stays relevant every
 * time an admin comes back to edit a price.
 */
function ForwardLookingNote({ children }: { children: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-brand/25 bg-brand/5 px-3.5 py-2.5 text-[13px] leading-snug text-foreground dark:border-ice/25 dark:bg-ice/10">
      <Icon name="alertTriangle" size={14} className="mt-0.5 flex-none text-brand dark:text-ice" />
      <p>{children}</p>
    </div>
  )
}

/**
 * Admin Panel → Pricing Settings (`pages/Admin.tsx`'s "pricing" section).
 * Real backend throughout: `GET/POST /admin/featured-pricing-tiers`, `PATCH
 * /admin/featured-pricing-tiers/{id}`, `GET /campaigns/pricing`, `PATCH
 * /admin/campaign-pricing` — see hooks/useAdmin.ts. Section 1 (Featured
 * Placement tiers) deliberately mirrors CategoryManagement.tsx's exact
 * table/inline-edit/toggle pattern (same components, same interaction
 * model — see docs/decisions.md's "Admin-editable pricing" entry, which
 * calls this out explicitly). Section 2 (Ad Campaign pricing) is a plain
 * two-field settings form, no table, since it's a single row not a tier list.
 */
export default function PricingSettings() {
  return (
    <div>
      <FeaturedTierSection />
      <CampaignPricingSection />
    </div>
  )
}

function FeaturedTierSection() {
  const { showToast } = useToast()
  const tiersQuery = useAdminFeaturedPricingTiers()
  const updateMutation = useUpdateFeaturedPricingTier()
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const tiers = tiersQuery.data ?? []
  const activeCount = tiers.filter((t) => t.is_active).length

  function startEdit(tier: AdminFeaturedPricingTierDto) {
    setEditingId(tier.id)
    setEditLabel(tier.label)
    setEditDuration(String(tier.duration_days))
    setEditAmount(tier.amount_kes)
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  function saveEdit(tier: AdminFeaturedPricingTierDto) {
    const label = editLabel.trim()
    const duration = Number(editDuration)
    const amount = Number(editAmount)
    if (!label) {
      setEditError('Give the tier a label.')
      return
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      setEditError('Duration must be a positive number of days.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditError('Price must be a positive amount.')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    updateMutation.mutate(
      { tierId: tier.id, payload: { label, duration_days: duration, amount_kes: amount } },
      {
        onSuccess: () => {
          setSavingEdit(false)
          cancelEdit()
          showToast(`${label} updated`)
        },
        onError: (err) => {
          setSavingEdit(false)
          setEditError(err instanceof ApiError ? err.message : 'Could not update this tier.')
        },
      },
    )
  }

  function toggleActive(tier: AdminFeaturedPricingTierDto) {
    updateMutation.mutate(
      { tierId: tier.id, payload: { is_active: !tier.is_active } },
      {
        onSuccess: () => showToast(tier.is_active ? `${tier.label} deactivated` : `${tier.label} reactivated`),
        onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not update this tier.'),
      },
    )
  }

  return (
    <DashSection
      title="Featured Placement tiers"
      subtitle={
        tiersQuery.isSuccess
          ? `${tiers.length} total · ${activeCount} active and shown to businesses. Deactivating hides a tier from new purchases — it's never deleted, so past purchases keep their record.`
          : undefined
      }
      action={
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex flex-none items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-3.5 py-2 text-xs font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
        >
          <Icon name="plus" size={13} />
          Add tier
        </button>
      }
    >
      <ForwardLookingNote>
        Changing a tier&apos;s price or duration only affects placements purchased from now on — any placement already bought
        keeps the price and duration it was purchased at.
      </ForwardLookingNote>

      {tiersQuery.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}

      {tiersQuery.isError && (
        <EmptyState tone="error" title="Couldn't load pricing tiers" subtitle="Check your connection and try again.">
          <button
            type="button"
            onClick={() => tiersQuery.refetch()}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Retry
          </button>
        </EmptyState>
      )}

      {tiersQuery.isSuccess && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-extrabold">Label</th>
                <th className="py-2 pr-3 font-extrabold">Duration</th>
                <th className="py-2 pr-3 font-extrabold">Price</th>
                <th className="py-2 pr-3 font-extrabold">Status</th>
                <th className="py-2 pr-1 font-extrabold" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => {
                const editing = editingId === tier.id
                return (
                  <tr key={tier.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">
                      {editing ? (
                        <TextInput
                          autoFocus
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="!py-1.5 text-sm font-bold"
                          error={Boolean(editError)}
                        />
                      ) : (
                        <div className={`flex items-center gap-2.5 ${tier.is_active ? '' : 'opacity-50 grayscale'}`}>
                          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel text-foreground">
                            <Icon name="cash" size={15} />
                          </span>
                          <div className="min-w-0 truncate font-bold text-foreground">{tier.label}</div>
                        </div>
                      )}
                    </td>
                    <td className={`py-2.5 pr-3 ${!editing && !tier.is_active ? 'opacity-50' : ''}`}>
                      {editing ? (
                        <div className="flex items-center gap-1.5">
                          <TextInput
                            type="number"
                            min={1}
                            step={1}
                            value={editDuration}
                            onChange={(e) => setEditDuration(e.target.value)}
                            className="!w-20 !py-1.5 text-sm"
                            error={Boolean(editError)}
                          />
                          <span className="text-xs text-muted-foreground">days</span>
                        </div>
                      ) : (
                        <span className="text-foreground">{tier.duration_days} days</span>
                      )}
                    </td>
                    <td className={`py-2.5 pr-3 ${!editing && !tier.is_active ? 'opacity-50' : ''}`}>
                      {editing ? (
                        <TextInput
                          type="number"
                          min={1}
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="!w-28 !py-1.5 text-sm"
                          error={Boolean(editError)}
                        />
                      ) : (
                        <span className="font-semibold text-foreground">{formatKES(Number(tier.amount_kes))}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {tier.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal">
                          <Icon name="check" size={10} strokeWidth={3} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-1">
                      <div className="flex items-center justify-end gap-2">
                        {editing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveEdit(tier)}
                              disabled={savingEdit}
                              aria-label="Save"
                              title="Save"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-teal text-white transition-opacity duration-150 ease-brand hover:opacity-90 disabled:opacity-60"
                            >
                              <Icon name="check" size={13} strokeWidth={3} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              aria-label="Cancel"
                              title="Cancel"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/70"
                            >
                              <Icon name="close" size={13} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(tier)}
                            aria-label={`Edit ${tier.label}`}
                            title="Edit"
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 ease-brand hover:bg-panel hover:text-foreground"
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        )}
                        <ToggleSwitch
                          on={tier.is_active}
                          onToggle={() => toggleActive(tier)}
                          label={tier.is_active ? `Deactivate ${tier.label}` : `Reactivate ${tier.label}`}
                          disabled={updateMutation.isPending}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {editingId !== null && editError && (
                <tr>
                  <td colSpan={5} className="pt-1 pb-2">
                    <p className="text-xs font-semibold text-danger">{editError}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <FeaturedTierAddModal open={addOpen} onClose={() => setAddOpen(false)} />
    </DashSection>
  )
}

function FeaturedTierAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast()
  const createMutation = useCreateFeaturedPricingTier()
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    setLabel('')
    setDuration('')
    setAmount('')
    setError(null)
    onClose()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmedLabel = label.trim()
    const durationDays = Number(duration)
    const amountKes = Number(amount)
    if (!trimmedLabel) {
      setError('Give the tier a label.')
      return
    }
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      setError('Duration must be a positive number of days.')
      return
    }
    if (!Number.isFinite(amountKes) || amountKes <= 0) {
      setError('Price must be a positive amount.')
      return
    }
    setError(null)
    createMutation.mutate(
      { label: trimmedLabel, duration_days: durationDays, amount_kes: amountKes },
      {
        onSuccess: (tier) => {
          showToast(`${tier.label} added`)
          handleClose()
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not add this tier.'),
      },
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add featured placement tier">
      <p className="mb-4 text-sm text-muted-foreground">
        Any duration works — this isn&apos;t locked to a fixed set of options like 7 or 30 days.
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="Label">
          <TextInput
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Launch Special — 10 days"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (days)">
            <TextInput type="number" min={1} step={1} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="14" />
          </Field>
          <Field label="Price (KES)">
            <TextInput type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="750" />
          </Field>
        </div>
        {error && <p className="mb-3.5 text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-1.5 flex gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-full border-[1.5px] border-border py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-panel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex-1 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-70"
          >
            {createMutation.isPending ? 'Adding…' : 'Add tier'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CampaignPricingSection() {
  const { showToast } = useToast()
  const pricingQuery = useCampaignPricing()
  const updateMutation = useUpdateCampaignPricing()
  const [cpm, setCpm] = useState('')
  const [minFunding, setMinFunding] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Pre-fill from the live values once loaded, but don't clobber whatever the
  // admin is mid-typing if this re-fetches in the background.
  useEffect(() => {
    if (pricingQuery.data && !dirty) {
      setCpm(pricingQuery.data.cpm_kes)
      setMinFunding(pricingQuery.data.min_funding_kes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingQuery.data])

  const cpmNumber = Number(cpm)
  const derivedCostPerImpression = Number.isFinite(cpmNumber) && cpmNumber > 0 ? cpmNumber / 1000 : null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cpmKes = Number(cpm)
    const minFundingKes = Number(minFunding)
    if (!Number.isFinite(cpmKes) || cpmKes <= 0) {
      setError('CPM rate must be a positive amount.')
      return
    }
    if (!Number.isFinite(minFundingKes) || minFundingKes <= 0) {
      setError('Minimum funding must be a positive amount.')
      return
    }
    setError(null)
    updateMutation.mutate(
      { cpm_kes: cpmKes, min_funding_kes: minFundingKes },
      {
        onSuccess: () => {
          setDirty(false)
          showToast('Ad campaign pricing updated')
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update campaign pricing.'),
      },
    )
  }

  return (
    <DashSection title="Ad Campaign pricing" subtitle="The current CPM rate and minimum top-up amount for every advertiser's campaign.">
      <ForwardLookingNote>
        Changing the CPM rate or minimum funding only affects campaigns created (and top-ups made) from now on — every
        existing campaign keeps billing at the CPM rate it was created under.
      </ForwardLookingNote>

      {pricingQuery.isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}

      {pricingQuery.isError && (
        <EmptyState tone="error" title="Couldn't load campaign pricing" subtitle="Check your connection and try again.">
          <button
            type="button"
            onClick={() => pricingQuery.refetch()}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Retry
          </button>
        </EmptyState>
      )}

      {pricingQuery.isSuccess && (
        <form onSubmit={handleSubmit} noValidate className="max-w-md">
          <Field label="CPM rate (KES per 1,000 impressions)">
            <TextInput
              type="number"
              min={1}
              step="0.01"
              value={cpm}
              onChange={(e) => {
                setCpm(e.target.value)
                setDirty(true)
              }}
            />
          </Field>
          <p className="-mt-2 mb-3.5 text-xs text-muted-foreground">
            {derivedCostPerImpression !== null
              ? `${formatKES(cpmNumber)} per 1,000 impressions = ${formatKES(derivedCostPerImpression)} per impression.`
              : 'Enter a CPM rate to see the per-impression cost.'}
          </p>
          <Field label="Minimum funding (KES)">
            <TextInput
              type="number"
              min={1}
              step="0.01"
              value={minFunding}
              onChange={(e) => {
                setMinFunding(e.target.value)
                setDirty(true)
              }}
            />
          </Field>
          {error && <p className="mb-3.5 text-xs font-semibold text-danger">{error}</p>}
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-5 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-70"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </DashSection>
  )
}
