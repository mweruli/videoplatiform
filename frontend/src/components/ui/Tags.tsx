/** Small uppercase pill markers — kept visually distinct and consistent
 * wherever paid/promoted placement needs to be called out, per the brief's
 * "sponsored placements clearly labelled, kept distinct from organic
 * results" rule. */
export function SponsoredTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-amber px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-amber-ink uppercase shadow-glow-amber ${className}`}
    >
      <span className="h-[5px] w-[5px] flex-none rounded-full bg-current" />
      Sponsored
    </span>
  )
}

interface FeaturedTagProps {
  className?: string
  /**
   * 'onDark' = the amber-glass variant for surfaces that are always dark
   * regardless of the app's light/dark theme (e.g. Home's "digital showroom"
   * band, `--color-ink`-backed) — mirrors the same
   * `bg-amber/15 border-amber/40 text-amber` chip pattern already
   * established for amber accents elsewhere (see lib/availability.ts's
   * "made_to_order" pill), rather than inventing a new amber treatment.
   * Default is the solid brand-blue pill for ordinary light/dark-aware
   * surfaces.
   */
  tone?: 'default' | 'onDark'
}

export function FeaturedTag({ className = '', tone = 'default' }: FeaturedTagProps) {
  if (tone === 'onDark') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border border-amber/40 bg-amber/15 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-amber uppercase ${className}`}
      >
        <span className="h-[5px] w-[5px] flex-none rounded-full bg-amber" />
        Featured
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white uppercase ${className}`}
    >
      <span className="h-[5px] w-[5px] flex-none rounded-full bg-amber" />
      Featured
    </span>
  )
}
