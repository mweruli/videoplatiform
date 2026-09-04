import { useState } from 'react'
import type { FormEvent } from 'react'

import Modal from '../ui/Modal'
import { Field, FormBanner, Select, SubmitButton, TextInput } from '../ui/FormControls'
import { useCategories } from '../../hooks/useCatalog'
import { useCreateCampaign } from '../../hooks/useCampaigns'
import { ApiError } from '../../lib/api'
import type { ProductDto } from '../../lib/api'

const ALL_CATEGORIES_VALUE = '__all__'
const THIS_BUSINESS_VALUE = '__business__'

interface CreateCampaignModalProps {
  open: boolean
  onClose: () => void
  businessId: string
  businessName: string
  /** The current business's own products (any moderation status) — a campaign can promote the business itself or one of its own products, same scoping as VideoUploadForm's "Link to a product". */
  products: ProductDto[]
  onCreated: () => void
}

/**
 * Create-campaign form — name, target (this business or one of its
 * products), category targeting ("All categories" or one specific), and an
 * optional free-text county. Always starts `pending_review` with zero
 * budget server-side; funding is a separate step (CampaignFundingModal),
 * independent of moderation — see docs/decisions.md's "Phase 1b design
 * pass" entry.
 *
 * County is a plain text field, not a picker, deliberately matching
 * BusinessForm.tsx's own county field 1:1 — there is no canonical fixed
 * county-list component anywhere in this codebase to reuse (Search.tsx's
 * `locations` is derived ad hoc from whatever counties already exist in the
 * catalog, not an exported picker), so a free-text field is the actual
 * existing convention here, not a shortcut around one.
 */
export default function CreateCampaignModal({ open, onClose, businessId, businessName, products, onCreated }: CreateCampaignModalProps) {
  const categoriesQuery = useCategories()
  const createMutation = useCreateCampaign()

  const [name, setName] = useState('')
  const [targetValue, setTargetValue] = useState(THIS_BUSINESS_VALUE)
  const [categoryValue, setCategoryValue] = useState(ALL_CATEGORIES_VALUE)
  const [county, setCounty] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)

  function handleClose() {
    if (createMutation.isPending) return
    setName('')
    setTargetValue(THIS_BUSINESS_VALUE)
    setCategoryValue(ALL_CATEGORIES_VALUE)
    setCounty('')
    setErrors({})
    setBanner(null)
    onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    const trimmedName = name.trim()
    const nextErrors: Record<string, string> = {}
    if (trimmedName.length < 2) nextErrors.name = 'Give this campaign a name.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      await createMutation.mutateAsync({
        businessId,
        payload: {
          name: trimmedName,
          product_id: targetValue === THIS_BUSINESS_VALUE ? null : targetValue,
          category_id: categoryValue === ALL_CATEGORIES_VALUE ? null : Number(categoryValue),
          county: county.trim() || null,
        },
      })
      handleClose()
      onCreated()
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'Could not create this campaign. Please try again.')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New ad campaign">
      <form onSubmit={handleSubmit} noValidate>
        <FormBanner kind="error" message={banner} />
        <p className="mb-3.5 text-sm leading-relaxed text-muted-foreground">
          New campaigns go to Miles Tech&apos;s moderation queue before they can go live, and start with zero budget — fund it once
          it&apos;s created.
        </p>

        <Field label="Campaign name" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nairobi Solar Push — September"
            error={!!errors.name}
            autoFocus
          />
        </Field>

        <Field label="What are you promoting?">
          <Select
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            options={[
              { value: THIS_BUSINESS_VALUE, label: `${businessName} (this business)` },
              ...products.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Field>

        <Field label="Category targeting" optional hint="Sponsored placement only shows to shoppers currently browsing this category.">
          <Select
            value={categoryValue}
            onChange={(e) => setCategoryValue(e.target.value)}
            disabled={categoriesQuery.isLoading}
            options={[
              { value: ALL_CATEGORIES_VALUE, label: 'All categories' },
              ...(categoriesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </Field>

        <Field label="Location targeting" optional hint="Leave blank to target every location. Otherwise, only shoppers browsing this county see the Sponsored tie-break.">
          <TextInput value={county} onChange={(e) => setCounty(e.target.value)} placeholder="e.g. Nairobi" />
        </Field>

        <div className="mt-4">
          <SubmitButton loading={createMutation.isPending} loadingText="Creating…">
            Create campaign
          </SubmitButton>
        </div>
      </form>
    </Modal>
  )
}
