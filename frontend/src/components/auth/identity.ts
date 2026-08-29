import type { OtpChannel } from '../../lib/api'

/** Login/Forgot use one "email or phone" field and auto-detect which; Register keeps them as two separate optional inputs (it needs to know which are filled to satisfy "at least one required") — an intentional asymmetry carried over from the approved design. */
export function parseIdentifier(raw: string): { email?: string; phone?: string } {
  const value = raw.trim()
  if (!value) return {}
  return value.includes('@') ? { email: value.toLowerCase() } : { phone: value }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value)
}

export function isValidPhoneShape(value: string): boolean {
  return value.replace(/[^0-9]/g, '').length >= 7
}

/** Same channel-selection rule as the backend's _channel_and_destination: phone wins if both are present (Kenya market — phone is primary). */
export function pickChannel(email?: string | null, phone?: string | null): { channel: OtpChannel; destination: string } | null {
  if (phone) return { channel: 'phone', destination: phone }
  if (email) return { channel: 'email', destination: email }
  return null
}

export function maskDestination(destination: string, channel: OtpChannel): string {
  if (channel === 'email') {
    const [user, domain] = destination.split('@')
    if (!domain) return destination
    return `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 2))}@${domain}`
  }
  return destination.length > 5 ? `${destination.slice(0, 4)} ••• ••${destination.slice(-3)}` : destination
}
