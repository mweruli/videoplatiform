import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../../../lib/api'
import type { UserRead } from '../../../lib/api'
import { useRequestOtpMutation, useResetPasswordMutation } from '../../../hooks/useAuthMutations'
import { RESEND_COOLDOWN_SECONDS, type AuthPending } from '../authPending'
import OtpInputGroup from '../OtpInputGroup'
import ResendControl from '../ResendControl'
import { Field, FormBanner, PasswordInput, SheetHeadRow, SubmitButton } from '../shared'

interface ResetPasswordViewProps {
  pending: AuthPending
  onBack: () => void
  onReset: (token: string, user: UserRead) => void
}

/** Code + new password on one screen, matching the real /auth/password/reset call shape (one request, not a two-step verify-then-change). Success doubles as login — the backend issues an access token directly. */
export default function ResetPasswordView({ pending: initialPending, onBack, onReset }: ResetPasswordViewProps) {
  const [pending, setPending] = useState(initialPending)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)

  const resetMutation = useResetPasswordMutation()
  const resendMutation = useRequestOtpMutation()

  const identity = pending.channel === 'phone' ? { phone: pending.destination } : { email: pending.destination }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setCodeError(null)
    setPasswordError(null)
    setConfirmError(null)

    let hasError = false
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.')
      hasError = true
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords don’t match.')
      hasError = true
    }
    if (code.length < 6) {
      setCodeError('Enter all 6 digits.')
      hasError = true
    }
    if (hasError) return

    try {
      const result = await resetMutation.mutateAsync({ ...identity, code, new_password: password })
      onReset(result.access_token, result.user)
    } catch (err) {
      setCodeError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setShake(true)
      window.setTimeout(() => setShake(false), 400)
    }
  }

  async function handleResend() {
    try {
      await resendMutation.mutateAsync({ ...identity, purpose: 'password_reset' })
    } catch {
      // Same anti-enumeration posture as the initial request — see
      // ForgotPasswordView. A resend for a destination with no real account
      // is a no-op server-side but still shouldn't surface differently here.
    }
    setPending((p) => ({ ...p, resendAvailableAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000, resendCount: p.resendCount + 1 }))
    setCode('')
    setCodeError(null)
  }

  return (
    <div>
      <SheetHeadRow title="Enter reset code" onBack={onBack} />
      <FormBanner kind="success" message="If an account exists for that email/phone, a reset code has been sent." />
      <p className="mb-4 text-sm text-muted-foreground">Enter the 6-digit code, then choose a new password.</p>

      <form onSubmit={handleSubmit} noValidate>
        <OtpInputGroup value={code} onChange={setCode} error={shake} disabled={resetMutation.isPending} autoFocus />
        {codeError && <p className="mt-3 text-center text-xs font-semibold text-danger">{codeError}</p>}

        <div className="mt-4">
          <Field label="New password" error={passwordError ?? undefined}>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              error={!!passwordError}
            />
          </Field>
          <Field label="Confirm new password" error={confirmError ?? undefined}>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              error={!!confirmError}
            />
          </Field>
        </div>

        <SubmitButton loading={resetMutation.isPending} loadingText="Resetting…">
          Reset password
        </SubmitButton>
      </form>

      <ResendControl pending={pending} onResend={handleResend} isResending={resendMutation.isPending} />
    </div>
  )
}
