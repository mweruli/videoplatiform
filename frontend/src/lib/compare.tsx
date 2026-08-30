import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useToast } from './toast'
import type { AvailabilityStatus, BusinessSummaryDto, ProductDto } from './api'

const STORAGE_KEY = 'miles-tech-compare'
export const MAX_COMPARE = 3

/**
 * Lightweight snapshot of a ProductDto — just the fields the comparison
 * table needs (see components/compare/CompareSheet.tsx). Stored (not just
 * the product id) because there's no "fetch products by id list" batch
 * endpoint yet; every add-to-compare call site already has the full
 * ProductDto in hand (search results, product detail, business profile all
 * fetch it via TanStack Query), so this is captured at add-time rather than
 * refetched.
 */
export interface CompareProduct {
  id: string
  slug: string
  name: string
  primary_image_url: string | null
  price_min: string | null
  price_max: string | null
  currency: string
  specs: Record<string, string>
  warranty_terms: string | null
  availability_status: AvailabilityStatus
  county: string | null
  city: string | null
  business: BusinessSummaryDto
}

export function toCompareProduct(product: ProductDto): CompareProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    primary_image_url: product.primary_image_url,
    price_min: product.price_min,
    price_max: product.price_max,
    currency: product.currency,
    specs: product.specs,
    warranty_terms: product.warranty_terms,
    availability_status: product.availability_status,
    county: product.county,
    city: product.city,
    business: product.business,
  }
}

interface CompareContextValue {
  items: CompareProduct[]
  count: number
  isSelected: (id: string) => boolean
  /** Add if not present (unless already at MAX_COMPARE — toasts instead), remove if present. */
  toggle: (product: CompareProduct) => void
  remove: (id: string) => void
  clear: () => void
  isSheetOpen: boolean
  openSheet: () => void
  closeSheet: () => void
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined)

function readStored(): CompareProduct[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CompareProduct[]) : []
  } catch {
    return []
  }
}

/**
 * Manual product comparison (DEVELOPMENT_PLAN Sprint 4 — "Manual product
 * comparison (2–3 items, side by side)"). Behaviour matches the approved
 * prototype's `compareSet`/`toggleCompare` (docs/design/prototype-v1.html):
 * up to 3 products, toast on add/remove, toast-only (no-op) once full.
 * Persisted to localStorage — a deliberate improvement over the prototype's
 * in-memory-only reference, since that was a static mockup and this is a
 * real app where an accidental refresh shouldn't silently empty the list.
 */
export function CompareProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast()
  const [items, setItems] = useState<CompareProduct[]>(() => readStored())
  const [sheetOpenRequested, setSheetOpenRequested] = useState(false)
  // Derived, not stored: once the last item is removed (from within the
  // sheet, or "Clear all") there's nothing left to show, so the sheet is
  // never actually open regardless of the raw request flag — mirrors the
  // prototype's `if(compareSet.length===0) closeSheets()` without a
  // setState-in-effect render cascade.
  const isSheetOpen = sheetOpenRequested && items.length > 0

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage unavailable (private mode, quota) — comparison still works for this session.
    }
  }, [items])

  const isSelected = useCallback((id: string) => items.some((p) => p.id === id), [items])

  // Deliberately *not* functional `setItems(prev => ...)` updaters here: the
  // updater callback must stay a pure function of state (React may invoke it
  // more than once, e.g. under StrictMode), so a side effect like showToast
  // living inside one trips "Cannot update a component while rendering a
  // different component". Reading `items` from the closure instead (each
  // callback is re-created via useCallback whenever `items` changes, so it's
  // never stale) keeps the state update pure and the toast a plain event-
  // handler side effect.
  const toggle = useCallback(
    (product: CompareProduct) => {
      if (items.some((p) => p.id === product.id)) {
        setItems(items.filter((p) => p.id !== product.id))
        showToast('Removed from compare')
        return
      }
      if (items.length >= MAX_COMPARE) {
        showToast('You can compare up to 3 products at a time')
        return
      }
      setItems([...items, product])
      showToast('Added to compare')
    },
    [items, showToast],
  )

  const remove = useCallback(
    (id: string) => {
      if (!items.some((p) => p.id === id)) return
      setItems(items.filter((p) => p.id !== id))
      showToast('Removed from compare')
    },
    [items, showToast],
  )

  const clear = useCallback(() => {
    if (items.length === 0) return
    setItems([])
    showToast('Compare list cleared')
  }, [items, showToast])

  const openSheet = useCallback(() => setSheetOpenRequested(true), [])
  const closeSheet = useCallback(() => setSheetOpenRequested(false), [])

  const value = useMemo<CompareContextValue>(
    () => ({ items, count: items.length, isSelected, toggle, remove, clear, isSheetOpen, openSheet, closeSheet }),
    [items, isSelected, toggle, remove, clear, isSheetOpen, openSheet, closeSheet],
  )

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error('useCompare must be used within a CompareProvider')
  return ctx
}
