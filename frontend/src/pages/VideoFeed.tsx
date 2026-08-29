import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import FeedSlide from '../components/feed/FeedSlide'
import UpNextRail from '../components/feed/UpNextRail'
import { FEED_ORDER } from '../data/home'
import { vidById } from '../data/videos'

/**
 * Video / Shorts feed — scroll-snap vertical column on mobile, centred
 * column + live "Up next" rail on desktop (>=1024px), matching the approved
 * prototype. There is no managed video API or video↔listing backend yet
 * (DEVELOPMENT_PLAN.md's Sprint 3 — not built), so this renders the same
 * fixture data as Home's trending rail rather than blocking on that work;
 * "playback" (pause overlay, Ken Burns zoom while in view) is simulated —
 * see FeedSlide.tsx.
 */
export default function VideoFeed() {
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get('v')

  const videos = useMemo(
    () => FEED_ORDER.map(vidById).filter((v): v is NonNullable<typeof v> => Boolean(v)),
    [],
  )
  const initialId = (requestedId && videos.some((v) => v.id === requestedId) ? requestedId : videos[0]?.id) ?? ''

  const [currentId, setCurrentId] = useState(initialId)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [followedBizIds, setFollowedBizIds] = useState<Set<string>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Scroll to the requested/initial slide once on mount (instant, not smooth
  // — this is establishing the starting position, not a user-triggered jump).
  useEffect(() => {
    slideRefs.current.get(initialId)?.scrollIntoView({ block: 'start' })
    // Intentionally run once on mount only — this establishes the starting
    // scroll position, it shouldn't re-fire if `initialId` were to change.
  }, [initialId])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const id = (entry.target as HTMLElement).dataset.vid
            if (id) setCurrentId(id)
          }
        }
      },
      { root, threshold: [0, 0.6, 1] },
    )
    for (const el of slideRefs.current.values()) observer.observe(el)
    return () => observer.disconnect()
  }, [videos])

  function toggleLike(id: string) {
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFollow(businessId: string) {
    setFollowedBizIds((prev) => {
      const next = new Set(prev)
      if (next.has(businessId)) next.delete(businessId)
      else next.add(businessId)
      return next
    })
  }

  function jumpTo(id: string) {
    slideRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-dvh bg-ink lg:flex lg:min-h-[calc(100dvh-64px)] lg:items-start lg:justify-center lg:gap-7 lg:px-10 lg:py-7">
      <div
        ref={containerRef}
        className="no-scrollbar h-dvh w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain lg:h-[calc(100dvh-8rem)] lg:max-h-[800px] lg:w-[400px] lg:flex-none lg:rounded-3xl lg:shadow-[0_30px_70px_-20px_rgba(0,0,0,0.6)]"
      >
        {videos.map((video, index) => (
          <FeedSlide
            key={video.id}
            ref={(el) => {
              if (el) slideRefs.current.set(video.id, el)
              else slideRefs.current.delete(video.id)
            }}
            video={video}
            index={index}
            total={videos.length}
            liked={likedIds.has(video.id)}
            following={Boolean(video.businessId) && followedBizIds.has(video.businessId ?? '')}
            inView={video.id === currentId}
            onToggleLike={() => toggleLike(video.id)}
            onToggleFollow={() => video.businessId && toggleFollow(video.businessId)}
          />
        ))}
      </div>
      <UpNextRail videos={videos} currentId={currentId} onSelect={jumpTo} />
    </div>
  )
}
