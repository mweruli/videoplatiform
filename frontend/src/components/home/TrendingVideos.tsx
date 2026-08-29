import SectionHeading from '../ui/SectionHeading'
import VideoCard from './VideoCard'
import { vidById } from '../../data/videos'
import { TRENDING_ORDER } from '../../data/home'

export default function TrendingVideos() {
  const videos = TRENDING_ORDER.map(vidById).filter((v): v is NonNullable<typeof v> => Boolean(v))

  return (
    <section className="bg-background py-6 lg:py-10">
      <div className="mb-4 px-5 lg:px-14">
        <SectionHeading eyebrow="Trending now" title="Videos everyone's watching" />
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pb-1.5 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-14">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </section>
  )
}
