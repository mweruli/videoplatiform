import { useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../../../lib/api'
import type { SelfRegisterableRole } from '../../../lib/api'
import { useRegisterMutation } from '../../../hooks/useAuthMutations'
import { freshPending, type AuthPending } from '../authPending'
import { isValidEmail, isValidPhoneShape, pickChannel } from '../identity'
import RolePicker from '../RolePicker'
import { Field, FormBanner, PasswordInput, SegTabs, SubmitButton, TextInput } from '../shared'

interface RegisterViewProps {
  initialRole: SelfRegisterableRole
  onSwitchToLogin: () => void
  onRegistered: (pending: AuthPending) => void
}

export default function RegisterView({ initialRole, onSwitchToLogin, onRegistered }: RegisterViewProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<SelfRegisterableRole>(initialRole)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)

  const registerMutation = useRegisterMutation()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBanner(null)
    const nextErrors: Record<string, string> = {}

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPhone = phone.trim()

    if (!trimmedEmail && !trimmedPhone) {
      nextErrors.email = 'Provide an email or phone number.'
      nextErrors.phone = 'Provide an email or phone number.'
    }
    if (trimmedEmail && !isValidEmail(trimmedEmail)) nextErrors.email = 'Enter a valid email address.'
    if (trimmedPhone && !isValidPhoneShape(trimmedPhone)) {
      nextErrors.phone = "Phone number must be 7-20 digits, optionally starting with '+'."
    }
    if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    try {
      const result = await registerMutation.mutateAsync({
        email: trimmedEmail || undefined,
        phone: trimmedPhone || undefined,
        password,
        full_name: fullName.trim() || undefined,
        role,
      })
      // Phone is the OTP channel if both were given — mirrors the backend's
      // _channel_and_destination (phone is primary for the Kenya market).
      const picked = pickChannel(result.user.email, result.user.phone)
      if (picked) onRegistered(freshPending(picked.channel, picked.destination, 'registration'))
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          if (/email/i.test(err.message)) setErrors((prev) => ({ ...prev, email: err.message }))
          else if (/phone/i.test(err.message)) setErrors((prev) => ({ ...prev, phone: err.message }))
        }
        setBanner(err.message)
      } else {
        setBanner('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <div>
      <SegTabs active="register" onSelect={(tab) => tab === 'login' && onSwitchToLogin()} />
      <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Join Miles Tech</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        One account for search &amp; video — and your digital showroom, if you run a business.
      </p>

      <FormBanner kind="error" message={banner} />

      <form onSubmit={handleSubmit} noValidate>
        <Field label="Full name" optional>
          <TextInput
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Grace Wanjiru"
            autoComplete="name"
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <TextInput
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            error={!!errors.email}
          />
        </Field>
        <Field label="Phone" error={errors.phone} hint="Provide at least one — email or phone.">
          <TextInput
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+254 7XX XXX XXX"
            autoComplete="tel"
            error={!!errors.phone}
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={!!errors.password}
          />
        </Field>

        <RolePicker value={role} onChange={setRole} />

        <SubmitButton loading={registerMutation.isPending} loadingText="Creating account…">
          Create account
        </SubmitButton>
      </form>

      <p className="mt-3.5 text-xs text-muted-foreground">
        Platform Admin and Content Moderator accounts are staff-assigned and not available here.
      </p>
    </div>
  )
}
