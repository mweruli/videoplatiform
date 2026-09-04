import Icon from '../icons/Icon'

/** Numbered pager — see docs/design/prototype-v1.html's `.pager` (v8 design pass). Used by User Management's paginated table. */
export default function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-border bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/60 disabled:pointer-events-none disabled:opacity-40"
      >
        <Icon name="back" size={13} />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`h-[30px] min-w-[30px] flex-none rounded-lg border px-2 text-[13px] font-bold transition-colors duration-150 ease-brand ${
            p === page ? 'border-brand bg-brand text-white' : 'border-border bg-panel text-foreground hover:bg-border/60'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        aria-label="Next page"
        className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-border bg-panel text-foreground transition-colors duration-150 ease-brand hover:bg-border/60 disabled:pointer-events-none disabled:opacity-40"
      >
        <Icon name="back" size={13} className="rotate-180" />
      </button>
    </div>
  )
}
