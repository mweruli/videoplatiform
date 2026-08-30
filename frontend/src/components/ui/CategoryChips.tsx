import type { CategoryDto } from '../../lib/api'

interface CategoryChipsProps {
  categories: CategoryDto[]
  /** Compact size for dense card/queue contexts (dashboard manage cards, admin moderation cards) vs. the default used on detail-page headers. */
  size?: 'sm' | 'md'
  className?: string
}

const sizeClasses: Record<NonNullable<CategoryChipsProps['size']>, string> = {
  md: 'px-2.5 py-1 text-xs font-bold text-foreground border border-border bg-panel',
  sm: 'px-2 py-0.5 text-[11px] font-semibold text-muted-foreground bg-panel',
}

/**
 * Read-only category chip list — a product/video now carries zero or more
 * categories (see docs/decisions.md's multi-category entry), so every place
 * that used to render a single `category` badge renders one chip per
 * category here instead. Renders nothing when the list is empty, same as the
 * old single-category `&& <span>` guards did.
 */
export default function CategoryChips({ categories, size = 'md', className = '' }: CategoryChipsProps) {
  if (categories.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {categories.map((category) => (
        <span key={category.id} className={`inline-flex items-center rounded-full ${sizeClasses[size]}`}>
          {category.name}
        </span>
      ))}
    </div>
  )
}
