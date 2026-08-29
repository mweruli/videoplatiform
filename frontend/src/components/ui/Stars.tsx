interface StarsProps {
  rating: number
  className?: string
}

/** Five-star rating glyph, amber-filled up to the rounded rating. */
export default function Stars({ rating, className = '' }: StarsProps) {
  const rounded = Math.round(rating)
  return (
    <span className={`inline-flex text-[13px] tracking-tighter text-amber ${className}`} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < rounded ? '' : 'text-border'}>
          ★
        </span>
      ))}
    </span>
  )
}
