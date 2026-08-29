import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

/**
 * A single, shared toast pill — mirrors the prototype's cross-screen toast
 * (one message at a time, ~2s, glass-dark pill, bottom-centered above the
 * mobile tab bar / near the bottom of the viewport on desktop). Used for
 * stopgap feedback on interactions that don't have a real destination yet
 * (e.g. business profile, compare) so those affordances feel honest rather
 * than dead.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const showToast = useCallback((next: string) => {
    setMessage(next)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setMessage(null), 2200)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex justify-center px-4 lg:bottom-8"
      >
        <div
          className={`rounded-full border border-white/10 bg-gradient-to-br from-ink-light to-ink px-5 py-3 text-sm font-medium text-ice shadow-elevated transition-all duration-300 ease-brand motion-reduce:transition-none ${
            message ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
          }`}
        >
          {message}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
