/**
 * Thin fetch-based API client. Every backend capability is reachable through
 * this module (or a future feature-specific module built on top of it) —
 * per the project's API-first rule, components should never talk to the
 * backend any other way.
 */

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

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
