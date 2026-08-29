interface SkeletonProps {
  className?: string
}

/**
 * Shared loading placeholder — a soft pulsing block. Used anywhere a real
 * network fetch (categories/businesses/products) is in flight, in place of
 * fabricating fake content. Respects prefers-reduced-motion (pulse becomes a
 * static tint instead of animating).
 */
export default function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-panel motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  )
}
