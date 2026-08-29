import SectionHeading from '../ui/SectionHeading'
import CategoryTile from './CategoryTile'
import Skeleton from '../ui/Skeleton'
import { useCategories } from '../../hooks/useCatalog'

/** Full category list, real data from GET /api/v1/categories. */
export default function CategoryGrid() {
  const categoriesQuery = useCategories()
  const categories = categoriesQuery.data ?? []

  return (
    <section className="bg-background py-6 lg:py-10">
      <div className="mb-4 px-5 lg:px-14">
        <SectionHeading
          eyebrow={categoriesQuery.data ? `${categoriesQuery.data.length} categories, growing` : 'Browse by category'}
          title="Explore categories"
        />
      </div>
      <div className="grid grid-cols-3 gap-2.5 px-5 lg:grid-cols-6 lg:gap-4 lg:px-14">
        {categoriesQuery.isLoading ? (
          Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-[84px]" />)
        ) : categories.length > 0 ? (
          categories.map((category) => <CategoryTile key={category.id} category={category} />)
        ) : (
          <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
            Categories aren&apos;t available right now — try refreshing.
          </p>
        )}
      </div>
    </section>
  )
}
