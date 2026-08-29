/**
 * Thin fetch-based API client. Every backend capability is reachable through
 * this module (or a future feature-specific module built on top of it) —
 * per the project's API-first rule, components should never talk to the
 * backend any other way.
 */

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Every versioned backend capability lives under this prefix (app.core.config.Settings.API_V1_PREFIX) — /health is the one deliberate exception. */
const V1 = '/api/v1'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with ${response.status}`, response.status)
  }

  return (await response.json()) as T
}

export interface DependencyStatus {
  status: 'ok' | 'error'
  detail?: string | null
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  environment: string
  database: DependencyStatus
  redis: DependencyStatus
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/health')
}

/**
 * Catalog types — mirror the backend's Pydantic response models 1:1
 * (app/schemas/{category,business,product}.py). Kept in this one file per
 * the module's own "every backend capability reachable through this module"
 * rule, rather than a parallel `apiTypes.ts`.
 */

export interface CategoryDto {
  id: number
  name: string
  slug: string
  is_active: boolean
}

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'
export type ModerationStatus = 'pending' | 'approved' | 'rejected'
export type AvailabilityStatus = 'in_stock' | 'made_to_order' | 'out_of_stock' | 'discontinued'

export interface BusinessSummaryDto {
  id: string
  name: string
  slug: string
  logo_url: string | null
  county: string | null
  city: string | null
  verification_status: VerificationStatus
}

export interface BusinessDto {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  cover_image_url: string | null
  cover_video_asset_id: string | null
  category: CategoryDto | null
  county: string | null
  city: string | null
  address_line: string | null
  phone: string | null
  email: string | null
  website_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  twitter_url: string | null
  tiktok_url: string | null
  verification_status: VerificationStatus
  verification_note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  product_count: number
}

export interface ProductSummaryDto {
  id: string
  name: string
  slug: string
  price_min: string | null
  price_max: string | null
  currency: string
  primary_image_url: string | null
}

export interface ProductDto {
  id: string
  business_id: string
  business: BusinessSummaryDto
  category: CategoryDto | null
  name: string
  slug: string
  description: string | null
  specs: Record<string, string>
  currency: string
  price_min: string | null
  price_max: string | null
  images: string[]
  primary_image_url: string | null
  warranty_terms: string | null
  availability_status: AvailabilityStatus
  availability_note: string | null
  county: string | null
  city: string | null
  moderation_status: ModerationStatus
  moderation_note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  related_products: ProductSummaryDto[]
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

function toQuery(params: object): string {
  const search = new URLSearchParams()
  const entries = Object.entries(params) as [string, string | number | undefined | null][]
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listCategories(): Promise<CategoryDto[]> {
  return apiFetch<CategoryDto[]>(`${V1}/categories`)
}

export interface ListBusinessesParams {
  category_id?: number
  county?: string
  city?: string
  q?: string
  page?: number
  page_size?: number
}

/** Public directory listing — verified, active businesses only (backend-enforced). */
export function listBusinesses(params: ListBusinessesParams = {}): Promise<Page<BusinessDto>> {
  return apiFetch<Page<BusinessDto>>(`${V1}/businesses${toQuery(params)}`)
}

export function getBusinessBySlug(slug: string): Promise<BusinessDto> {
  return apiFetch<BusinessDto>(`${V1}/businesses/slug/${encodeURIComponent(slug)}`)
}

export interface ListProductsParams {
  business_id?: string
  category_id?: number
  county?: string
  city?: string
  min_price?: number
  max_price?: number
  q?: string
  page?: number
  page_size?: number
}

/** Public browse — approved, active products from active businesses only. */
export function listProducts(params: ListProductsParams = {}): Promise<Page<ProductDto>> {
  return apiFetch<Page<ProductDto>>(`${V1}/products${toQuery(params)}`)
}

export function getProductBySlug(slug: string): Promise<ProductDto> {
  return apiFetch<ProductDto>(`${V1}/products/slug/${encodeURIComponent(slug)}`)
}
