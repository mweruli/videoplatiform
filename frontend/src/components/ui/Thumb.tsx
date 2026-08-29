import type { ReactNode } from 'react'

import Icon from '../icons/Icon'
import { gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { SponsoredTag } from './Tags'

interface ThumbProps {
  grad: number
  glyph?: string
  duration?: string
  sponsored?: boolean
  showPlayBadge?: boolean
  className?: string
  overlay?: ReactNode
}

/**
 * The shared "out-of-focus video still" thumbnail treatment used across
 * every video/product tile: a multi-stop angled gradient with two off-axis
 * bokeh glows, a film-grain layer, and a bottom vignette — reads as real
 * footage rather than a flat color chip. Real photography/video posters
 * replace the gradient+glyph placeholder once media upload lands; the
 * grain/vignette/duration/sponsored chrome stays.
 */
export default function Thumb({ grad, glyph, duration, sponsored, showPlayBadge, className = '', overlay }: ThumbProps) {
  return (
    <div className={`group/thumb relative isolate overflow-hidden rounded-2xl bg-panel ${className}`}>
      <div
        className="absolute inset-0 transition-transform duration-500 ease-brand group-hover/thumb:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover/thumb:scale-100"
        style={{ backgroundImage: gradientFor(grad) }}
      >
        <div className="absolute inset-0 opacity-70 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} aria-hidden="true" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 120%, rgba(0,0,0,.5) 0%, transparent 55%), radial-gradient(circle at 82% 8%, rgba(255,255,255,.16) 0%, transparent 30%)',
          }}
          aria-hidden="true"
        />
      </div>

      {glyph && (
        <div
          className="absolute inset-0 flex translate-y-0.5 items-center justify-center text-4xl opacity-85 drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
          aria-hidden="true"
        >
          {glyph}
        </div>
      )}

      {sponsored && (
        <div className="absolute top-2 left-2 z-10">
          <SponsoredTag />
        </div>
      )}

      {showPlayBadge && (
        <div className="absolute top-2 right-2 z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/50 text-white shadow-[0_4px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <Icon name="play" size={13} />
        </div>
      )}

      {duration && (
        <div className="absolute right-1.5 bottom-1.5 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white backdrop-blur-sm">
          {duration}
        </div>
      )}

      {overlay}
    </div>
  )
}
