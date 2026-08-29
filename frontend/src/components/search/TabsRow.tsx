export type SearchTab = 'all' | 'businesses' | 'products' | 'videos'

interface TabsRowProps {
  active: SearchTab
  counts: Record<SearchTab, number>
  onChange: (tab: SearchTab) => void
}

const TABS: { id: SearchTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'businesses', label: 'Businesses' },
  { id: 'products', label: 'Products' },
  { id: 'videos', label: 'Videos' },
]

export default function TabsRow({ active, counts, onChange }: TabsRowProps) {
  return (
    <div role="tablist" aria-label="Result type" className="no-scrollbar flex gap-2 overflow-x-auto">
      {TABS.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex-none rounded-full border px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors duration-150 ease-brand ${
              isActive
                ? 'border-brand bg-brand text-white'
                : 'border-border bg-surface text-muted-foreground hover:border-teal hover:text-foreground'
            }`}
          >
            {tab.label} <span className="opacity-60">{counts[tab.id]}</span>
          </button>
        )
      })}
    </div>
  )
}
