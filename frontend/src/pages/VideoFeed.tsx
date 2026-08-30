import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import FeedSlide from '../components/feed/FeedSlide'
import UpNextRail from '../components/feed/UpNextRail'
import { useRecordVideoView, useVideoFeed } from '../hooks/useCatalog'
import type { VideoDto } from '../lib/api'

/**
 * Video / Shorts feed — scroll-snap vertical column on mobile, centred
 * column + live "Up next" rail on desktop (>=1024px); the layout/motion here
 * is the same approved design as before, this is purely a data-rewiring
 * pass. Wired to the real backend (GET /videos — approved+active videos
 * only, same as every other public catalog endpoint) instead of
 * data/videos.ts fixtures.
 *
 * Only 3 real videos are seeded as of Sprint 3 — a short real feed is a
 * real case to design for honestly (loading/empty/error states below), not
 * something to pad out with leftover fixture data.
 */
export default function VideoFeed() {
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get('v')

  const videosQuery = useVideoFeed()

  if (videosQuery.isLoading) {
    return (
      <FeedStateShell>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white motion-reduce:animate-none" aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold text-ice/70">Loading the feed…</p>
      </FeedStateShell>
    )
  }

  if (videosQuery.isError) {
    return (
      <FeedStateShell>
        <span className="text-3xl" aria-hidden="true">⚠️</span>
        <h2 className="mt-3 font-display text-lg font-bold text-ice">Couldn&apos;t load the feed</h2>
        <p className="mt-1.5 max-w-[36ch] text-sm text-ice/65">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => videosQuery.refetch()}
          className="mt-4 rounded-full border-[1.5px] border-ice/60 px-4 py-2 text-sm font-bold text-ice transition-colors duration-150 ease-brand hover:bg-ice hover:text-ink"
        >
          Try again
        </button>
      </FeedStateShell>
    )
  }

  const videos = videosQuery.data?.items ?? []

  if (videos.length === 0) {
    return (
      <FeedStateShell>
        <span className="text-3xl" aria-hidden="true">🎬</span>
        <h2 className="mt-3 font-display text-lg font-bold text-ice">No videos yet</h2>
        <p className="mt-1.5 max-w-[36ch] text-sm text-ice/65">
          Businesses are still uploading — check back soon, or explore products and businesses in Search.
        </p>
      </FeedStateShell>
    )
  }

  return <VideoFeedPlayer videos={videos} requestedId={requestedId} />
}

function FeedStateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-center lg:min-h-[calc(100dvh-64px)]">
      {children}
    </div>
  )
}

interface VideoFeedPlayerProps {
  videos: VideoDto[]
  requestedId: string | null
}

/** Only mounted once real video data exists, so the "scroll to initial slide once on mount" effect below has real data to work with on its very first render — no separate "sync once data arrives" effect needed. */
function VideoFeedPlayer({ videos, requestedId }: VideoFeedPlayerProps) {
  const initialId = (requestedId && videos.some((v) => v.id === requestedId) ? requestedId : videos[0]?.id) ?? ''

  const [currentId, setCurrentId] = useState(initialId)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [followedBizIds, setFollowedBizIds] = useState<Set<string>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const recordView = useRecordVideoView()
  const viewedIdsRef = useRef<Set<string>>(new Set())

  // Scroll to the requested/initial slide once on mount (instant, not smooth
  // — this is establishing the starting position, not a user-triggered jump).
  useEffect(() => {
    slideRefs.current.get(initialId)?.scrollIntoView({ block: 'start' })
    // Intentionally run once on mount only — this establishes the starting
    // scroll position, it shouldn't re-fire if `initialId` were to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Real view counting (POST /videos/{id}/view), once per video per visit —
  // fires the first time each video becomes the centred slide.
  useEffect(() => {
    if (!currentId || viewedIdsRef.current.has(currentId)) return
    viewedIdsRef.current.add(currentId)
    recordView.mutate(currentId)
    // recordView is a stable mutate function from useMutation; omitting it
    // avoids re-firing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

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

  const currentIndex = Math.max(
    0,
    videos.findIndex((v) => v.id === currentId),
  )

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
            following={followedBizIds.has(video.business.id)}
            inView={video.id === currentId}
            shouldLoad={Math.abs(index - currentIndex) <= 1}
            onToggleLike={() => toggleLike(video.id)}
            onToggleFollow={() => toggleFollow(video.business.id)}
          />
        ))}
      </div>
      <UpNextRail videos={videos} currentId={currentId} onSelect={jumpTo} />
    </div>
  )
}
