import { Link } from 'react-router-dom'

import Icon from '../icons/Icon'
import type { Category } from '../../data/types'

interface CategoryChipProps {
  category: Category
}

/** Vertical icon-tile category chip used in the horizontal rail / desktop grid. */
export default function CategoryChip({ category }: CategoryChipProps) {
  return (
    <Link
      to={`/search?category=${category.id}`}
      className="group flex w-16 flex-none flex-col items-center gap-1.5 lg:w-auto"
    >
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-border bg-surface text-[1.35rem] shadow-soft transition-[transform,box-shadow,border-color] duration-150 ease-brand group-hover:-translate-y-0.5 group-hover:border-teal group-hover:shadow-elevated motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        {category.icon}
      </span>
      <span className="text-center text-[11px] leading-tight font-bold text-muted-foreground">{category.label}</span>
    </Link>
  )
}

export function MoreCategoriesChip() {
  return (
    <Link to="/search" className="group flex w-16 flex-none flex-col items-center gap-1.5 lg:hidden">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-border bg-surface text-muted-foreground shadow-soft transition-[transform,box-shadow,border-color] duration-150 ease-brand group-hover:-translate-y-0.5 group-hover:border-teal group-hover:shadow-elevated motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <Icon name="plus" size={18} />
      </span>
      <span className="text-center text-[11px] leading-tight font-bold text-muted-foreground">More</span>
    </Link>
  )
}
