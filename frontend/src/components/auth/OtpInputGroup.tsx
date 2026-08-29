import { useEffect, useRef } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'

interface OtpInputGroupProps {
  length?: number
  value: string
  onChange: (value: string) => void
  error?: boolean
  disabled?: boolean
  autoFocus?: boolean
}

/**
 * Six auto-advancing digit boxes with paste support — matches the approved
 * prototype's OTP entry (a deliberate bit of extra interactivity for a
 * thumb-driven, video-first product, rather than one plain text input).
 * Shakes + reddens on `error`, same motion language as the rest of the app
 * (a single reused ease/duration set).
 */
export default function OtpInputGroup({ length = 6, value, onChange, error, disabled, autoFocus }: OtpInputGroupProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus()
  }, [autoFocus])

  function setDigitAt(index: number, digit: string) {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join('').slice(0, length))
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/[^0-9]/g, '').slice(-1)
    setDigitAt(index, digit)
    if (digit && index + 1 < length) inputsRef.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/[^0-9]/g, '')
    if (!text) return
    e.preventDefault()
    onChange(text.slice(0, length))
    const focusIndex = Math.min(text.length, length) - 1
    inputsRef.current[Math.max(focusIndex, 0)]?.focus()
  }

  return (
    <div className={`flex justify-center gap-2 ${error ? 'animate-[shakeX_0.4s_ease-in-out] motion-reduce:animate-none' : ''}`}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`Digit ${i + 1} of ${length}`}
          className={`h-[52px] w-11 rounded-xl border-[1.5px] bg-panel text-center font-display text-xl font-bold text-foreground outline-none transition-colors duration-150 ease-brand disabled:opacity-60 ${
            error ? 'border-danger' : 'border-border focus:border-brand focus:shadow-[0_0_0_3px_rgba(16,52,166,0.15)] dark:focus:shadow-[0_0_0_3px_rgba(21,66,214,0.3)]'
          }`}
        />
      ))}
    </div>
  )
}
