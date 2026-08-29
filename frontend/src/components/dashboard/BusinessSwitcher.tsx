import Icon from '../icons/Icon'
import { gradIndexForId, gradientFor } from '../../lib/thumbTreatment'
import type { BusinessDto } from '../../lib/api'

interface BusinessSwitcherProps {
  businesses: BusinessDto[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddNew: () => void
}

/** A business can own more than one business (GET /businesses/mine returns a list) — this horizontal pill row is the switcher, shown even with a single business so "add another" always has a home. */
export default function BusinessSwitcher({ businesses, selectedId, onSelect, onAddNew }: BusinessSwitcherProps) {
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      {businesses.map((biz) => {
        const active = biz.id === selectedId
        const initial = biz.name.trim().charAt(0).toUpperCase() || '?'
        return (
          <button
            key={biz.id}
            type="button"
            onClick={() => onSelect(biz.id)}
            aria-pressed={active}
            className={`flex flex-none items-center gap-2 rounded-full border-[1.5px] py-1.5 pr-4 pl-1.5 text-sm font-bold transition-colors duration-150 ease-brand ${
              active ? 'border-brand bg-brand text-white' : 'border-border bg-surface text-foreground hover:border-brand'
            }`}
          >
            <span
              className="flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white"
              style={{ backgroundImage: gradientFor(gradIndexForId(biz.id)) }}
            >
              {biz.logo_url ? <img src={biz.logo_url} alt="" className="h-full w-full object-cover" /> : initial}
            </span>
            {biz.name}
          </button>
        )
      })}
      <button
        type="button"
        onClick={onAddNew}
        className="flex flex-none items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-border px-3.5 py-1.5 text-sm font-bold text-muted-foreground transition-colors duration-150 ease-brand hover:border-teal hover:text-teal"
      >
        <Icon name="plus" size={13} /> Add business
      </button>
    </div>
  )
}
