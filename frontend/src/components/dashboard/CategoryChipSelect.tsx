import type { CategoryDto } from '../../lib/api'

interface CategoryChipSelectProps {
  categories: CategoryDto[]
  selectedIds: Set<number>
  onToggle: (id: number) => void
  loading?: boolean
}

const chipBase = 'rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-150 ease-brand'
const chipInactive = 'border-border bg-surface text-muted-foreground hover:border-teal hover:text-foreground'
const chipActive = 'border-brand bg-brand text-white'

/**
 * Toggleable category-chip multi-select for the Product/Video forms — visual
 * pattern lifted 1:1 from `components/search/FilterPanel.tsx`'s category
 * filter chips, since that's the same "tap to toggle membership in a set of
 * ids" interaction, just against a payload field instead of a filter draft.
 * Zero or more selections are valid (categories are optional on both Product
 * and Video per the backend), so there's no "select one" affordance.
 */
export default function CategoryChipSelect({ categories, selectedIds, onToggle, loading }: CategoryChipSelectProps) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading categories…</p>
  if (categories.length === 0) return <p className="text-xs text-muted-foreground">No categories available yet.</p>

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
      {categories.map((category) => {
        const active = selectedIds.has(category.id)
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onToggle(category.id)}
            aria-pressed={active}
            className={`${chipBase} ${active ? chipActive : chipInactive}`}
          >
            {category.name}
          </button>
        )
      })}
    </div>
  )
}
