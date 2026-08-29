import { Link } from 'react-router-dom'

import { iconForCategory } from '../../lib/categoryIcons'
import type { CategoryDto } from '../../lib/api'

interface CategoryTileProps {
  category: CategoryDto
}

/** Compact grid tile for the full "Explore categories" list. */
export default function CategoryTile({ category }: CategoryTileProps) {
  return (
    <Link
      to={`/search?category=${category.slug}`}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-2 py-3.5 text-center transition-transform duration-150 ease-brand hover:-translate-y-0.5 hover:border-teal motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="text-[1.25rem]" aria-hidden="true">
        {iconForCategory(category.slug)}
      </span>
      <span className="text-[11px] leading-tight font-bold text-muted-foreground">{category.name}</span>
    </Link>
  )
}
