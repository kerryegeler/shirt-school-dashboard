import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import EmailAgent from './modules/email-agent/EmailAgent.jsx'
import FeedbackTab from './modules/feedback/FeedbackTab.jsx'
import ContentAgent from './modules/content-agent/ContentAgent.jsx'
import ContentBoard from './modules/content-board/ContentBoard.jsx'
import ChallengeLauncher from './modules/challenge-launcher/ChallengeLauncher.jsx'
import PaymentRecovery from './modules/payment-recovery/PaymentRecovery.jsx'
import AuthCallback from './components/AuthCallback.jsx'
import LoginScreen from './components/LoginScreen.jsx'

export default function App() {
  // dashboardUser: undefined = checking, null = not logged in, object = logged in
  const [dashboardUser, setDashboardUser] = useState(undefined)
  const [authState, setAuthState] = useState(null)
  const [activeModule, setActiveModule] = useState('email-agent')
  const [unreadCount, setUnreadCount] = useState(0)

  const isAuthCallback = window.location.pathname === '/auth/callback'

  const refreshAuthStatus = useCallback(() => {
    return fetch('/api/auth/status')
      .then((r) => r.json())
      .then(setAuthState)
      .catch(() => setAuthState({ accounts: {}, anyConnected: false }))
  }, [])

  const checkDashboardAuth = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me')
      if (r.ok) {
        const data = await r.json()
        setDashboardUser(data.user)
        return true
      }
    } catch {}
    setDashboardUser(null)
    return false
  }, [])

  useEffect(() => {
    if (isAuthCallback) return
    checkDashboardAuth().then((loggedIn) => {
      if (loggedIn) refreshAuthStatus()
    })
  }, [isAuthCallback, checkDashboardAuth, refreshAuthStatus])

  async function handleDisconnect(account) {
    const qs = account ? `?account=${encodeURIComponent(account)}` : ''
    await fetch(`/api/auth/logout${qs}`, { method: 'POST' })
    refreshAuthStatus()
    if (account === null) setUnreadCount(0)
  }

  function handleAfterCallback() {
    window.history.replaceState(null, '', '/')
    checkDashboardAuth().then((loggedIn) => {
      if (loggedIn) refreshAuthStatus()
    })
  }

  if (isAuthCallback) {
    return <AuthCallback onComplete={handleAfterCallback} />
  }

  // Still checking session
  if (dashboardUser === undefined) {
    return (
      <div className="app-loading">
        <div className="app-loading-dot" />
      </div>
    )
  }

  // Not logged in to dashboard
  if (!dashboardUser) {
    return <LoginScreen />
  }

  // Logged in but Gmail status still loading
  if (!authState) {
    return (
      <div className="app-loading">
        <div className="app-loading-dot" />
      </div>
    )
  }

  const connectedAccounts = Object.entries(authState.accounts || {})
    .filter(([, v]) => v.connected)
    .map(([k]) => k)

  return (
    <>
      <div className="app-layout">
        <Sidebar
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          unreadCount={unreadCount}
          accountStatus={authState.accounts || {}}
          onDisconnect={handleDisconnect}
        />
        <main className="app-main">
          {activeModule === 'email-agent' && (
            <EmailAgent
              onUnreadChange={setUnreadCount}
              connectedAccounts={connectedAccounts}
            />
          )}
          {activeModule === 'ai-feedback' && <FeedbackTab />}
          {activeModule === 'content-agent' && <ContentAgent />}
          {activeModule === 'content-board' && <ContentBoard />}
          {activeModule === 'challenge-launcher' && <ChallengeLauncher />}
          {activeModule === 'payment-recovery' && <PaymentRecovery />}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tab-bar">
        <button
          className={`mobile-tab-btn ${activeModule === 'email-agent' ? 'active' : ''}`}
          onClick={() => setActiveModule('email-agent')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="14" height="10" rx="1.5" />
            <path d="M1 5l7 5 7-5" />
          </svg>
          Email
          {unreadCount > 0 && <span className="mobile-tab-badge">{unreadCount}</span>}
        </button>
        <button
          className={`mobile-tab-btn ${activeModule === 'content-agent' ? 'active' : ''}`}
          onClick={() => setActiveModule('content-agent')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 2l3 3-9 9H2v-3L11 2z" />
          </svg>
          Content
        </button>
        <button
          className={`mobile-tab-btn ${activeModule === 'ai-feedback' ? 'active' : ''}`}
          onClick={() => setActiveModule('ai-feedback')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1v14M1 8h14M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
          Feedback
        </button>
        <button
          className={`mobile-tab-btn ${activeModule === 'challenge-launcher' ? 'active' : ''}`}
          onClick={() => setActiveModule('challenge-launcher')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1c0 0 4 2 4 7H4C4 3 8 1 8 1z" />
            <path d="M5 8v4l3 2 3-2V8" />
            <circle cx="8" cy="5" r="1" fill="currentColor" stroke="none" />
          </svg>
          Launch
        </button>
      </nav>
    </>
  )
}
