import { useState } from 'react'
import type { FormEvent } from 'react'

import { Field, FormBanner, Select, SubmitButton, TextArea, TextInput } from '../ui/FormControls'
import { useCategories } from '../../hooks/useCatalog'
import { ApiError } from '../../lib/api'
import type { BusinessDto, BusinessWritePayload } from '../../lib/api'

const PHONE_RE = /^\+?[0-9 -]{7,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface BusinessFormProps {
  /** Present when editing; absent when creating. */
  initial?: BusinessDto
  onSubmit: (payload: BusinessWritePayload) => Promise<unknown>
  onDone: () => void
  submitLabel: string
  submittingLabel: string
}

/**
 * Create/edit form for a Business — field set mirrors BusinessCreate/
 * BusinessUpdate exactly (app/schemas/business.py): verification_status and
 * cover_video_asset_id are deliberately absent (verification only changes
 * via admin endpoints; cover video needs the video-upload work from a later
 * sprint, not this one).
 */
export default function BusinessForm({ initial, onSubmit, onDone, submitLabel, submittingLabel }: BusinessFormProps) {
  const categoriesQuery = useCategories()

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category?.id ? String(initial.category.id) : '')
  const [county, setCounty] = useState(initial?.county ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [addressLine, setAddressLine] = useState(initial?.address_line ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? '')
  const [facebookUrl, setFacebookUrl] = useState(initial?.facebook_url ?? '')
  const [instagramUrl, setInstagramUrl] = useState(initial?.instagram_url ?? '')
  const [twitterUrl, setTwitterUrl] = useState(initial?.twitter_url ?? '')
  const [tiktokUrl, setTiktokUrl] = useState(initial?.tiktok_url ?? '')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    const nextErrors: Record<string, string> = {}

    const trimmedName = name.trim()
    if (trimmedName.length < 2) nextErrors.name = 'Business name must be at least 2 characters.'
    if (phone.trim() && !PHONE_RE.test(phone.trim())) {
      nextErrors.phone = "Phone number must be 7-20 digits, optionally starting with '+'."
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) nextErrors.email = 'Enter a valid email address.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: BusinessWritePayload = {
      name: trimmedName,
      description: description.trim() || null,
      category_id: categoryId ? Number(categoryId) : null,
      county: county.trim() || null,
      city: city.trim() || null,
      address_line: addressLine.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website_url: websiteUrl.trim() || null,
      facebook_url: facebookUrl.trim() || null,
      instagram_url: instagramUrl.trim() || null,
      twitter_url: twitterUrl.trim() || null,
      tiktok_url: tiktokUrl.trim() || null,
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

      <Field label="Business name" error={errors.name}>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Wanjiru Textiles Ltd"
          error={!!errors.name}
        />
      </Field>

      <Field label="Description" optional hint="What you make, sell or offer — shown on your public profile.">
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Tell buyers what your business does…"
        />
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="County" optional>
          <TextInput value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Nairobi" />
        </Field>
        <Field label="City / Town" optional>
          <TextInput value={city} onChange={(e) => setCity(e.target.value)} placeholder="Nairobi" />
        </Field>
      </div>

      <Field label="Address" optional>
        <TextInput value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="Street, building, floor" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" optional error={errors.phone}>
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+254 7XX XXX XXX"
            error={!!errors.phone}
          />
        </Field>
        <Field label="Email" optional error={errors.email}>
          <TextInput
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@business.co.ke"
            error={!!errors.email}
          />
        </Field>
      </div>

      <p className="mb-2 mt-1 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        Online presence <span className="font-semibold tracking-normal normal-case opacity-70">(optional)</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <TextInput value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="Website URL" className="mb-3.5" />
        <TextInput value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="Facebook URL" className="mb-3.5" />
        <TextInput value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="Instagram URL" className="mb-3.5" />
        <TextInput value={twitterUrl} onChange={(e) => setTwitterUrl(e.target.value)} placeholder="X / Twitter URL" className="mb-3.5" />
        <TextInput value={tiktokUrl} onChange={(e) => setTiktokUrl(e.target.value)} placeholder="TikTok URL" className="mb-1" />
      </div>

      <div className="mt-4">
        <SubmitButton loading={submitting} loadingText={submittingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  )
}
