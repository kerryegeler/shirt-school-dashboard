import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import EmailAgent from './modules/email-agent/EmailAgent.jsx'
import AuthCallback from './components/AuthCallback.jsx'
import LoginScreen from './components/LoginScreen.jsx'

export default function App() {
  const [authState, setAuthState] = useState(null) // null = loading
  const [activeModule, setActiveModule] = useState('email-agent')
  const [unreadCount, setUnreadCount] = useState(0)

  const isAuthCallback = window.location.pathname === '/auth/callback'

  const refreshAuthStatus = useCallback(() => {
    return fetch('/api/auth/status')
      .then((r) => r.json())
      .then(setAuthState)
      .catch(() => setAuthState({ accounts: {}, anyConnected: false }))
  }, [])

  useEffect(() => {
    if (isAuthCallback) return
    refreshAuthStatus()
  }, [isAuthCallback, refreshAuthStatus])

  async function handleDisconnect(account) {
    const qs = account ? `?account=${encodeURIComponent(account)}` : ''
    await fetch(`/api/auth/logout${qs}`, { method: 'POST' })
    refreshAuthStatus()
    if (account === null) setUnreadCount(0) // full logout
  }

  if (isAuthCallback) {
    return (
      <AuthCallback
        onComplete={() => {
          window.history.replaceState(null, '', '/')
          refreshAuthStatus()
        }}
      />
    )
  }

  if (!authState) {
    return (
      <div className="app-loading">
        <div className="app-loading-dot" />
      </div>
    )
  }

  if (!authState.anyConnected) {
    return <LoginScreen accountStatus={authState.accounts} />
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
      </main>
    </div>
  )
}
