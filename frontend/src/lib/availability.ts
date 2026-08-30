import type { AvailabilityStatus } from './api'

/**
 * Shared availability copy/tone — originally local to ProductDetail.tsx,
 * lifted out so the Compare sheet (components/compare/CompareSheet.tsx) can
 * show the same labels in its comparison table instead of re-typing them.
 */
export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  in_stock: 'In stock',
  made_to_order: 'Made to order',
  out_of_stock: 'Out of stock',
  discontinued: 'Discontinued',
}

export const AVAILABILITY_TONE: Record<AvailabilityStatus, string> = {
  in_stock: 'bg-teal/15 text-teal border-teal/30',
  made_to_order: 'bg-amber/15 text-amber-ink border-amber/40 dark:text-amber',
  out_of_stock: 'bg-border text-muted-foreground border-border',
  discontinued: 'bg-border text-muted-foreground border-border',
}
