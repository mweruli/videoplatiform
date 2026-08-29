import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import BrandLockup from '../layout/BrandLockup'
import ThemeToggle from '../layout/ThemeToggle'
import Icon from '../icons/Icon'
import { SEARCH_SUGGESTIONS } from '../../data/home'
import { useToast } from '../../lib/toast'

/** Grid texture masked to the top-right, matching the prototype's hero. */
const gridOverlayStyle = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
  backgroundSize: '26px 26px',
  maskImage: 'radial-gradient(ellipse at top right, black, transparent 70%)',
  WebkitMaskImage: 'radial-gradient(ellipse at top right, black, transparent 70%)',
} as const

export default function Hero() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { showToast } = useToast()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
  }

  return (
    <section className="relative isolate overflow-hidden px-5 pt-4.5 pb-7 text-ice lg:px-14 lg:pt-16 lg:pb-16">
      {/* Egyptian Blue → ink hero gradient, per BRAND_DIRECTION.md v2 */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          background:
            'radial-gradient(circle at 88% 4%, rgba(250,189,46,.16), transparent 30%), radial-gradient(ellipse at top right, hsl(226 82% 36%), hsl(226 60% 14%) 55%, hsl(226 70% 6%) 100%)',
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 -z-10 opacity-50" style={gridOverlayStyle} aria-hidden="true" />

      <div className="relative z-10 mb-5 flex items-center justify-between gap-4 lg:hidden">
        <BrandLockup tone="onDark" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => showToast('Location picker — Nairobi is set as the default for now')}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur-md"
          >
            <Icon name="pin" size={13} />
            Nairobi
          </button>
          <ThemeToggle variant="onDark" />
        </div>
      </div>

      <div className="relative z-10 mb-2.5 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.18em] text-ice/80 uppercase">
        <span
          className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-amber motion-reduce:animate-none"
          style={{ boxShadow: '0 0 0 3px rgba(250,189,46,.22)' }}
          aria-hidden="true"
        />
        Search · Discover · Watch · Compare · Connect
      </div>

      <h1 className="relative z-10 mb-2.5 max-w-[20ch] font-display text-[2.15rem] leading-[1.02] font-bold tracking-tight lg:text-6xl">
        Find it. Watch it. <span className="text-amber">Connect.</span>
      </h1>
      <p className="relative z-10 mb-4.5 max-w-[32ch] text-[0.87rem] leading-relaxed text-ice/70 lg:max-w-[46ch] lg:text-base">
        Kenya&apos;s video-first marketplace for products, suppliers &amp; services — from water tanks to solar pumps.
      </p>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-w-[560px] items-center gap-2 rounded-2xl bg-white p-1.5 pl-4 shadow-[0_18px_36px_-12px_rgba(0,0,0,0.5)]"
      >
        <label htmlFor="home-search" className="sr-only">
          Search products, businesses, videos
        </label>
        <input
          id="home-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, businesses, videos…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2 text-[0.86rem] text-ink outline-none placeholder:text-[#8593A3] lg:py-2.5 lg:text-[0.95rem]"
        />
        <button
          type="submit"
          aria-label="Search"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] text-amber-ink shadow-[0_6px_14px_-4px_rgba(250,189,46,0.6)] transition-transform duration-150 ease-brand active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <Icon name="search" size={18} />
        </button>
      </form>

      <div className="no-scrollbar relative z-10 mt-3.5 -mx-5 flex gap-2 overflow-x-auto px-5 pt-0.5 pb-1 lg:mx-0 lg:mt-4.5 lg:flex-wrap lg:px-0">
        {SEARCH_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)}
            className="flex-none rounded-full border border-white/18 bg-white/10 px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-ice transition-colors duration-150 ease-brand hover:bg-white/20"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  )
}
