import { useEffect, useRef, useState } from 'react'

import Icon from '../icons/Icon'
import Modal from '../ui/Modal'
import { Field, TextInput } from '../ui/FormControls'
import { formatDate, formatKES } from '../../lib/format'
import { isValidKenyanMsisdn, formatKenyanMsisdnForInput } from '../../lib/phone'
import { useCreateFeaturedPurchase, useFeaturedPricing, useInvalidateAfterFeaturedPurchase, usePollFeaturedPurchase } from '../../hooks/useFeaturedPurchase'
import { ApiError } from '../../lib/api'
import type { FeaturedPricingTier } from '../../lib/api'

/** Daraja's own STK prompt times out client-side around 60-90s — a 2-minute poll ceiling is a sane upper bound past that (see docs/decisions.md's "Phase 1b design pass" entry). */
const POLL_TIMEOUT_MS = 120_000

export type FeaturedPurchaseTarget =
  | { kind: 'business'; label: string }
  | { kind: 'product'; productId: string; label: string }

interface FeaturedPurchaseModalProps {
  open: boolean
  onClose: () => void
  businessId: string
  businessPhone: string | null
  target: FeaturedPurchaseTarget
}

type Step = 'picker' | 'polling' | 'success' | 'failed' | 'timeout'

/**
 * The full self-serve M-Pesa purchase flow: pricing-tier picker → phone
 * confirmation → submit (STK Push initiated) → polling state → success /
 * failed / timed-out terminal state. Reused for both business-level and
 * product-level purchases, parameterized by `target`. See
 * docs/decisions.md's "Phase 1b" entries for the exact API contract and
 * polling/timeout guidance this implements.
 */
export default function FeaturedPurchaseModal({ open, onClose, businessId, businessPhone, target }: FeaturedPurchaseModalProps) {
  const pricingQuery = useFeaturedPricing()
  const createMutation = useCreateFeaturedPurchase()
  const invalidate = useInvalidateAfterFeaturedPurchase()

  const [step, setStep] = useState<Step>('picker')
  const [selectedTier, setSelectedTier] = useState<FeaturedPricingTier | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [purchaseId, setPurchaseId] = useState<string | null>(null)
  const timeoutRef = useRef<number | undefined>(undefined)
  const wasOpenRef = useRef(false)

  // Reset to a clean first step on the false->true transition of `open`
  // only — NOT on every re-render while the modal stays open. `target` is a
  // fresh object literal from the caller on every render (e.g.
  // `target={{ kind: 'business', ... }}` in BusinessPanel.tsx), so keying
  // this effect on `target` itself would re-fire (and wipe the in-progress
  // polling/success state) the moment a successful purchase's cache
  // invalidation causes the parent to re-render — which is exactly what
  // happened before this fix.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStep('picker')
      setSelectedTier(null)
      setPhone(formatKenyanMsisdnForInput(businessPhone))
      setPhoneError(null)
      setSubmitError(null)
      setPurchaseId(null)
    }
    wasOpenRef.current = open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pollQuery = usePollFeaturedPurchase(purchaseId ?? undefined, step === 'polling')
  const purchase = pollQuery.data

  // Start a 2-minute ceiling the instant polling begins; clear it whenever
  // we leave the polling step for any reason (resolved or modal closed).
  useEffect(() => {
    if (step !== 'polling') {
      window.clearTimeout(timeoutRef.current)
      return
    }
    timeoutRef.current = window.setTimeout(() => setStep((s) => (s === 'polling' ? 'timeout' : s)), POLL_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutRef.current)
  }, [step, purchaseId])

  // React to the polled purchase's status transitioning out of pending.
  useEffect(() => {
    if (step !== 'polling' || !purchase) return
    if (purchase.status === 'completed') {
      setStep('success')
      invalidate(businessId)
    } else if (purchase.status === 'failed') {
      setStep('failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase?.status, step])

  function handleSubmit() {
    setSubmitError(null)
    if (!selectedTier) {
      setSubmitError('Pick a placement duration to continue.')
      return
    }
    if (!isValidKenyanMsisdn(phone)) {
      setPhoneError('Enter a valid Kenyan phone number (e.g. 0712345678).')
      return
    }
    setPhoneError(null)
    createMutation.mutate(
      {
        businessId,
        payload: {
          tier: selectedTier,
          product_id: target.kind === 'product' ? target.productId : undefined,
          phone,
        },
      },
      {
        onSuccess: (created) => {
          setPurchaseId(created.id)
          setStep('polling')
        },
        onError: (err) => {
          setSubmitError(err instanceof ApiError ? err.message : 'Could not start the M-Pesa payment. Please try again.')
        },
      },
    )
  }

  function resetToPicker() {
    setStep('picker')
    setPurchaseId(null)
    setSubmitError(null)
  }

  const title =
    step === 'picker'
      ? target.kind === 'business'
        ? 'Feature your business'
        : 'Feature this product'
      : step === 'polling'
        ? 'Approve on your phone'
        : step === 'success'
          ? 'Featured!'
          : step === 'failed'
            ? 'Payment failed'
            : "Didn't hear back in time"

  return (
    <Modal open={open} onClose={onClose} title={title} widthClassName="lg:max-w-[480px]">
      {step === 'picker' && (
        <div>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            {target.kind === 'business'
              ? "Shows in Home's Featured rail and carries a Sponsored badge in Search results."
              : 'Carries a Sponsored badge in Search results for '.concat(target.label, '.')}
          </p>

          {pricingQuery.isLoading && (
            <div className="mb-4 flex flex-col gap-2.5">
              <div className="h-16 animate-pulse rounded-xl bg-panel" />
              <div className="h-16 animate-pulse rounded-xl bg-panel" />
            </div>
          )}

          {pricingQuery.isError && (
            <p className="mb-4 text-sm font-semibold text-danger">Couldn&apos;t load pricing — check your connection and reopen this dialog.</p>
          )}

          {pricingQuery.data && (
            <div className="mb-4 flex flex-col gap-2.5" role="radiogroup" aria-label="Placement duration">
              {pricingQuery.data.map((option) => {
                const active = selectedTier === option.tier
                return (
                  <button
                    key={option.tier}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedTier(option.tier)}
                    className={`flex items-center justify-between rounded-xl border-[1.5px] px-4 py-3 text-left transition-[border-color,box-shadow] duration-150 ease-brand ${
                      active
                        ? 'border-brand bg-brand/5 shadow-[0_0_0_3px_rgba(16,52,166,0.12)] dark:border-ice dark:shadow-[0_0_0_3px_rgba(21,66,214,0.25)]'
                        : 'border-border hover:border-brand/50'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold text-foreground">{option.label}</div>
                      <div className="text-xs text-muted-foreground">Featured placement</div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-display text-base font-bold text-foreground">{formatKES(Number(option.amount_kes))}</span>
                      <span
                        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                          active ? 'border-brand bg-brand text-white dark:border-ice dark:bg-ice dark:text-ink' : 'border-border'
                        }`}
                      >
                        {active && <Icon name="check" size={11} strokeWidth={3} />}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <Field label="M-Pesa phone number" error={phoneError ?? undefined} hint="We'll send an STK push prompt to this number.">
            <TextInput
              type="tel"
              inputMode="tel"
              placeholder="0712345678"
              value={phone}
              error={Boolean(phoneError)}
              onChange={(e) => {
                setPhone(e.target.value)
                if (phoneError) setPhoneError(null)
              }}
            />
          </Field>

          {submitError && (
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-danger">
              <Icon name="close" size={11} />
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !pricingQuery.data}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] py-3 text-sm font-bold text-amber-ink shadow-glow-amber transition-[box-shadow,opacity] duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-70"
          >
            {createMutation.isPending && (
              <span className="inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent opacity-85 motion-reduce:animate-none" />
            )}
            {createMutation.isPending
              ? 'Sending prompt…'
              : selectedTier
                ? `Pay ${formatKES(Number(pricingQuery.data?.find((o) => o.tier === selectedTier)?.amount_kes ?? 0))} via M-Pesa`
                : 'Pay via M-Pesa'}
          </button>
        </div>
      )}

      {step === 'polling' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="inline-block h-10 w-10 flex-none animate-spin rounded-full border-[3px] border-amber border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-foreground">Check your phone</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Approve the M-Pesa prompt sent to <span className="font-semibold text-foreground">{phone}</span> to activate featured placement.
            </p>
          </div>
        </div>
      )}

      {step === 'success' && purchase && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-teal/15 text-teal">
            <Icon name="check" size={22} strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">
              {target.kind === 'business' ? 'Your business is now featured' : `${target.label} is now featured`}
            </p>
            {purchase.featured_until && (
              <p className="mt-1 text-sm text-muted-foreground">Featured until {formatDate(purchase.featured_until)}</p>
            )}
            {purchase.mpesa_receipt_number && (
              <p className="mt-2 text-xs text-muted-foreground">
                Receipt <span className="font-mono font-semibold text-foreground">{purchase.mpesa_receipt_number}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Done
          </button>
        </div>
      )}

      {step === 'failed' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-danger/15 text-danger">
            <Icon name="close" size={20} strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">The payment didn&apos;t go through</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {purchase?.failure_reason ?? 'The M-Pesa transaction was not completed.'}
            </p>
          </div>
          <button
            type="button"
            onClick={resetToPicker}
            className="mt-1 w-full rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
          >
            Try again
          </button>
        </div>
      )}

      {step === 'timeout' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-panel text-muted-foreground">
            <Icon name="clock" size={20} />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Didn&apos;t hear back in time</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              You can try again, or it may still complete — check back here shortly.
            </p>
          </div>
          <div className="mt-1 flex w-full gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
            >
              Close
            </button>
            <button
              type="button"
              onClick={resetToPicker}
              className="flex-1 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
