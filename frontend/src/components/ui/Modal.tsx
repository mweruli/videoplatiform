import { useEffect } from 'react'
import type { ReactNode } from 'react'

import Icon from '../icons/Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Desktop max-width utility class — callers with wider forms (e.g. the product form) can widen it. */
  widthClassName?: string
}

/**
 * Generic modal shell for anything that isn't the auth flow — the Business
 * Dashboard's create/edit-business and create/edit-product forms use this.
 * Deliberately mirrors AuthModal's own shell 1:1 (bottom sheet on mobile,
 * centered dialog at the >=1024px breakpoint, same backdrop/easing/duration)
 * so the dashboard doesn't introduce a second modal language — see
 * components/auth/AuthModal.tsx for the original.
 */
export default function Modal({ open, onClose, title, children, widthClassName = 'lg:max-w-[560px]' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div aria-hidden={!open}>
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
        } lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:w-full lg:-translate-x-1/2 lg:rounded-3xl lg:border lg:border-border lg:p-7 lg:shadow-elevated lg:transition-[opacity,transform] ${widthClassName} ${
          open ? 'lg:pointer-events-auto lg:translate-y-[-50%] lg:opacity-100' : 'lg:pointer-events-none lg:translate-y-[-46%] lg:opacity-0'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-border lg:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/70"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
