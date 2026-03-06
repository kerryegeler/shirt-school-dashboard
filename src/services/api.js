export async function fetchThread(id, account) {
  const url = account
    ? `/api/emails/${id}?account=${encodeURIComponent(account)}`
    : `/api/emails/${id}`
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch thread')
  return data.thread
}

export async function archiveEmail(id, account) {
  const response = await fetch(`/api/emails/${id}/archive`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to archive')
  }
}

export async function markEmailRead(id, account) {
  const response = await fetch(`/api/emails/${id}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to mark as read')
  }
}

export async function markEmailUnread(id, account) {
  const response = await fetch(`/api/emails/${id}/unread`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to mark as unread')
  }
}

export async function reclassifyEmail(id, category) {
  const response = await fetch(`/api/emails/${id}/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to reclassify email')
  return data
}

export async function generateReply(email, category) {
  const response = await fetch('/api/generate-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, category }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate reply')
  }

  return data
}

export async function sendEmail(email, draft, fromAccount) {
  const response = await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, draft, fromAccount }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Failed to send email')
  }

  return data
}
