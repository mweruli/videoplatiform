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
  category_id?: number | null
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
