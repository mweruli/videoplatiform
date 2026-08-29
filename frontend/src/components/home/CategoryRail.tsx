import CategoryChip, { MoreCategoriesChip } from './CategoryChip'
import Skeleton from '../ui/Skeleton'
import { useCategories } from '../../hooks/useCatalog'
import { HOME_CATEGORY_SLUGS } from '../../data/home'

/**
 * Horizontal scroll-snap rail on mobile; becomes a wrap/grid of chips at the
 * desktop breakpoint (still just chips — the full 18-category grid lives
 * further down the page as its own section). Real categories from
 * GET /api/v1/categories (useCatalog.ts); HOME_CATEGORY_SLUGS is just this
 * rail's curated subset/order, not a separate data source.
 */
export default function CategoryRail() {
  const categoriesQuery = useCategories()

  const bySlug = new Map((categoriesQuery.data ?? []).map((c) => [c.slug, c]))
  const categories = HOME_CATEGORY_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  )

  return (
    <div className="bg-panel py-4 lg:py-7">
      <div className="mb-2.5 flex items-center gap-2 px-5 text-[11px] font-extrabold tracking-[0.18em] text-muted-foreground uppercase lg:px-14">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber" aria-hidden="true" />
        Browse categories
      </div>
      <div className="no-scrollbar -mx-0 flex gap-3 overflow-x-auto px-5 pt-0.5 pb-1.5 lg:flex-wrap lg:justify-start lg:gap-5 lg:px-14">
        {categoriesQuery.isLoading ? (
          Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[52px] w-16 flex-none rounded-2xl lg:w-[68px]" />
          ))
        ) : categories.length > 0 ? (
          <>
            {categories.map((category) => (
              <CategoryChip key={category.id} category={category} />
            ))}
            <MoreCategoriesChip />
          </>
        ) : (
          <p className="px-1 py-3 text-xs text-muted-foreground">
            Categories aren&apos;t available right now — try refreshing.
          </p>
        )}
      </div>
    </div>
  )
}
