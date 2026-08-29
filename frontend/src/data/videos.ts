import type { Video } from './types'

/**
 * Fixture video data — ported from the approved prototype
 * (docs/design/prototype-v1.html, VIDEOS).
 */
export const VIDEOS: Video[] = [
  {
    id: 'v1',
    businessId: 'aquatank',
    title: "Inside Our Rotomoulding Plant — How It's Made",
    category: 'Manufacturing',
    views: 82000,
    grad: 0,
    icon: '🏭',
    sponsored: false,
    duration: '12:04',
  },
  {
    id: 'v2',
    businessId: 'sunflow',
    title: 'Solar Irrigation Setup in 10 Minutes',
    category: 'Energy · Agriculture',
    views: 54000,
    grad: 1,
    icon: '☀️',
    sponsored: false,
    duration: '9:47',
  },
  {
    id: 'v3',
    businessId: null,
    creator: 'Fundi Josephat',
    title: 'DIY: Fixing a Leaking Water Tank Valve',
    category: 'DIY',
    views: 121000,
    grad: 5,
    icon: '🔧',
    sponsored: false,
    duration: '6:42',
  },
  {
    id: 'v4',
    businessId: 'nairobisteel',
    title: 'Steel Fabrication Floor Tour',
    category: 'Manufacturing',
    views: 19000,
    grad: 2,
    icon: '⚙️',
    sponsored: false,
    duration: '4:55',
  },
  {
    id: 'v5',
    businessId: 'aquatank',
    title: 'New 2026 Tank Range Launch',
    category: 'Manufacturing',
    views: 8000,
    grad: 0,
    icon: '🛢️',
    sponsored: true,
    duration: '1:58',
  },
  {
    id: 'v6',
    businessId: 'solaris',
    title: 'How Solar Hybrid Systems Work',
    category: 'Energy',
    views: 33000,
    grad: 4,
    icon: '🔋',
    sponsored: false,
    duration: '7:20',
  },
  {
    id: 'v7',
    businessId: 'greengrow',
    title: 'Testing Your Soil pH at Home',
    category: 'Agriculture · Education',
    views: 45000,
    grad: 3,
    icon: '🌱',
    sponsored: false,
    duration: '5:10',
  },
]

export const vidById = (id: string): Video | undefined => VIDEOS.find((v) => v.id === id)
