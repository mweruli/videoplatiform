import { MAX_RESENDS_PER_SESSION, type AuthPending } from './authPending'
import { useCountdownSeconds } from './useCountdown'

interface ResendControlProps {
  pending: AuthPending
  onResend: () => void
  isResending: boolean
}

/** "Didn't get a code? Resend in Ns" → live countdown → "Resend code" link, mirroring the approved prototype's resend row. Shared by the post-registration verify screen and the forgot-password reset screen. */
export default function ResendControl({ pending, onResend, isResending }: ResendControlProps) {
  const remaining = useCountdownSeconds(pending.resendAvailableAt)

  if (remaining > 0) {
    return (
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Didn&apos;t get a code? Resend in <b className="text-foreground">{remaining}s</b>
      </p>
    )
  }

  if (pending.resendCount >= MAX_RESENDS_PER_SESSION) {
    return <p className="mt-3 text-center text-xs font-semibold text-danger">Too many code requests. Please try again later.</p>
  }

  return (
    <p className="mt-3 text-center text-xs">
      <button
        type="button"
        onClick={onResend}
        disabled={isResending}
        className="font-bold text-teal transition-colors duration-150 ease-brand hover:underline disabled:opacity-60"
      >
        {isResending ? 'Sending…' : 'Resend code'}
      </button>
    </p>
  )
}
