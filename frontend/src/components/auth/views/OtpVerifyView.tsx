import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../../../lib/api'
import { useRequestOtpMutation, useVerifyOtpMutation } from '../../../hooks/useAuthMutations'
import { RESEND_COOLDOWN_SECONDS, type AuthPending } from '../authPending'
import { maskDestination } from '../identity'
import OtpInputGroup from '../OtpInputGroup'
import ResendControl from '../ResendControl'
import { SheetHeadRow, SubmitButton } from '../shared'

interface OtpVerifyViewProps {
  pending: AuthPending
  onBack: () => void
  onVerified: (destination: string) => void
}

/** Post-registration OTP verification — separate call from login by design (see app/api/v1/endpoints/auth.py): verifying does not sign the user in, it hands off to Login. */
export default function OtpVerifyView({ pending: initialPending, onBack, onVerified }: OtpVerifyViewProps) {
  const [pending, setPending] = useState(initialPending)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  const verifyMutation = useVerifyOtpMutation()
  const resendMutation = useRequestOtpMutation()

  const identity = pending.channel === 'phone' ? { phone: pending.destination } : { email: pending.destination }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (code.length < 6) {
      setError('Enter all 6 digits.')
      return
    }
    try {
      await verifyMutation.mutateAsync({ ...identity, code, purpose: 'registration' })
      onVerified(pending.destination)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setShake(true)
      setCode('')
      window.setTimeout(() => setShake(false), 400)
    }
  }

  async function handleResend() {
    try {
      await resendMutation.mutateAsync({ ...identity, purpose: 'registration' })
      setPending((p) => ({ ...p, resendAvailableAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000, resendCount: p.resendCount + 1 }))
      setError(null)
      setCode('')
    } catch (err) {
      if (err instanceof ApiError && err.retryAfterSeconds) {
        setPending((p) => ({ ...p, resendAvailableAt: Date.now() + err.retryAfterSeconds! * 1000 }))
      }
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.')
    }
  }

  return (
    <div>
      <SheetHeadRow title="Verify your account" onBack={onBack} />
      <p className="mt-2 mb-5 text-sm text-muted-foreground">
        Enter the 6-digit code we sent to <b className="text-foreground">{maskDestination(pending.destination, pending.channel)}</b>.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <OtpInputGroup value={code} onChange={setCode} error={shake} disabled={verifyMutation.isPending} autoFocus />
        {error && <p className="mt-3 text-center text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-4">
          <SubmitButton loading={verifyMutation.isPending} loadingText="Verifying…">
            Verify &amp; continue
          </SubmitButton>
        </div>
      </form>

      <ResendControl pending={pending} onResend={handleResend} isResending={resendMutation.isPending} />
    </div>
  )
}
