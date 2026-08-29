import type { CategoryDto } from '../../lib/api'
import type { SearchFilters } from './filterState'

interface FilterPanelProps {
  categories: CategoryDto[]
  locations: string[]
  draft: SearchFilters
  onToggleCategory: (id: number) => void
  onToggleLocation: (location: string) => void
  onPriceMinChange: (value: string) => void
  onPriceMaxChange: (value: string) => void
  onApply: () => void
  onReset: () => void
}

const chipBase =
  'rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors duration-150 ease-brand'
const chipInactive = 'border-border bg-surface text-muted-foreground hover:border-teal hover:text-foreground'
const chipActive = 'border-brand bg-brand text-white'

/**
 * Shared filter content — rendered inside a mobile BottomSheet by Search on
 * small screens, and directly inside a persistent `<aside>` sidebar at the
 * >=1024px breakpoint. Category/location chips and price stage into `draft`
 * as the user taps; nothing takes effect on the results list until "Apply"
 * (or "Reset") — mirrors the approved prototype's filter-sheet behaviour,
 * which avoids re-running search on every tap while the sheet is open.
 */
export default function FilterPanel({
  categories,
  locations,
  draft,
  onToggleCategory,
  onToggleLocation,
  onPriceMinChange,
  onPriceMaxChange,
  onApply,
  onReset,
}: FilterPanelProps) {
  return (
    <div>
      <h3 className="font-display text-lg font-bold tracking-tight text-foreground">Filter results</h3>
      <p className="mt-1 text-sm text-muted-foreground">Narrow down by category, location or price.</p>

      <div className="mt-5">
        <label className="mb-2 block text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Category
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onToggleCategory(category.id)}
              aria-pressed={draft.categoryIds.has(category.id)}
              className={`${chipBase} ${draft.categoryIds.has(category.id) ? chipActive : chipInactive}`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Location
        </label>
        <div className="flex flex-wrap gap-2">
          {locations.map((location) => (
            <button
              key={location}
              type="button"
              onClick={() => onToggleLocation(location)}
              aria-pressed={draft.location === location}
              className={`${chipBase} ${draft.location === location ? chipActive : chipInactive}`}
            >
              {location}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-[11px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Price range (KES)
        </label>
        <div className="flex items-center gap-2.5">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            value={draft.priceMin}
            onChange={(e) => onPriceMinChange(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-teal"
          />
          <span className="flex-none text-muted-foreground">–</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            value={draft.priceMax}
            onChange={(e) => onPriceMaxChange(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-teal"
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Price range applies to product listings only.</p>
      </div>

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-full border-[1.5px] border-foreground px-4 py-2.5 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          className="flex-1 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
