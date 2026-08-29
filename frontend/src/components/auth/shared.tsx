import { useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

import Icon from '../icons/Icon'
import { TextInput } from '../ui/FormControls'

/**
 * Shared building blocks for every auth screen (Login/Register/Verify/
 * Forgot/Reset) — kept to one file since each piece is small and used by
 * every view. Reuses the app's existing token language (border/teal focus
 * ring, danger for errors, amber for primary actions) rather than inventing
 * new auth-specific color roles.
 *
 * Field/TextInput/FormBanner/SubmitButton/Spinner are generic form
 * primitives now defined once in `components/ui/FormControls.tsx` (the
 * Business Dashboard's forms need the same language) and re-exported here so
 * every existing `from '../shared'` import in the auth views keeps working
 * unchanged.
 */
export { Field, FormBanner, Spinner, SubmitButton, TextInput } from '../ui/FormControls'

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

export function PendingNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-border bg-panel px-3.5 py-2.5 text-xs leading-snug text-muted-foreground">
      <Icon name="clock" size={14} className="mt-0.5 flex-none text-teal" />
      <div>{children}</div>
    </div>
  )
}
