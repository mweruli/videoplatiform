import SectionHeading from '../ui/SectionHeading'
import CategoryTile from './CategoryTile'
import { CATEGORIES } from '../../data/categories'

export default function CategoryGrid() {
  return (
    <section className="bg-background py-6 lg:py-10">
      <div className="mb-4 px-5 lg:px-14">
        <SectionHeading eyebrow="18 categories, growing" title="Explore categories" />
      </div>
      <div className="grid grid-cols-3 gap-2.5 px-5 lg:grid-cols-6 lg:gap-4 lg:px-14">
        {CATEGORIES.map((category) => (
          <CategoryTile key={category.id} category={category} />
        ))}
      </div>
    </section>
  )
}
