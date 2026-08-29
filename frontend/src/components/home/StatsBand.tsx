import { useAllBusinesses, useAllProducts, useCategories } from '../../hooks/useCatalog'
import { GRAIN_TEXTURE } from '../../lib/thumbTreatment'

/**
 * All three numbers are now real counts straight off the backend (Page.total
 * from GET /businesses and GET /products, and the length of GET /categories)
 * rather than the prototype's illustrative "1,240+" copy — a freshly seeded
 * environment genuinely only has a handful of businesses/products, and
 * showing that honestly is preferable to fabricating impressive-looking
 * numbers next to otherwise-real data on the same page. Each stat shows a
 * loading ellipsis until its query resolves, and an em dash on error —
 * never a wrong/stale/fabricated figure.
 */
export default function StatsBand() {
  const businessesQuery = useAllBusinesses()
  const productsQuery = useAllProducts()
  const categoriesQuery = useCategories()

  const stats = [
    {
      label: 'Verified businesses',
      value: businessesQuery.data?.total,
      isError: businessesQuery.isError,
    },
    {
      label: 'Product listings',
      value: productsQuery.data?.total,
      isError: productsQuery.isError,
    },
    {
      label: 'Categories live',
      value: categoriesQuery.data?.length,
      isError: categoriesQuery.isError,
    },
  ]

  return (
    <section
      className="relative mt-2 flex justify-between gap-2.5 overflow-hidden px-5 py-7.5 text-ice lg:px-14 lg:py-12"
      style={{ background: 'radial-gradient(circle at 15% 0%, rgba(28,138,168,.35), transparent 45%), var(--color-ink)' }}
    >
      <div className="absolute inset-0 opacity-50 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} aria-hidden="true" />
      {stats.map((stat) => (
        <div key={stat.label} className="relative z-10 text-left">
          <div
            className="font-display text-[2.05rem] leading-none font-bold tracking-tight text-amber lg:text-5xl"
            style={{ textShadow: '0 0 24px rgba(250,189,46,.35)' }}
          >
            {stat.isError ? '—' : stat.value === undefined ? '…' : stat.value.toLocaleString()}
          </div>
          <div className="mt-1 text-[10px] font-bold tracking-[0.08em] text-ice/70 uppercase">{stat.label}</div>
        </div>
      ))}
    </section>
  )
}
