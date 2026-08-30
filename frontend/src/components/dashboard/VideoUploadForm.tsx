import { useState } from 'react'
import type { DragEvent, FormEvent } from 'react'

import Icon from '../icons/Icon'
import { Field, FormBanner, Select, SubmitButton, TextArea, TextInput } from '../ui/FormControls'
import { useCategories } from '../../hooks/useCatalog'
import { ApiError } from '../../lib/api'
import type { ProductDto, VideoUploadPayload } from '../../lib/api'

/** Mirrors settings.allowed_video_content_types_list / MAX_VIDEO_UPLOAD_SIZE_MB (backend/app/core/config.py) — display copy only, the backend re-validates regardless. */
const ACCEPTED_TYPES = 'video/mp4,video/quicktime,video/webm'

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

interface VideoUploadFormProps {
  /** The current business's own products (any moderation status) — link-to-product is scoped to this business, same as the design spec. */
  products: ProductDto[]
  onSubmit: (payload: VideoUploadPayload) => Promise<unknown>
  onDone: () => void
}

/**
 * Upload-video form for the Business Dashboard's "Upload video" sheet — a
 * real native file input behind a styled dropzone (default/hover/drag/
 * has-file/error states), title (required), description, category and
 * optional link-to-product. Submitting a real multipart request to
 * POST /businesses/{id}/videos (see useUploadVideo) — a real upload, not a
 * stub, per the approved design pass.
 */
export default function VideoUploadForm({ products, onSubmit, onDone }: VideoUploadFormProps) {
  const categoriesQuery = useCategories()

  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [productId, setProductId] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function pickFile(picked: File | null) {
    setFile(picked)
    if (picked) setErrors((e) => ({ ...e, file: '' }))
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(true)
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) pickFile(dropped)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    const nextErrors: Record<string, string> = {}

    if (!file) nextErrors.file = 'Choose a video file to upload.'
    const trimmedTitle = title.trim()
    if (trimmedTitle.length < 2) nextErrors.title = 'Give your video a title.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit({
        title: trimmedTitle,
        description: description.trim() || null,
        category_id: categoryId ? Number(categoryId) : null,
        product_id: productId || null,
        file: file as File,
      })
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
      <p className="mb-3.5 text-sm leading-relaxed text-muted-foreground">
        Submitted videos go to Miles Tech&apos;s moderation queue before they&apos;re publicly visible — most reviews complete within 2
        business days.
      </p>

      <div className="mb-3.5">
        <label className="mb-1.5 block text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Video file</label>
        <label
          htmlFor="video-file-input"
          onDragOver={handleDragOver}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-150 ease-brand ${
            errors.file
              ? 'border-danger bg-danger/5'
              : dragActive
                ? 'border-brand bg-brand/5 dark:border-ice dark:bg-white/5'
                : 'border-border bg-panel hover:border-teal'
          }`}
        >
          <Icon name="upload" size={22} className="text-muted-foreground" />
          {file ? (
            <span className="text-sm font-bold text-foreground">
              {file.name} · {formatFileSize(file.size)}
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">Tap to choose a video file, or drag one here</span>
          )}
          <span className="text-xs text-muted-foreground">MP4, MOV or WebM, up to 200MB</span>
        </label>
        <input
          id="video-file-input"
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {errors.file && (
          <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-danger">
            <Icon name="close" size={11} />
            {errors.file}
          </p>
        )}
      </div>

      <Field label="Title" error={errors.title}>
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Inside Our Rotomoulding Plant — How It's Made"
          error={!!errors.title}
        />
      </Field>

      <Field label="Description" optional>
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What's in this video, and why should shoppers care?"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" optional>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder={categoriesQuery.isLoading ? 'Loading…' : 'Select a category'}
            disabled={categoriesQuery.isLoading}
            options={(categoriesQuery.data ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </Field>
        <Field label="Link to a product" optional hint={products.length === 0 ? 'Add a product first to link one.' : undefined}>
          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder={products.length === 0 ? 'No products yet' : 'None'}
            disabled={products.length === 0}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </div>

      <div className="mt-4">
        <SubmitButton loading={submitting} loadingText="Uploading…">
          Upload video
        </SubmitButton>
      </div>
    </form>
  )
}
