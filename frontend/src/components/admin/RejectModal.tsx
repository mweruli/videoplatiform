import { useState } from 'react'
import type { FormEvent } from 'react'

import Modal from '../ui/Modal'
import { Field, FormBanner, Spinner, TextArea } from '../ui/FormControls'
import { ApiError } from '../../lib/api'

interface RejectModalProps {
  open: boolean
  onClose: () => void
  title: string
  itemName: string
  onSubmit: (reason: string) => Promise<unknown>
}

/**
 * Shared reject-with-reason modal for both the business and product
 * moderation queues — mirrors BusinessRejectAction/ProductRejectAction's
 * `reason` field (min length 3, see app/schemas/{business,product}.py) and
 * makes explicit that this text becomes visible to the owner, not just an
 * internal note. Deliberately not styled with SubmitButton's amber gradient
 * (that's this app's "positive/primary action" language) — a rejection gets
 * its own danger-colored confirm button so the two moderation outcomes read
 * as visually distinct, not just differently labelled.
 */
export default function RejectModal({ open, onClose, title, itemName, onSubmit }: RejectModalProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleClose() {
    if (submitting) return
    setReason('')
    setError(null)
    setBanner(null)
    onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setError('Give a reason of at least 3 characters — the owner will see this.')
      return
    }
    setError(null)
    setBanner(null)
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setReason('')
      onClose()
    } catch (err) {
      setBanner(err instanceof ApiError ? err.message : 'Could not reject — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} noValidate>
        <FormBanner kind="error" message={banner} />
        <p className="mb-3.5 text-sm leading-relaxed text-muted-foreground">
          Rejecting <span className="font-bold text-foreground">{itemName}</span>. This reason is shown to the owner so they know what
          to fix.
        </p>
        <Field label="Reason" error={error ?? undefined}>
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Photos don't match the listed product — please re-upload accurate images."
            error={!!error}
            autoFocus
          />
        </Field>
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-danger py-3 text-sm font-bold text-white shadow-soft transition-opacity duration-150 ease-brand hover:opacity-90 disabled:pointer-events-none disabled:opacity-70"
        >
          {submitting && <Spinner />}
          {submitting ? 'Rejecting…' : 'Confirm rejection'}
        </button>
      </form>
    </Modal>
  )
}
