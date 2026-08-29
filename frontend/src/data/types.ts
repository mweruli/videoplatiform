export interface Category {
  id: string
  label: string
  icon: string
}

export interface Business {
  id: string
  name: string
  categories: string[]
  location: string
  verified: boolean
  pending?: boolean
  rating: number
  ratingCount: number
  grad: number
  icon: string
  description: string
  productsCount: number
  videosCount: number
  phone: string
  hours: string
  tags: string[]
  featured: boolean
  sponsoredKeywords?: string[]
}

export interface ProductSpecs {
  [label: string]: string
}

export interface Product {
  id: string
  businessId: string
  name: string
  price: number
  grad: number
  icon: string
  specs: ProductSpecs
  tags: string[]
}

export interface Video {
  id: string
  businessId: string | null
  creator?: string
  title: string
  category: string
  views: number
  grad: number
  icon: string
  sponsored: boolean
  duration: string
}
