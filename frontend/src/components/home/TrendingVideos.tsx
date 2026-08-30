import SectionHeading from '../ui/SectionHeading'
import Skeleton from '../ui/Skeleton'
import VideoCard from './VideoCard'
import { useVideoFeed } from '../../hooks/useCatalog'

const TRENDING_COUNT = 4

/**
 * Real backend now (GET /videos, approved+active videos from active
 * businesses only — backend-enforced, no `include_unapproved`). There's no
 * trending/ranking signal on Video yet (no likes/engagement field — see
 * FeedSlide.tsx's docstring), and the endpoint only supports ordering by
 * `created_at DESC` (backend/app/api/v1/endpoints/videos.py) — so this takes
 * the first TRENDING_COUNT rows as returned, i.e. "most recently uploaded",
 * an honest reading of "trending now" rather than a fabricated algorithm.
 * Revisit once a real signal exists.
 *
 * Only a handful of real videos are seeded as of this sprint — a short row
 * (or none) is a real case to design for, not a bug.
 */
export default function TrendingVideos() {
  const videosQuery = useVideoFeed()
  const videos = (videosQuery.data?.items ?? []).slice(0, TRENDING_COUNT)

  return (
    <section className="bg-background py-6 lg:py-10">
      <div className="mb-4 px-5 lg:px-14">
        <SectionHeading eyebrow="Trending now" title="Videos everyone's watching" />
      </div>

      {videosQuery.isLoading ? (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1.5 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-14">
          {Array.from({ length: TRENDING_COUNT }, (_, i) => (
            <Skeleton key={i} className="h-[112px] w-[168px] flex-none lg:h-[150px] lg:w-full" />
          ))}
        </div>
      ) : videosQuery.isError ? (
        <div className="px-5 lg:px-14">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load trending videos right now.</p>
          <button
            type="button"
            onClick={() => videosQuery.refetch()}
            className="mt-3 rounded-full border-[1.5px] border-foreground px-4 py-2 text-sm font-bold text-foreground transition-colors duration-150 ease-brand hover:bg-foreground hover:text-background"
          >
            Try again
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="px-5 lg:px-14">
          <p className="text-sm text-muted-foreground">
            No videos yet — businesses are still uploading. Check back soon.
          </p>
        </div>
      ) : (
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1.5 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-14">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </section>
  )
}
