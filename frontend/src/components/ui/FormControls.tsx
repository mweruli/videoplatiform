import { useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import Icon from '../icons/Icon'

/**
 * Shared form primitives — originally lived only in `components/auth/shared.tsx`
 * (login/register/etc.), promoted here once the Business Dashboard needed the
 * same label/input/error language for business & product forms. `auth/shared.tsx`
 * re-exports Field/TextInput/FormBanner/SubmitButton/Spinner from this module so
 * every existing auth screen keeps working unchanged — this is the one true
 * definition, not a fork.
 */

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

const inputBorder = (error?: boolean) =>
  error
    ? 'border-danger'
    : 'border-border focus:border-brand focus:shadow-[0_0_0_3px_rgba(16,52,166,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(21,66,214,0.3)]'

export function TextInput({
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input className={`${inputBase} ${inputBorder(error)} ${className}`} {...rest} />
}

export function TextArea({
  error,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return <textarea className={`${inputBase} resize-y ${inputBorder(error)} ${className}`} {...rest} />
}

interface SelectOption {
  value: string
  label: string
}

export function Select({
  error,
  className = '',
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean; options: SelectOption[]; placeholder?: string }) {
  const id = useId()
  return (
    <div className="relative">
      <select
        id={id}
        className={`${inputBase} ${inputBorder(error)} appearance-none pr-9 ${className}`}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronRight"
        size={13}
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 rotate-90 text-muted-foreground"
      />
    </div>
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

export function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent opacity-85 motion-reduce:animate-none"
      aria-hidden="true"
    />
  )
}

export function SubmitButton({ loading, loadingText, children, ...rest }: { loading: boolean; loadingText: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] py-3 text-sm font-bold text-amber-ink shadow-glow-amber transition-[box-shadow,opacity] duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-80"
      {...rest}
    >
      {loading && <Spinner />}
      {loading ? loadingText : children}
    </button>
  )
}
