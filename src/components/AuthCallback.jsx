import { useEffect, useState } from 'react'
import './LoginScreen.css'

export default function AuthCallback({ onComplete }) {
  const [status, setStatus] = useState('Connecting account...')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    // Google echoes back our `state` param. Also check localStorage as fallback.
    const stateAccount = params.get('state')
    const lsIntent = localStorage.getItem('oauth_account_intent')
    localStorage.removeItem('oauth_account_intent')
    // Use state if it looks like an email; otherwise use localStorage fallback
    const expectedAccount = (stateAccount && stateAccount.includes('@')) ? stateAccount : (lsIntent || 'auto')

    if (error) {
      setStatus('Authorization was denied. You can close this page and try again.')
      setIsError(true)
      return
    }
    if (!code) {
      setStatus('No authorization code was received.')
      setIsError(true)
      return
    }

    setStatus('Connecting account...')

    fetch('/api/auth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, expectedAccount }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setStatus(`${data.email} connected. Redirecting...`)
          setTimeout(onComplete, 800)
        } else {
          setStatus(data.error || 'Something went wrong.')
          setIsError(true)
        }
      })
      .catch(() => {
        setStatus('Failed to connect. Make sure the dev server is running.')
        setIsError(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/ShirtSchool_Logo_2024.png" alt="Shirt School" className="login-logo" />
        <p style={{ fontSize: 14, color: isError ? 'var(--red)' : 'var(--text-secondary)', lineHeight: 1.6 }}>
          {status}
        </p>
        {isError && (
          <a href="/" style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: 'var(--orange-hover)', textDecoration: 'none' }}>
            Back to dashboard
          </a>
        )}
      </div>
    </div>
  )
}
