interface BrandLockupProps {
  tone?: 'onDark' | 'nav'
  className?: string
}

/** "Miles" + amber "Tech" wordmark. On the dark hero it stays ice (inherited
 * text color); in flat chrome (desktop top nav) "Miles" takes the brand's
 * Egyptian Blue — its first-listed role in BRAND_DIRECTION.md. */
export default function BrandLockup({ tone = 'onDark', className = '' }: BrandLockupProps) {
  return (
    <span className={`font-display text-[1.15rem] font-bold tracking-tight ${className}`}>
      <span className={tone === 'nav' ? 'text-brand' : 'text-ice'}>Miles</span>
      <span className="text-amber">Tech</span>
    </span>
  )
}
