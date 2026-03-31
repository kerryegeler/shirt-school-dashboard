export async function fetchSentEmails() {
  const response = await fetch('/api/emails/sent')
  const data = await response.json()
  console.log('[Sent] HTTP', response.status, '→', data)
  if (!response.ok) throw new Error(data.error || 'Failed to fetch sent emails')
  return data.sent
}

export async function fetchThread(id, account) {
  const url = account
    ? `/api/emails/${id}?account=${encodeURIComponent(account)}`
    : `/api/emails/${id}`
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch thread')
  return data.thread
}

export async function archiveAll() {
  const response = await fetch('/api/emails/archive-all', { method: 'POST' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to archive all')
  return data
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

export async function unarchiveEmail(id, account) {
  const response = await fetch(`/api/emails/${id}/unarchive`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to move to inbox')
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

export async function searchEmails(q) {
  const response = await fetch(`/api/emails/search?q=${encodeURIComponent(q)}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Search failed')
  return data
}

export async function fetchDraft(threadId) {
  const response = await fetch(`/api/drafts/${threadId}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch draft')
  return data.content
}

export async function saveDraft(threadId, content) {
  const response = await fetch(`/api/drafts/${threadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to save draft')
  }
}

export async function deleteDraft(threadId) {
  await fetch(`/api/drafts/${threadId}`, { method: 'DELETE' })
}

export async function fetchFolders() {
  const response = await fetch('/api/folders')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch folders')
  return data.folders
}

export async function createFolder(name) {
  const response = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to create folder')
  return data.folder
}

export async function deleteFolder(id) {
  const response = await fetch(`/api/folders/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to delete folder')
  }
}

export async function assignFolder(threadId, folderId) {
  const response = await fetch(`/api/emails/${threadId}/folder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to assign folder')
  return data
}

export async function fetchLearnedBehaviors() {
  const r = await fetch('/api/learned-behaviors')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch learned behaviors')
  return d // { content, lastUpdated }
}

export async function saveLearnedBehaviors(content) {
  const r = await fetch('/api/learned-behaviors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to save') }
}

export async function fetchFeedback() {
  const response = await fetch('/api/feedback')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch feedback')
  return data.entries
}

export async function logFeedback({ threadId, category, originalDraft, finalVersion }) {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, category, originalDraft, finalVersion }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to log feedback')
  return data
}

export async function updateFeedbackNotes(id, notes) {
  const response = await fetch(`/api/feedback/${id}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to update notes')
  }
}

// ─── Content Agent ─────────────────────────────────────────────────────────────

export async function fetchContentIdeas() {
  const r = await fetch('/api/content/ideas')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch ideas')
  return d.ideas
}

export async function updateContentIdea(id, updates) {
  const r = await fetch(`/api/content/ideas/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update idea') }
}

export async function deleteContentIdea(id) {
  const r = await fetch(`/api/content/ideas/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete idea') }
}

export async function fetchContentBriefs() {
  const r = await fetch('/api/content/briefs')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch briefs')
  return d.briefs
}

export async function fetchContentBrief(id) {
  const r = await fetch(`/api/content/briefs/${id}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Brief not found')
  return d.brief
}

export async function runContentBrief() {
  const r = await fetch('/api/content/run-brief', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to run brief')
  return d
}

export async function fetchContentTopics() {
  const r = await fetch('/api/content/topics')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch topics')
  return d.topics
}

export async function createContentTopic(keyword) {
  const r = await fetch('/api/content/topics', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to create topic')
  return d.topic
}

export async function updateContentTopic(id, updates) {
  const r = await fetch(`/api/content/topics/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update topic') }
}

export async function deleteContentTopic(id) {
  const r = await fetch(`/api/content/topics/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete topic') }
}

export async function fetchChannelStats() {
  const r = await fetch('/api/content/channel-stats')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch channel stats')
  return d  // returns { stats, configured, channelId, kerryConnected }
}

export async function fetchYouTubeChannels() {
  const r = await fetch('/api/content/youtube-channels')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch channels')
  return d
}

export async function lookupChannel(query) {
  const r = await fetch('/api/content/channel-lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Channel not found')
  return d.channels
}

export async function selectChannel(channelId) {
  const r = await fetch('/api/content/channel-select', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to save channel') }
}

export async function refreshChannelStats() {
  const r = await fetch('/api/content/channel-stats/refresh', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to refresh stats')
  return d
}

export async function fetchCompetitors() {
  const r = await fetch('/api/content/competitors')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch competitors')
  return d.competitors
}

export async function addCompetitor(competitor) {
  const r = await fetch('/api/content/competitors', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(competitor),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to add competitor')
  return d.competitor
}

export async function updateCompetitor(id, updates) {
  const r = await fetch(`/api/content/competitors/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update competitor') }
}

export async function deleteCompetitor(id) {
  const r = await fetch(`/api/content/competitors/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete competitor') }
}

// ─── Content Board ──────────────────────────────────────────────────────────────

export async function fetchContentCards() {
  const r = await fetch('/api/content/cards')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch cards')
  return d.cards
}

export async function createContentCard({ title, boardType, generateAI, ideaData }) {
  const r = await fetch('/api/content/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, boardType, generateAI, ideaData }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to create card')
  return d.card
}

export async function updateContentCard(id, updates) {
  const r = await fetch(`/api/content/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update card') }
}

export async function deleteContentCard(id) {
  const r = await fetch(`/api/content/cards/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete card') }
}

export async function regenerateCardSections(id, field) {
  const r = await fetch(`/api/content/cards/${id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to regenerate')
  return d.sections
}

export async function sendEmail(email, draft, fromAccount, toEmail, isManual = false) {
  // Only send the fields the server needs — avoid sending the full message history
  const trimmedEmail = {
    id: email.id,
    threadId: email.threadId,
    messageId: email.messageId,
    from: email.from,
    to: email.to,
    name: email.name,
    subject: email.subject,
    account: email.account,
    category: email.category,
  }
  const response = await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmedEmail, draft, fromAccount, toEmail, isManual }),
  })

  let data
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    const text = await response.text()
    data = { error: response.status === 413 ? 'Request too large. Try shortening your draft.' : `Server error (${response.status})` }
  }

  if (!response.ok) {
    throw new Error(data.error || 'Failed to send email')
  }

  return data
}

export async function triggerLearningRebuild() {
  const r = await fetch('/api/learning/run', { method: 'POST' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed') }
}
