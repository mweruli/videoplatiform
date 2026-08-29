import { useState } from 'react'
import type { FormEvent } from 'react'

import Icon from '../icons/Icon'
import { Field, FormBanner, Select, SubmitButton, TextArea, TextInput } from '../ui/FormControls'
import { useCategories } from '../../hooks/useCatalog'
import { ApiError } from '../../lib/api'
import type { AvailabilityStatus, ProductDto, ProductWritePayload } from '../../lib/api'

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'made_to_order', label: 'Made to order' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'discontinued', label: 'Discontinued' },
]

const CURRENCY_OPTIONS = [
  { value: 'KES', label: 'KES — Kenyan Shilling' },
  { value: 'USD', label: 'USD — US Dollar' },
]

interface SpecRow {
  key: string
  value: string
}

function specsToRows(specs: Record<string, string> | undefined): SpecRow[] {
  const entries = Object.entries(specs ?? {})
  return entries.length > 0 ? entries.map(([key, value]) => ({ key, value })) : [{ key: '', value: '' }]
}

interface ProductFormProps {
  initial?: ProductDto
  onSubmit: (payload: ProductWritePayload) => Promise<unknown>
  onDone: () => void
  submitLabel: string
  submittingLabel: string
  /** Shown when editing an already-approved product — the backend re-queues it for moderation on any change. */
  showReReviewNotice?: boolean
}

/** Create/edit form for a Product — field set mirrors ProductCreate/ProductUpdate exactly (app/schemas/product.py). related_product_ids is omitted (a curated cross-sell picker is a reasonable fast-follow, not core CRUD). */
export default function ProductForm({ initial, onSubmit, onDone, submitLabel, submittingLabel, showReReviewNotice }: ProductFormProps) {
  const categoriesQuery = useCategories()

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category?.id ? String(initial.category.id) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'KES')
  const [priceMin, setPriceMin] = useState(initial?.price_min ?? '')
  const [priceMax, setPriceMax] = useState(initial?.price_max ?? '')
  const [warrantyTerms, setWarrantyTerms] = useState(initial?.warranty_terms ?? '')
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>(initial?.availability_status ?? 'in_stock')
  const [availabilityNote, setAvailabilityNote] = useState(initial?.availability_note ?? '')
  const [county, setCounty] = useState(initial?.county ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => specsToRows(initial?.specs))

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateSpecRow(index: number, field: 'key' | 'value', value: string) {
    setSpecRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function addSpecRow() {
    setSpecRows((rows) => [...rows, { key: '', value: '' }])
  }

  function removeSpecRow(index: number) {
    setSpecRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : [{ key: '', value: '' }]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    const nextErrors: Record<string, string> = {}

    const trimmedName = name.trim()
    if (trimmedName.length < 2) nextErrors.name = 'Product name must be at least 2 characters.'

    const min = priceMin === '' ? null : Number(priceMin)
    const max = priceMax === '' ? null : Number(priceMax)
    if (priceMin !== '' && (Number.isNaN(min) || (min as number) < 0)) nextErrors.priceMin = 'Enter a valid price.'
    if (priceMax !== '' && (Number.isNaN(max) || (max as number) < 0)) nextErrors.priceMax = 'Enter a valid price.'
    if (min !== null && max !== null && max < min) nextErrors.priceMax = 'Maximum price cannot be less than minimum.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const specs: Record<string, string> = {}
    for (const row of specRows) {
      const key = row.key.trim()
      if (key) specs[key] = row.value.trim()
    }

    const payload: ProductWritePayload = {
      name: trimmedName,
      description: description.trim() || null,
      category_id: categoryId ? Number(categoryId) : null,
      specs,
      currency,
      price_min: min,
      price_max: max,
      warranty_terms: warrantyTerms.trim() || null,
      availability_status: availabilityStatus,
      availability_note: availabilityNote.trim() || null,
      county: county.trim() || null,
      city: city.trim() || null,
    }

    setSubmitting(true)
    try {
      await onSubmit(payload)
      onDone()
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormBanner kind="error" message={banner} />
      {showReReviewNotice && (
        <div className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-border bg-panel px-3.5 py-2.5 text-xs leading-snug text-muted-foreground">
          <Icon name="clock" size={14} className="mt-0.5 flex-none text-teal" />
          Saving changes sends this listing back for moderator review before it's visible to buyers again.
        </div>
      )}

      <Field label="Product / service name" error={errors.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Industrial Sewing Machine" error={!!errors.name} />
      </Field>

      <Field label="Description" optional>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Specs, use cases, what's included…" />
      </Field>

      <Field label="Category" optional>
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          placeholder={categoriesQuery.isLoading ? 'Loading categories…' : 'Select a category'}
          disabled={categoriesQuery.isLoading}
          options={(categoriesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCY_OPTIONS} />
        </Field>
        <Field label="Min price" optional error={errors.priceMin}>
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="0"
            error={!!errors.priceMin}
          />
        </Field>
        <Field label="Max price" optional error={errors.priceMax}>
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="0"
            error={!!errors.priceMax}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Availability">
          <Select
            value={availabilityStatus}
            onChange={(e) => setAvailabilityStatus(e.target.value as AvailabilityStatus)}
            options={AVAILABILITY_OPTIONS}
          />
        </Field>
        <Field label="Warranty" optional>
          <TextInput value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} placeholder="e.g. 12 months" />
        </Field>
      </div>

      <Field label="Availability note" optional>
        <TextInput value={availabilityNote} onChange={(e) => setAvailabilityNote(e.target.value)} placeholder="e.g. Ready to ship in 3 days" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="County" optional hint="Defaults to your business location if left blank.">
          <TextInput value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Nairobi" />
        </Field>
        <Field label="City / Town" optional>
          <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder="Nairobi" />
        </Field>
      </div>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
          Specifications <span className="font-semibold tracking-normal normal-case opacity-70">(optional)</span>
        </label>
        <div className="flex flex-col gap-2">
          {specRows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <TextInput
                value={row.key}
                onChange={(e) => updateSpecRow(index, 'key', e.target.value)}
                placeholder="e.g. Power"
                className="flex-1"
              />
              <TextInput
                value={row.value}
                onChange={(e) => updateSpecRow(index, 'value', e.target.value)}
                placeholder="e.g. 750W"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeSpecRow(index)}
                aria-label="Remove specification"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-brand hover:bg-panel hover:text-danger"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSpecRow}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-teal hover:text-teal"
        >
          <Icon name="plus" size={11} /> Add specification
        </button>
      </div>

      <div className="mt-4">
        <SubmitButton loading={submitting} loadingText={submittingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  )
}
