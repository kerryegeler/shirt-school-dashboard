import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import EmailAgent from './modules/email-agent/EmailAgent.jsx'
import FeedbackTab from './modules/feedback/FeedbackTab.jsx'
import ContentAgent from './modules/content-agent/ContentAgent.jsx'
import ContentBoard from './modules/content-board/ContentBoard.jsx'
import PaymentRecovery from './modules/payment-recovery/PaymentRecovery.jsx'
import SalesAnalytics from './modules/sales-analytics/SalesAnalytics.jsx'
import Reminders from './modules/reminders/Reminders.jsx'
import AuthCallback from './components/AuthCallback.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import LiveEventModal from './components/LiveEventModal.jsx'

export default function App() {
  // dashboardUser: undefined = checking, null = not logged in, object = logged in
  const [dashboardUser, setDashboardUser] = useState(undefined)
  const [authState, setAuthState] = useState(null)
  const [activeModule, setActiveModule] = useState('email-agent')
  const [unreadCount, setUnreadCount] = useState(0)
  const [liveEventOpen, setLiveEventOpen] = useState(false)

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
          onOpenLiveEvent={() => setLiveEventOpen(true)}
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
          {activeModule === 'payment-recovery' && <PaymentRecovery />}
          {activeModule === 'sales-analytics' && <SalesAnalytics />}
          {activeModule === 'reminders' && <Reminders />}
        </main>
      </div>

      {liveEventOpen && <LiveEventModal onClose={() => setLiveEventOpen(false)} />}

      {/* Mobile menu launcher (pill in the bottom-center) + sections sheet */}
      <MobileMenu
        activeModule={activeModule}
        onSelect={(id) => setActiveModule(id)}
        unreadCount={unreadCount}
        onOpenLiveEvent={() => setLiveEventOpen(true)}
      />
    </>
  )
}

// ─── Mobile menu (centered pill button + bottom sheet) ────────────────────────

const MOBILE_SECTIONS = [
  { id: 'email-agent', label: 'Email Agent', short: 'Email' },
  { id: 'ai-feedback', label: 'AI Feedback', short: 'Feedback' },
  { id: 'content-agent', label: 'Content Agent', short: 'Content' },
  { id: 'content-board', label: 'Content Board', short: 'Board' },
  { id: 'payment-recovery', label: 'Payment Recovery', short: 'Payments' },
  { id: 'sales-analytics', label: 'Sales Analytics', short: 'Sales' },
  { id: 'reminders', label: 'Reminders', short: 'Reminders' },
]

function MobileMenu({ activeModule, onSelect, unreadCount, onOpenLiveEvent }) {
  const [open, setOpen] = useState(false)
  const active = MOBILE_SECTIONS.find((s) => s.id === activeModule) || MOBILE_SECTIONS[0]

  return (
    <>
      <button
        className="mobile-menu-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <span className="mobile-menu-launcher-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="2" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="9.5" y="2.5" width="4.5" height="4.5" rx="1" />
            <rect x="2" y="9" width="4.5" height="4.5" rx="1" />
            <rect x="9.5" y="9" width="4.5" height="4.5" rx="1" />
          </svg>
        </span>
        <span className="mobile-menu-launcher-label">{active.short}</span>
        {unreadCount > 0 && activeModule !== 'email-agent' && (
          <span className="mobile-menu-launcher-badge">{unreadCount}</span>
        )}
        <svg className="mobile-menu-launcher-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>

      {open && (
        <div className="mobile-menu-overlay" onClick={() => setOpen(false)}>
          <div className="mobile-menu-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-sheet-handle" />
            <div className="mobile-menu-sheet-title">Sections</div>
            <div className="mobile-menu-sheet-grid">
              {MOBILE_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`mobile-menu-card ${activeModule === s.id ? 'active' : ''}`}
                  onClick={() => { onSelect(s.id); setOpen(false) }}
                >
                  {s.id === 'email-agent' && unreadCount > 0 && (
                    <span className="mobile-menu-card-badge">{unreadCount}</span>
                  )}
                  <span className="mobile-menu-card-label">{s.label}</span>
                </button>
              ))}
              <button
                className="mobile-menu-card"
                onClick={() => { onOpenLiveEvent?.(); setOpen(false) }}
              >
                <span className="mobile-menu-card-label">📅 Live Event</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
