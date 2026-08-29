import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import ProductTile from '../components/business/ProductTile'
import Icon from '../components/icons/Icon'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import VerificationStatusBadge from '../components/ui/VerificationStatusBadge'
import { useBusinessBySlug, useBusinessProducts } from '../hooks/useCatalog'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../lib/thumbTreatment'
import { useToast } from '../lib/toast'

type ProfileTab = 'products' | 'videos' | 'about'

/**
 * Business profile — real backend (GET /businesses/slug/{slug} +
 * GET /products?business_id=...). Ratings/reviews aren't a backend feature
 * yet (no field on Business), so unlike the approved prototype's mock data
 * this screen has no star rating to show — omitted rather than fabricated.
 * Same for the Videos tab: there's no video↔business backend association
 * yet (Sprint 3 per DEVELOPMENT_PLAN.md, not built), so it's an honest empty
 * state rather than borrowing unrelated fixture videos.
 */
export default function BusinessProfile() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [tab, setTab] = useState<ProfileTab>('products')

  const businessQuery = useBusinessBySlug(slug)
  const business = businessQuery.data
  const productsQuery = useBusinessProducts(business?.id)

  if (businessQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-6 lg:px-14 lg:py-10">
        <Skeleton className="h-[180px] w-full lg:h-[240px]" />
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:gap-8">
          <Skeleton className="h-[220px] w-full lg:w-80" />
          <Skeleton className="h-[320px] w-full flex-1" />
        </div>
      </div>
    )
  }

  if (businessQuery.isError || !business) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 lg:px-8">
        <EmptyState
          tone="error"
          title="Business not found"
          subtitle="This showroom may have been unpublished, or the link is out of date."
        >
          <Link
            to="/search"
            className="rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Back to search
          </Link>
        </EmptyState>
      </div>
    )
  }

  const grad = gradIndexForId(business.id)
  const location = [business.city, business.county].filter(Boolean).join(', ')
  const initial = business.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div>
      <div
        className="relative h-[180px] w-full overflow-hidden lg:h-[260px]"
        style={{ backgroundImage: business.cover_image_url ? undefined : gradientFor(grad) }}
      >
        {business.cover_image_url ? (
          <img src={business.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 opacity-70 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-4 lg:px-14">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors duration-150 ease-brand hover:bg-black/60"
          >
            <Icon name="back" size={17} />
          </button>
          <button
            type="button"
            onClick={() => showToast('Share sheet lands with the native Share API at build time')}
            aria-label="Share"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors duration-150 ease-brand hover:bg-black/60"
          >
            <Icon name="share" size={16} />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 lg:px-14">
        <div className="-mt-10 lg:flex lg:items-start lg:gap-10">
          {/* Sidebar (sticky at desktop) */}
          <aside className="lg:sticky lg:top-24 lg:w-80 lg:flex-none">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-elevated">
              <span
                className="relative -mt-14 mb-3 flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl border-4 border-surface text-2xl font-bold text-white shadow-soft"
                style={{ backgroundImage: gradientFor(grad) }}
              >
                <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
                {business.logo_url ? (
                  <img src={business.logo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="relative">{initial}</span>
                )}
              </span>

              <h1 className="flex items-center gap-1.5 font-display text-xl font-bold tracking-tight text-foreground">
                {business.name}
                <VerificationStatusBadge status={business.verification_status} />
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {[business.category?.name, location].filter(Boolean).join(' · ') || 'Business'}
              </p>

              {business.verification_status === 'pending' && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-panel p-3 text-xs leading-relaxed text-muted-foreground">
                  <Icon name="clock" size={15} className="mt-0.5 flex-none" />
                  Verification pending — this profile is under Miles Tech&apos;s manual review and not yet marked
                  verified.
                </div>
              )}
              {business.verification_status === 'unverified' && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-panel p-3 text-xs leading-relaxed text-muted-foreground">
                  <Icon name="clock" size={15} className="mt-0.5 flex-none" />
                  This business hasn&apos;t submitted for verification yet.
                </div>
              )}

              {business.description && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{business.description}</p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 border-y border-border py-3.5">
                <div>
                  <div className="font-display text-lg font-bold text-amber">{business.product_count}</div>
                  <div className="text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                    Products
                  </div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold text-amber">
                    {business.verification_status === 'verified' ? '✓' : '—'}
                  </div>
                  <div className="text-[10px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                    Verified
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2.5">
                {business.phone ? (
                  <a
                    href={`tel:${business.phone.replace(/\s+/g, '')}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
                  >
                    <Icon name="phone" size={15} /> Contact
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => showToast('No phone number listed for this business yet')}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-panel px-4 py-2.5 text-sm font-bold text-muted-foreground"
                  >
                    <Icon name="phone" size={15} /> Contact
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => showToast('Saved to your favourites')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
                >
                  <Icon name="bookmark" size={15} /> Save
                </button>
              </div>
            </div>
          </aside>

          {/* Tab content */}
          <div className="mt-6 min-w-0 flex-1 lg:mt-0">
            <div role="tablist" aria-label="Business profile section" className="flex gap-1 border-b border-border">
              {(
                [
                  { id: 'products', label: 'Products' },
                  { id: 'videos', label: 'Videos' },
                  { id: 'about', label: 'About' },
                ] as { id: ProfileTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative px-4 py-3 text-sm font-bold transition-colors duration-150 ease-brand ${
                    tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-amber" />}
                </button>
              ))}
            </div>

            <div className="py-5">
              {tab === 'products' &&
                (productsQuery.isLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    <Skeleton className="h-[180px]" />
                    <Skeleton className="h-[180px]" />
                    <Skeleton className="h-[180px]" />
                  </div>
                ) : (productsQuery.data?.items.length ?? 0) === 0 ? (
                  <EmptyState
                    icon="📦"
                    title="No products listed yet"
                    subtitle="This business hasn't published any listings — check back soon."
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {productsQuery.data?.items.map((p) => <ProductTile key={p.id} product={p} />)}
                  </div>
                ))}

              {tab === 'videos' && (
                <EmptyState
                  icon="🎬"
                  title="No videos yet"
                  subtitle="Video uploads and the Shorts feed integration for business profiles are coming in a later release."
                />
              )}

              {tab === 'about' && (
                <div className="flex flex-col gap-5">
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                      Overview
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {business.description || 'No description provided yet.'}
                    </p>
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                      Contact &amp; location
                    </h3>
                    <div className="flex flex-col gap-1.5 text-sm text-foreground">
                      {location && (
                        <span className="flex items-center gap-2">
                          <Icon name="pin" size={15} className="text-muted-foreground" /> {location}
                        </span>
                      )}
                      {business.phone && (
                        <span className="flex items-center gap-2">
                          <Icon name="phone" size={15} className="text-muted-foreground" /> {business.phone}
                        </span>
                      )}
                      {business.website_url && (
                        <a
                          href={business.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-brand hover:underline dark:text-ice"
                        >
                          <Icon name="share" size={15} className="text-muted-foreground" /> {business.website_url}
                        </a>
                      )}
                      {!location && !business.phone && !business.website_url && (
                        <span className="text-muted-foreground">No contact details listed yet.</span>
                      )}
                    </div>
                  </div>
                  {business.category && (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                        Category
                      </h3>
                      <span className="inline-flex items-center rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-bold text-foreground">
                        {business.category.name}
                      </span>
                    </div>
                  )}
                  <div>
                    <h3 className="mb-1.5 text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                      Verification
                    </h3>
                    <VerificationStatusBadge status={business.verification_status} withLabel />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="h-6 lg:h-10" aria-hidden="true" />
    </div>
  )
}
