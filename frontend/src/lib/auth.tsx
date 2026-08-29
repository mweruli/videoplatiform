import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { ApiError, getMe } from './api'
import type { SelfRegisterableRole, UserRead } from './api'

const TOKEN_STORAGE_KEY = 'miles-tech-auth-token'

/**
 * Token storage decision (flagged per the brief — this is security-relevant):
 * the access token lives in `sessionStorage`, mirrored into a module-level
 * variable that every API call actually reads from. Rationale:
 *   - The backend (app/api/v1/endpoints/auth.py) returns the JWT in a JSON
 *     body, not a `Set-Cookie` — there is no httpOnly-cookie option available
 *     without a backend change, so *some* JS-readable storage is the only
 *     option today. That's an unavoidable tradeoff of this endpoint shape,
 *     not a corner cut here.
 *   - Given that constraint, `sessionStorage` over `localStorage`: identical
 *     XSS exposure while the tab is open, but it clears when the tab/browser
 *     closes rather than persisting indefinitely — smaller blast radius if a
 *     token is ever exfiltrated, at the cost of "stay signed in for days"
 *     convenience. The access token also already expires in 24h server-side
 *     (settings.ACCESS_TOKEN_EXPIRE_MINUTES), so the realistic persistence
 *     gap between the two options is small.
 *   - Never logged to the console (see login/register handlers) and never
 *     placed in a URL.
 * Revisit if/when the backend grows a refresh-token + httpOnly-cookie flow —
 * that would be the stronger option and is worth a follow-up ticket.
 */
function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode, etc.) — session simply won't survive a refresh.
  }
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthModalOptions {
  /** Opens straight into Register with this role pre-selected — e.g. the "List your business" entry point. */
  forceRegisterRole?: SelfRegisterableRole
}

interface AuthContextValue {
  status: AuthStatus
  user: UserRead | null
  token: string | null
  setSession: (token: string, user: UserRead) => void
  updateUser: (user: UserRead) => void
  logout: () => void
  isAuthModalOpen: boolean
  authModalOptions: AuthModalOptions
  openAuthModal: (opts?: AuthModalOptions) => void
  closeAuthModal: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/**
 * App-wide session state (current user + token) and the auth modal's
 * open/closed state. The modal itself (`<AuthModal />`) is rendered by the
 * app root (see main.tsx) rather than from inside this provider, purely to
 * avoid a circular import (AuthModal reads session state via `useAuth`,
 * which lives in this file) — the provider still owns all of the state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken())
  const [user, setUser] = useState<UserRead | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => (readStoredToken() ? 'loading' : 'anonymous'))
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authModalOptions, setAuthModalOptions] = useState<AuthModalOptions>({})

  useEffect(() => {
    if (!token) {
      setStatus('anonymous')
      return
    }
    let cancelled = false
    getMe(token)
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Expired/invalid token (or backend unreachable) — drop it silently
        // rather than looping the user into an error state on load.
        if (err instanceof ApiError) {
          writeStoredToken(null)
          setToken(null)
        }
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
    // Only re-run when the token itself changes (login/logout/reset), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const setSession = useCallback((nextToken: string, nextUser: UserRead) => {
    writeStoredToken(nextToken)
    setToken(nextToken)
    setUser(nextUser)
    setStatus('authenticated')
  }, [])

  const updateUser = useCallback((nextUser: UserRead) => {
    setUser(nextUser)
  }, [])

  const logout = useCallback(() => {
    writeStoredToken(null)
    setToken(null)
    setUser(null)
    setStatus('anonymous')
  }, [])

  const openAuthModal = useCallback((opts: AuthModalOptions = {}) => {
    setAuthModalOptions(opts)
    setIsAuthModalOpen(true)
  }, [])

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      setSession,
      updateUser,
      logout,
      isAuthModalOpen,
      authModalOptions,
      openAuthModal,
      closeAuthModal,
    }),
    [status, user, token, setSession, updateUser, logout, isAuthModalOpen, authModalOptions, openAuthModal, closeAuthModal],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
