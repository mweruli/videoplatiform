import { PLATFORM_STATS } from '../../data/home'
import { GRAIN_TEXTURE } from '../../lib/thumbTreatment'

export default function StatsBand() {
  return (
    <section
      className="relative mt-2 flex justify-between gap-2.5 overflow-hidden px-5 py-7.5 text-ice lg:px-14 lg:py-12"
      style={{ background: 'radial-gradient(circle at 15% 0%, rgba(28,138,168,.35), transparent 45%), var(--color-ink)' }}
    >
      <div className="absolute inset-0 opacity-50 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} aria-hidden="true" />
      {PLATFORM_STATS.map((stat) => (
        <div key={stat.label} className="relative z-10 text-left">
          <div
            className="font-display text-[2.05rem] leading-none font-bold tracking-tight text-amber lg:text-5xl"
            style={{ textShadow: '0 0 24px rgba(250,189,46,.35)' }}
          >
            {stat.value}
          </div>
          <div className="mt-1 text-[10px] font-bold tracking-[0.08em] text-ice/70 uppercase">{stat.label}</div>
        </div>
      ))}
    </section>
  )
}
