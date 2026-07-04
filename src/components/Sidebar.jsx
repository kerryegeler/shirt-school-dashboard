const TARGET_ACCOUNTS = ['support@shirtschool.com', 'kerry@shirtschool.com']

const IconEmail = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 5l7 5 7-5" />
  </svg>
)

const IconFeedback = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1v14M1 8h14M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </svg>
)

const IconEdit = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-9 9H2v-3L11 2z" />
  </svg>
)

const IconBoard = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="4" height="12" rx="1" />
    <rect x="6" y="2" width="4" height="8" rx="1" />
    <rect x="11" y="2" width="4" height="10" rx="1" />
  </svg>
)

const IconCard = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="2" />
    <path d="M1 6h14" />
    <path d="M4 10h3" />
  </svg>
)

const IconChartBar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 14V8" />
    <path d="M6 14V5" />
    <path d="M10 14v-3" />
    <path d="M14 14V3" />
    <path d="M1 14h14" />
  </svg>
)

const IconClock = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="9" r="6" />
    <path d="M8 6v3l2 1.5" />
    <path d="M6 1h4" />
  </svg>
)

const IconMegaphone = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6.5v3l2 .5 1.5 3.5 1.5-.5-1-3L14 12V2L4 6l-2 .5z" />
  </svg>
)

const IconCalendar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
    <path d="M1.5 6h13" />
    <path d="M5 1v3M11 1v3" />
  </svg>
)

const modules = [
  { id: 'email-agent', label: 'Email Agent', icon: IconEmail, comingSoon: false },
  { id: 'ai-feedback', label: 'AI Feedback', icon: IconFeedback, comingSoon: false },
  { id: 'content-agent', label: 'Content Agent', icon: IconEdit, comingSoon: false },
  { id: 'content-board', label: 'Content Board', icon: IconBoard, comingSoon: false },
  { id: 'payment-recovery', label: 'Payment Recovery', icon: IconCard, comingSoon: false },
  { id: 'sales-analytics', label: 'Sales Analytics', icon: IconChartBar, comingSoon: false },
  { id: 'reminders', label: 'Reminders', icon: IconClock, comingSoon: false },
  { id: 'social-proof', label: 'Social Proof', icon: IconMegaphone, comingSoon: false },
]

export default function Sidebar({ activeModule, onSelectModule, unreadCount, accountStatus, onDisconnect, onOpenLiveEvent }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/ShirtSchool_Logo_2024.png" alt="Shirt School" />
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Agents</div>
        {modules.map((mod) => {
          const Icon = mod.icon
          const isActive = activeModule === mod.id
          return (
            <div
              key={mod.id}
              className={`sidebar-item ${isActive ? 'active' : ''} ${mod.comingSoon ? 'coming-soon' : ''}`}
              onClick={() => !mod.comingSoon && onSelectModule(mod.id)}
              title={mod.comingSoon ? 'Coming soon' : mod.label}
            >
              <span className="sidebar-item-icon"><Icon /></span>
              {mod.label}
              {mod.comingSoon && <span className="sidebar-badge-pill">Soon</span>}
              {!mod.comingSoon && mod.id === 'email-agent' && unreadCount > 0 && (
                <span className="sidebar-unread-dot">{unreadCount}</span>
              )}
            </div>
          )
        })}

        <div className="sidebar-section-label" style={{ marginTop: 16 }}>Settings</div>
        <div
          className="sidebar-item"
          onClick={() => onOpenLiveEvent?.()}
          title="Configure current live event info the AI uses"
        >
          <span className="sidebar-item-icon"><IconCalendar /></span>
          Live Event
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-section-label" style={{ padding: '0 4px 8px', marginTop: 0 }}>
          Gmail Accounts
        </div>
        {TARGET_ACCOUNTS.map((account) => {
          const status = accountStatus?.[account]
          const connected = status?.connected
          return (
            <div key={account} className="sidebar-account-row">
              <span className={`sidebar-account-dot ${connected ? 'dot-on' : 'dot-off'}`} />
              <span className="sidebar-account-email" title={account}>
                {account.split('@')[0]}@<wbr />shirtschool.com
              </span>
              {connected ? (
                <>
                  <button
                    className="sidebar-account-action sidebar-account-reconnect"
                    title={`Re-authorize ${account} with updated permissions`}
                    onClick={() => {
                      localStorage.setItem('oauth_account_intent', account)
                      window.location.href = `/api/auth/google?account=${encodeURIComponent(account)}`
                    }}
                  >
                    Reconnect
                  </button>
                  <button
                    className="sidebar-account-action"
                    onClick={() => onDisconnect(account)}
                    title={`Disconnect ${account}`}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  className="sidebar-account-action sidebar-account-connect"
                  title={`Connect ${account}`}
                  onClick={() => {
                    localStorage.setItem('oauth_account_intent', account)
                    window.location.href = `/api/auth/google?account=${encodeURIComponent(account)}`
                  }}
                >
                  Connect
                </button>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
