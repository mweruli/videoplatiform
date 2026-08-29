import { Link } from 'react-router-dom'

import Thumb from '../ui/Thumb'
import { bizById } from '../../data/businesses'
import type { Video } from '../../data/types'
import { formatViews } from '../../lib/format'

interface VideoCardProps {
  video: Video
}

export default function VideoCard({ video }: VideoCardProps) {
  const business = video.businessId ? bizById(video.businessId) : undefined
  const by = business ? business.name : video.creator

  return (
    <Link to={`/feed?v=${video.id}`} className="group block w-[168px] flex-none lg:w-full">
      <Thumb
        grad={video.grad}
        glyph={video.icon}
        duration={video.duration}
        sponsored={video.sponsored}
        showPlayBadge
        className="h-[112px] w-[168px] lg:h-[150px] lg:w-full"
        overlay={
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/92 via-black/35 to-transparent px-2.5 pt-4 pb-2 text-white">
            <p className="line-clamp-2 text-[13px] leading-tight font-bold">{video.title}</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {by} · {formatViews(video.views)} views
            </p>
          </div>
        }
      />
    </Link>
  )
}
