/**
 * Kenyan MSISDN validation for the M-Pesa featured-placement purchase flow —
 * deliberately mirrors backend/app/services/mpesa.py's `to_msisdn()` leniency
 * exactly (the function that actually gates whether Daraja will accept the
 * number), not backend/app/utils/phone.py's much looser generic auth-phone
 * shape check. Accepting a number here that `to_msisdn()` would reject just
 * means a 502 later at submit time instead of an inline validation error —
 * this exists so that failure surfaces immediately, in the form, not after a
 * round trip.
 *
 * Accepted input shapes (with optional leading '+', spaces/dashes anywhere):
 *   - "254712345678" / "+254 712 345 678" (12 digits, starts 254)
 *   - "0712345678" (10 digits, starts 0)
 *   - "712345678" / "112345678" (9 digits, starts 7 or 1)
 */

export function isValidKenyanMsisdn(raw: string): boolean {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.startsWith('254') && digits.length === 12) return true
  if (digits.startsWith('0') && digits.length === 10) return true
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return true
  return false
}

/** Normalizes any of the accepted shapes above to the "0712345678" form for display in a form field — doesn't need to match Daraja's 254-prefixed wire format since the backend itself does that conversion (to_msisdn()) from whatever shape is submitted. */
export function formatKenyanMsisdnForInput(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.startsWith('254') && digits.length === 12) return `0${digits.slice(3)}`
  if (digits.startsWith('0') && digits.length === 10) return digits
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return `0${digits}`
  return raw
}
