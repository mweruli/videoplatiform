import type { OtpChannel, OtpPurpose } from '../../lib/api'

/** In-flight registration-verify or forgot-reset context, handed from one screen to the next. */
export interface AuthPending {
  channel: OtpChannel
  destination: string
  purpose: OtpPurpose
  resendAvailableAt: number
  resendCount: number
}

/** UX-only mirror of the real numbers in app/services/otp_service.py (OTP_RESEND_COOLDOWN_SECONDS / OTP_MAX_REQUESTS_PER_HOUR) — the backend is the actual source of truth and returns 429 + Retry-After if a caller races past these client-side guesses. */
export const RESEND_COOLDOWN_SECONDS = 60
export const MAX_RESENDS_PER_SESSION = 5

export function freshPending(channel: OtpChannel, destination: string, purpose: OtpPurpose): AuthPending {
  return {
    channel,
    destination,
    purpose,
    resendAvailableAt: Date.now() + RESEND_COOLDOWN_SECONDS * 1000,
    resendCount: 0,
  }
}
