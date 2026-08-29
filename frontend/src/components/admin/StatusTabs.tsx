/**
 * Generic status-filter tab row for the Admin moderation queue — same visual
 * language as search/TabsRow.tsx (active = solid brand pill, inactive =
 * outline), genericized over the status union since businesses and products
 * use different status enums (VerificationStatus vs ModerationStatus).
 */
interface StatusTabsProps<T extends string> {
  active: T
  options: { id: T; label: string }[]
  counts?: Partial<Record<T, number>>
  onChange: (id: T) => void
}

export default function StatusTabs<T extends string>({ active, options, counts, onChange }: StatusTabsProps<T>) {
  return (
    <div role="tablist" aria-label="Status" className="no-scrollbar flex gap-2 overflow-x-auto">
      {options.map((opt) => {
        const isActive = active === opt.id
        const count = counts?.[opt.id]
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={`flex-none rounded-full border px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors duration-150 ease-brand ${
              isActive
                ? 'border-brand bg-brand text-white'
                : 'border-border bg-surface text-muted-foreground hover:border-teal hover:text-foreground'
            }`}
          >
            {opt.label} {count !== undefined && <span className="opacity-60">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
