import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../../../lib/api'
import type { UserRead } from '../../../lib/api'
import { useLoginMutation, useRequestOtpMutation } from '../../../hooks/useAuthMutations'
import { freshPending, type AuthPending } from '../authPending'
import { parseIdentifier, pickChannel } from '../identity'
import { Field, FormBanner, PasswordInput, PendingNote, SegTabs, SubmitButton, TextInput } from '../shared'

interface LoginViewProps {
  prefillIdentifier: string
  notice: string | null
  onSwitchToRegister: () => void
  onForgotPassword: () => void
  onSuccessLogin: (token: string, user: UserRead) => void
  onNeedsVerification: (pending: AuthPending) => void
}

export default function LoginView({
  prefillIdentifier,
  notice,
  onSwitchToRegister,
  onForgotPassword,
  onSuccessLogin,
  onNeedsVerification,
}: LoginViewProps) {
  const [identifier, setIdentifier] = useState(prefillIdentifier)
  const [password, setPassword] = useState('')
  const [identifierError, setIdentifierError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; message: string } | null>(
    notice ? { kind: 'success', message: notice } : null,
  )
  const [unverified, setUnverified] = useState<{ email?: string; phone?: string } | null>(null)

  const loginMutation = useLoginMutation()
  const resendMutation = useRequestOtpMutation()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIdentifierError(null)
    setPasswordError(null)
    setBanner(null)
    setUnverified(null)

    let hasError = false
    if (!identifier.trim()) {
      setIdentifierError('Enter your email or phone number.')
      hasError = true
    }
    if (!password) {
      setPasswordError('Enter your password.')
      hasError = true
    }
    if (hasError) return

    const identity = parseIdentifier(identifier)
    try {
      const result = await loginMutation.mutateAsync({ ...identity, password })
      onSuccessLogin(result.access_token, result.user)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && /verify/i.test(err.message)) {
        setUnverified(identity)
        setBanner({ kind: 'error', message: err.message })
        return
      }
      setBanner({ kind: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' })
    }
  }

  async function handleResend() {
    if (!unverified) return
    try {
      await resendMutation.mutateAsync({ ...unverified, purpose: 'registration' })
      const picked = pickChannel(unverified.email, unverified.phone)
      if (picked) onNeedsVerification(freshPending(picked.channel, picked.destination, 'registration'))
    } catch (err) {
      setBanner({ kind: 'error', message: err instanceof ApiError ? err.message : 'Could not resend the code.' })
    }
  }

  return (
    <div>
      <SegTabs active="login" onSelect={(tab) => tab === 'register' && onSwitchToRegister()} />
      <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Welcome back</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Save favourites, follow businesses, or manage a company showroom.
      </p>

      <FormBanner kind={banner?.kind ?? 'error'} message={banner?.message ?? null} />
      {unverified && (
        <p className="-mt-2 mb-3.5 text-xs">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="font-bold text-danger underline decoration-danger/50 underline-offset-2 transition-opacity duration-150 ease-brand hover:opacity-80 disabled:opacity-60"
          >
            {resendMutation.isPending ? 'Sending code…' : 'Resend verification code'}
          </button>
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Field label="Email or phone" error={identifierError ?? undefined}>
          <TextInput
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com or +254 7•• ••• •••"
            autoComplete="username"
            error={!!identifierError}
          />
        </Field>
        <Field label="Password" error={passwordError ?? undefined}>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            error={!!passwordError}
          />
        </Field>
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={onForgotPassword} className="text-xs font-bold text-teal hover:underline">
            Forgot password?
          </button>
        </div>
        <SubmitButton loading={loginMutation.isPending} loadingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      <PendingNote>
        Demo login — <b className="text-foreground">demo-owner@miles.tech</b> /{' '}
        <b className="text-foreground">DemoPass123!</b> (seeded, verified Business Admin account).
      </PendingNote>
    </div>
  )
}
