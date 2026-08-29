import { useEffect, useState } from 'react'

/** Remaining whole seconds until `targetMs`, ticking every second. Used to drive the OTP resend cooldown display. */
export function useCountdownSeconds(targetMs: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)))

  useEffect(() => {
    setRemaining(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)))
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)))
    }, 1000)
    return () => window.clearInterval(id)
  }, [targetMs])

  return remaining
}
