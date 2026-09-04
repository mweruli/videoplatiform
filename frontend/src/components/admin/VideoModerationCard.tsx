import { useState } from 'react'
import { Link } from 'react-router-dom'

import Icon from '../icons/Icon'
import ModerationStatusBadge from '../dashboard/ModerationStatusBadge'
import CategoryChips from '../ui/CategoryChips'
import ToggleSwitch from '../ui/ToggleSwitch'
import RejectModal from './RejectModal'
import { useApproveVideo, useRejectVideo } from '../../hooks/useAdmin'
import { ApiError } from '../../lib/api'
import type { VideoDto } from '../../lib/api'
import { formatDate, formatDuration, formatRelativeTime, formatViews } from '../../lib/format'
import { gradIndexForId, gradientFor, GRAIN_TEXTURE } from '../../lib/thumbTreatment'
import { useToast } from '../../lib/toast'

interface VideoModerationCardProps {
  video: VideoDto
}

/**
 * One video in the moderation queue — mirrors ProductModerationCard's
 * pattern exactly (approve is one click; reject opens RejectModal, required
 * reason), with one deliberate difference per the approved design pass: a
 * real video-still thumbnail rather than the small square icon business/
 * product rows use — a video's content IS its thumbnail, so a moderator
 * needs more than a name to judge it.
 *
 * A moderator can't fairly judge a video from a static poster frame and one
 * clipped line of copy, so the full description and an actual playable
 * `<video>` (same tag/attributes as FeedSlide's real player, not a new one)
 * sit behind a "Show full details" disclosure — same expand/collapse
 * pattern as ProductModerationCard/UserManagement — plus a link out to
 * where the video is actually watchable publicly (the Shorts feed, deep
 * linked via `/feed?v=<id>` — VideoFeed.tsx reads that query param).
 */
export default function VideoModerationCard({ video }: VideoModerationCardProps) {
  const { showToast } = useToast()
  const approveMutation = useApproveVideo()
  const rejectMutation = useRejectVideo()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const pending = video.moderation_status === 'pending'
  const approved = video.moderation_status === 'approved'
  const rejected = video.moderation_status === 'rejected'
  const grad = gradIndexForId(video.id)
  const duration = formatDuration(video.duration_seconds)

  function handleApprove() {
    setError(null)
    approveMutation.mutate(video.id, {
      onSuccess: () =>
        showToast(rejected ? `${video.title} approved — reinstated and live again` : `${video.title} approved — now live`),
      onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not approve this video.'),
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="relative h-20 w-32 flex-none overflow-hidden rounded-xl bg-panel">
          <span className="absolute inset-0" style={{ backgroundImage: gradientFor(grad) }}>
            <span className="absolute inset-0 opacity-60 mix-blend-overlay" style={{ backgroundImage: GRAIN_TEXTURE }} />
          </span>
          {video.thumbnail_url ? (
            <img src={video.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-85" aria-hidden="true">
              🎬
            </span>
          )}
          {duration && (
            <span className="absolute right-1 bottom-1 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-extrabold tabular-nums text-white">
              {duration}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-sm font-bold text-foreground">{video.title}</h3>
            <div className="flex flex-none items-center gap-2">
              <ModerationStatusBadge status={video.moderation_status} />
              {(approved || rejected) && (
                <ToggleSwitch
                  on={approved}
                  onToggle={approved ? () => setRejecting(true) : handleApprove}
                  label={approved ? `Pull down ${video.title}` : `Restore ${video.title}`}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                />
              )}
            </div>
          </div>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{video.business.name}</p>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{formatViews(video.view_count)} views</p>
        </div>
      </div>

      {video.description && !expanded && (
        <p className="mt-3 line-clamp-1 text-sm leading-relaxed text-muted-foreground">{video.description}</p>
      )}

      <CategoryChips categories={video.categories} size="sm" className="mt-3" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
        <span title={formatDate(video.created_at)}>Submitted {formatRelativeTime(video.created_at)}</span>
        {video.product && (
          <span className="inline-flex items-center gap-1">
            <Icon name="box" size={11} />
            {video.product.name}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label="Full video details"
        className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-teal transition-colors duration-150 ease-brand hover:text-teal/80"
      >
        <Icon name="chevronRight" size={12} strokeWidth={3} className={`transition-transform duration-150 ease-brand ${expanded ? 'rotate-90' : ''}`} />
        {expanded ? 'Hide full details' : 'Show full details'}
      </button>

      {expanded && (
        <div className="mt-3 rounded-xl border border-border bg-panel/50 p-3.5">
          <div className="aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-lg bg-black">
            <video
              src={video.video_url}
              poster={video.thumbnail_url ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            >
              Your browser doesn&apos;t support embedded video playback.
            </video>
          </div>

          {video.description && (
            <p className="mt-3.5 text-sm leading-relaxed whitespace-pre-line text-foreground">{video.description}</p>
          )}

          <Link
            to={`/feed?v=${video.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline dark:text-ice"
          >
            View in public feed
            <Icon name="externalLink" size={12} />
          </Link>
        </div>
      )}

      {video.moderation_status === 'rejected' && video.moderation_note && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs leading-snug text-danger">
          <span className="font-bold">Rejection reason: </span>
          {video.moderation_note}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}

      {pending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-bold text-white transition-opacity duration-150 ease-brand hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="check" size={13} strokeWidth={3} />
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={rejectMutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-danger px-4 py-2 text-sm font-bold text-danger transition-colors duration-150 ease-brand hover:bg-danger hover:text-white disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name="close" size={13} strokeWidth={3} />
            Reject
          </button>
        </div>
      )}

      <RejectModal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={approved ? 'Pull down video' : 'Reject video'}
        itemName={video.title}
        description={
          approved ? (
            <>
              <span className="font-bold text-foreground">{video.title}</span> is currently live in the public feed. Pulling it down
              removes it immediately and shows the owner why.
            </>
          ) : undefined
        }
        confirmLabel={approved ? 'Confirm pull-down' : undefined}
        pendingLabel={approved ? 'Pulling down…' : undefined}
        onSubmit={(reason) =>
          rejectMutation
            .mutateAsync({ videoId: video.id, reason })
            .then(() => showToast(approved ? `${video.title} pulled down` : `${video.title} rejected`))
        }
      />
    </div>
  )
}
