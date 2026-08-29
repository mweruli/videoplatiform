import { forwardRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import Icon from '../icons/Icon'
import VerifiedBadge from '../ui/VerifiedBadge'
import { SponsoredTag } from '../ui/Tags'
import { bizById } from '../../data/businesses'
import type { Video } from '../../data/types'
import { formatViews } from '../../lib/format'
import { gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { useToast } from '../../lib/toast'

interface HeartBurst {
  id: number
  x: number
  y: number
}

interface FeedSlideProps {
  video: Video
  index: number
  total: number
  liked: boolean
  following: boolean
  /** Whether this slide is the one currently centred in the viewport (per VideoFeed.tsx's IntersectionObserver) — drives the Ken Burns zoom and the avatar pulse ring. */
  inView: boolean
  onToggleLike: () => void
  onToggleFollow: () => void
}

let burstId = 0

/**
 * One full-height Shorts slide. There's no managed video API wired up yet
 * (fixture data only — see VideoFeed.tsx module docstring), so "playback" is
 * simulated: the gradient still slowly scales like a Ken Burns effect while
 * `in view`, and tap-to-pause/double-tap-to-like both give real feedback
 * without a real <video> underneath. The prototype's pause-icon toggle only
 * ever visibly showed the "resume" glyph (a minor logic quirk in the static
 * mockup) — cleaned up here to a straightforward paused/playing boolean.
 */
const FeedSlide = forwardRef<HTMLDivElement, FeedSlideProps>(function FeedSlide(
  { video, index, total, liked, following, inView, onToggleLike, onToggleFollow },
  ref,
) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const business = video.businessId ? bizById(video.businessId) : undefined
  const [paused, setPaused] = useState(false)
  const [bursts, setBursts] = useState<HeartBurst[]>([])
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    setPaused((p) => !p)
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    if (!liked) onToggleLike()
    const rect = event.currentTarget.getBoundingClientRect()
    const id = burstId++
    setBursts((b) => [...b, { id, x: event.clientX - rect.left, y: event.clientY - rect.top }])
    window.setTimeout(() => setBursts((b) => b.filter((burst) => burst.id !== id)), reducedMotion ? 0 : 820)
  }

  function openProfile() {
    if (!business) {
      showToast('Creator profiles are coming in a fast-follow release')
      return
    }
    navigate(`/business/${business.id}`)
  }

  return (
    <div
      ref={ref}
      data-vid={video.id}
      data-idx={index}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="relative isolate flex h-full w-full flex-none snap-start snap-always flex-col justify-end overflow-hidden text-white"
    >
      <div
        className={`absolute inset-0 transition-transform duration-[7000ms] ease-linear motion-reduce:transition-none motion-reduce:scale-100 ${
          inView ? 'scale-[1.16]' : 'scale-[1.06]'
        }`}
        style={{ backgroundImage: gradientFor(video.grad) }}
      >
        <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        <span
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 8%, rgba(255,255,255,.14), transparent 40%)' }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-[6rem] opacity-15" aria-hidden="true">
        {video.icon}
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 24%, rgba(0,0,0,0) 55%, rgba(0,0,0,.86) 100%)',
        }}
      />

      {/* Progress dots */}
      <div className="absolute inset-x-3.5 top-1 z-10 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            {i < index && <span className="absolute inset-0 rounded-full bg-white/75" />}
            {i === index && <span className="scrub-fill absolute inset-0 rounded-full bg-amber" />}
          </span>
        ))}
      </div>

      {/* Topbar */}
      <div className="absolute inset-x-0 top-3.5 z-10 flex items-center justify-between px-3.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Exit Shorts"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-md"
        >
          <Icon name="back" size={17} />
        </button>
        <div className="flex items-center gap-1.5 text-sm font-bold">
          <span className="flex h-[11px] items-end gap-[2.5px]" aria-hidden="true">
            <span className="eq-bar w-[2.5px] rounded-sm bg-amber" style={{ height: 6 }} />
            <span className="eq-bar w-[2.5px] rounded-sm bg-amber" style={{ height: 11 }} />
            <span className="eq-bar w-[2.5px] rounded-sm bg-amber" style={{ height: 4 }} />
          </span>
          Shorts
        </div>
        <button
          type="button"
          onClick={() => navigate('/search')}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-md"
        >
          <Icon name="search" size={17} />
        </button>
      </div>

      {video.sponsored && (
        <div className="absolute top-14 left-3.5 z-10">
          <SponsoredTag />
        </div>
      )}

      {/* Pause/resume overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-[5] flex items-center justify-center transition-opacity duration-300 ease-brand motion-reduce:transition-none ${
          paused ? 'opacity-90' : 'opacity-0'
        }`}
      >
        <Icon name="play" size={56} className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]" />
      </div>

      {/* Heart bursts */}
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="heart-burst-anim pointer-events-none absolute z-[6] motion-reduce:hidden"
          style={{ left: burst.x - 45, top: burst.y - 45 }}
        >
          <Icon name="heart" size={90} className="fill-amber text-amber" />
        </div>
      ))}

      {/* Rail */}
      <div className="absolute right-2.5 bottom-[110px] z-10 flex flex-col items-center gap-5">
        <button type="button" onClick={openProfile} className="relative flex flex-col items-center gap-1">
          <span
            className={`relative z-[1] flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber bg-brand text-lg motion-reduce:animate-none ${
              inView ? 'motion-safe:animate-pulse' : ''
            }`}
          >
            {business ? business.icon : '🎬'}
          </span>
        </button>
        <button type="button" onClick={onToggleLike} className="flex flex-col items-center gap-1">
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/15 backdrop-blur-md transition-[background-color,transform] duration-150 ease-brand active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 ${
              liked ? 'bg-amber/25' : 'bg-white/15'
            }`}
          >
            <Icon name="heart" size={22} className={liked ? 'fill-amber text-amber' : ''} />
          </span>
          <span className="text-[0.66rem] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">
            {formatViews(Math.floor(video.views / 9) + (liked ? 1 : 0))}
          </span>
        </button>
        <button
          type="button"
          onClick={() => showToast('Comments — moderation-reviewed, coming with the content ecosystem')}
          className="flex flex-col items-center gap-1"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/15 backdrop-blur-md">
            <Icon name="comment" size={22} />
          </span>
          <span className="text-[0.66rem] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">
            {formatViews(Math.floor(video.views / 40))}
          </span>
        </button>
        <button
          type="button"
          onClick={() => showToast('Share sheet lands with the native Share API at build time')}
          className="flex flex-col items-center gap-1"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/15 backdrop-blur-md">
            <Icon name="share" size={20} />
          </span>
          <span className="text-[0.66rem] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,.5)]">Share</span>
        </button>
      </div>

      {/* Bottom caption */}
      <div className="relative z-10 px-3.5 pb-5">
        <div className="mb-1.5 flex items-center gap-2 text-[0.85rem] font-bold">
          <span>{business ? business.name : video.creator}</span>
          {business && <VerifiedBadge business={business} />}
          {business && (
            <button
              type="button"
              onClick={onToggleFollow}
              className={`rounded-full border px-3 py-1 text-[0.68rem] font-bold text-white transition-colors duration-150 ease-brand ${
                following ? 'border-amber bg-amber text-amber-ink' : 'border-white bg-transparent'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
        <p className="mb-1 max-w-[calc(100%-64px)] text-[0.82rem] leading-snug">{video.title}</p>
        <p className="flex items-center gap-1.5 text-[0.7rem] opacity-75">
          {video.category} · {formatViews(video.views)} views{video.duration ? ` · ${video.duration}` : ''}
        </p>
      </div>
    </div>
  )
})

export default FeedSlide
