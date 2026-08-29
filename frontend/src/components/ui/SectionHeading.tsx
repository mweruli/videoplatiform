interface SectionHeadingProps {
  eyebrow: string
  title: string
  subtitle?: string
  tone?: 'default' | 'onDark'
  pulse?: boolean
}

/**
 * Shared section-heading pattern: uppercase eyebrow + amber dot, display
 * headline, optional supporting line. Reused across every Home section so
 * hierarchy stays consistent instead of ad hoc per-section sizing.
 */
export default function SectionHeading({ eyebrow, title, subtitle, tone = 'default', pulse }: SectionHeadingProps) {
  const onDark = tone === 'onDark'
  return (
    <div>
      <div
        className={`mb-2 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.18em] uppercase ${
          onDark ? 'text-ice/70' : 'text-muted-foreground'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 flex-none rounded-full bg-amber ${pulse ? 'motion-safe:animate-pulse' : ''}`}
          style={{ boxShadow: '0 0 0 3px rgba(250,189,46,.22)' }}
          aria-hidden="true"
        />
        {eyebrow}
      </div>
      <h2 className={`font-display text-[1.5rem] leading-[1.1] font-bold tracking-tight ${onDark ? 'text-ice' : 'text-foreground'}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-1 text-sm leading-relaxed ${onDark ? 'text-ice/60' : 'text-muted-foreground'}`}>{subtitle}</p>
      )}
    </div>
  )
}
