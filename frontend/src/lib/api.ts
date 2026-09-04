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
  /** Seconds to wait before retrying — populated from a 429's `Retry-After` header (OTP rate limiting; see app/services/otp_service.py). */
  retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * Pulls FastAPI's real error copy out of the response body instead of a
 * generic "request failed" string — every auth screen surfaces the
 * backend's actual `detail` (see app/api/v1/endpoints/auth.py), not a
 * paraphrase. Falls back to a generic message only if the body isn't the
 * shape we expect (e.g. a proxy error page, not JSON).
 */
async function extractErrorDetail(response: Response, path: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        return detail
          .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
          .join(' ')
      }
    }
  } catch {
    // Non-JSON body — fall through to the generic message below.
  }
  return `Request to ${path} failed with ${response.status}`
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // `...init` must spread BEFORE `headers`, not after: `init` itself carries
  // a `headers` key on every authenticated call (see authHeaders() below), so
  // spreading `...init` last would silently clobber the merged headers object
  // with init.headers alone — dropping the default Content-Type entirely and
  // sending JSON bodies with no Content-Type header. That's exactly what
  // happened here previously: it went unnoticed because no caller combined a
  // body *and* custom headers in the same request until the Business
  // Dashboard's authenticated POST/PATCH endpoints (a bearer token header
  // alongside a JSON body) started doing both.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const detail = await extractErrorDetail(response, path)
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined
    throw new ApiError(detail, response.status, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Attaches a bearer token to an apiFetch call — see app/api/deps.py's HTTPBearer contract. */
function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` }
}

/**
 * Multipart upload — deliberately not routed through apiFetch, which always
 * forces a `Content-Type: application/json` header; a multipart boundary has
 * to be set by the browser itself from the FormData body. Used by the
 * business logo/cover-image and product image upload endpoints, the only
 * endpoints in the API that take file bodies.
 */
async function apiUpload<T>(path: string, token: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  })
  if (!response.ok) {
    const detail = await extractErrorDetail(response, path)
    throw new ApiError(detail, response.status)
  }
  if (response.status === 204) return undefined as T
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

/**
 * The lightweight shape embedded in `BusinessDto.active_campaign`/
 * `ProductDto.active_campaign` — mirrors app/schemas/campaign_targeting.py's
 * `CampaignTargetingRead` 1:1. Present only when there currently exists an
 * ACTIVE Campaign row targeting that exact business/product — see
 * lib/searchCatalog.ts's `rank()` for how this feeds the Sponsored tie-break
 * and docs/decisions.md's "Phase 1b design pass: self-serve advertiser
 * campaign manager" entry ("What 'matches the category/location the user is
 * browsing' means, precisely") for the exact context-matching semantics.
 */
export interface CampaignTargetingDto {
  campaign_id: string
  category_id: number | null
  county: string | null
}

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
  /** Platform-controlled manual placement (see docs/decisions.md's "Phase 1a: manual featured placement" entry) — never settable by the owner, only by admin/moderator via POST /admin/businesses/{id}/feature|unfeature. */
  is_featured: boolean
  /** Set only while a time-limited self-serve featured purchase (see FeaturedPurchaseDto below) is active; null for an admin-permanent feature or when not featured at all. */
  featured_until: string | null
  /** Present only while an ACTIVE self-serve ad campaign targets this business itself (not one of its products) — see CampaignTargetingDto's docstring. Feeds the same Sponsored tie-break/badge as `is_featured`, never a separate visual treatment. */
  active_campaign: CampaignTargetingDto | null
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
  /** Zero or more — see docs/decisions.md's "Product/Video: single category_id -> many-to-many categories" entry. Always an array, empty if none assigned. */
  categories: CategoryDto[]
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
  /** Platform-controlled manual placement (see docs/decisions.md's "Phase 1a: manual featured placement" entry) — never settable by the owner, only by admin/moderator via POST /admin/products/{id}/feature|unfeature. */
  is_featured: boolean
  /** Set only while a time-limited self-serve featured purchase (see FeaturedPurchaseDto below) is active; null for an admin-permanent feature or when not featured at all. */
  featured_until: string | null
  /** Present only while an ACTIVE self-serve ad campaign targets this exact product — see CampaignTargetingDto's docstring. Feeds the same Sponsored tie-break/badge as `is_featured`, never a separate visual treatment. */
  active_campaign: CampaignTargetingDto | null
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
  /** `true` scopes to exactly the platform-curated featured set (Home's "Featured Businesses" rail); `false` explicitly excludes them. Omit for no filtering either way. */
  is_featured?: boolean
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

/**
 * "Search appearances" batch reporting — mirrors app/schemas/common.py's
 * `ImpressionBatchRequest`/`ImpressionBatchResult` 1:1 (see docs/decisions.md's
 * "core analytics" entry for the full design). Public, unauthenticated,
 * fire-and-forget: the caller reports the ids it actually rendered in a
 * search/browse result set, capped at 1-100 per call; unknown/non-public ids
 * are silently skipped server-side. `POST /campaigns/impressions`/`/clicks`
 * (below) share this exact shape and are batched alongside these two at the
 * same call site — see Search.tsx's impression-reporting effect.
 */
export interface ImpressionBatchResult {
  updated: number
}

export function recordBusinessImpressions(ids: string[]): Promise<ImpressionBatchResult> {
  return apiFetch<ImpressionBatchResult>(`${V1}/businesses/impressions`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export function recordProductImpressions(ids: string[]): Promise<ImpressionBatchResult> {
  return apiFetch<ImpressionBatchResult>(`${V1}/products/impressions`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export interface ListProductsParams {
  business_id?: string
  category_id?: number
  county?: string
  city?: string
  min_price?: number
  max_price?: number
  q?: string
  /** Only takes effect when `token` belongs to the owner of `business_id` (or a platform admin) — see app/api/v1/endpoints/products.py. */
  include_unapproved?: boolean
  page?: number
  page_size?: number
}

/**
 * Public browse — approved, active products from active businesses only,
 * unless `token` is the owning business's owner (or a platform admin) and
 * `include_unapproved` is set, in which case the dashboard reuses this same
 * endpoint to see its own pending/rejected listings too.
 */
export function listProducts(params: ListProductsParams = {}, token?: string): Promise<Page<ProductDto>> {
  return apiFetch<Page<ProductDto>>(`${V1}/products${toQuery(params)}`, token ? { headers: authHeaders(token) } : undefined)
}

export function getProductBySlug(slug: string): Promise<ProductDto> {
  return apiFetch<ProductDto>(`${V1}/products/slug/${encodeURIComponent(slug)}`)
}

/**
 * Video — mirrors app/schemas/video.py's VideoRead 1:1. Videos are
 * business-uploaded (no creator-upload flow yet — see
 * app/models/video.py's module docstring), so `business` is always present,
 * unlike the fixture `Video` type's optional `creator` field it replaces.
 */

export interface VideoDto {
  id: string
  business_id: string
  business: BusinessSummaryDto
  /** Zero or more — see docs/decisions.md's "Product/Video: single category_id -> many-to-many categories" entry. Always an array, empty if none assigned. */
  categories: CategoryDto[]
  product_id: string | null
  product: ProductSummaryDto | null
  title: string
  description: string | null
  video_url: string
  thumbnail_url: string | null
  duration_seconds: number | null
  view_count: number
  moderation_status: ModerationStatus
  moderation_note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ListVideosParams {
  business_id?: string
  category_id?: number
  product_id?: string
  /** Only takes effect when `token` belongs to the owner of `business_id` (or a platform admin) — see app/api/v1/endpoints/videos.py. */
  include_unapproved?: boolean
  page?: number
  page_size?: number
}

/** Public browse — approved, active videos from active businesses only, unless `token` is the owning business's owner and `include_unapproved` is set. */
export function listVideos(params: ListVideosParams = {}, token?: string): Promise<Page<VideoDto>> {
  return apiFetch<Page<VideoDto>>(`${V1}/videos${toQuery(params)}`, token ? { headers: authHeaders(token) } : undefined)
}

export function getVideo(videoId: string): Promise<VideoDto> {
  return apiFetch<VideoDto>(`${V1}/videos/${videoId}`)
}

export interface VideoViewResult {
  view_count: number
}

/** Side-effect POST, not incrementing on GET — see app/api/v1/endpoints/videos.py's record_video_view docstring. Only succeeds for currently-approved+active videos. */
export function recordVideoView(videoId: string): Promise<VideoViewResult> {
  return apiFetch<VideoViewResult>(`${V1}/videos/${videoId}/view`, { method: 'POST' })
}

export interface VideoUploadPayload {
  title: string
  description?: string | null
  /** Zero or more category ids — repeated multipart form field, see uploadVideo() below. */
  category_ids?: number[]
  product_id?: string | null
  file: File
}

/** Multipart upload (title/description/category/product as form fields, the file as a part) — mirrors the FastAPI `Form(...)`/`File(...)` signature of POST /businesses/{id}/videos exactly, so it's not routed through apiFetch (see apiUpload's docstring). `category_ids` is a repeated form field (one `category_ids` part per id), which is how FastAPI's `list[int] = Form(...)` parses a multipart body — there's no JSON-array-as-single-field option here since the endpoint is multipart. */
export function uploadVideo(token: string, businessId: string, payload: VideoUploadPayload): Promise<VideoDto> {
  const formData = new FormData()
  formData.append('title', payload.title)
  if (payload.description) formData.append('description', payload.description)
  for (const categoryId of payload.category_ids ?? []) formData.append('category_ids', String(categoryId))
  if (payload.product_id) formData.append('product_id', payload.product_id)
  formData.append('file', payload.file)
  return apiUpload<VideoDto>(`${V1}/businesses/${businessId}/videos`, token, formData)
}

/** Mirrors app/schemas/video.py's VideoUpdate 1:1 — all fields optional (PATCH semantics). Re-uploading the file isn't supported here (upload creates a new Video); use uploadVideo for a new file. */
export interface VideoUpdatePayload {
  title?: string
  description?: string | null
  category_ids?: number[]
  product_id?: string | null
}

/** Editing an already-approved video resets it to moderation_status='pending' server-side, same re-review behaviour as updateProduct. */
export function updateVideo(token: string, videoId: string, payload: VideoUpdatePayload): Promise<VideoDto> {
  return apiFetch<VideoDto>(`${V1}/videos/${videoId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** Soft delete (deactivates, doesn't hard-delete) — mirrors deactivateProduct. */
export function deactivateVideo(token: string, videoId: string): Promise<void> {
  return apiFetch<void>(`${V1}/videos/${videoId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

/**
 * Auth — mirrors app/schemas/auth.py 1:1. See app/api/v1/endpoints/auth.py
 * for the exact per-endpoint status codes/error semantics this UI relies on.
 */

/** The 7 roles from docs/PROJECT_BRIEF.md. Only SelfRegisterableRole may be chosen at registration — the other two are staff-assigned. */
export type UserRole =
  | 'platform_admin'
  | 'content_moderator'
  | 'business_admin'
  | 'advertiser'
  | 'content_creator'
  | 'publisher'
  | 'general_user'

export type SelfRegisterableRole = Exclude<UserRole, 'platform_admin' | 'content_moderator'>

export type OtpPurpose = 'registration' | 'login' | 'password_reset'
export type OtpChannel = 'email' | 'phone'

export interface UserRead {
  id: string
  phone: string | null
  email: string | null
  full_name: string | null
  role: UserRole
  is_active: boolean
  is_verified: boolean
}

export interface OtpDebugInfo {
  code: string
  destination: string
  expires_in_seconds: number
}

export interface Identity {
  email?: string | null
  phone?: string | null
}

export interface RegisterPayload extends Identity {
  password: string
  full_name?: string | null
  role: SelfRegisterableRole
}

export interface RegisterResponse {
  user: UserRead
  message: string
  otp: OtpDebugInfo | null
}

export interface OtpRequestPayload extends Identity {
  purpose: OtpPurpose
}

export interface OtpRequestResponse {
  message: string
  otp: OtpDebugInfo | null
}

export interface OtpVerifyPayload extends Identity {
  code: string
  purpose: OtpPurpose
}

export interface OtpVerifyResponse {
  message: string
  user: UserRead
}

export interface LoginPayload extends Identity {
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserRead
}

export interface ForgotPasswordPayload extends Identity {}

export interface ForgotPasswordResponse {
  message: string
  otp: OtpDebugInfo | null
}

export interface ResetPasswordPayload extends Identity {
  code: string
  new_password: string
}

export function registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>(`${V1}/auth/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse> {
  return apiFetch<OtpRequestResponse>(`${V1}/auth/otp/request`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function verifyOtp(payload: OtpVerifyPayload): Promise<OtpVerifyResponse> {
  return apiFetch<OtpVerifyResponse>(`${V1}/auth/otp/verify`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginUser(payload: LoginPayload): Promise<TokenResponse> {
  return apiFetch<TokenResponse>(`${V1}/auth/login`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function forgotPassword(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
  return apiFetch<ForgotPasswordResponse>(`${V1}/auth/password/forgot`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function resetPassword(payload: ResetPasswordPayload): Promise<TokenResponse> {
  return apiFetch<TokenResponse>(`${V1}/auth/password/reset`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getMe(token: string): Promise<UserRead> {
  return apiFetch<UserRead>(`${V1}/auth/me`, { headers: authHeaders(token) })
}

/**
 * Business Dashboard — mirrors app/schemas/business.py's BusinessCreate/
 * BusinessUpdate 1:1. Any authenticated user may own a business (there is no
 * role gate on the backend beyond "is the owner, or a platform admin" —
 * see businesses.py's `_can_manage`), so these aren't restricted to
 * role === 'business_admin' on the client either.
 */

export interface BusinessWritePayload {
  name: string
  description?: string | null
  category_id?: number | null
  county?: string | null
  city?: string | null
  address_line?: string | null
  phone?: string | null
  email?: string | null
  website_url?: string | null
  facebook_url?: string | null
  instagram_url?: string | null
  twitter_url?: string | null
  tiktok_url?: string | null
}

export type BusinessUpdatePayload = Partial<BusinessWritePayload>

export function getMyBusinesses(token: string): Promise<BusinessDto[]> {
  return apiFetch<BusinessDto[]>(`${V1}/businesses/mine`, { headers: authHeaders(token) })
}

export function createBusiness(token: string, payload: BusinessWritePayload): Promise<BusinessDto> {
  return apiFetch<BusinessDto>(`${V1}/businesses`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export function updateBusiness(token: string, businessId: string, payload: BusinessUpdatePayload): Promise<BusinessDto> {
  return apiFetch<BusinessDto>(`${V1}/businesses/${businessId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** unverified/rejected -> pending. 409s (surfaced via ApiError) from any other status — see app/api/v1/endpoints/businesses.py. */
export function submitBusinessForVerification(token: string, businessId: string): Promise<BusinessDto> {
  return apiFetch<BusinessDto>(`${V1}/businesses/${businessId}/submit-for-verification`, {
    method: 'POST',
    headers: authHeaders(token),
  })
}

export function uploadBusinessLogo(token: string, businessId: string, file: File): Promise<BusinessDto> {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BusinessDto>(`${V1}/businesses/${businessId}/logo`, token, formData)
}

export function uploadBusinessCoverImage(token: string, businessId: string, file: File): Promise<BusinessDto> {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<BusinessDto>(`${V1}/businesses/${businessId}/cover-image`, token, formData)
}

/** Mirrors app/schemas/product.py's ProductCreate/ProductUpdate 1:1. */
export interface ProductWritePayload {
  name: string
  description?: string | null
  /** Zero or more, max 10, deduped, order-preserving — omitted/empty means zero categories, not "inherit the business's." */
  category_ids?: number[]
  specs?: Record<string, string>
  currency?: string
  price_min?: number | null
  price_max?: number | null
  warranty_terms?: string | null
  availability_status?: AvailabilityStatus
  availability_note?: string | null
  county?: string | null
  city?: string | null
  related_product_ids?: string[]
}

export type ProductUpdatePayload = Partial<ProductWritePayload>

export function createProduct(token: string, businessId: string, payload: ProductWritePayload): Promise<ProductDto> {
  return apiFetch<ProductDto>(`${V1}/businesses/${businessId}/products`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** Editing an already-approved product resets it to moderation_status='pending' server-side — see docs/decisions.md. */
export function updateProduct(token: string, productId: string, payload: ProductUpdatePayload): Promise<ProductDto> {
  return apiFetch<ProductDto>(`${V1}/products/${productId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** Soft delete (deactivates, doesn't hard-delete) — see app/api/v1/endpoints/products.py's deactivate_product docstring. */
export function deactivateProduct(token: string, productId: string): Promise<void> {
  return apiFetch<void>(`${V1}/products/${productId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
}

export function uploadProductImages(token: string, productId: string, files: File[]): Promise<ProductDto> {
  const formData = new FormData()
  for (const file of files) formData.append('files', file)
  return apiUpload<ProductDto>(`${V1}/products/${productId}/images`, token, formData)
}

/**
 * Admin moderation queue — mirrors app/api/v1/endpoints/admin.py 1:1. Every
 * route requires `require_moderator` (platform_admin or content_moderator)
 * server-side; the client-side role check in pages/Admin.tsx exists purely
 * for UX (a clean "no access" state instead of a raw 403), the real gate is
 * the backend's.
 */

export interface AdminListBusinessesParams {
  status?: VerificationStatus
  category_id?: number
  q?: string
  page?: number
  page_size?: number
}

export function adminListBusinesses(token: string, params: AdminListBusinessesParams = {}): Promise<Page<BusinessDto>> {
  return apiFetch<Page<BusinessDto>>(`${V1}/admin/businesses${toQuery(params)}`, { headers: authHeaders(token) })
}

export interface ModerationActionPayload {
  note?: string | null
}

export interface ModerationRejectPayload {
  reason: string
}

export function approveBusinessAdmin(token: string, businessId: string, payload: ModerationActionPayload = {}): Promise<BusinessDto> {
  return apiFetch<BusinessDto>(`${V1}/admin/businesses/${businessId}/approve`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export function rejectBusinessAdmin(token: string, businessId: string, payload: ModerationRejectPayload): Promise<BusinessDto> {
  return apiFetch<BusinessDto>(`${V1}/admin/businesses/${businessId}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface AdminListProductsParams {
  status?: ModerationStatus
  business_id?: string
  q?: string
  page?: number
  page_size?: number
}

export function adminListProducts(token: string, params: AdminListProductsParams = {}): Promise<Page<ProductDto>> {
  return apiFetch<Page<ProductDto>>(`${V1}/admin/products${toQuery(params)}`, { headers: authHeaders(token) })
}

export function approveProductAdmin(token: string, productId: string, payload: ModerationActionPayload = {}): Promise<ProductDto> {
  return apiFetch<ProductDto>(`${V1}/admin/products/${productId}/approve`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export function rejectProductAdmin(token: string, productId: string, payload: ModerationRejectPayload): Promise<ProductDto> {
  return apiFetch<ProductDto>(`${V1}/admin/products/${productId}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface AdminListVideosParams {
  status?: ModerationStatus
  business_id?: string
  q?: string
  page?: number
  page_size?: number
}

export function adminListVideos(token: string, params: AdminListVideosParams = {}): Promise<Page<VideoDto>> {
  return apiFetch<Page<VideoDto>>(`${V1}/admin/videos${toQuery(params)}`, { headers: authHeaders(token) })
}

export function approveVideoAdmin(token: string, videoId: string, payload: ModerationActionPayload = {}): Promise<VideoDto> {
  return apiFetch<VideoDto>(`${V1}/admin/videos/${videoId}/approve`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export function rejectVideoAdmin(token: string, videoId: string, payload: ModerationRejectPayload): Promise<VideoDto> {
  return apiFetch<VideoDto>(`${V1}/admin/videos/${videoId}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/**
 * Admin Campaign Moderation (`GET /admin/campaigns`, approve/reject) — mirrors
 * app/api/v1/endpoints/admin.py's campaign routes 1:1. Unlike Business/Product/
 * Video's 3-value status, `CampaignStatus` has 7 reachable values (see
 * lib/api.ts's CampaignStatus type) — `status` here still only takes one at a
 * time (the backend has no "OR of statuses" filter), so the admin screen's
 * broader tab groupings (e.g. "Live" = approved+active+paused+exhausted) are
 * assembled client-side from multiple calls, same pattern as
 * useAdminBusinessCounts' per-status Promise.all.
 */
export interface AdminListCampaignsParams {
  status?: CampaignStatus
  business_id?: string
  q?: string
  page?: number
  page_size?: number
}

export function adminListCampaigns(token: string, params: AdminListCampaignsParams = {}): Promise<Page<CampaignDto>> {
  return apiFetch<Page<CampaignDto>>(`${V1}/admin/campaigns${toQuery(params)}`, { headers: authHeaders(token) })
}

/** APPROVABLE_STATUSES only (pending_review or rejected) — 409 otherwise. Uses `resolve_status_after_approval()` server-side, so a pre-funded campaign lands straight on 'active' rather than 'approved'. */
export function approveCampaignAdmin(token: string, campaignId: string, payload: ModerationActionPayload = {}): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/admin/campaigns/${campaignId}/approve`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** REJECTABLE_STATUSES (everything except completed) — a moderator can pull down a running, spending campaign immediately. */
export function rejectCampaignAdmin(token: string, campaignId: string, payload: ModerationRejectPayload): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/admin/campaigns/${campaignId}/reject`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/**
 * Admin Category Management (`GET/POST /admin/categories`,
 * `PATCH /admin/categories/{id}`) — mirrors app/api/v1/endpoints/admin.py's
 * category routes. Deactivate-only (no delete route exists at all — see
 * docs/decisions.md), so `CategoryUpdatePayload.is_active` is the only way
 * to hide a category from the public `GET /categories` picker.
 */

export interface AdminCategoryDto extends CategoryDto {
  /** Active-rows-only counts (see AdminCategoryRead's docstring) — real backend aggregates, not a client-side approximation. */
  business_count: number
  product_count: number
  video_count: number
}

export function adminListCategories(token: string): Promise<AdminCategoryDto[]> {
  return apiFetch<AdminCategoryDto[]>(`${V1}/admin/categories`, { headers: authHeaders(token) })
}

export interface CategoryCreatePayload {
  name: string
}

/** Slug is never accepted as input — the server always generates it (see CategoryCreate's docstring). */
export function createCategoryAdmin(token: string, payload: CategoryCreatePayload): Promise<CategoryDto> {
  return apiFetch<CategoryDto>(`${V1}/admin/categories`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface CategoryUpdatePayload {
  name?: string
  is_active?: boolean
}

/** Renaming does NOT regenerate the slug (see CategoryUpdate's docstring). */
export function updateCategoryAdmin(token: string, categoryId: number, payload: CategoryUpdatePayload): Promise<CategoryDto> {
  return apiFetch<CategoryDto>(`${V1}/admin/categories/${categoryId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/**
 * Admin User Management (`GET /admin/users`, `GET /admin/users/{id}`,
 * `PATCH /admin/users/{id}`) — mirrors app/api/v1/endpoints/admin.py's user
 * routes. Deactivation is a soft-delete (`is_active=false`) guarded
 * server-side by two rules this frontend also enforces in the row rendering
 * itself (see components/admin/UserManagement.tsx): a user can't deactivate
 * their own account, and no `platform_admin` row can be deactivated by
 * anyone through this endpoint.
 */

export interface AdminUserDto {
  id: string
  phone: string | null
  email: string | null
  full_name: string | null
  role: UserRole
  is_active: boolean
  is_verified: boolean
  created_at: string
}

export interface AdminUserDetailDto extends AdminUserDto {
  businesses: BusinessSummaryDto[]
}

export interface AdminListUsersParams {
  role?: UserRole
  q?: string
  page?: number
  page_size?: number
}

export function adminListUsers(token: string, params: AdminListUsersParams = {}): Promise<Page<AdminUserDto>> {
  return apiFetch<Page<AdminUserDto>>(`${V1}/admin/users${toQuery(params)}`, { headers: authHeaders(token) })
}

export function adminGetUser(token: string, userId: string): Promise<AdminUserDetailDto> {
  return apiFetch<AdminUserDetailDto>(`${V1}/admin/users/${userId}`, { headers: authHeaders(token) })
}

export function adminUpdateUser(token: string, userId: string, payload: { is_active: boolean }): Promise<AdminUserDto> {
  return apiFetch<AdminUserDto>(`${V1}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/**
 * Business Analytics (`GET /businesses/{id}/stats`) — owner (or platform
 * admin) only aggregate view, backs the Business Dashboard's "Analytics" nav
 * item. Product/video counts-by-status and view sums are active-rows-only,
 * matching `BusinessDto.product_count`'s existing convention.
 */

export interface ModerationStatusCounts {
  pending: number
  approved: number
  rejected: number
}

export interface BusinessStatsDto {
  business_id: string
  business_view_count: number
  business_impression_count: number
  total_product_views: number
  total_video_views: number
  product_counts: ModerationStatusCounts
  video_counts: ModerationStatusCounts
}

export function getBusinessStats(token: string, businessId: string): Promise<BusinessStatsDto> {
  return apiFetch<BusinessStatsDto>(`${V1}/businesses/${businessId}/stats`, { headers: authHeaders(token) })
}

/**
 * M-Pesa self-serve featured placement (`GET /featured/pricing`,
 * `POST /businesses/{id}/featured-purchases`, `GET /featured-purchases/{id}`,
 * `GET /businesses/{id}/featured-purchases`) — mirrors
 * app/schemas/featured_purchase.py 1:1. See docs/decisions.md's "Phase 1b
 * design pass" and endpoint-implementation follow-up entries for the full
 * design (pricing snapshotting, stacking/extension math, callback validation
 * posture — all backend-side, not the frontend's concern beyond consuming
 * this shape).
 */

export type FeaturedPricingTier = '7_days' | '30_days'
export type FeaturedPurchaseStatus = 'pending' | 'completed' | 'failed'

export interface FeaturedPricingOptionDto {
  tier: FeaturedPricingTier
  label: string
  /** Decimal-as-string over the wire (Pydantic Decimal) — parse with Number() only for display math, never for identity comparisons. */
  amount_kes: string
  duration_days: number
}

/** Public — never hardcode pricing amounts/durations in the frontend. */
export function getFeaturedPricing(): Promise<FeaturedPricingOptionDto[]> {
  return apiFetch<FeaturedPricingOptionDto[]>(`${V1}/featured/pricing`)
}

export interface FeaturedPurchaseDto {
  id: string
  business_id: string
  /** Non-null when this purchase features one specific product rather than the business itself. */
  product_id: string | null
  tier: FeaturedPricingTier
  amount_kes: string
  duration_days: number
  status: FeaturedPurchaseStatus
  payer_phone: string
  /** Only set once status is 'completed'. */
  mpesa_receipt_number: string | null
  /** Only set once status is 'failed' — the real Daraja result description, not a generic message. */
  failure_reason: string | null
  featured_until: string | null
  created_at: string
}

export interface FeaturedPurchaseCreatePayload {
  tier: FeaturedPricingTier
  /** Omit/null to feature the business itself; set to feature one specific product of that business. */
  product_id?: string | null
  /** Whatever Kenyan MSISDN shape the backend's app/utils/phone.py accepts — see lib/phone.ts. */
  phone: string
}

/** Owner/admin only. Only creates a row once Daraja's STK Push itself succeeds — a synchronous failure surfaces as a 502 ApiError with no row created (see the backend design doc). */
export function createFeaturedPurchase(
  token: string,
  businessId: string,
  payload: FeaturedPurchaseCreatePayload,
): Promise<FeaturedPurchaseDto> {
  return apiFetch<FeaturedPurchaseDto>(`${V1}/businesses/${businessId}/featured-purchases`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** Owner/admin only — what the purchase modal polls every 2-3s while status is 'pending'. */
export function getFeaturedPurchase(token: string, purchaseId: string): Promise<FeaturedPurchaseDto> {
  return apiFetch<FeaturedPurchaseDto>(`${V1}/featured-purchases/${purchaseId}`, { headers: authHeaders(token) })
}

export interface ListFeaturedPurchasesParams {
  page?: number
  page_size?: number
}

/** Owner/admin only — paginated purchase history for a business. */
export function listFeaturedPurchases(
  token: string,
  businessId: string,
  params: ListFeaturedPurchasesParams = {},
): Promise<Page<FeaturedPurchaseDto>> {
  return apiFetch<Page<FeaturedPurchaseDto>>(`${V1}/businesses/${businessId}/featured-purchases${toQuery(params)}`, {
    headers: authHeaders(token),
  })
}

/**
 * Self-serve advertiser campaign manager (Phase 1b) — mirrors
 * app/schemas/campaign.py / app/api/v1/endpoints/campaigns.py 1:1. See
 * docs/decisions.md's "Phase 1b design pass: self-serve advertiser campaign
 * manager" entry (and its endpoints-shipped follow-up) for the full design:
 * the lifecycle state machine, the funding/moderation-independence rules,
 * and CPM-only-for-v1 billing. Unlike FeaturedPurchase (a one-shot,
 * duration-based flat fee), a campaign is a real prepaid budget that depletes
 * with impressions and can be topped up more than once over its life.
 */

export type CampaignStatus = 'pending_review' | 'rejected' | 'approved' | 'active' | 'paused' | 'exhausted' | 'completed'
export type CampaignFundingStatus = 'pending' | 'completed' | 'failed'

export interface CampaignPricingDto {
  cpm_kes: string
  cost_per_impression_kes: string
  min_funding_kes: string
}

/** Public — never hardcode the CPM rate/minimum top-up in the frontend. */
export function getCampaignPricing(): Promise<CampaignPricingDto> {
  return apiFetch<CampaignPricingDto>(`${V1}/campaigns/pricing`)
}

export interface CampaignDto {
  id: string
  business_id: string
  business: BusinessSummaryDto
  /** Non-null when this campaign promotes one specific product rather than the business itself. */
  product: ProductSummaryDto | null
  name: string
  /** Targeting — null means "all categories"/"all locations", see docs/decisions.md's ad-serving-mechanic section. */
  category: CategoryDto | null
  county: string | null
  cpm_kes: string
  budget_kes: string
  spent_kes: string
  /** Computed server-side: `budget_kes - spent_kes`, floored at 0. */
  remaining_kes: string
  impression_count: number
  click_count: number
  status: CampaignStatus
  /** A moderator's rejection reason, or their approval note — same single-field reuse as Business.verification_note/Product.moderation_note. */
  moderation_note: string | null
  created_at: string
  updated_at: string
}

export interface CampaignCreatePayload {
  name: string
  /** Omit/null to promote the business itself; set to promote one specific product of that business. Immutable after creation. */
  product_id?: string | null
  /** Omit/null to target all categories. */
  category_id?: number | null
  /** Omit/null to target all locations. */
  county?: string | null
}

/** PATCH semantics — target (`product_id`/`business_id`) is immutable, not present here at all; an owner who wants to promote a different product creates a new campaign. Editing an already-reviewed campaign re-queues it for moderation (server-side; see the endpoint's docstring). */
export type CampaignUpdatePayload = Partial<Pick<CampaignCreatePayload, 'name' | 'category_id' | 'county'>>

export function createCampaign(token: string, businessId: string, payload: CampaignCreatePayload): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/businesses/${businessId}/campaigns`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

export interface ListCampaignsParams {
  page?: number
  page_size?: number
}

export function listBusinessCampaigns(
  token: string,
  businessId: string,
  params: ListCampaignsParams = {},
): Promise<Page<CampaignDto>> {
  return apiFetch<Page<CampaignDto>>(`${V1}/businesses/${businessId}/campaigns${toQuery(params)}`, {
    headers: authHeaders(token),
  })
}

export function getCampaign(token: string, campaignId: string): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/campaigns/${campaignId}`, { headers: authHeaders(token) })
}

export function updateCampaign(token: string, campaignId: string, payload: CampaignUpdatePayload): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/campaigns/${campaignId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** ACTIVE -> PAUSED only — 409 (surfaced via ApiError) otherwise. The dashboard only ever shows this action when `status === 'active'`, so a 409 round-trip should never actually happen in normal use. */
export function pauseCampaign(token: string, campaignId: string): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/campaigns/${campaignId}/pause`, { method: 'POST', headers: authHeaders(token) })
}

/** PAUSED -> ACTIVE only, unconditionally. */
export function resumeCampaign(token: string, campaignId: string): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/campaigns/${campaignId}/resume`, { method: 'POST', headers: authHeaders(token) })
}

/** Owner's own "I'm done" — allowed from any non-COMPLETED status, 409 from COMPLETED itself (double-click safety). Truly terminal, unlike EXHAUSTED. */
export function completeCampaign(token: string, campaignId: string): Promise<CampaignDto> {
  return apiFetch<CampaignDto>(`${V1}/campaigns/${campaignId}/complete`, { method: 'POST', headers: authHeaders(token) })
}

export interface CampaignFundingDto {
  id: string
  campaign_id: string
  amount_kes: string
  status: CampaignFundingStatus
  mpesa_receipt_number: string | null
  created_at: string
}

export interface CampaignFundingCreatePayload {
  /** Advertiser-chosen — validated against CampaignPricingDto.min_funding_kes both client- and server-side. */
  amount_kes: number
  /** Whatever Kenyan MSISDN shape the backend's app/utils/phone.py accepts — see lib/phone.ts. */
  phone: string
}

/** Owner/admin only. Only creates a row once Daraja's STK Push itself succeeds — a synchronous failure surfaces as a 502 ApiError with no row created. Allowed from any campaign status except COMPLETED — funding is independent of moderation review, see docs/decisions.md. */
export function createCampaignFunding(
  token: string,
  campaignId: string,
  payload: CampaignFundingCreatePayload,
): Promise<CampaignFundingDto> {
  return apiFetch<CampaignFundingDto>(`${V1}/campaigns/${campaignId}/funding`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  })
}

/** Owner/admin only — what the funding modal polls every 2-3s while status is 'pending'. */
export function getCampaignFunding(token: string, fundingId: string): Promise<CampaignFundingDto> {
  return apiFetch<CampaignFundingDto>(`${V1}/campaign-fundings/${fundingId}`, { headers: authHeaders(token) })
}

/** Owner/admin only — paginated top-up history for a campaign. */
export function listCampaignFundings(
  token: string,
  campaignId: string,
  params: ListCampaignsParams = {},
): Promise<Page<CampaignFundingDto>> {
  return apiFetch<Page<CampaignFundingDto>>(`${V1}/campaigns/${campaignId}/fundings${toQuery(params)}`, {
    headers: authHeaders(token),
  })
}

/** Public batch endpoints, same shape/reasoning as recordBusinessImpressions/recordProductImpressions above — the frontend calls these with the ids of campaigns whose Sponsored tie-break is currently rendered, batched at the same call site (see Search.tsx). `/clicks` is analytics-only and never bills `spent_kes` (CPM-only for v1). */
export function recordCampaignImpressions(ids: string[]): Promise<ImpressionBatchResult> {
  return apiFetch<ImpressionBatchResult>(`${V1}/campaigns/impressions`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}

export function recordCampaignClicks(ids: string[]): Promise<ImpressionBatchResult> {
  return apiFetch<ImpressionBatchResult>(`${V1}/campaigns/clicks`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
}
