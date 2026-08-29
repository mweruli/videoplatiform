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

export function FeaturedTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white uppercase ${className}`}
    >
      <span className="h-[5px] w-[5px] flex-none rounded-full bg-amber" />
      Featured
    </span>
  )
}
