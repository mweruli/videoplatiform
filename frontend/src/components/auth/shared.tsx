import { useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

import Icon from '../icons/Icon'

/**
 * Shared building blocks for every auth screen (Login/Register/Verify/
 * Forgot/Reset) — kept to one file since each piece is small and used by
 * every view. Reuses the app's existing token language (border/teal focus
 * ring, danger for errors, amber for primary actions) rather than inventing
 * new auth-specific color roles.
 */

export function SegTabs({ active, onSelect }: { active: 'login' | 'register'; onSelect: (tab: 'login' | 'register') => void }) {
  return (
    <div className="mb-5 flex rounded-full bg-panel p-1">
      {(['login', 'register'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelect(tab)}
          className={`flex-1 rounded-full py-2 text-xs font-bold transition-all duration-150 ease-brand ${
            active === tab ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab === 'login' ? 'Sign in' : 'Create account'}
        </button>
      ))}
    </div>
  )
}

export function SheetHeadRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-1 flex items-center gap-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/70"
      >
        <Icon name="back" size={16} />
      </button>
      <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
    </div>
  )
}

interface FieldProps {
  label: ReactNode
  optional?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ label, optional, hint, error, children }: FieldProps) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        {label} {optional && <span className="font-semibold tracking-normal text-muted-foreground normal-case opacity-70">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-danger">
          <Icon name="close" size={11} />
          {error}
        </p>
      )}
    </div>
  )
}

const inputBase =
  'w-full rounded-xl border-[1.5px] bg-panel px-3.5 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-brand placeholder:text-muted-foreground placeholder:opacity-70 disabled:opacity-60'

export function TextInput({
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      className={`${inputBase} ${
        error ? 'border-danger' : 'border-border focus:border-brand focus:shadow-[0_0_0_3px_rgba(16,52,166,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(21,66,214,0.3)]'
      } ${className}`}
      {...rest}
    />
  )
}

export function PasswordInput({
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <TextInput type={visible ? 'text' : 'password'} error={error} className="pr-11" {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-brand hover:bg-border/70 hover:text-foreground"
      >
        <EyeIcon open={visible} />
      </button>
    </div>
  )
}

/** Simple eye / eye-off glyph — small enough not to warrant adding two more entries to the shared Icon set for a single-use toggle. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {open && <line x1="2" y1="22" x2="22" y2="2" />}
    </svg>
  )
}

export function FormBanner({ kind, message }: { kind: 'error' | 'success'; message: string | null }) {
  if (!message) return null
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`mb-3.5 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-snug font-medium ${
        kind === 'error'
          ? 'border-danger/30 bg-danger/10 text-danger'
          : 'border-teal/30 bg-teal/10 text-teal'
      }`}
    >
      <Icon name={kind === 'error' ? 'close' : 'check'} size={14} className="mt-0.5 flex-none" />
      <div>{message}</div>
    </div>
  )
}

export function SubmitButton({ loading, loadingText, children }: { loading: boolean; loadingText: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] py-3 text-sm font-bold text-amber-ink shadow-glow-amber transition-[box-shadow,opacity] duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-80"
    >
      {loading && <Spinner />}
      {loading ? loadingText : children}
    </button>
  )
}

export function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent opacity-85 motion-reduce:animate-none"
      aria-hidden="true"
    />
  )
}

export function PendingNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-border bg-panel px-3.5 py-2.5 text-xs leading-snug text-muted-foreground">
      <Icon name="clock" size={14} className="mt-0.5 flex-none text-teal" />
      <div>{children}</div>
    </div>
  )
}
