import CategoryChip, { MoreCategoriesChip } from './CategoryChip'
import { catById } from '../../data/categories'
import { HOME_CATEGORY_ORDER } from '../../data/home'

/**
 * Horizontal scroll-snap rail on mobile; becomes a wrap/grid of chips at the
 * desktop breakpoint (still just chips — the full 18-category grid lives
 * further down the page as its own section).
 */
export default function CategoryRail() {
  const categories = HOME_CATEGORY_ORDER.map(catById).filter((c): c is NonNullable<typeof c> => Boolean(c))

  return (
    <div className="bg-panel py-4 lg:py-7">
      <div className="mb-2.5 flex items-center gap-2 px-5 text-[11px] font-extrabold tracking-[0.18em] text-muted-foreground uppercase lg:px-14">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber" aria-hidden="true" />
        Browse categories
      </div>
      <div className="no-scrollbar -mx-0 flex gap-3 overflow-x-auto px-5 pt-0.5 pb-1.5 lg:flex-wrap lg:justify-start lg:gap-5 lg:px-14">
        {categories.map((category) => (
          <CategoryChip key={category.id} category={category} />
        ))}
        <MoreCategoriesChip />
      </div>
    </div>
  )
}
