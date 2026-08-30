import { useEffect, useRef, useState } from 'react'

import Icon from '../icons/Icon'
import ModerationStatusBadge from './ModerationStatusBadge'
import CategoryChips from '../ui/CategoryChips'
import { useDeactivateVideo } from '../../hooks/useDashboard'
import { ApiError } from '../../lib/api'
import type { VideoDto } from '../../lib/api'
import { formatDuration, formatViews } from '../../lib/format'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { useToast } from '../../lib/toast'

interface VideoManageCardProps {
  video: VideoDto
}

/**
 * One card in the Business Dashboard's Videos grid — a card grid rather than
 * a data table like Products, since a video's thumbnail is the point (per
 * the approved design pass, docs/design/prototype-v1.html's "Videos" entry).
 * Same status pill, rejection-reason surfacing and two-click remove pattern
 * as ProductManageCard; Edit is a deliberate stub — see the button below.
 */
export default function VideoManageCard({ video }: VideoManageCardProps) {
  const { showToast } = useToast()
  const deactivateMutation = useDeactivateVideo()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const confirmTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(confirmTimerRef.current), [])

  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      window.clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = window.setTimeout(() => setConfirmingDelete(false), 4000)
      return
    }
    window.clearTimeout(confirmTimerRef.current)
    deactivateMutation.mutate(
      { videoId: video.id, businessId: video.business_id },
      {
        onSuccess: () => showToast(`${video.title} removed from your showroom`),
        onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not remove this video.'),
      },
    )
  }

  const grad = gradIndexForId(video.id)
  const duration = formatDuration(video.duration_seconds)

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
      <div className="relative aspect-video w-full flex-none overflow-hidden bg-panel">
        <span className="absolute inset-0" style={{ backgroundImage: gradientFor(grad) }}>
          <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
        </span>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-85 drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)]" aria-hidden="true">
            🎬
          </span>
        )}
        <span className="absolute top-2 right-2 z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/50 text-white shadow-[0_4px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm">
          <Icon name="play" size={13} />
        </span>
        {duration && (
          <span className="absolute right-1.5 bottom-1.5 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white backdrop-blur-sm">
            {duration}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 text-sm font-bold text-foreground">{video.title}</h4>
          <ModerationStatusBadge status={video.moderation_status} />
        </div>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">{formatViews(video.view_count)} views</p>

        {video.moderation_status === 'rejected' && video.moderation_note && (
          <p className="mt-1.5 text-xs leading-snug text-danger">{video.moderation_note}</p>
        )}

        <CategoryChips categories={video.categories} size="sm" className="mt-1.5" />

        {video.product && (
          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
            <Icon name="box" size={11} />
            {video.product.name}
          </span>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => showToast('Video editing is coming in a later release.')}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors duration-150 ease-brand hover:border-brand hover:text-brand dark:hover:text-ice"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={deactivateMutation.isPending}
            className={`ml-auto inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-150 ease-brand disabled:opacity-60 ${
              confirmingDelete
                ? 'border-danger bg-danger text-white'
                : 'border-border text-muted-foreground hover:border-danger hover:text-danger'
            }`}
          >
            <Icon name="close" size={11} />
            {deactivateMutation.isPending ? 'Removing…' : confirmingDelete ? 'Confirm remove?' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}
