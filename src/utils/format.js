// Shared formatting + avatar helpers. These were previously duplicated across
// EmailDetail, EmailList, FeedbackTab, SalesAnalytics, PaymentRecovery,
// ContentAgent, and ContentBoard — import from here instead.

export function formatFullDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function formatShortDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatMoney(cents, currency = 'USD') {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency })
}

const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#059669', '#dc2626',
  '#0891b2', '#d97706', '#db2777', '#65a30d',
]

export function getAvatarColor(name) {
  return AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length]
}

export function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
