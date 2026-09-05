import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import Icon from '../icons/Icon'
import CategoryChipSelect from './CategoryChipSelect'
import { Field, FormBanner, Select, SubmitButton, TextArea, TextInput } from '../ui/FormControls'
import { useCategories } from '../../hooks/useCatalog'
import { ApiError } from '../../lib/api'
import type { AvailabilityStatus, CategoryDto, ProductDto, ProductWritePayload } from '../../lib/api'
import { CATEGORY_SUGGESTION_DEBOUNCE_MS, suggestCategories } from '../../lib/categoryKeywords'
import { tokenize } from '../../lib/searchMatch'

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
  const [categoryIds, setCategoryIds] = useState<Set<number>>(() => new Set((initial?.categories ?? []).map((c) => c.id)))
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

  // Automated category suggestion (keyword matching, no AI/API call — see
  // lib/categoryKeywords.ts). Pre-checks suggested categories as the owner
  // types, but only until they touch the picker themselves — an existing,
  // already-categorised product (edit mode) counts as "touched" from the
  // start so a small description tweak can't silently replace deliberate
  // prior curation.
  const [suggestions, setSuggestions] = useState<CategoryDto[]>([])
  const [manuallyTouched, setManuallyTouched] = useState(() => categoryIds.size > 0)
  const manualTouchRef = useRef(manuallyTouched)

  function updateSpecRow(index: number, field: 'key' | 'value', value: string) {
    setSpecRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function addSpecRow() {
    setSpecRows((rows) => [...rows, { key: '', value: '' }])
  }

  function removeSpecRow(index: number) {
    setSpecRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : [{ key: '', value: '' }]))
  }

  function toggleCategory(id: number) {
    manualTouchRef.current = true
    setManuallyTouched(true)
    setCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Debounced re-scoring, same spirit as Search's live-search debounce
  // (pages/Search.tsx) — recompute shortly after typing settles rather than
  // on every keystroke.
  useEffect(() => {
    const categories = categoriesQuery.data
    if (!categories || categories.length === 0) return
    const timeout = window.setTimeout(() => {
      const matches = suggestCategories(`${name} ${description}`, categories, tokenize)
      setSuggestions(matches)
      if (!manualTouchRef.current) {
        setCategoryIds(new Set(matches.map((c) => c.id)))
      }
    }, CATEGORY_SUGGESTION_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [name, description, categoriesQuery.data])

  // Only surfaced once the owner has taken over category selection
  // themselves — before that, suggestions are already reflected directly as
  // pre-checked chips, so a second "suggested" hint would be redundant.
  const pendingSuggestions = manuallyTouched ? suggestions.filter((c) => !categoryIds.has(c.id)) : []

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
      category_ids: Array.from(categoryIds),
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

      <Field label="Categories" optional hint="Tap to select as many as apply — most listings need just one or two.">
        <CategoryChipSelect
          categories={categoriesQuery.data ?? []}
          selectedIds={categoryIds}
          onToggle={toggleCategory}
          loading={categoriesQuery.isLoading}
        />
        {pendingSuggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Icon name="sparkle" size={12} className="text-teal" /> Suggested:
            </span>
            {pendingSuggestions.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                className="rounded-full border border-dashed border-teal/60 px-2.5 py-0.5 text-xs font-bold text-teal transition-colors duration-150 ease-brand hover:bg-teal/10"
              >
                + {category.name}
              </button>
            ))}
          </div>
        )}
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
