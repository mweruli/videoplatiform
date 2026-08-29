import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../../../lib/api'
import { useForgotPasswordMutation } from '../../../hooks/useAuthMutations'
import { freshPending, type AuthPending } from '../authPending'
import { parseIdentifier, pickChannel } from '../identity'
import { Field, SheetHeadRow, SubmitButton, TextInput } from '../shared'

interface ForgotPasswordViewProps {
  onBack: () => void
  onRequested: (pending: AuthPending) => void
}

export default function ForgotPasswordView({ onBack, onRequested }: ForgotPasswordViewProps) {
  const [identifier, setIdentifier] = useState('')
  const [error, setError] = useState<string | null>(null)

  const forgotMutation = useForgotPasswordMutation()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!identifier.trim()) {
      setError('Enter your email or phone number.')
      return
    }
    const identity = parseIdentifier(identifier)
    const picked = pickChannel(identity.email, identity.phone)
    if (!picked) {
      setError('Enter your email or phone number.')
      return
    }
    try {
      // Always succeeds with an identical generic message whether or not the
      // account exists (see app/api/v1/endpoints/auth.py's anti-enumeration
      // design) — the UI can't and shouldn't distinguish the two cases. A
      // thrown error here means the request itself was malformed (e.g. an
      // invalid phone shape the backend's validator rejected), not "no such
      // account" — that's a real, user-fixable error worth surfacing.
      await forgotMutation.mutateAsync(identity)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      return
    }
    onRequested(freshPending(picked.channel, picked.destination, 'password_reset'))
  }

  return (
    <div>
      <SheetHeadRow title="Reset your password" onBack={onBack} />
      <p className="mt-2 mb-4 text-sm text-muted-foreground">
        Enter the email or phone linked to your account and we&apos;ll send a reset code.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <Field label="Email or phone" error={error ?? undefined}>
          <TextInput
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or +254 7•• ••• •••"
            autoComplete="username"
            error={!!error}
          />
        </Field>
        <SubmitButton loading={forgotMutation.isPending} loadingText="Sending…">
          Send reset code
        </SubmitButton>
      </form>
    </div>
  )
}
