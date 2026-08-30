import Thumb from '../ui/Thumb'
import type { VideoDto } from '../../lib/api'
import { formatDuration, formatViews } from '../../lib/format'
import { gradIndexForId } from '../../lib/thumbTreatment'

interface UpNextRailProps {
  videos: VideoDto[]
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
                grad={gradIndexForId(video.id)}
                glyph={video.thumbnail_url ? undefined : '🎬'}
                duration={formatDuration(video.duration_seconds)}
                className="h-16 w-24 flex-none"
                overlay={
                  video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                  ) : undefined
                }
              />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[0.78rem] leading-tight font-bold text-ice">{video.title}</p>
                <p className="mt-1 text-[0.68rem] text-ice/60">
                  {video.business.name} · {formatViews(video.view_count)} views
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
