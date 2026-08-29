import Thumb from '../ui/Thumb'
import { bizById } from '../../data/businesses'
import type { Video } from '../../data/types'
import { formatViews } from '../../lib/format'

interface UpNextRailProps {
  videos: Video[]
  currentId: string
  onSelect: (id: string) => void
}

/**
 * Desktop-only "Up next" rail beside the centred Shorts column (>=1024px) —
 * highlights whichever video is currently in view and jumps the feed to it
 * on click, reusing the same feed order as the mobile scroll-snap column.
 */
export default function UpNextRail({ videos, currentId, onSelect }: UpNextRailProps) {
  return (
    <div className="hidden max-h-[calc(100dvh-8rem)] w-80 flex-none flex-col overflow-y-auto lg:flex">
      <div className="mb-3 text-[11px] font-extrabold tracking-[0.1em] text-ice/55 uppercase">Up next in Shorts</div>
      <div className="flex flex-col gap-1.5">
        {videos.map((video) => {
          const business = video.businessId ? bizById(video.businessId) : undefined
          const active = video.id === currentId
          return (
            <button
              key={video.id}
              type="button"
              onClick={() => onSelect(video.id)}
              aria-current={active}
              className={`flex gap-2.5 rounded-xl p-2 text-left transition-colors duration-150 ease-brand hover:bg-white/[0.06] ${
                active ? 'bg-amber/10 shadow-[inset_0_0_0_1px_rgba(250,189,46,0.35)]' : ''
              }`}
            >
              <Thumb
                grad={video.grad}
                glyph={video.icon}
                duration={video.duration}
                sponsored={video.sponsored}
                className="h-16 w-24 flex-none"
              />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[0.78rem] leading-tight font-bold text-ice">{video.title}</p>
                <p className="mt-1 text-[0.68rem] text-ice/60">
                  {business ? business.name : video.creator} · {formatViews(video.views)} views
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
