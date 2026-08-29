import { useEffect, useState } from 'react'

import type { SelfRegisterableRole, UserRead } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useToast } from '../../lib/toast'
import type { AuthPending } from './authPending'
import AccountHomeView from './views/AccountHomeView'
import ForgotPasswordView from './views/ForgotPasswordView'
import LoginView from './views/LoginView'
import OtpVerifyView from './views/OtpVerifyView'
import RegisterView from './views/RegisterView'
import ResetPasswordView from './views/ResetPasswordView'

type AuthView = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'home'

/**
 * Shared auth modal/sheet — bottom sheet on mobile, centred modal on desktop
 * (>=1024px), hosting Login/Register/OTP verify/Forgot/Reset/signed-in-home
 * as internal view state rather than separate routes, per the approved
 * design (docs/design/prototype-v1.html's account sheet).
 *
 * Positioning note: the prototype's sheet used `position:absolute; top:50%`
 * at the desktop breakpoint, which only centred correctly by accident on
 * short pages — it measured against the full scrollable page height, not
 * the viewport, and broke on tall ones. This is built with `position:fixed`
 * at every breakpoint from the start, so it's always anchored to the
 * viewport regardless of page scroll height.
 */
export default function AuthModal() {
  const { isAuthModalOpen, authModalOptions, closeAuthModal, status, user, setSession, logout } = useAuth()
  const { showToast } = useToast()

  const [view, setView] = useState<AuthView>('login')
  const [, setHistory] = useState<AuthView[]>(['login'])
  const [pending, setPending] = useState<AuthPending | null>(null)
  const [registerRole, setRegisterRole] = useState<SelfRegisterableRole>('general_user')
  const [loginPrefill, setLoginPrefill] = useState('')
  const [loginNotice, setLoginNotice] = useState<string | null>(null)

  // Decide the starting screen each time the modal is opened: signed-in
  // users land on Home, "List your business" jumps straight into Register
  // with the role pre-selected, everyone else sees Login.
  useEffect(() => {
    if (!isAuthModalOpen) return
    if (status === 'authenticated') {
      setView('home')
      setHistory(['home'])
    } else if (authModalOptions.forceRegisterRole) {
      setRegisterRole(authModalOptions.forceRegisterRole)
      setView('register')
      setHistory(['login'])
    } else {
      setView('login')
      setHistory(['login'])
    }
    setLoginNotice(null)
    // Deliberately only re-run on the open transition, not on every status/options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthModalOpen])

  function pushView(next: AuthView) {
    setHistory((h) => [...h, view])
    setView(next)
  }

  function resetTo(next: AuthView, newHistory: AuthView[]) {
    setHistory(newHistory)
    setView(next)
  }

  function goBack() {
    setHistory((h) => {
      const copy = [...h]
      const prev = (copy.pop() as AuthView | undefined) ?? 'login'
      setView(prev)
      return copy
    })
  }

  function handleSuccessLogin(token: string, nextUser: UserRead) {
    setSession(token, nextUser)
    showToast(`Signed in as ${nextUser.full_name || nextUser.email || nextUser.phone}`)
    resetTo('home', ['home'])
  }

  function handleRegistered(nextPending: AuthPending) {
    setPending(nextPending)
    showToast(`Verification code sent to your ${nextPending.channel}.`)
    resetTo('verify', ['register'])
  }

  function handleVerified(destination: string) {
    setLoginPrefill(destination)
    setLoginNotice('Account verified! Sign in to continue.')
    showToast('Account verified.')
    resetTo('login', ['login'])
  }

  function handleForgotRequested(nextPending: AuthPending) {
    setPending(nextPending)
    resetTo('reset', ['forgot'])
  }

  function handleReset(token: string, nextUser: UserRead) {
    setSession(token, nextUser)
    showToast('Password reset — you’re signed in.')
    resetTo('home', ['home'])
  }

  function handleNeedsVerification(nextPending: AuthPending) {
    setPending(nextPending)
    showToast(`New verification code sent to your ${nextPending.channel}.`)
    resetTo('verify', ['login'])
  }

  function handleSignOut() {
    logout()
    showToast('Signed out')
    resetTo('login', ['login'])
  }

  const title =
    { login: 'Sign in', register: 'Create account', verify: 'Verify your account', forgot: 'Reset your password', reset: 'Enter reset code', home: 'Account' }[
      view
    ]

  return (
    <div aria-hidden={!isAuthModalOpen}>
      {/* backdrop */}
      <div
        onClick={closeAuthModal}
        className={`fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-brand motion-reduce:transition-none ${
          isAuthModalOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* panel — fixed at every breakpoint, so it's always viewport-relative regardless of page scroll height */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-x-0 bottom-0 z-[95] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-glass-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-elevated transition-transform duration-300 ease-brand motion-reduce:transition-none ${
          isAuthModalOpen ? 'translate-y-0' : 'translate-y-full'
        } lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:w-full lg:max-w-[440px] lg:-translate-x-1/2 lg:rounded-3xl lg:border lg:border-border lg:p-7 lg:shadow-elevated lg:transition-[opacity,transform] ${
          isAuthModalOpen ? 'lg:pointer-events-auto lg:translate-y-[-50%] lg:opacity-100' : 'lg:pointer-events-none lg:translate-y-[-46%] lg:opacity-0'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 flex-none rounded-full bg-border lg:hidden" aria-hidden="true" />

        {view === 'login' && (
          <LoginView
            prefillIdentifier={loginPrefill}
            notice={loginNotice}
            onSwitchToRegister={() => resetTo('register', ['login'])}
            onForgotPassword={() => pushView('forgot')}
            onSuccessLogin={handleSuccessLogin}
            onNeedsVerification={handleNeedsVerification}
          />
        )}
        {view === 'register' && (
          <RegisterView initialRole={registerRole} onSwitchToLogin={() => resetTo('login', ['login'])} onRegistered={handleRegistered} />
        )}
        {view === 'verify' && pending && <OtpVerifyView pending={pending} onBack={goBack} onVerified={handleVerified} />}
        {view === 'forgot' && <ForgotPasswordView onBack={goBack} onRequested={handleForgotRequested} />}
        {view === 'reset' && pending && <ResetPasswordView pending={pending} onBack={goBack} onReset={handleReset} />}
        {view === 'home' && user && <AccountHomeView user={user} onSignOut={handleSignOut} />}
      </div>
    </div>
  )
}
