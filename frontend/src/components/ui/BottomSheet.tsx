import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * Mobile bottom sheet (<1024px) — slides up from the bottom with a backdrop,
 * per the approved prototype's sheet pattern (filter/account/compare all
 * share this same shell). At the desktop breakpoint callers render their
 * content directly (e.g. Search's persistent filter sidebar) instead of
 * using this component, per the prototype's own note that a sheet sliding
 * up from the bottom of a browser window reads as a mobile-only pattern.
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className="lg:hidden" aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-brand motion-reduce:transition-none ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-x-0 bottom-0 z-[95] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-glass-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-elevated transition-transform duration-300 ease-brand motion-reduce:transition-none ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-border" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
