import { useEffect, useRef, useState } from 'react'

import Icon from '../icons/Icon'
import Modal from '../ui/Modal'
import { Field, TextInput } from '../ui/FormControls'
import { formatKES } from '../../lib/format'
import { isValidKenyanMsisdn, formatKenyanMsisdnForInput } from '../../lib/phone'
import {
  useCampaignPricing,
  useCreateCampaignFunding,
  useInvalidateAfterCampaignFunding,
  usePollCampaignFunding,
} from '../../hooks/useCampaigns'
import { ApiError } from '../../lib/api'

/** Same 2-minute ceiling as FeaturedPurchaseModal — Daraja's own STK prompt times out client-side around 60-90s. */
const POLL_TIMEOUT_MS = 120_000

interface CampaignFundingModalProps {
  open: boolean
  onClose: () => void
  businessId: string
  businessPhone: string | null
  campaignId: string
  campaignName: string
}

type Step = 'form' | 'polling' | 'success' | 'failed' | 'timeout'

/**
 * Campaign top-up flow — directly adapted from FeaturedPurchaseModal.tsx's
 * STK-push-then-poll pattern (same polling cadence, same 2-minute timeout,
 * same success/failed/timeout terminal states), with an advertiser-chosen
 * amount input in place of the fixed pricing-tier picker, since a campaign
 * top-up has no "tier" — see docs/decisions.md's "Phase 1b design pass:
 * self-serve advertiser campaign manager" entry.
 */
export default function CampaignFundingModal({ open, onClose, businessId, businessPhone, campaignId, campaignName }: CampaignFundingModalProps) {
  const pricingQuery = useCampaignPricing()
  const createMutation = useCreateCampaignFunding()
  const invalidate = useInvalidateAfterCampaignFunding()

  const [step, setStep] = useState<Step>('form')
  const [amount, setAmount] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fundingId, setFundingId] = useState<string | null>(null)
  const timeoutRef = useRef<number | undefined>(undefined)
  const wasOpenRef = useRef(false)

  const minFunding = pricingQuery.data ? Number(pricingQuery.data.min_funding_kes) : null

  // Reset to a clean first step only on the false->true transition of `open`
  // — same reasoning as FeaturedPurchaseModal's identical effect (a
  // successful top-up's cache invalidation re-renders the parent while the
  // modal is still showing its success step, and this must not wipe that).
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStep('form')
      setAmount('')
      setAmountError(null)
      setPhone(formatKenyanMsisdnForInput(businessPhone))
      setPhoneError(null)
      setSubmitError(null)
      setFundingId(null)
    }
    wasOpenRef.current = open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pollQuery = usePollCampaignFunding(fundingId ?? undefined, step === 'polling')
  const funding = pollQuery.data

  useEffect(() => {
    if (step !== 'polling') {
      window.clearTimeout(timeoutRef.current)
      return
    }
    timeoutRef.current = window.setTimeout(() => setStep((s) => (s === 'polling' ? 'timeout' : s)), POLL_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutRef.current)
  }, [step, fundingId])

  useEffect(() => {
    if (step !== 'polling' || !funding) return
    if (funding.status === 'completed') {
      setStep('success')
      invalidate(businessId, campaignId)
    } else if (funding.status === 'failed') {
      setStep('failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funding?.status, step])

  function handleSubmit() {
    setSubmitError(null)
    const amountNumber = Number(amount)
    if (!amount || Number.isNaN(amountNumber) || amountNumber <= 0) {
      setAmountError('Enter an amount to fund this campaign.')
      return
    }
    if (minFunding !== null && amountNumber < minFunding) {
      setAmountError(`Minimum top-up is ${formatKES(minFunding)}.`)
      return
    }
    setAmountError(null)
    if (!isValidKenyanMsisdn(phone)) {
      setPhoneError('Enter a valid Kenyan phone number (e.g. 0712345678).')
      return
    }
    setPhoneError(null)
    createMutation.mutate(
      { campaignId, payload: { amount_kes: amountNumber, phone } },
      {
        onSuccess: (created) => {
          setFundingId(created.id)
          setStep('polling')
        },
        onError: (err) => {
          setSubmitError(err instanceof ApiError ? err.message : 'Could not start the M-Pesa payment. Please try again.')
        },
      },
    )
  }

  function resetToForm() {
    setStep('form')
    setFundingId(null)
    setSubmitError(null)
  }

  const title =
    step === 'form'
      ? 'Fund campaign'
      : step === 'polling'
        ? 'Approve on your phone'
        : step === 'success'
          ? 'Campaign funded!'
          : step === 'failed'
            ? 'Payment failed'
            : "Didn't hear back in time"

  return (
    <Modal open={open} onClose={onClose} title={title} widthClassName="lg:max-w-[480px]">
      {step === 'form' && (
        <div>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Top up <span className="font-bold text-foreground">{campaignName}</span>&apos;s budget. It only spends (and only shows the
            Sponsored tie-break) while it&apos;s both approved by Miles Tech and funded.
          </p>

          {pricingQuery.isError && (
            <p className="mb-4 text-sm font-semibold text-danger">Couldn&apos;t load pricing — check your connection and reopen this dialog.</p>
          )}

          <Field
            label="Amount to fund"
            error={amountError ?? undefined}
            hint={
              pricingQuery.data
                ? `CPM ${formatKES(Number(pricingQuery.data.cpm_kes))} per 1,000 impressions · minimum top-up ${formatKES(Number(pricingQuery.data.min_funding_kes))}`
                : undefined
            }
          >
            <TextInput
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="e.g. 2000"
              value={amount}
              error={Boolean(amountError)}
              onChange={(e) => {
                setAmount(e.target.value)
                if (amountError) setAmountError(null)
              }}
            />
          </Field>

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
            disabled={createMutation.isPending || pricingQuery.isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] py-3 text-sm font-bold text-amber-ink shadow-glow-amber transition-[box-shadow,opacity] duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-70"
          >
            {createMutation.isPending && (
              <span className="inline-block h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent opacity-85 motion-reduce:animate-none" />
            )}
            {createMutation.isPending ? 'Sending prompt…' : 'Pay via M-Pesa'}
          </button>
        </div>
      )}

      {step === 'polling' && (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <span className="inline-block h-10 w-10 flex-none animate-spin rounded-full border-[3px] border-amber border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-foreground">Check your phone</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Approve the M-Pesa prompt sent to <span className="font-semibold text-foreground">{phone}</span> to add funds to this
              campaign.
            </p>
          </div>
        </div>
      )}

      {step === 'success' && funding && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-teal/15 text-teal">
            <Icon name="check" size={22} strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">{formatKES(Number(funding.amount_kes))} added to {campaignName}</p>
            {funding.mpesa_receipt_number && (
              <p className="mt-2 text-xs text-muted-foreground">
                Receipt <span className="font-mono font-semibold text-foreground">{funding.mpesa_receipt_number}</span>
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
              {funding?.status === 'failed' ? 'The M-Pesa transaction was not completed.' : 'Something went wrong. Please try again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={resetToForm}
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
              onClick={resetToForm}
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
