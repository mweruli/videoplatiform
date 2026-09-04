import type { UseQueryResult } from '@tanstack/react-query'

import Icon from '../icons/Icon'
import VideoManageCard from './VideoManageCard'
import EmptyState from '../ui/EmptyState'
import Skeleton from '../ui/Skeleton'
import type { Page, VideoDto } from '../../lib/api'

interface VideosSectionProps {
  videosQuery: UseQueryResult<Page<VideoDto>>
  onUpload: () => void
  onEditVideo: (video: VideoDto) => void
}

/** Business Dashboard's Videos section — a card grid (not a table like Products), since a video's thumbnail is the point. See VideoManageCard for the per-video treatment. */
export default function VideosSection({ videosQuery, onUpload, onEditVideo }: VideosSectionProps) {
  const videos = videosQuery.data?.items ?? []

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-foreground">Videos</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Includes videos still pending review — shoppers won&apos;t see those until they&apos;re approved.
          </p>
        </div>
        <button
          type="button"
          onClick={onUpload}
          className="inline-flex flex-none items-center gap-1.5 rounded-full bg-gradient-to-br from-[#FFCE5C] via-amber to-[#F0A80F] px-4 py-2.5 text-sm font-bold text-amber-ink shadow-glow-amber transition-shadow duration-150 ease-brand hover:shadow-glow-amber-lg"
        >
          <Icon name="upload" size={13} /> Upload video
        </button>
      </div>

      <div className="mt-4">
        {videosQuery.isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="hidden h-56 w-full sm:block" />
          </div>
        )}

        {videosQuery.isError && (
          <EmptyState tone="error" title="Couldn't load your videos" subtitle="Check your connection and try again." />
        )}

        {!videosQuery.isLoading && !videosQuery.isError && videos.length === 0 && (
          <EmptyState
            icon="🎬"
            title="No videos yet"
            subtitle="Upload your first video — it'll go straight into moderator review before it's publicly visible."
          />
        )}

        {videos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {videos.map((video) => (
              <VideoManageCard key={video.id} video={video} onEdit={() => onEditVideo(video)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
