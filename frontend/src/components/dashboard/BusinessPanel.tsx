import { useRef } from 'react'

import Icon from '../icons/Icon'
import VerificationStatusBadge from '../ui/VerificationStatusBadge'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import type { BusinessDto } from '../../lib/api'

interface BusinessPanelProps {
  business: BusinessDto
  onEdit: () => void
  onUploadLogo: (file: File) => void
  onUploadCover: (file: File) => void
  logoUploading: boolean
  coverUploading: boolean
  onSubmitVerification: () => void
  submittingVerification: boolean
  verificationError: string | null
}

/**
 * The managed view of one business — cover/logo (click to replace), identity
 * + real verification state, and the verification-submission action. Mirrors
 * BusinessProfile's public card visually (same gradient/grain treatment,
 * same badge component) so the dashboard and the public profile read as the
 * same product, just with edit affordances layered on.
 */
export default function BusinessPanel({
  business,
  onEdit,
  onUploadLogo,
  onUploadCover,
  logoUploading,
  coverUploading,
  onSubmitVerification,
  submittingVerification,
  verificationError,
}: BusinessPanelProps) {
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const grad = gradIndexForId(business.id)
  const location = [business.city, business.county].filter(Boolean).join(', ')
  const initial = business.name.trim().charAt(0).toUpperCase() || '?'
  const canSubmitVerification = business.verification_status === 'unverified' || business.verification_status === 'rejected'

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated">
      <div className="relative h-32 w-full overflow-hidden bg-panel lg:h-44">
        <span className="absolute inset-0" style={{ backgroundImage: business.cover_image_url ? undefined : gradientFor(grad) }}>
          {!business.cover_image_url && <span className="absolute inset-0 opacity-70 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />}
        </span>
        {business.cover_image_url && <img src={business.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        <button
          type="button"
          onClick={() => coverInputRef.current?.click()}
          disabled={coverUploading}
          className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm transition-colors duration-150 ease-brand hover:bg-black/70 disabled:opacity-70"
        >
          {coverUploading ? 'Uploading…' : 'Change cover'}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUploadCover(file)
            e.target.value = ''
          }}
        />
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="group relative -mt-14 flex h-[68px] w-[68px] flex-none items-center justify-center overflow-hidden rounded-2xl border-4 border-surface text-xl font-bold text-white shadow-soft">
              <span className="absolute inset-0" style={{ backgroundImage: gradientFor(grad) }}>
                <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
              </span>
              {business.logo_url ? (
                <img src={business.logo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="relative">{initial}</span>
              )}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                aria-label="Change logo"
                className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity duration-150 ease-brand hover:bg-black/50 hover:opacity-100 focus-visible:bg-black/50 focus-visible:opacity-100 disabled:opacity-70"
              >
                <Icon name="plus" size={16} />
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUploadLogo(file)
                  e.target.value = ''
                }}
              />
            </div>
            <div className="pt-1">
              <h2 className="flex items-center gap-1.5 font-display text-lg font-bold tracking-tight text-foreground">
                {business.name}
                <VerificationStatusBadge status={business.verification_status} />
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[business.category?.name, location].filter(Boolean).join(' · ') || 'No category or location set yet'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Edit details
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border py-3.5">
          <div>
            <div className="font-display text-lg font-bold text-amber">{business.product_count}</div>
            <div className="text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">Products</div>
          </div>
          <div>
            <div className="font-display text-lg font-bold text-amber">{business.phone ? '✓' : '—'}</div>
            <div className="text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">Phone set</div>
          </div>
          <div>
            <div className="font-display text-lg font-bold text-amber">{business.is_active ? 'Active' : 'Inactive'}</div>
            <div className="text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">Listing status</div>
          </div>
        </div>

        <div className="mt-4">
          {business.verification_status === 'verified' && (
            <div className="flex items-start gap-2 rounded-xl border border-teal/30 bg-teal/10 p-3 text-xs leading-relaxed text-teal">
              <Icon name="check" size={15} className="mt-0.5 flex-none" />
              Verified by Miles Tech — your profile is visible in public Search &amp; Directory results.
            </div>
          )}
          {business.verification_status === 'pending' && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-panel p-3 text-xs leading-relaxed text-muted-foreground">
              <Icon name="clock" size={15} className="mt-0.5 flex-none text-teal" />
              Submitted for verification — Miles Tech is reviewing your profile. This can take a few business days.
            </div>
          )}
          {business.verification_status === 'rejected' && (
            <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-danger">
              <span className="flex items-start gap-2">
                <Icon name="close" size={15} className="mt-0.5 flex-none" />
                Verification was rejected{business.verification_note ? `: ${business.verification_note}` : '.'}
              </span>
            </div>
          )}
          {business.verification_status === 'unverified' && (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-panel p-3 text-xs leading-relaxed text-muted-foreground">
              <Icon name="clock" size={15} className="mt-0.5 flex-none" />
              Not yet submitted for verification. Verified businesses appear in public Search &amp; the Directory.
            </div>
          )}

          {verificationError && <p className="mt-2 text-xs font-semibold text-danger">{verificationError}</p>}

          {canSubmitVerification && (
            <button
              type="button"
              onClick={onSubmitVerification}
              disabled={submittingVerification}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg disabled:pointer-events-none disabled:opacity-70"
            >
              {submittingVerification
                ? 'Submitting…'
                : business.verification_status === 'rejected'
                  ? 'Resubmit for verification'
                  : 'Submit for verification'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
