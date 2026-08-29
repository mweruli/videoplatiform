import { Link } from 'react-router-dom'

import Thumb from '../ui/Thumb'
import { bizById } from '../../data/businesses'
import type { Video } from '../../data/types'
import { formatViews } from '../../lib/format'

interface VideoResultCardProps {
  video: Video
}

/**
 * There's no real video backend yet (see VideoFeed.tsx) — video results stay
 * on the same fixture data as Home's trending rail, matched against the
 * search query client-side. Real video search joins this once the video
 * pipeline and Meilisearch both land.
 */
export default function VideoResultCard({ video }: VideoResultCardProps) {
  const business = video.businessId ? bizById(video.businessId) : undefined
  const by = business ? business.name : video.creator

  return (
    <Link to={`/feed?v=${video.id}`} className="group flex gap-3.5 rounded-2xl border border-border bg-surface p-3 shadow-soft transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Thumb
        grad={video.grad}
        glyph={video.icon}
        duration={video.duration}
        sponsored={video.sponsored}
        showPlayBadge
        className="h-[76px] w-[76px] flex-none"
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[0.9rem] font-bold text-foreground">{video.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {by} · {video.category}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{formatViews(video.views)} views</p>
      </div>
    </Link>
  )
}
