// All API calls go through this wrapper: 30s timeout so a hung request can't
// leave the UI on an infinite spinner. AbortSignal.timeout is supported in all
// modern browsers (and this dashboard only runs on Kerry's devices).
function apiFetch(url, options = {}) {
  return fetch(url, { signal: AbortSignal.timeout(30000), ...options })
}

export async function fetchSentEmails() {
  const response = await apiFetch('/api/emails/sent')
  const data = await response.json()
  console.log('[Sent] HTTP', response.status, '→', data)
  if (!response.ok) throw new Error(data.error || 'Failed to fetch sent emails')
  return data.sent
}

export async function fetchThread(id, account) {
  const url = account
    ? `/api/emails/${id}?account=${encodeURIComponent(account)}`
    : `/api/emails/${id}`
  const response = await apiFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch thread')
  return data.thread
}

export async function archiveAll() {
  const response = await apiFetch('/api/emails/archive-all', { method: 'POST' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to archive all')
  return data
}

export async function archiveEmail(id, account) {
  const response = await apiFetch(`/api/emails/${id}/archive`, {
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
  const response = await apiFetch(`/api/emails/${id}/unarchive`, {
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
  const response = await apiFetch(`/api/emails/${id}/read`, {
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
  const response = await apiFetch(`/api/emails/${id}/unread`, {
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
  const response = await apiFetch(`/api/emails/${id}/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to reclassify email')
  return data
}

export async function generateReply(email, category) {
  const response = await apiFetch('/api/generate-reply', {
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
  const response = await apiFetch(`/api/emails/search?q=${encodeURIComponent(q)}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Search failed')
  return data
}

export async function fetchDraft(threadId) {
  const response = await apiFetch(`/api/drafts/${threadId}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch draft')
  return { content: data.content, originalAiDraft: data.originalAiDraft || null }
}

export async function saveDraft(threadId, content, originalAiDraft) {
  const response = await apiFetch(`/api/drafts/${threadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, originalAiDraft }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to save draft')
  }
}

export async function deleteDraft(threadId) {
  await apiFetch(`/api/drafts/${threadId}`, { method: 'DELETE' })
}

export async function fetchFolders() {
  const response = await apiFetch('/api/folders')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch folders')
  return data.folders
}

export async function createFolder(name) {
  const response = await apiFetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to create folder')
  return data.folder
}

export async function deleteFolder(id) {
  const response = await apiFetch(`/api/folders/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to delete folder')
  }
}

export async function assignFolder(threadId, folderId) {
  const response = await apiFetch(`/api/emails/${threadId}/folder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to assign folder')
  return data
}

export async function fetchLearnedBehaviors() {
  const r = await apiFetch('/api/learned-behaviors')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch learned behaviors')
  return d // { content, lastUpdated }
}

export async function saveLearnedBehaviors(content) {
  const r = await apiFetch('/api/learned-behaviors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to save') }
}

export async function fetchFeedback() {
  const response = await apiFetch('/api/feedback')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to fetch feedback')
  return data.entries
}

export async function logFeedback({ threadId, category, originalDraft, finalVersion }) {
  const response = await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, category, originalDraft, finalVersion }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to log feedback')
  return data
}

export async function updateFeedbackNotes(id, notes) {
  const response = await apiFetch(`/api/feedback/${id}/notes`, {
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
  const r = await apiFetch('/api/content/ideas')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch ideas')
  return d.ideas
}

export async function updateContentIdea(id, updates) {
  const r = await apiFetch(`/api/content/ideas/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update idea') }
}

export async function deleteContentIdea(id) {
  const r = await apiFetch(`/api/content/ideas/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete idea') }
}

export async function saveContentIdea(id) {
  const r = await apiFetch(`/api/content/ideas/${id}/save`, { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to save idea')
  return d
}

export async function fetchContentBriefs() {
  const r = await apiFetch('/api/content/briefs')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch briefs')
  return d.briefs
}

export async function fetchContentBrief(id) {
  const r = await apiFetch(`/api/content/briefs/${id}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Brief not found')
  return d.brief
}

export async function runContentBrief() {
  const r = await apiFetch('/api/content/run-brief', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to run brief')
  return d
}

export async function fetchContentTopics() {
  const r = await apiFetch('/api/content/topics')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch topics')
  return d.topics
}

export async function createContentTopic(keyword) {
  const r = await apiFetch('/api/content/topics', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to create topic')
  return d.topic
}

export async function updateContentTopic(id, updates) {
  const r = await apiFetch(`/api/content/topics/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update topic') }
}

export async function deleteContentTopic(id) {
  const r = await apiFetch(`/api/content/topics/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete topic') }
}

export async function fetchChannelStats() {
  const r = await apiFetch('/api/content/channel-stats')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch channel stats')
  return d  // returns { stats, configured, channelId, kerryConnected }
}

export async function fetchYouTubeChannels() {
  const r = await apiFetch('/api/content/youtube-channels')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch channels')
  return d
}

export async function lookupChannel(query) {
  const r = await apiFetch('/api/content/channel-lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Channel not found')
  return d.channels
}

export async function selectChannel(channelId) {
  const r = await apiFetch('/api/content/channel-select', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId }),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to save channel') }
}

export async function refreshChannelStats() {
  const r = await apiFetch('/api/content/channel-stats/refresh', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to refresh stats')
  return d
}

export async function fetchCompetitors() {
  const r = await apiFetch('/api/content/competitors')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch competitors')
  return d.competitors
}

export async function addCompetitor(competitor) {
  const r = await apiFetch('/api/content/competitors', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(competitor),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to add competitor')
  return d.competitor
}

export async function updateCompetitor(id, updates) {
  const r = await apiFetch(`/api/content/competitors/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update competitor') }
}

export async function deleteCompetitor(id) {
  const r = await apiFetch(`/api/content/competitors/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete competitor') }
}

// ─── Content Board ──────────────────────────────────────────────────────────────

export async function fetchContentCards() {
  const r = await apiFetch('/api/content/cards')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch cards')
  return d.cards
}

export async function createContentCard({ title, boardType, generateAI, ideaData, column }) {
  const r = await apiFetch('/api/content/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, boardType, generateAI, ideaData, column }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to create card')
  return d.card
}

export async function updateContentCard(id, updates) {
  const r = await apiFetch(`/api/content/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update card') }
}

export async function deleteContentCard(id) {
  const r = await apiFetch(`/api/content/cards/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete card') }
}

export async function regenerateCardSections(id, field) {
  const r = await apiFetch(`/api/content/cards/${id}/regenerate`, {
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
  const response = await apiFetch('/api/emails/send', {
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

export async function composeEmail({ fromAccount, toEmail, subject, body }) {
  const response = await apiFetch('/api/emails/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromAccount, toEmail, subject, body }),
  })
  const data = await response.json().catch(() => ({ error: 'Server error' }))
  if (!response.ok) throw new Error(data.error || 'Failed to send email')
  return data
}

export async function forwardEmail({ email, message, toEmail, fromAccount, note }) {
  const trimmedEmail = {
    id: email.id, threadId: email.threadId, from: email.from, to: email.to,
    name: email.name, subject: email.subject, account: email.account,
    bodyText: email.bodyText,
  }
  const trimmedMsg = message ? {
    from: message.from, senderName: message.senderName, name: message.name,
    to: message.to, subject: message.subject, bodyText: message.bodyText,
    timestamp: message.timestamp,
  } : null
  const response = await apiFetch('/api/emails/forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmedEmail, message: trimmedMsg, toEmail, fromAccount, note }),
  })
  const data = await response.json().catch(() => ({ error: 'Server error' }))
  if (!response.ok) throw new Error(data.error || 'Failed to forward email')
  return data
}

export async function triggerLearningRebuild() {
  const r = await apiFetch('/api/learning/run', { method: 'POST' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed') }
}

// ─── Payment Recovery ─────────────────────────────────────────────────────────

export async function fetchFailedPayments(status = 'failed') {
  const r = await apiFetch(`/api/payment-recovery/payments?status=${encodeURIComponent(status)}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch payments')
  return d.payments
}

export async function syncKajabi() {
  const r = await apiFetch('/api/payment-recovery/sync', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to sync')
  return d
}

export async function startRecoverySequence(paymentId) {
  const r = await apiFetch(`/api/payment-recovery/start/${paymentId}`, { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to start sequence')
  return d.sequence
}

export async function fetchRecoverySequence(sequenceId) {
  const r = await apiFetch(`/api/payment-recovery/sequences/${sequenceId}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch sequence')
  return d
}

export async function cancelRecoverySequence(sequenceId) {
  const r = await apiFetch(`/api/payment-recovery/sequences/${sequenceId}/cancel`, { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to cancel sequence')
  return d
}

export async function fetchRecoverySequences(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const r = await apiFetch(`/api/payment-recovery/sequences${qs}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch sequences')
  return d.sequences
}

// ─── Sales Analytics ──────────────────────────────────────────────────────────

export async function fetchSalesSummary({ from, to, product } = {}) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (product) qs.set('product', product)
  const r = await apiFetch(`/api/sales/summary?${qs.toString()}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch summary')
  return d
}

export async function fetchRevenueEntries({ source, from, to, product, limit = 100 } = {}) {
  const qs = new URLSearchParams()
  if (source) qs.set('source', source)
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  if (product) qs.set('product', product)
  if (limit) qs.set('limit', String(limit))
  const r = await apiFetch(`/api/sales/entries?${qs.toString()}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch entries')
  return d.entries
}

export async function fetchSalesProducts() {
  const r = await apiFetch('/api/sales/products')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch products')
  return d.products
}

export async function addRevenueEntry(entry) {
  const r = await apiFetch('/api/sales/entries', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to add entry')
  return d
}

export async function deleteRevenueEntry(id) {
  const r = await apiFetch(`/api/sales/entries/${id}`, { method: 'DELETE' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Failed to delete entry')
}

export async function backfillKajabi() {
  const r = await apiFetch('/api/sales/backfill-kajabi', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Backfill failed')
  return d
}

export async function backfillStripe(days = 90) {
  const r = await apiFetch('/api/sales/backfill-stripe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Stripe backfill failed')
  return d
}

export async function cleanupStripeDuplicates() {
  const r = await apiFetch('/api/sales/cleanup-stripe-duplicates', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Cleanup failed')
  return d
}

export async function repairKajabi() {
  const r = await apiFetch('/api/sales/repair-kajabi', { method: 'POST' })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Kajabi repair failed')
  return d
}

// ─── Business Reminders ───────────────────────────────────────────────────────

export async function fetchReminders(includeDone = false) {
  const r = await apiFetch(`/api/reminders${includeDone ? '?includeDone=true' : ''}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to fetch reminders')
  return d.reminders
}

export async function createReminder({ title, notes, due_date }) {
  const r = await apiFetch('/api/reminders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, notes, due_date }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to create reminder')
  return d.reminder
}

export async function updateReminder(id, updates) {
  const r = await apiFetch(`/api/reminders/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to update reminder') }
}

export async function deleteReminder(id) {
  const r = await apiFetch(`/api/reminders/${id}`, { method: 'DELETE' })
  if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to delete reminder') }
}

// ─── Live Event Info ──────────────────────────────────────────────────────────

export async function fetchLiveEvent() {
  const r = await apiFetch('/api/live-event')
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to load live event info')
  return d // { info, phase }
}

export async function saveLiveEvent(fields) {
  const r = await apiFetch('/api/live-event', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to save live event info')
  return d // { info, phase }
}

// ─── Customer Profiles ────────────────────────────────────────────────────────

export async function fetchCustomerProfile(email, threadId) {
  const qs = threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''
  const r = await apiFetch(`/api/customer-profile/${encodeURIComponent(email)}${qs}`)
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to load customer profile')
  return d // { email, profile, purchases, threads }
}

export async function saveCustomerProfile(email, fields) {
  const r = await apiFetch(`/api/customer-profile/${encodeURIComponent(email)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d.error || 'Failed to save customer profile')
  return d.profile
}
