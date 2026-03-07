import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import EmailAgent from './modules/email-agent/EmailAgent.jsx'
import FeedbackTab from './modules/feedback/FeedbackTab.jsx'
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
      </main>
    </div>
  )
}
