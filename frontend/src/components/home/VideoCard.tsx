import { Link } from 'react-router-dom'

import Thumb from '../ui/Thumb'
import type { VideoDto } from '../../lib/api'
import { formatDuration, formatViews } from '../../lib/format'
import { gradIndexForId } from '../../lib/thumbTreatment'

interface VideoCardProps {
  video: VideoDto
}

/**
 * Real Home "Trending now" video card (GET /videos — see
 * TrendingVideos.tsx). Replaces the old fixture-`Video`-typed version;
 * Search's video tab keeps using the fixture data (VideoResultCard) until
 * the video catalog is searchable — see Search.tsx's module docstring.
 * `duration_seconds` is often null (the dev file backend doesn't extract it
 * — see formatDuration's docstring), so the duration badge is omitted
 * rather than showing a fake "0:00".
 */
export default function VideoCard({ video }: VideoCardProps) {
  return (
    <Link to={`/feed?v=${video.id}`} className="group block w-[168px] flex-none lg:w-full">
      <Thumb
        grad={gradIndexForId(video.id)}
        imageUrl={video.thumbnail_url ?? undefined}
        glyph={video.thumbnail_url ? undefined : '🎬'}
        duration={formatDuration(video.duration_seconds)}
        showPlayBadge
        className="h-[112px] w-[168px] lg:h-[150px] lg:w-full"
        overlay={
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/92 via-black/35 to-transparent px-2.5 pt-4 pb-2 text-white">
            <p className="line-clamp-2 text-[13px] leading-tight font-bold">{video.title}</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {video.business.name} · {formatViews(video.view_count)} views
            </p>
          </div>
        }
      />
    </Link>
  )
}
