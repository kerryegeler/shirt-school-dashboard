import 'dotenv/config'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import { google } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { WebClient as SlackWebClient } from '@slack/web-api'
import fs from 'fs'
import path from 'path'


const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── Dashboard session (signed HTTP-only cookie, no DB needed) ────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production'
const SESSION_COOKIE = 'ss_session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60

function getCookie(req, name) {
  const header = req.headers.cookie || ''
  const match = header.split(';').find((c) => c.trim().startsWith(name + '='))
  return match ? match.trim().slice(name.length + 1) : null
}

function createSessionToken(email) {
  const ts = Date.now()
  const payload = `${email}:${ts}`
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
  return `${payload}:${sig}`
}

function verifySessionToken(raw) {
  if (!raw) return null
  try {
    const lastColon = raw.lastIndexOf(':')
    if (lastColon === -1) return null
    const payload = raw.slice(0, lastColon)
    const sig = raw.slice(lastColon + 1)
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
    if (sig.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const tsColon = payload.lastIndexOf(':')
    const email = payload.slice(0, tsColon)
    const ts = parseInt(payload.slice(tsColon + 1))
    if (!email.includes('@') || isNaN(ts)) return null
    if (Date.now() - ts > SESSION_MAX_AGE_MS) return null
    return { email }
  } catch {
    return null
  }
}

function setSessionCookie(res, email) {
  const value = createSessionToken(email)
  const secureFlag = process.env.RAILWAY_PUBLIC_URL ? 'Secure; ' : ''
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_MAX_AGE_S}; Path=/; HttpOnly; ${secureFlag}SameSite=Lax`)
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`)
}

function getDashboardUser(req) {
  return verifySessionToken(getCookie(req, SESSION_COOKIE))
}

// Only @shirtschool.com accounts may access the dashboard
const ALLOWED_DOMAIN = 'shirtschool.com'

const DASHBOARD_PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/me',
  '/api/auth/dashboard-login',
  '/api/auth/dashboard-complete',
  '/api/auth/dashboard-logout',
  '/api/slack/actions',  // Called by Slack, not the dashboard user
  '/api/slack/events',   // Slack Event Subscriptions
])

function requireDashboardAuth(req, res, next) {
  if (!req.path.startsWith('/api')) return next()
  if (DASHBOARD_PUBLIC_PATHS.has(req.path)) return next()
  const user = getDashboardUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized', requiresLogin: true })
  req.dashboardUser = user
  next()
}

app.use(requireDashboardAuth)

// ─── Hardcoded target accounts ───────────────────────────────────────────────
// The app ALWAYS fetches from and sends on behalf of these two accounts only.
const TARGET_ACCOUNTS = ['support@shirtschool.com', 'kerry@shirtschool.com']
const REDIRECT_URI = process.env.REDIRECT_URI ||
  (process.env.RAILWAY_PUBLIC_URL ? process.env.RAILWAY_PUBLIC_URL + '/auth/callback' : null) ||
  'http://localhost:5173/auth/callback'
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/youtube.readonly',
  'openid',
  'email',
  'profile',
]

// ─── Anthropic ────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null

// ─── Slack client ──────────────────────────────────────────────────────────────
const slackClient = process.env.SLACK_BOT_TOKEN ? new SlackWebClient(process.env.SLACK_BOT_TOKEN) : null

// ─── In-memory caches (hydrated at startup) ───────────────────────────────────
// These let buildThreadObject stay synchronous while Supabase is the source of truth.
let categoryOverridesCache = {}   // { [threadId]: category }
let folderDataCache = { folders: [], assignments: {} }  // { folders: [], assignments: { [threadId]: folderId } }
let savedDraftsCache = new Set()  // Set of threadIds that have a saved draft
let slackNotifiedCache = new Set() // Set of threadIds already posted to Slack
const approvalTimers = new Map()   // threadId → setTimeout ref (for 5-min send delay)
const DRAFTS_PATH = path.resolve('.drafts.json')

// ─── Category override storage ────────────────────────────────────────────────
const CATEGORIES_PATH = path.resolve('.categories.json')

function loadCategoryOverrides() {
  return categoryOverridesCache
}

function saveCategoryOverride(id, category) {
  categoryOverridesCache[id] = category
  if (supabase) {
    supabase.from('category_overrides')
      .upsert({ thread_id: id, category, updated_at: new Date().toISOString() })
      .then(() => {})
      .catch((err) => console.error('Supabase category save error:', err.message))
  } else {
    fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(categoryOverridesCache, null, 2))
  }
}

// ─── Folder storage ────────────────────────────────────────────────────────────
const FOLDERS_PATH = path.resolve('.folders.json')

function loadFolders() {
  return folderDataCache
}

// ─── Per-account token storage ────────────────────────────────────────────────
function tokenPath(account) {
  return path.resolve(`.tokens-${account.split('@')[0]}.json`)
}

async function loadTokens(account) {
  if (supabase) {
    const { data, error } = await supabase.from('gmail_tokens').select('tokens').eq('account', account).single()
    if (!error && data?.tokens) return data.tokens
    return null
  }
  try {
    const p = tokenPath(account)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {}
  return null
}

function saveTokens(account, tokens) {
  if (supabase) {
    supabase.from('gmail_tokens')
      .upsert({ account, tokens, updated_at: new Date().toISOString() })
      .then(() => {})
      .catch((err) => console.error('Supabase token save error:', err.message))
  } else {
    fs.writeFileSync(tokenPath(account), JSON.stringify(tokens, null, 2))
  }
}

function clearTokens(account) {
  if (supabase) {
    supabase.from('gmail_tokens').delete().eq('account', account)
      .then(() => {})
      .catch((err) => console.error('Supabase token clear error:', err.message))
  } else {
    const p = tokenPath(account)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}

// ─── One OAuth2 client per target account ────────────────────────────────────
const clients = {}

for (const account of TARGET_ACCOUNTS) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )
  // Tokens loaded async at startup (see init() below)
  client.on('tokens', (newTokens) => {
    // Merge with current in-memory credentials to avoid losing refresh_token
    const merged = { ...(client.credentials || {}), ...newTokens }
    saveTokens(account, merged)
    client.setCredentials(merged)
  })
  clients[account] = client
}

function hasTokens(account) {
  const creds = clients[account]?.credentials
  return !!(creds && (creds.access_token || creds.refresh_token))
}

function connectedAccounts() {
  return TARGET_ACCOUNTS.filter(hasTokens)
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (connectedAccounts().length === 0) {
    return res.status(401).json({ error: 'Not authenticated', needsAuth: true })
  }
  next()
}

// ─── Gmail parsing helpers ────────────────────────────────────────────────────
function getHeader(headers, name) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

function decodeBase64(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractTextBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) {
    const content = decodeBase64(payload.body.data)
    return payload.mimeType === 'text/html' ? stripHtml(content) : content
  }
  if (!payload.parts) return ''
  const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain')
  if (plainPart?.body?.data) return decodeBase64(plainPart.body.data)
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const nested = extractTextBody(part)
      if (nested) return nested
    }
  }
  const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
  if (htmlPart?.body?.data) return stripHtml(decodeBase64(htmlPart.body.data))
  return ''
}

function extractHtmlBody(payload) {
  if (!payload) return null
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64(payload.body.data)
  }
  if (!payload.parts) return null
  const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
  if (htmlPart?.body?.data) return decodeBase64(htmlPart.body.data)
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const nested = extractHtmlBody(part)
      if (nested) return nested
    }
  }
  return null
}

function findAttachmentParts(payload, results = []) {
  if (!payload) return results
  const contentId = getHeader(payload.headers || [], 'Content-ID')?.replace(/[<>]/g, '')
  const disposition = getHeader(payload.headers || [], 'Content-Disposition') || ''
  if (payload.body?.attachmentId) {
    results.push({
      attachmentId: payload.body.attachmentId,
      mimeType: payload.mimeType || 'application/octet-stream',
      filename: payload.filename || '',
      contentId: contentId || null,
      isInline: disposition.toLowerCase().startsWith('inline') || !!contentId,
      size: payload.body.size || 0,
    })
  }
  if (payload.parts) {
    for (const part of payload.parts) findAttachmentParts(part, results)
  }
  return results
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Replace cid: src references in HTML with API URLs so iframe can load them
function replaceCidReferences(html, attachments, messageId, account) {
  for (const att of attachments) {
    if (att.contentId && att.isInline) {
      const apiUrl =
        `/api/emails/${messageId}/attachment/${att.attachmentId}` +
        `?type=${encodeURIComponent(att.mimeType)}&account=${encodeURIComponent(account)}`
      const pattern = new RegExp(`cid:${escapeRegex(att.contentId)}(\\S*)?`, 'gi')
      html = html.replace(pattern, apiUrl)
    }
  }
  return html
}

// ─── Email categorization + smart sender ─────────────────────────────────────
function categorizeEmail({ to, subject, body }) {
  const toLower = (to || '').toLowerCase()
  const combined = ((subject || '') + ' ' + (body || '').substring(0, 600)).toLowerCase()

  if (toLower.includes('support@shirtschool')) return 'student_support'

  const sponsorKeywords = [
    'partnership', 'partner', 'sponsor', 'collaboration', 'collab',
    'podcast', 'affiliate', 'advertis', 'influencer', 'promotion',
    'brand deal', 'paid opportunity', 'campaign', 'feature your',
  ]
  if (sponsorKeywords.some((kw) => combined.includes(kw))) return 'sponsorship'

  const supportKeywords = [
    'course', 'module', 'video', 'lesson', 'help', 'question', 'issue',
    'problem', 'error', 'access', 'login', 'purchase', 'refund',
    'printful', 'printify', 'shopify', 'etsy', 'how do i', 'how to',
    'confused', 'beginner', 'just started',
  ]
  if (supportKeywords.some((kw) => combined.includes(kw))) return 'student_support'

  return 'general'
}

// Which Shirt School address should reply?
function defaultFromAccount(category, subject, body) {
  if (category === 'student_support') return 'support@shirtschool.com'
  if (category === 'sponsorship') return 'support@shirtschool.com'
  // General: if addressed personally to Kerry, reply as Kerry
  const combined = ((subject || '') + ' ' + (body || '').substring(0, 300)).toLowerCase()
  const personal = ['hi kerry', 'hey kerry', 'dear kerry', 'hello kerry', 'kerry,']
  if (personal.some((g) => combined.includes(g))) return 'kerry@shirtschool.com'
  return 'kerry@shirtschool.com'
}

// Build a single message object (one item in a thread's messages array)
function buildMessageObject(message, account) {
  if (!message.payload) return null
  const headers = message.payload.headers || []
  const from = getHeader(headers, 'From')
  const to = getHeader(headers, 'To')
  const subject = getHeader(headers, 'Subject')
  const messageId = getHeader(headers, 'Message-ID')

  const fromMatch = from.match(/^"?(.+?)"?\s*<(.+?)>$/)
  const senderName = fromMatch ? fromMatch[1].trim() : from.split('@')[0]
  const fromEmail = fromMatch ? fromMatch[2].trim() : from.trim()
  const isOutgoing = TARGET_ACCOUNTS.some((a) => fromEmail.toLowerCase() === a.toLowerCase())

  const bodyText = extractTextBody(message.payload)
  const attachments = findAttachmentParts(message.payload)
  let bodyHtml = extractHtmlBody(message.payload)
  if (bodyHtml) bodyHtml = replaceCidReferences(bodyHtml, attachments, message.id, account)

  return {
    id: message.id,
    account,
    messageId,
    from: fromEmail,
    senderName,
    name: isOutgoing ? 'You' : senderName,
    to,
    subject: subject || '(no subject)',
    bodyText,
    bodyHtml,
    isOutgoing,
    preview: message.snippet || bodyText.substring(0, 140).replace(/\n/g, ' ').trim(),
    timestamp: new Date(parseInt(message.internalDate)).toISOString(),
    labelIds: message.labelIds || [],
    attachments: attachments.filter((a) => !a.isInline),
  }
}

// Build a thread object with all messages and derived status
function buildThreadObject(thread, account) {
  const messages = (thread.messages || [])
    .map((msg) => buildMessageObject(msg, account))
    .filter(Boolean)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  if (!messages.length) return null

  const firstMsg = messages[0]
  const latestMsg = messages[messages.length - 1]
  // Latest message from the other person (not us)
  const latestIncoming = [...messages].reverse().find((m) => !m.isOutgoing) || firstMsg

  const subject = firstMsg.subject

  // Category: use override by threadId, fall back to auto-detect
  const overrides = loadCategoryOverrides()
  const category = overrides[thread.id] || categorizeEmail({
    to: firstMsg.to,
    subject,
    body: firstMsg.bodyText,
  })

  // Thread status
  const hasUnread = messages.some((m) => m.labelIds.includes('UNREAD'))
  const hasOurReply = messages.some((m) => m.isOutgoing)
  const isLastFromUs = latestMsg.isOutgoing
  let status = 'read'
  if (hasUnread) status = 'unread'
  else if (isLastFromUs) status = 'awaiting_reply'
  else if (hasOurReply) status = 'replied'

  // Full conversation text for AI context
  const bodyText = messages
    .map((m) => `[${m.isOutgoing ? 'Sent' : 'Received'} — ${new Date(m.timestamp).toLocaleDateString()}]\n${m.bodyText}`)
    .join('\n\n---\n\n')

  const folderData = loadFolders()
  const folderId = folderData.assignments[thread.id] || null

  return {
    id: thread.id,
    threadId: thread.id,
    account,
    accounts: [account],
    category,
    folderId,
    hasDraft: savedDraftsCache.has(thread.id),
    defaultFrom: defaultFromAccount(category, subject, firstMsg.bodyText),
    status,
    read: !hasUnread,
    subject,
    from: latestIncoming.from,
    name: latestIncoming.senderName,
    to: firstMsg.to,
    messageId: latestIncoming.messageId, // for In-Reply-To header
    preview: latestMsg.preview,
    timestamp: latestMsg.timestamp,
    bodyText,
    bodyHtml: null, // rendered per-message in thread view
    messages,
    attachments: latestIncoming.attachments,
  }
}

function buildReplyRaw({ from, to, subject, inReplyTo, references, body }) {
  const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
  return Buffer.from(
    [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${reSubject}`,
      `In-Reply-To: ${inReplyTo}`,
      `References: ${references || inReplyTo}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\r\n')
  ).toString('base64url')
}

// ─── Dashboard auth routes ────────────────────────────────────────────────────

// Step 1: redirect to Google with minimal scopes (openid + email only)
app.get('/api/auth/dashboard-login', (req, res) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )
  res.redirect(client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state: 'dashboard',
    prompt: 'select_account',
  }))
})

// Step 2: frontend posts code here after the OAuth callback
app.post('/api/auth/dashboard-complete', async (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Missing authorization code' })
  try {
    const tempClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    )
    const { tokens } = await tempClient.getToken(code)
    tempClient.setCredentials(tokens)
    const { data: userInfo } = await google.oauth2({ version: 'v2', auth: tempClient }).userinfo.get()
    const email = userInfo.email.toLowerCase()
    if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
      return res.status(403).json({
        error: `Access denied. Only @${ALLOWED_DOMAIN} accounts can access this dashboard. You signed in as ${email}.`,
      })
    }
    setSessionCookie(res, email)
    res.json({ success: true, email })
  } catch (error) {
    console.error('Dashboard login error:', error.message)
    res.status(500).json({ error: 'Sign-in failed. Please try again.' })
  }
})

// Returns the current logged-in dashboard user (or 401)
app.get('/api/auth/me', (req, res) => {
  const user = getDashboardUser(req)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  res.json({ user })
})

// Sign out of dashboard
app.post('/api/auth/dashboard-logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ success: true })
})

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.get('/api/auth/google', (req, res) => {
  const account = req.query.account // optional — if provided, hints which account to use
  const anyClient = clients[TARGET_ACCOUNTS[0]]
  const authOptions = {
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state: account || 'auto', // echoed back in redirect; 'auto' means server will detect
  }
  if (account && TARGET_ACCOUNTS.includes(account)) {
    authOptions.login_hint = account
  }
  res.redirect(anyClient.generateAuthUrl(authOptions))
})

app.post('/api/auth/exchange', async (req, res) => {
  const { code, expectedAccount } = req.body
  if (!code) return res.status(400).json({ error: 'Missing authorization code' })
  try {
    // Use a temp client to exchange the code and detect which account signed in
    const tempClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      REDIRECT_URI
    )
    const { tokens } = await tempClient.getToken(code)
    tempClient.setCredentials(tokens)

    const { data: userInfo } = await google.oauth2({ version: 'v2', auth: tempClient }).userinfo.get()
    const email = userInfo.email.toLowerCase()

    if (!TARGET_ACCOUNTS.includes(email)) {
      return res.status(400).json({
        error: `${email} is not an authorized Shirt School account. Please sign in as support@shirtschool.com or kerry@shirtschool.com.`,
      })
    }

    if (expectedAccount && expectedAccount !== 'auto' && email !== expectedAccount.toLowerCase()) {
      return res.status(400).json({
        error: `You signed in as ${email} instead of ${expectedAccount}. Please try again and select the correct Google account.`,
      })
    }

    const existing = await loadTokens(email) || {}
    const merged = { ...existing, ...tokens }
    saveTokens(email, merged)
    clients[email].setCredentials(merged)

    res.json({ success: true, email })
  } catch (error) {
    console.error('Token exchange error:', error.message)
    res.status(500).json({ error: 'Failed to complete authorization.' })
  }
})

app.get('/api/auth/status', async (_req, res) => {
  const accounts = {}
  for (const account of TARGET_ACCOUNTS) {
    if (!hasTokens(account)) { accounts[account] = { connected: false }; continue }
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: clients[account] })
      const { data } = await oauth2.userinfo.get()
      accounts[account] = { connected: true, email: data.email }
    } catch {
      accounts[account] = { connected: false }
    }
  }
  res.json({ accounts, anyConnected: Object.values(accounts).some((a) => a.connected) })
})

app.post('/api/auth/logout', (req, res) => {
  const account = req.query.account
  const targets = account && TARGET_ACCOUNTS.includes(account) ? [account] : TARGET_ACCOUNTS
  for (const acc of targets) {
    clients[acc].revokeCredentials().catch(() => {})
    clients[acc].setCredentials({})
    clearTokens(acc)
  }
  res.json({ success: true })
})

// ─── Gmail routes ─────────────────────────────────────────────────────────────

// Shared dedup helper
function deduplicateThreads(threadsByAccount) {
  const threadMap = new Map()
  for (const thread of threadsByAccount.flat()) {
    if (threadMap.has(thread.id)) {
      const existing = threadMap.get(thread.id)
      const existingMsgIds = new Set(existing.messages.map((m) => m.messageId || m.id))
      const newMsgs = thread.messages.filter((m) => !existingMsgIds.has(m.messageId || m.id))
      existing.messages = [...existing.messages, ...newMsgs]
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      if (!existing.accounts.includes(thread.account)) existing.accounts.push(thread.account)
      const latest = existing.messages[existing.messages.length - 1]
      existing.timestamp = latest.timestamp
      existing.preview = latest.preview
    } else {
      threadMap.set(thread.id, thread)
    }
  }
  return [...threadMap.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

app.get('/api/emails', requireAuth, async (req, res) => {
  const { archived, pageTokens: pageTokensParam } = req.query
  let pageTokens = {}
  try { if (pageTokensParam) pageTokens = JSON.parse(pageTokensParam) } catch {}
  const connected = connectedAccounts()
  try {
    let totalEstimate = 0
    const nextPageTokens = {}
    const threadsByAccount = await Promise.all(
      connected.map(async (account) => {
        const gmail = google.gmail({ version: 'v1', auth: clients[account] })
        const q = archived === 'true' ? '-in:inbox -in:trash -in:spam -in:draft' : 'in:inbox'
        const listRes = await gmail.users.threads.list({
          userId: 'me', maxResults: 25, q,
          ...(pageTokens[account] ? { pageToken: pageTokens[account] } : {}),
        })
        totalEstimate += listRes.data.resultSizeEstimate || 0
        if (listRes.data.nextPageToken) nextPageTokens[account] = listRes.data.nextPageToken
        if (!listRes.data.threads?.length) return []
        const threads = await Promise.all(
          listRes.data.threads.map((t) =>
            gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' }).then((r) => r.data)
          )
        )
        return threads.map((t) => buildThreadObject(t, account)).filter(Boolean)
      })
    )
    const emails = deduplicateThreads(threadsByAccount)
    res.json({
      emails,
      nextPageTokens: Object.keys(nextPageTokens).length ? nextPageTokens : null,
      totalEstimate,
    })
  } catch (error) {
    console.error('Gmail fetch error:', error.message)
    res.status(error.code === 401 ? 401 : 500).json({ error: 'Failed to fetch emails from Gmail.' })
  }
})

// ─── Gmail search ──────────────────────────────────────────────────────────────

app.get('/api/emails/search', requireAuth, async (req, res) => {
  const { q } = req.query
  if (!q?.trim()) return res.json({ emails: [] })
  const connected = connectedAccounts()
  try {
    const threadsByAccount = await Promise.all(
      connected.map(async (account) => {
        const gmail = google.gmail({ version: 'v1', auth: clients[account] })
        const listRes = await gmail.users.threads.list({ userId: 'me', maxResults: 50, q: q.trim() })
        if (!listRes.data.threads?.length) return []
        const threads = await Promise.all(
          listRes.data.threads.map((t) =>
            gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' }).then((r) => r.data)
          )
        )
        return threads.map((t) => buildThreadObject(t, account)).filter(Boolean)
      })
    )
    const emails = deduplicateThreads(threadsByAccount)
    res.json({ emails })
  } catch (error) {
    console.error('Gmail search error:', error.message)
    res.status(500).json({ error: 'Search failed. Try again.' })
  }
})

// Archive all inbox threads across all connected accounts using Gmail batchModify
app.post('/api/emails/archive-all', requireAuth, async (req, res) => {
  const accounts = connectedAccounts()
  if (!accounts.length) return res.status(401).json({ error: 'No accounts connected' })

  let total = 0
  try {
    // Build set of thread IDs that are assigned to a folder — skip these
    const folderedThreadIds = new Set(Object.keys(folderDataCache.assignments))

    for (const account of accounts) {
      const gmail = google.gmail({ version: 'v1', auth: clients[account] })
      let pageToken = undefined
      const msgIds = []

      // Collect inbox message IDs, skipping messages that belong to foldered threads
      do {
        const r = await gmail.users.messages.list({
          userId: 'me', q: 'in:inbox', maxResults: 500, ...(pageToken && { pageToken }),
        })
        for (const m of r.data.messages || []) {
          if (!folderedThreadIds.has(m.threadId)) msgIds.push(m.id)
        }
        pageToken = r.data.nextPageToken
      } while (pageToken)

      // batchModify removes INBOX label from up to 1000 messages per call
      for (let i = 0; i < msgIds.length; i += 1000) {
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: { ids: msgIds.slice(i, i + 1000), removeLabelIds: ['INBOX'] },
        })
      }
      total += msgIds.length
    }
    res.json({ success: true, archived: total })
  } catch (err) {
    console.error('Archive-all error:', err.message)
    res.status(500).json({ error: 'Failed to archive all emails' })
  }
})

// Fetch a single fresh thread by ID (for real-time sync on click)
app.get('/api/emails/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { account } = req.query
  const connected = connectedAccounts()
  const accountsToTry = account && connected.includes(account) ? [account] : connected
  for (const acct of accountsToTry) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: clients[acct] })
      const threadRes = await gmail.users.threads.get({ userId: 'me', id, format: 'full' })
      const thread = buildThreadObject(threadRes.data, acct)
      if (thread) return res.json({ thread })
    } catch (err) {
      if (err.code !== 404) console.error(`Thread ${id} fetch error for ${acct}:`, err.message)
    }
  }
  res.status(404).json({ error: 'Thread not found' })
})

// Serve inline image attachments for HTML email rendering in the iframe
app.get('/api/emails/:messageId/attachment/:attachmentId', requireAuth, async (req, res) => {
  const { messageId, attachmentId } = req.params
  const account = req.query.account
  const mimeType = req.query.type || 'application/octet-stream'
  const client = account && hasTokens(account) ? clients[account] : clients[connectedAccounts()[0]]
  if (!client) return res.status(401).send('Not authenticated')

  const gmail = google.gmail({ version: 'v1', auth: client })
  try {
    const { data } = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId })
    const buffer = Buffer.from(data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    res.set('Content-Type', mimeType)
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(buffer)
  } catch (error) {
    console.error('Attachment error:', error.message)
    res.status(404).send('Not found')
  }
})

app.post('/api/emails/send', requireAuth, async (req, res) => {
  const { email, draft, fromAccount, toEmail } = req.body
  if (!email || !draft) return res.status(400).json({ error: 'Missing email or draft' })

  const sendFrom =
    fromAccount && TARGET_ACCOUNTS.includes(fromAccount) && hasTokens(fromAccount)
      ? fromAccount
      : email.account

  if (!hasTokens(sendFrom)) {
    return res.status(400).json({ error: `${sendFrom} is not connected. Connect it first.` })
  }

  // Use override recipient if provided, otherwise fall back to the original sender
  const recipientAddress = toEmail?.trim() || email.from
  const isOverride = toEmail?.trim() && toEmail.trim() !== email.from
  const toField = isOverride ? recipientAddress : `${email.name} <${email.from}>`

  const gmail = google.gmail({ version: 'v1', auth: clients[sendFrom] })
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: clients[sendFrom] })
    const { data: userInfo } = await oauth2.userinfo.get()

    const raw = buildReplyRaw({
      from: `${userInfo.name || sendFrom} <${sendFrom}>`,
      to: toField,
      subject: email.subject || '(no subject)',
      inReplyTo: email.messageId,
      references: email.messageId,
      body: draft,
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: email.threadId } })
    res.json({ success: true, sentFrom: sendFrom })
  } catch (error) {
    console.error('Gmail send error:', error.message, error.response?.data)
    const isAuthError = error.message?.includes('invalid_grant') || error.message?.includes('Invalid Credentials') || error.response?.status === 401
    if (isAuthError) {
      // Clear stale tokens so UI prompts reconnect
      await clearTokens(sendFrom)
      clients[sendFrom].setCredentials({})
      return res.status(401).json({ error: `Gmail token expired for ${sendFrom}. Please reconnect the account.` })
    }
    res.status(500).json({ error: `Failed to send: ${error.message}` })
  }
})

// ─── Email label routes ───────────────────────────────────────────────────────

app.patch('/api/emails/:id/read', requireAuth, async (req, res) => {
  const { id } = req.params
  const { account } = req.body
  const client = (account && hasTokens(account)) ? clients[account] : clients[connectedAccounts()[0]]
  if (!client) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const gmail = google.gmail({ version: 'v1', auth: client })
    await gmail.users.threads.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } })
    res.json({ success: true })
  } catch (error) {
    console.error('Mark read error:', error.message)
    res.status(500).json({ error: 'Failed to mark as read' })
  }
})

app.patch('/api/emails/:id/unread', requireAuth, async (req, res) => {
  const { id } = req.params
  const { account } = req.body
  const client = (account && hasTokens(account)) ? clients[account] : clients[connectedAccounts()[0]]
  if (!client) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const gmail = google.gmail({ version: 'v1', auth: client })
    await gmail.users.threads.modify({ userId: 'me', id, requestBody: { addLabelIds: ['UNREAD'] } })
    res.json({ success: true })
  } catch (error) {
    console.error('Mark unread error:', error.message)
    res.status(500).json({ error: 'Failed to mark as unread' })
  }
})

app.patch('/api/emails/:id/archive', requireAuth, async (req, res) => {
  const { id } = req.params
  const { account } = req.body
  const client = (account && hasTokens(account)) ? clients[account] : clients[connectedAccounts()[0]]
  if (!client) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const gmail = google.gmail({ version: 'v1', auth: client })
    await gmail.users.threads.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['INBOX'] } })
    res.json({ success: true })
  } catch (error) {
    console.error('Archive error:', error.message)
    res.status(500).json({ error: 'Failed to archive' })
  }
})

app.patch('/api/emails/:id/unarchive', requireAuth, async (req, res) => {
  const { id } = req.params
  const { account } = req.body
  const client = (account && hasTokens(account)) ? clients[account] : clients[connectedAccounts()[0]]
  if (!client) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const gmail = google.gmail({ version: 'v1', auth: client })
    await gmail.users.threads.modify({ userId: 'me', id, requestBody: { addLabelIds: ['INBOX'] } })
    res.json({ success: true })
  } catch (error) {
    console.error('Unarchive error:', error.message)
    res.status(500).json({ error: 'Failed to move to inbox' })
  }
})

app.patch('/api/emails/:id/category', requireAuth, (req, res) => {
  const { id } = req.params
  const { category } = req.body
  const valid = ['student_support', 'sponsorship', 'general']
  if (!valid.includes(category)) return res.status(400).json({ error: 'Invalid category' })
  saveCategoryOverride(id, category)
  // Return the new defaultFrom so the frontend can update it
  const defaultFrom = defaultFromAccount(category, '', '')
  res.json({ success: true, category, defaultFrom })
})

// ─── Folder routes ────────────────────────────────────────────────────────────

app.get('/api/folders', requireAuth, (req, res) => {
  const data = loadFolders()
  const counts = {}
  for (const folderId of Object.values(data.assignments)) {
    counts[folderId] = (counts[folderId] || 0) + 1
  }
  res.json({ folders: data.folders.map((f) => ({ ...f, count: counts[f.id] || 0 })) })
})

app.post('/api/folders', requireAuth, async (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' })
  const folder = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() }
  if (supabase) {
    const { error } = await supabase.from('folders')
      .insert({ id: folder.id, name: folder.name, created_at: folder.createdAt })
    if (error) return res.status(500).json({ error: 'Failed to create folder' })
  } else {
    fs.writeFileSync(FOLDERS_PATH, JSON.stringify(
      { ...folderDataCache, folders: [...folderDataCache.folders, folder] }, null, 2))
  }
  folderDataCache.folders.push(folder)
  res.json({ folder })
})

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  if (supabase) {
    // ON DELETE CASCADE on folder_assignments handles cleanup
    const { error } = await supabase.from('folders').delete().eq('id', id)
    if (error) return res.status(500).json({ error: 'Failed to delete folder' })
    // Remove from assignments cache
    for (const [threadId, folderId] of Object.entries(folderDataCache.assignments)) {
      if (folderId === id) delete folderDataCache.assignments[threadId]
    }
  } else {
    for (const [threadId, folderId] of Object.entries(folderDataCache.assignments)) {
      if (folderId === id) delete folderDataCache.assignments[threadId]
    }
    fs.writeFileSync(FOLDERS_PATH, JSON.stringify(folderDataCache, null, 2))
  }
  folderDataCache.folders = folderDataCache.folders.filter((f) => f.id !== id)
  res.json({ success: true })
})

app.patch('/api/emails/:id/folder', requireAuth, async (req, res) => {
  const { id } = req.params
  const { folderId } = req.body
  if (supabase) {
    if (folderId) {
      const { error } = await supabase.from('folder_assignments')
        .upsert({ thread_id: id, folder_id: folderId, updated_at: new Date().toISOString() })
      if (error) return res.status(500).json({ error: 'Failed to assign folder' })
    } else {
      const { error } = await supabase.from('folder_assignments').delete().eq('thread_id', id)
      if (error) return res.status(500).json({ error: 'Failed to remove folder assignment' })
    }
  }
  if (folderId) {
    folderDataCache.assignments[id] = folderId
  } else {
    delete folderDataCache.assignments[id]
  }
  if (!supabase) fs.writeFileSync(FOLDERS_PATH, JSON.stringify(folderDataCache, null, 2))
  res.json({ success: true, folderId: folderId || null })
})

// ─── Draft routes ─────────────────────────────────────────────────────────────

app.get('/api/drafts/:threadId', requireAuth, async (req, res) => {
  const { threadId } = req.params
  if (supabase) {
    const { data } = await supabase.from('saved_drafts').select('content').eq('thread_id', threadId).single()
    return res.json({ content: data?.content || null })
  }
  try {
    if (fs.existsSync(DRAFTS_PATH)) {
      const drafts = JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf8'))
      return res.json({ content: drafts[threadId] || null })
    }
  } catch {}
  res.json({ content: null })
})

app.put('/api/drafts/:threadId', requireAuth, async (req, res) => {
  const { threadId } = req.params
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Draft content required' })
  savedDraftsCache.add(threadId)
  if (supabase) {
    const { error } = await supabase.from('saved_drafts')
      .upsert({ thread_id: threadId, content, updated_at: new Date().toISOString() })
    if (error) return res.status(500).json({ error: 'Failed to save draft' })
  } else {
    try {
      const drafts = fs.existsSync(DRAFTS_PATH) ? JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf8')) : {}
      drafts[threadId] = content
      fs.writeFileSync(DRAFTS_PATH, JSON.stringify(drafts, null, 2))
    } catch {}
  }
  res.json({ success: true })
})

app.delete('/api/drafts/:threadId', requireAuth, async (req, res) => {
  const { threadId } = req.params
  savedDraftsCache.delete(threadId)
  if (supabase) {
    await supabase.from('saved_drafts').delete().eq('thread_id', threadId)
  } else {
    try {
      if (fs.existsSync(DRAFTS_PATH)) {
        const drafts = JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf8'))
        delete drafts[threadId]
        fs.writeFileSync(DRAFTS_PATH, JSON.stringify(drafts, null, 2))
      }
    } catch {}
  }
  res.json({ success: true })
})

// ─── AI routes ────────────────────────────────────────────────────────────────

const KERRY_BRAIN_PATH = path.resolve('kerry-brain.md')

function loadKerryBrain() {
  try {
    if (fs.existsSync(KERRY_BRAIN_PATH)) return fs.readFileSync(KERRY_BRAIN_PATH, 'utf8')
  } catch {}
  return ''
}

const PERSONA_NAMES = {
  student_support: 'Shirt School Support Team',
  sponsorship: 'Kerry',
  general: 'Kerry',
}

// ─── Feedback helpers ─────────────────────────────────────────────────────────

function computeDiffSummary(original, final) {
  const ow = original.trim().split(/\s+/)
  const fw = final.trim().split(/\s+/)
  const owSet = new Set(ow)
  const fwSet = new Set(fw)
  const added = fw.filter((w) => !owSet.has(w)).length
  const removed = ow.filter((w) => !fwSet.has(w)).length
  return `${ow.length}→${fw.length} words; ~${added} added, ~${removed} removed`
}

// ─── Slack workflow helpers ───────────────────────────────────────────────────

async function generateDraftForSlack(thread) {
  const kerryBrain = loadKerryBrain()
  const category = thread.category
  const personaName = PERSONA_NAMES[category] || 'Kerry'

  const systemPrompt = `You are an AI email assistant for Shirt School. Draft a reply and assess the email.
${kerryBrain ? `--- BEGIN CONTEXT ---\n${kerryBrain}\n--- END CONTEXT ---\n` : ''}
Return ONLY valid JSON (no markdown fences, no explanation) in exactly this format:
{"draft":"full reply body","summary":"2-3 sentences about what this email needs","confidence":"high","confidence_reason":null}`

  const userPrompt = `Category: ${category}. Reply as ${personaName}.

From: ${thread.name} <${thread.from}>
Subject: ${thread.subject}
---
${(thread.bodyText || '').slice(0, 2000)}
---
Return JSON only.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content[0].text.trim()
  // Strip any accidental markdown fences
  const clean = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  return { ...JSON.parse(clean), persona: personaName }
}

function confidenceEmoji(c) {
  return { high: '🟢', medium: '🟡', low: '🔴' }[c] || '🟡'
}

function buildSlackBlocks(thread, draft, summary, confidence, confidenceReason, status, checkIfNeeded = false) {
  const truncDraft = draft.length > 2800 ? draft.slice(0, 2800) + '…' : draft
  const dashUrl = process.env.RAILWAY_PUBLIC_URL || 'http://localhost:5173'
  const capConf = (confidence || 'medium').charAt(0).toUpperCase() + (confidence || 'medium').slice(1)
  const headerText = checkIfNeeded ? '📧 New Email — Reply needed?' : '📧 New Email — Action Required'

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*From:* ${thread.name} <${thread.from}>` },
        { type: 'mrkdwn', text: `*Category:* ${thread.category}` },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: `*Subject:* ${thread.subject}\n*Summary:* ${summary}` } },
  ]

  if (checkIfNeeded) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `⚠️ _AI is uncertain whether this email needs a reply. Draft is ready if you approve._` } })
  }

  blocks.push(
    { type: 'section', text: { type: 'mrkdwn', text: `*Draft Reply:*\n\`\`\`${truncDraft}\`\`\`` } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Confidence:* ${confidenceEmoji(confidence)} ${capConf}${confidenceReason ? `\n_${confidenceReason}_` : ''}`,
      },
    },
  )

  const statusMessages = {
    approved: '✅ *Approved* — sending in 5 minutes…',
    sent:     '✅ *Sent* via Gmail.',
    skipped:  '⏭️ *Skipped* — no reply needed.',
  }
  if (statusMessages[status]) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: statusMessages[status] } })
  }

  if (status === 'pending') {
    blocks.push({
      type: 'actions',
      block_id: 'email_approval',
      elements: [
        {
          type: 'button', style: 'primary',
          text: { type: 'plain_text', text: '✅ Approve & Send' },
          action_id: 'approve_email', value: thread.id,
          confirm: {
            title: { type: 'plain_text', text: 'Approve this reply?' },
            text: { type: 'mrkdwn', text: 'The draft will be sent in 5 minutes. You can cancel during that window.' },
            confirm: { type: 'plain_text', text: 'Approve' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '✏️ Edit in Dashboard' },
          action_id: 'edit_email', value: thread.id, url: dashUrl,
        },
        {
          type: 'button', style: 'danger',
          text: { type: 'plain_text', text: '⏭️ Skip' },
          action_id: 'skip_email', value: thread.id,
        },
      ],
    })
  } else if (status === 'approved') {
    blocks.push({
      type: 'actions',
      block_id: 'email_approval',
      elements: [{
        type: 'button', style: 'danger',
        text: { type: 'plain_text', text: '❌ Cancel Send' },
        action_id: 'cancel_email', value: thread.id,
      }],
    })
  }

  return blocks
}

async function getSlackNotification(threadId) {
  if (!supabase) return null
  const { data } = await supabase.from('slack_notifications').select('*').eq('thread_id', threadId).single()
  return data || null
}

async function updateSlackMessage(notif, status) {
  if (!slackClient || !notif?.slack_ts || !notif?.channel_id) return
  const meta = notif.thread_meta || {}
  const mockThread = {
    id: notif.thread_id, name: meta.fromName, from: meta.from,
    to: meta.to, subject: meta.subject, category: notif.category,
  }
  const checkIfNeeded = notif.category === 'general' || notif.confidence === 'low'
  const blocks = buildSlackBlocks(mockThread, notif.draft || '', notif.summary || '',
    notif.confidence, notif.confidence_reason, status, checkIfNeeded)
  await slackClient.chat.update({
    channel: notif.channel_id,
    ts: notif.slack_ts,
    text: `${meta.subject || 'Email'} — ${status}`,
    blocks,
  })
}

async function postEmailToSlack(thread) {
  if (!slackClient || !process.env.SLACK_CHANNEL_ID) return

  let result
  try {
    result = await generateDraftForSlack(thread)
  } catch (err) {
    console.error(`[Slack] Draft generation failed for ${thread.id}:`, err.message)
    return
  }

  const { draft, summary, confidence, confidence_reason } = result
  const checkIfNeeded = thread.category === 'general' || confidence === 'low'
  const blocks = buildSlackBlocks(thread, draft, summary, confidence, confidence_reason, 'pending', checkIfNeeded)

  const msg = await slackClient.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID,
    text: `New email from ${thread.name}: ${thread.subject}`,
    blocks,
  })

  const threadMeta = {
    from: thread.from, fromName: thread.name, to: thread.to,
    subject: thread.subject, messageId: thread.messageId,
    threadId: thread.id, defaultFrom: thread.defaultFrom,
  }

  slackNotifiedCache.add(thread.id)

  if (supabase) {
    await supabase.from('slack_notifications').upsert({
      thread_id: thread.id, account: thread.account,
      slack_ts: msg.ts, channel_id: process.env.SLACK_CHANNEL_ID,
      status: 'pending', draft, category: thread.category,
      confidence, confidence_reason: confidence_reason || null,
      summary, thread_meta: threadMeta,
      created_at: new Date().toISOString(),
    })

    // Save draft to saved_drafts so it auto-loads in EmailDetail ("Edit in Dashboard")
    await supabase.from('saved_drafts').upsert({
      thread_id: thread.id, content: draft, updated_at: new Date().toISOString(),
    })
    savedDraftsCache.add(thread.id)
  }
}

async function sendApprovedEmail(threadId) {
  try {
    const notif = await getSlackNotification(threadId)
    if (!notif || notif.status !== 'approved') return

    const meta = notif.thread_meta || {}
    const sendFrom = meta.defaultFrom || notif.account

    if (!hasTokens(sendFrom)) {
      console.error(`[Slack] Cannot send from ${sendFrom}: not connected`)
      return
    }

    const gmail = google.gmail({ version: 'v1', auth: clients[sendFrom] })
    const oauth2 = google.oauth2({ version: 'v2', auth: clients[sendFrom] })
    const { data: userInfo } = await oauth2.userinfo.get()

    const raw = buildReplyRaw({
      from: `${userInfo.name || sendFrom} <${sendFrom}>`,
      to: `${meta.fromName} <${meta.from}>`,
      subject: meta.subject,
      inReplyTo: meta.messageId,
      references: meta.messageId,
      body: notif.draft,
    })

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw, threadId: meta.threadId },
    })

    approvalTimers.delete(threadId)

    if (supabase) {
      await supabase.from('slack_notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('thread_id', threadId)
    }

    await updateSlackMessage({ ...notif, status: 'sent' }, 'sent')
    console.log(`[Slack] Auto-sent reply for thread ${threadId}`)
  } catch (err) {
    console.error(`[Slack] sendApprovedEmail error for ${threadId}:`, err.message)
  }
}

function scheduleApprovalSend(threadId, delayMs) {
  if (approvalTimers.has(threadId)) clearTimeout(approvalTimers.get(threadId))
  const timer = setTimeout(() => sendApprovedEmail(threadId), delayMs)
  approvalTimers.set(threadId, timer)
}

async function runSlackPoll() {
  if (!slackClient || !process.env.SLACK_CHANNEL_ID || !supabase) return
  const accounts = connectedAccounts()
  if (!accounts.length) return

  const cutoff = Date.now() - 48 * 60 * 60 * 1000 // Only process emails from last 48h

  for (const account of accounts) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: clients[account] })
      const listRes = await gmail.users.threads.list({ userId: 'me', q: 'in:inbox', maxResults: 20 })
      const threads = listRes.data.threads || []

      for (const t of threads) {
        if (slackNotifiedCache.has(t.id)) continue

        // Mark in cache immediately to prevent duplicate processing
        slackNotifiedCache.add(t.id)

        try {
          const threadRes = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' })
          const thread = buildThreadObject(threadRes.data, account)
          if (!thread) continue

          // Skip: too old, or we already sent the last message
          if (new Date(thread.timestamp).getTime() < cutoff) continue
          const lastMsg = (thread.messages || []).at(-1)
          if (lastMsg?.isOutgoing) continue

          await postEmailToSlack(thread)
          await new Promise((r) => setTimeout(r, 800)) // Rate limit guard
        } catch (err) {
          console.error(`[Slack] Error processing thread ${t.id}:`, err.message)
          slackNotifiedCache.delete(t.id) // Allow retry next poll
        }
      }
    } catch (err) {
      console.error(`[Slack] Poll error for ${account}:`, err.message)
    }
  }
}

function startSlackPolling() {
  if (!slackClient || !process.env.SLACK_CHANNEL_ID) {
    console.log('  Slack: not configured (set SLACK_BOT_TOKEN + SLACK_CHANNEL_ID to enable)')
    return
  }
  console.log('  Slack: approval workflow enabled, polling every 15 min')
  setTimeout(runSlackPoll, 15_000) // First run 15s after startup
  setInterval(runSlackPoll, 15 * 60 * 1000)
}


app.post('/api/generate-reply', async (req, res) => {
  const { email, category } = req.body
  if (!email || !category) return res.status(400).json({ error: 'Missing email or category' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' })

  const kerryBrain = loadKerryBrain()
  const personaName = PERSONA_NAMES[category] || 'Kerry'

  // Fetch last 10 feedback examples for this category to improve drafts
  let feedbackContext = ''
  if (supabase) {
    const { data: feedbackRows } = await supabase.from('ai_feedback')
      .select('original_draft, final_version, diff_summary')
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(10)
    if (feedbackRows?.length) {
      feedbackContext = `\n\nHere are recent examples where Kerry edited your AI drafts. Learn from these patterns:\n\n${
        feedbackRows.map((f, i) => {
          const orig = f.original_draft.slice(0, 300)
          const final = f.final_version.slice(0, 300)
          return `Example ${i + 1}:\nOriginal: ${orig}\nKerry changed to: ${final}${f.diff_summary ? `\n(${f.diff_summary})` : ''}`
        }).join('\n\n---\n\n')
      }`
    }
  }

  const systemPrompt = `You are an AI email assistant for Shirt School. Your job is to draft email replies on behalf of Kerry or the Shirt School Support Team.

${kerryBrain ? `--- BEGIN CONTEXT ---\n${kerryBrain}\n--- END CONTEXT ---\n` : ''}
The email you are replying to is categorized as: ${category}
${feedbackContext}

Write only the email body — no subject line, no "From:", no metadata. Start directly with the greeting.`

  const userPrompt = `Draft a reply to this email:

From: ${email.name} <${email.from}>
To: ${email.to}
Subject: ${email.subject}
---
${email.bodyText || email.body || '(no body)'}
---

Reply as instructed in the context above.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    res.json({ draft: message.content[0].text, persona: personaName })
  } catch (error) {
    console.error('Anthropic API error:', error.message)
    res.status(500).json({ error: 'Failed to generate reply. Check your API key.' })
  }
})

// ─── Slack actions endpoint ───────────────────────────────────────────────────

app.post('/api/slack/actions', async (req, res) => {
  res.status(200).send() // Respond to Slack immediately (3s timeout requirement)

  let payload
  try {
    payload = JSON.parse(req.body?.payload || '{}')
  } catch {
    console.error('[Slack] Invalid payload JSON')
    return
  }

  const action = payload.actions?.[0]
  if (!action) return
  const { action_id: actionId, value: threadId } = action
  const slackTs = payload.message?.ts
  const channelId = payload.channel?.id
  if (!threadId) return

  try {
    const notif = await getSlackNotification(threadId)

    if (actionId === 'approve_email') {
      if (supabase) {
        await supabase.from('slack_notifications')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('thread_id', threadId)
      }
      scheduleApprovalSend(threadId, 5 * 60 * 1000)
      if (notif) await updateSlackMessage({ ...notif, slack_ts: slackTs, channel_id: channelId }, 'approved')

    } else if (actionId === 'cancel_email') {
      if (approvalTimers.has(threadId)) {
        clearTimeout(approvalTimers.get(threadId))
        approvalTimers.delete(threadId)
      }
      if (supabase) {
        await supabase.from('slack_notifications')
          .update({ status: 'pending' })
          .eq('thread_id', threadId)
      }
      if (notif) await updateSlackMessage({ ...notif, slack_ts: slackTs, channel_id: channelId }, 'pending')

    } else if (actionId === 'content_save_idea') {
      // Save a content idea from the daily brief to the Ideas Bank
      const ideaId = threadId // action value is the idea UUID
      if (supabase) {
        const { data: existing } = await supabase.from('content_ideas').select('id, status, title').eq('id', ideaId).single()
        if (existing && existing.status !== 'saved') {
          await supabase.from('content_ideas').update({ status: 'saved' }).eq('id', ideaId)
          await updateContentPreferences({ format: 'short', title: existing.title }) // format updated below
          // Post ephemeral confirmation
          if (slackClient && channelId && payload.user?.id) {
            await slackClient.chat.postEphemeral({
              channel: channelId, user: payload.user.id,
              text: `⭐ Saved: *${existing.title}*`,
            }).catch(() => {})
          }
        } else if (existing?.status === 'saved') {
          if (slackClient && channelId && payload.user?.id) {
            await slackClient.chat.postEphemeral({
              channel: channelId, user: payload.user.id, text: `Already saved!`,
            }).catch(() => {})
          }
        }
      }

    } else if (actionId === 'skip_email') {
      if (supabase) {
        await supabase.from('slack_notifications')
          .update({ status: 'skipped' })
          .eq('thread_id', threadId)
      }
      if (notif) await updateSlackMessage({ ...notif, slack_ts: slackTs, channel_id: channelId }, 'skipped')
    } else if (actionId === 'edit_email') {
      // "Edit in Dashboard" — no status change so thread replies still work
      if (slackClient && channelId && slackTs) {
        const dashUrl = process.env.RAILWAY_PUBLIC_URL || 'http://localhost:5173'
        await slackClient.chat.postMessage({
          channel: channelId, thread_ts: slackTs,
          text: `Open the dashboard to edit this reply: ${dashUrl}\n\nOr reply here in this thread with your edit instruction.`,
        })
      }
    }
  } catch (err) {
    console.error('[Slack] Action handler error:', err.message)
  }
})

// ─── Slack Events endpoint (for conversational thread editing) ────────────────

app.post('/api/slack/events', async (req, res) => {
  const body = req.body || {}

  // Slack URL verification challenge (sent once when you configure the endpoint)
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge })
  }

  // Respond 200 immediately so Slack doesn't retry
  res.status(200).send()

  if (body.type !== 'event_callback') return
  const event = body.event
  if (!event) return

  // Only handle plain messages that are replies in a thread (not bot messages, not edits)
  if (event.type !== 'message') return
  if (event.subtype) return          // ignore message_changed, message_deleted, bot_message subtypes
  if (event.bot_id) return           // ignore bot messages
  if (!event.thread_ts) return       // must be a thread reply
  if (event.thread_ts === event.ts) return // top-level message, not a reply

  const instruction = (event.text || '').trim()
  if (!instruction) return

  // Look up if this thread_ts matches a Slack notification
  if (!supabase) return
  const { data: notif } = await supabase
    .from('slack_notifications')
    .select('*')
    .eq('slack_ts', event.thread_ts)
    .single()

  if (!notif) return
  if (!['pending', 'approved'].includes(notif.status)) return // don't edit already-sent/skipped

  const currentDraft = notif.draft
  if (!currentDraft) return

  try {
    // Ask Claude to apply the edit instruction to the draft
    const editMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: 'You are editing an email draft. Apply the instruction and return ONLY the revised email body — no subject line, no labels, no explanation, just the reply text.',
      messages: [{
        role: 'user',
        content: `Current draft:\n---\n${currentDraft}\n---\n\nEdit instruction: ${instruction}\n\nReturn ONLY the revised draft text.`,
      }],
    })
    const revisedDraft = editMsg.content[0].text.trim()

    // Update slack_notifications with new draft
    await supabase.from('slack_notifications')
      .update({ draft: revisedDraft })
      .eq('thread_id', notif.thread_id)

    // Update saved_drafts so EmailDetail picks it up
    await supabase.from('saved_drafts').upsert({
      thread_id: notif.thread_id, content: revisedDraft, updated_at: new Date().toISOString(),
    })
    savedDraftsCache.add(notif.thread_id)

    // Post revised draft back to the Slack thread as confirmation
    if (slackClient && notif.channel_id) {
      const truncRevised = revisedDraft.length > 2800 ? revisedDraft.slice(0, 2800) + '…' : revisedDraft
      await slackClient.chat.postMessage({
        channel: notif.channel_id,
        thread_ts: notif.slack_ts,
        text: `✏️ Draft updated. Here's the revised version:\n\`\`\`${truncRevised}\`\`\`\n\nReply again to make more edits, or use the buttons above to approve/skip.`,
      })

      // Also update the original message with the new draft
      await updateSlackMessage({ ...notif, draft: revisedDraft }, notif.status)
    }

    console.log(`[Slack] Draft edited for thread ${notif.thread_id}: "${instruction.slice(0, 60)}"`)
  } catch (err) {
    console.error('[Slack] Edit handler error:', err.message)
    if (slackClient && notif.channel_id) {
      await slackClient.chat.postMessage({
        channel: notif.channel_id,
        thread_ts: notif.slack_ts,
        text: `⚠️ Failed to apply edit: ${err.message}`,
      }).catch(() => {})
    }
  }
})

// ─── AI Feedback routes ───────────────────────────────────────────────────────

app.get('/api/feedback', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ entries: [] })
  const { data, error } = await supabase.from('ai_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ entries: data || [] })
})

app.post('/api/feedback', requireAuth, async (req, res) => {
  const { threadId, category, originalDraft, finalVersion } = req.body
  if (!originalDraft || !finalVersion || !category) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  const diffSummary = computeDiffSummary(originalDraft, finalVersion)
  if (supabase) {
    const { error } = await supabase.from('ai_feedback').insert({
      thread_id: threadId || null, category,
      original_draft: originalDraft, final_version: finalVersion,
      diff_summary: diffSummary, created_at: new Date().toISOString(),
    })
    if (error) return res.status(500).json({ error: error.message })
  }
  res.json({ success: true, diffSummary })
})

app.patch('/api/feedback/:id/notes', requireAuth, async (req, res) => {
  const { id } = req.params
  const { notes } = req.body
  if (!supabase) return res.json({ success: true })
  const { error } = await supabase.from('ai_feedback').update({ notes }).eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ─── Content Agent ────────────────────────────────────────────────────────────

const DEFAULT_TOPICS = [
  'print on demand',
  't-shirts apparel business',
  'Shopify',
  'AI tools ecommerce content creation',
  'ecommerce marketing',
]

async function getContentTopics() {
  if (!supabase) return DEFAULT_TOPICS
  const { data } = await supabase.from('content_topics').select('keyword').eq('active', true).order('created_at')
  return data?.length ? data.map((r) => r.keyword) : DEFAULT_TOPICS
}

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

async function fetchYouTubeVideos(keyword) {
  if (!process.env.YOUTUBE_API_KEY) return []
  try {
    const publishedAfter = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const yt = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY })
    const searchRes = await yt.search.list({
      part: ['snippet'], q: keyword, type: ['video'],
      order: 'viewCount', publishedAfter, maxResults: 5, regionCode: 'US',
    })
    const items = searchRes.data.items || []
    if (!items.length) return []
    const ids = items.map((i) => i.id.videoId).filter(Boolean).join(',')
    const statsRes = await yt.videos.list({ part: ['statistics'], id: [ids] })
    const statsMap = {}
    for (const v of (statsRes.data.items || [])) statsMap[v.id] = v.statistics
    return items.map((item) => ({
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      videoId: item.id.videoId,
      url: `https://youtu.be/${item.id.videoId}`,
      views: parseInt(statsMap[item.id.videoId]?.viewCount || 0),
      publishedAt: item.snippet.publishedAt,
    })).sort((a, b) => b.views - a.views)
  } catch (err) {
    console.error(`[Content] YouTube fetch error for "${keyword}":`, err.message)
    return []
  }
}

async function fetchCompetitorVideos() {
  if (!process.env.YOUTUBE_API_KEY || !supabase) return []
  const { data: competitors } = await supabase.from('content_competitors').select('*').eq('active', true)
  if (!competitors?.length) return []
  const yt = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY })
  const results = []
  for (const competitor of competitors) {
    try {
      const channelRes = await yt.channels.list({ part: ['contentDetails', 'statistics'], id: [competitor.channel_id] })
      const channel = channelRes.data.items?.[0]
      if (!channel) continue
      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
      if (!uploadsPlaylistId) continue
      const playlistRes = await yt.playlistItems.list({ part: ['contentDetails', 'snippet'], playlistId: uploadsPlaylistId, maxResults: 5 })
      const videoIds = (playlistRes.data.items || []).map((i) => i.contentDetails.videoId).filter(Boolean)
      if (!videoIds.length) continue
      const statsRes = await yt.videos.list({ part: ['statistics', 'snippet'], id: [videoIds.join(',')] })
      const videos = (statsRes.data.items || []).map((v) => ({
        id: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt,
        url: `https://youtu.be/${v.id}`, views: parseInt(v.statistics.viewCount || 0),
        channel: competitor.channel_name, channelId: competitor.channel_id,
      }))
      const avgViews = videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0
      results.push(...videos.map((v) => ({ ...v, isBreakout: avgViews > 0 && v.views >= avgViews * 2, channelAvgViews: avgViews })))
    } catch (err) {
      console.error(`[Content] Competitor fetch error for ${competitor.channel_name}:`, err.message)
    }
  }
  return results.sort((a, b) => b.views - a.views)
}

async function fetchSerperNews(query) {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 3, tbs: 'qdr:w' }),
    })
    const data = await res.json()
    return (data.news || []).slice(0, 3).map((a) => ({
      title: a.title, source: a.source,
      snippet: a.snippet, url: a.link, date: a.date,
    }))
  } catch (err) {
    console.error(`[Content] Serper news error for "${query}":`, err.message)
    return []
  }
}

async function fetchSerperReddit(subreddit) {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `site:reddit.com/r/${subreddit}`, num: 3, tbs: 'qdr:w' }),
    })
    const data = await res.json()
    return (data.organic || []).slice(0, 3).map((r) => ({
      title: r.title, subreddit: `r/${subreddit}`,
      snippet: r.snippet, url: r.link,
    }))
  } catch (err) {
    console.error(`[Content] Serper Reddit error for "${subreddit}":`, err.message)
    return []
  }
}

async function fetchToolUpdates(topics) {
  if (!process.env.SERPER_API_KEY) return []
  try {
    const q = `(${topics.slice(0, 3).join(' OR ')}) new tool release update`
    const res = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, num: 5, tbs: 'qdr:m' }),
    })
    const data = await res.json()
    return (data.news || []).slice(0, 4).map((a) => ({
      title: a.title, source: a.source,
      snippet: a.snippet, url: a.link, date: a.date,
    }))
  } catch (err) {
    console.error('[Content] Tool updates error:', err.message)
    return []
  }
}

async function getStoredChannelId() {
  if (!supabase) return null
  const { data } = await supabase.from('content_config').select('value').eq('key', 'youtube_channel_id').single()
  return data?.value || null
}

async function fetchKerryChannelStats(channelIdOverride) {
  if (!hasTokens('kerry@shirtschool.com')) return null
  try {
    const ytKerry = google.youtube({ version: 'v3', auth: clients['kerry@shirtschool.com'] })
    const channelId = channelIdOverride || await getStoredChannelId()

    // Build channel list params: use stored/provided ID, or fall back to mine:true
    const channelParams = channelId
      ? { part: ['statistics', 'snippet', 'contentDetails'], id: [channelId] }
      : { part: ['statistics', 'snippet', 'contentDetails'], mine: true }

    const channelRes = await ytKerry.channels.list(channelParams)
    const channel = channelRes.data.items?.[0]
    if (!channel) return null

    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylistId) return null

    const playlistRes = await ytKerry.playlistItems.list({
      part: ['contentDetails'], playlistId: uploadsPlaylistId, maxResults: 50,
    })
    const videoIds = (playlistRes.data.items || []).map((i) => i.contentDetails.videoId)
    if (!videoIds.length) return null

    const videoStats = []
    for (let i = 0; i < videoIds.length; i += 50) {
      const vRes = await ytKerry.videos.list({
        part: ['statistics', 'snippet'], id: [videoIds.slice(i, i + 50).join(',')],
      })
      videoStats.push(...(vRes.data.items || []))
    }

    const videos = videoStats.map((v) => ({
      id: v.id,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      url: `https://youtu.be/${v.id}`,
      views: parseInt(v.statistics.viewCount || 0),
      likes: parseInt(v.statistics.likeCount || 0),
      comments: parseInt(v.statistics.commentCount || 0),
    }))
    const byViews = [...videos].sort((a, b) => b.views - a.views)
    const byDate = [...videos].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    const avgViews = videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0

    return {
      channelId: channel.id,
      channelName: channel.snippet.title,
      subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
      totalViews: parseInt(channel.statistics.viewCount || 0),
      videoCount: parseInt(channel.statistics.videoCount || 0),
      topVideos: byViews.slice(0, 10),
      recentVideos: byDate.slice(0, 10),
      avgViews,
    }
  } catch (err) {
    console.error('[Content] Kerry channel stats error:', err.message)
    return null
  }
}

async function generateContentIdeas(research, preferences, channelStats) {
  const { topVideos, topNews, topReddit, toolUpdates, competitorVideos = [] } = research
  let prefContext = ''
  if (preferences?.save_count >= 10) {
    prefContext = `Kerry's content preferences (from her saved ideas):\n- Preferred topics: ${preferences.topic_keywords?.slice(0, 8).join(', ') || 'varies'}\n- Preferred format: ${preferences.preferred_format || 'both'}\nWeight ideas toward these preferences.\n\n`
  }

  // Source A (30%): Kerry's top-performing channel videos
  let sourceACtx = ''
  if (channelStats?.topVideos?.length) {
    const top5 = channelStats.topVideos.slice(0, 5).map((v) => `"${v.title}" (${formatNum(v.views)} views)`).join('\n')
    sourceACtx = `SOURCE A — MY CHANNEL PERFORMANCE (30% of ideas should draw from this):
Top-performing videos:
${top5}
Channel avg views: ${formatNum(channelStats.avgViews)}
→ Ideas from this source: identify topics/formats/angles that outperformed, then suggest similar or follow-up videos.\n\n`
  }

  // Source B (35%): Competitor activity and breakout videos
  const breakouts = competitorVideos.filter((v) => v.isBreakout)
  const nonBreakouts = competitorVideos.filter((v) => !v.isBreakout)
  let sourceBCtx = ''
  if (competitorVideos.length) {
    const breakoutLines = breakouts.slice(0, 3).map((v) =>
      `🔥 "${v.title}" by ${v.channel} (${formatNum(v.views)} views — ${Math.round(v.views / v.channelAvgViews)}x their avg)`
    ).join('\n')
    const normalLines = nonBreakouts.slice(0, 4).map((v) =>
      `- "${v.title}" by ${v.channel} (${formatNum(v.views)} views)`
    ).join('\n')
    sourceBCtx = `SOURCE B — COMPETITOR ACTIVITY (35% of ideas should draw from this):
${breakoutLines ? `BREAKOUT VIDEOS (outperforming 2x+ their channel average):\n${breakoutLines}\n` : ''}${normalLines ? `Recent uploads:\n${normalLines}` : ''}
→ Ideas from this source: create your own angle on topics that competitors' breakout videos prove people want right now.\n\n`
  } else {
    sourceBCtx = `SOURCE B — COMPETITOR ACTIVITY (35% of ideas):
No competitor channels configured yet. Use general YouTube trends below instead.\n\n`
  }

  // Source C (35%): Reddit + news trending
  const sourceCCtx = `SOURCE C — TRENDING TOPICS (35% of ideas should draw from this):
TOP NEWS:
${topNews.slice(0, 4).map((n) => `- ${n.title} (${n.source}): ${n.snippet?.slice(0, 100)}`).join('\n') || 'N/A'}

REDDIT BUZZ:
${topReddit.slice(0, 3).map((r) => `- [${r.subreddit}] ${r.title}`).join('\n') || 'N/A'}

TOOL UPDATES:
${toolUpdates.slice(0, 3).map((t) => `- ${t.title}: ${t.snippet?.slice(0, 80)}`).join('\n') || 'N/A'}
→ Ideas from this source: translate news/Reddit conversations into YouTube topics Kerry's audience needs.\n\n`

  const prompt = `You are a content strategist for "Shirt School" — Kerry's YouTube channel about print-on-demand, t-shirt businesses, Shopify, and ecommerce.
${prefContext}Generate fresh content ideas for Kerry using THREE weighted sources below. For each idea, include which source inspired it.

${sourceACtx}${sourceBCtx}${sourceCCtx}GENERAL TRENDING YOUTUBE (supplementary context):
${topVideos.slice(0, 4).map((v) => `- "${v.title}" by ${v.channel} (${formatNum(v.views)} views)`).join('\n') || 'N/A'}

Return ONLY valid JSON (no markdown fences) in this exact format:
{"short_form":[{"title":"...","hook":"opening hook line for the video","why_timely":"why now based on trends above","source":"A|B|C","source_note":"brief explanation of which specific data point inspired this"},...],"long_form":[{"title":"...","outline":"1-paragraph video outline","why_timely":"why now based on trends above","source":"A|B|C","source_note":"brief explanation of which specific data point inspired this"},...]}
Generate exactly 5 short_form ideas and 3 long_form ideas. Aim for ~2 from Source A, ~2 from Source B, ~2 from Source C for short_form; ~1 each for long_form.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0].text.trim()
  const clean = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  return JSON.parse(clean)
}

async function updateContentPreferences(idea) {
  if (!supabase) return
  const { data: pref } = await supabase.from('content_preferences').select('*').single()
  const saveCount = (pref?.save_count || 0) + 1
  const stopWords = new Set(['a','an','the','and','or','for','to','with','how','your','you','what','this','that','make'])
  const words = idea.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w))
  const newKeywords = [...new Set([...(pref?.topic_keywords || []), ...words])].slice(0, 30)
  const fmtCounts = { ...(pref?.format_counts || { short: 0, long: 0 }) }
  fmtCounts[idea.format] = (fmtCounts[idea.format] || 0) + 1
  const prefFormat = saveCount >= 10 ? (fmtCounts.short >= fmtCounts.long ? 'short' : 'long') : (pref?.preferred_format || null)
  const upsertData = {
    topic_keywords: newKeywords, preferred_format: prefFormat,
    save_count: saveCount, format_counts: fmtCounts, updated_at: new Date().toISOString(),
  }
  if (pref) {
    await supabase.from('content_preferences').update(upsertData).eq('id', pref.id)
  } else {
    await supabase.from('content_preferences').insert(upsertData)
  }
}

async function sendBriefToSlack(brief) {
  if (!slackClient || !process.env.SLACK_CHANNEL_ID) return
  const date = new Date(brief.run_at).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
  })
  const blocks = []
  blocks.push({ type: 'header', text: { type: 'plain_text', text: `📊 Daily Industry Brief — ${date}` } })
  blocks.push({ type: 'divider' })

  if (brief.youtube?.length) {
    const lines = brief.youtube.slice(0, 5).map((v, i) =>
      `${i + 1}. <${v.url}|${v.title}>\n   _${v.channel}_ • ${formatNum(v.views)} views`
    ).join('\n')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🎥 Trending YouTube Videos*\n${lines}` } })
    blocks.push({ type: 'divider' })
  }

  if (brief.news?.length) {
    const lines = brief.news.slice(0, 5).map((n, i) =>
      `${i + 1}. <${n.url}|${n.title}>\n   _${n.source}_ — ${(n.snippet || '').slice(0, 100)}`
    ).join('\n')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*📰 Industry News*\n${lines}` } })
    blocks.push({ type: 'divider' })
  }

  if (brief.reddit?.length) {
    const lines = brief.reddit.slice(0, 3).map((r, i) =>
      `${i + 1}. <${r.url}|${r.title}>\n   _${r.subreddit}_`
    ).join('\n')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*💬 Reddit Buzz*\n${lines}` } })
    blocks.push({ type: 'divider' })
  }

  if (brief.tools?.length) {
    const lines = brief.tools.slice(0, 4).map((t, i) =>
      `${i + 1}. <${t.url}|${t.title}> — ${(t.snippet || '').slice(0, 80)}`
    ).join('\n')
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🛠️ Tool & Platform Updates*\n${lines}` } })
    blocks.push({ type: 'divider' })
  }

  // Competitor Activity section
  if (brief.competitors?.length) {
    const breakouts = brief.competitors.filter((v) => v.isBreakout)
    const others = brief.competitors.filter((v) => !v.isBreakout)
    const lines = []
    for (const v of breakouts.slice(0, 3)) {
      lines.push(`🔥 <${v.url}|${v.title}>\n   _${v.channel}_ • ${formatNum(v.views)} views _(${Math.round(v.views / v.channelAvgViews)}x their avg — breakout!)_`)
    }
    for (const v of others.slice(0, 4 - Math.min(breakouts.length, 3))) {
      lines.push(`• <${v.url}|${v.title}>\n   _${v.channel}_ • ${formatNum(v.views)} views`)
    }
    if (lines.length) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*🎯 Competitor Activity*\n${lines.join('\n')}` } })
      blocks.push({ type: 'divider' })
    }
  }

  const sourceLabel = (s) => s === 'A' ? '📊 My Channel' : s === 'B' ? '🎯 Competitor' : '📰 Trending'

  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*💡 Content Ideas for Kerry*\n_Click ⭐ Save to add an idea to your Ideas Bank_' } })

  if (brief.ideas?.short_form?.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*📱 Short Form (Reels / Shorts)*' } })
    for (const idea of brief.ideas.short_form) {
      const src = idea.source ? ` • _Source: ${sourceLabel(idea.source)}_` : ''
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${idea.title}*${src}\nHook: _${idea.hook}_\n${idea.why_timely}` },
        accessory: { type: 'button', text: { type: 'plain_text', text: '⭐ Save' }, action_id: 'content_save_idea', value: idea.id },
      })
    }
  }

  if (brief.ideas?.long_form?.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*🎬 Long Form (YouTube)*' } })
    for (const idea of brief.ideas.long_form) {
      const src = idea.source ? ` • _Source: ${sourceLabel(idea.source)}_` : ''
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${idea.title}*${src}\n${idea.outline}\n_${idea.why_timely}_` },
        accessory: { type: 'button', text: { type: 'plain_text', text: '⭐ Save' }, action_id: 'content_save_idea', value: idea.id },
      })
    }
  }

  const msg = await slackClient.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID,
    text: `📊 Daily Industry Brief — ${date}`,
    blocks,
  })
  if (supabase && msg.ts) {
    await supabase.from('content_briefs').update({ slack_ts: msg.ts }).eq('id', brief.id)
  }
}

async function runContentBrief({ manual = false } = {}) {
  console.log(`[Content] Running brief (${manual ? 'manual' : 'scheduled'})...`)
  const topics = await getContentTopics()

  const [ytResults, newsResults, redditResults, toolResults, channelStats, competitorVideos] = await Promise.all([
    Promise.all(topics.map((t) => fetchYouTubeVideos(t))).then((r) => r.flat()),
    Promise.all(topics.map((t) => fetchSerperNews(t))).then((r) => r.flat()),
    Promise.all(['printondemand', 'shopify', 'ecommerce', 'Entrepreneur'].map((s) => fetchSerperReddit(s))).then((r) => r.flat()),
    fetchToolUpdates(topics),
    fetchKerryChannelStats(),
    fetchCompetitorVideos(),
  ])

  const dedupeByUrl = (arr) => {
    const seen = new Set()
    return arr.filter((item) => { if (!item.url || seen.has(item.url)) return false; seen.add(item.url); return true })
  }
  const topVideos = dedupeByUrl(ytResults).sort((a, b) => b.views - a.views).slice(0, 5)
  const topNews = dedupeByUrl(newsResults).slice(0, 5)
  const topReddit = dedupeByUrl(redditResults).slice(0, 3)

  let preferences = null
  if (supabase) {
    const { data } = await supabase.from('content_preferences').select('*').single()
    preferences = data
  }

  let ideas = { short_form: [], long_form: [] }
  try {
    ideas = await generateContentIdeas(
      { topVideos, topNews, topReddit, toolUpdates: toolResults, competitorVideos },
      preferences, channelStats
    )
  } catch (err) {
    console.error('[Content] Idea generation error:', err.message)
  }

  const briefId = crypto.randomUUID()
  const ideasWithIds = {
    short_form: (ideas.short_form || []).map((i) => ({ ...i, id: crypto.randomUUID(), format: 'short' })),
    long_form: (ideas.long_form || []).map((i) => ({ ...i, id: crypto.randomUUID(), format: 'long' })),
  }

  const briefData = {
    id: briefId, run_at: new Date().toISOString(),
    youtube: topVideos, news: topNews, reddit: topReddit,
    tools: toolResults, ideas: ideasWithIds, channel_stats: channelStats,
    competitors: competitorVideos,
  }

  if (supabase) {
    await supabase.from('content_briefs').insert({
      id: briefId, run_at: briefData.run_at,
      youtube: topVideos, news: topNews, reddit: topReddit,
      tools: toolResults, ideas: ideasWithIds, channel_stats: channelStats,
    })
    // Store all generated ideas as individual rows for easy lookup
    const allIdeas = [...ideasWithIds.short_form, ...ideasWithIds.long_form]
    if (allIdeas.length) {
      await supabase.from('content_ideas').insert(allIdeas.map((idea) => ({
        id: idea.id, brief_id: briefId, format: idea.format, title: idea.title,
        hook: idea.hook || null, outline: idea.outline || null, why_timely: idea.why_timely || null,
        status: 'generated', created_at: new Date().toISOString(),
      })))
    }
    if (channelStats) {
      await supabase.from('youtube_channel_stats').insert({
        fetched_at: briefData.run_at, channel_id: channelStats.channelId,
        channel_name: channelStats.channelName, subscriber_count: channelStats.subscriberCount,
        view_count: channelStats.totalViews, video_count: channelStats.videoCount,
        top_videos: channelStats.topVideos, recent_videos: channelStats.recentVideos, avg_views: channelStats.avgViews,
      })
    }
  }

  await sendBriefToSlack(briefData)
  console.log('[Content] Brief complete.')
  return briefData
}

// Compute ms until next 8 AM America/Chicago
function msUntilNextBriefTime() {
  const now = new Date()
  const checkCentralHour = (d) => parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
      .formatToParts(d).find((p) => p.type === 'hour')?.value || '0'
  )
  // Try UTC 13 and 14 (covers both CDT=UTC-5 and CST=UTC-6) for today + tomorrow
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const utcHour of [13, 14]) {
      const candidate = new Date(now)
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset)
      candidate.setUTCHours(utcHour, 0, 0, 0)
      if (checkCentralHour(candidate) === 8 && candidate > now) return candidate.getTime() - now.getTime()
    }
  }
  // Fallback: 14:00 UTC tomorrow
  const fallback = new Date(now)
  fallback.setUTCDate(fallback.getUTCDate() + 1)
  fallback.setUTCHours(14, 0, 0, 0)
  return fallback.getTime() - now.getTime()
}

function startContentBriefScheduler() {
  if (!process.env.YOUTUBE_API_KEY && !process.env.SERPER_API_KEY) {
    console.log('  Content Agent: not configured (set YOUTUBE_API_KEY + SERPER_API_KEY to enable)')
    return
  }
  const scheduleNext = () => {
    const delay = msUntilNextBriefTime()
    const target = new Date(Date.now() + delay)
    console.log(`  Content Agent: next brief at ${target.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`)
    setTimeout(() => {
      runContentBrief().catch((err) => console.error('[Content] Scheduled brief error:', err.message))
      scheduleNext()
    }, delay)
  }
  scheduleNext()
}

// ─── Content Agent API routes ─────────────────────────────────────────────────

app.get('/api/content/ideas', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ideas: [] })
  const { data, error } = await supabase.from('content_ideas')
    .select('*').neq('status', 'deleted').neq('status', 'generated')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ideas: data || [] })
})

app.patch('/api/content/ideas/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { notes, status, calendar_date } = req.body
  if (!supabase) return res.json({ success: true })
  const updates = {}
  if (notes !== undefined) updates.notes = notes
  if (status !== undefined) updates.status = status
  if (calendar_date !== undefined) updates.calendar_date = calendar_date
  const { error } = await supabase.from('content_ideas').update(updates).eq('id', id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

app.delete('/api/content/ideas/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ success: true })
  const { error } = await supabase.from('content_ideas').update({ status: 'deleted' }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

app.get('/api/content/briefs', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ briefs: [] })
  const { data, error } = await supabase.from('content_briefs')
    .select('id, run_at, youtube, news, reddit, tools, ideas, channel_stats')
    .order('run_at', { ascending: false }).limit(30)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ briefs: data || [] })
})

app.get('/api/content/briefs/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.status(404).json({ error: 'Not found' })
  const { data, error } = await supabase.from('content_briefs').select('*').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: 'Brief not found' })
  res.json({ brief: data })
})

app.post('/api/content/run-brief', requireAuth, async (req, res) => {
  res.json({ success: true, message: 'Brief running in background…' })
  runContentBrief({ manual: true }).catch((err) => console.error('[Content] Manual brief error:', err.message))
})

app.get('/api/content/topics', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ topics: DEFAULT_TOPICS.map((k, i) => ({ id: String(i), keyword: k, active: true })) })
  const { data, error } = await supabase.from('content_topics').select('*').order('created_at')
  if (error) return res.status(500).json({ error: error.message })
  // Seed defaults if empty
  if (!data?.length) {
    const rows = DEFAULT_TOPICS.map((keyword) => ({ keyword, active: true }))
    const { data: inserted } = await supabase.from('content_topics').insert(rows).select()
    return res.json({ topics: inserted || [] })
  }
  res.json({ topics: data })
})

app.post('/api/content/topics', requireAuth, async (req, res) => {
  const { keyword } = req.body
  if (!keyword?.trim()) return res.status(400).json({ error: 'Keyword required' })
  if (!supabase) return res.json({ topic: { id: crypto.randomUUID(), keyword: keyword.trim(), active: true } })
  const { data, error } = await supabase.from('content_topics').insert({ keyword: keyword.trim(), active: true }).select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ topic: data })
})

app.patch('/api/content/topics/:id', requireAuth, async (req, res) => {
  const { keyword, active } = req.body
  if (!supabase) return res.json({ success: true })
  const updates = {}
  if (keyword !== undefined) updates.keyword = keyword.trim()
  if (active !== undefined) updates.active = active
  const { error } = await supabase.from('content_topics').update(updates).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

app.delete('/api/content/topics/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ success: true })
  const { error } = await supabase.from('content_topics').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

app.get('/api/content/channel-stats', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ stats: null, configured: false })
  const [statsResult, configResult] = await Promise.all([
    supabase.from('youtube_channel_stats').select('*').order('fetched_at', { ascending: false }).limit(1).single(),
    supabase.from('content_config').select('value').eq('key', 'youtube_channel_id').single(),
  ])
  res.json({
    stats: statsResult.data || null,
    configured: !!configResult.data?.value,
    channelId: configResult.data?.value || null,
    kerryConnected: hasTokens('kerry@shirtschool.com'),
  })
})

// Resolve a channel handle or ID to a channel object (for the selector UI)
app.post('/api/content/channel-lookup', requireAuth, async (req, res) => {
  const { query } = req.body // can be a channel ID (UC...) or handle (@shirtschool)
  if (!query?.trim()) return res.status(400).json({ error: 'Query required' })
  if (!hasTokens('kerry@shirtschool.com')) return res.status(401).json({ error: 'kerry@shirtschool.com not connected' })
  try {
    const ytKerry = google.youtube({ version: 'v3', auth: clients['kerry@shirtschool.com'] })
    const q = query.trim()
    const isId = q.startsWith('UC')
    const params = {
      part: ['snippet', 'statistics'],
      ...(isId ? { id: [q] } : { forHandle: q.startsWith('@') ? q.slice(1) : q }),
    }
    const res2 = await ytKerry.channels.list(params)
    const channels = res2.data.items || []
    if (!channels.length) return res.status(404).json({ error: 'Channel not found. Try using the channel ID (starts with UC…) from YouTube Studio.' })
    res.json({ channels: channels.map((c) => ({ id: c.id, name: c.snippet.title, thumbnail: c.snippet.thumbnails?.default?.url, subscribers: c.statistics.subscriberCount })) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Also expose mine:true channel for quick detection
app.get('/api/content/youtube-channels', requireAuth, async (req, res) => {
  if (!hasTokens('kerry@shirtschool.com')) return res.json({ channels: [], kerryConnected: false })
  try {
    const ytKerry = google.youtube({ version: 'v3', auth: clients['kerry@shirtschool.com'] })
    const r = await ytKerry.channels.list({ part: ['snippet', 'statistics'], mine: true })
    const channels = (r.data.items || []).map((c) => ({
      id: c.id, name: c.snippet.title,
      thumbnail: c.snippet.thumbnails?.default?.url,
      subscribers: c.statistics.subscriberCount,
    }))
    res.json({ channels, kerryConnected: true })
  } catch (err) {
    res.json({ channels: [], kerryConnected: true, error: err.message })
  }
})

app.post('/api/content/channel-select', requireAuth, async (req, res) => {
  const { channelId } = req.body
  if (!channelId?.trim()) return res.status(400).json({ error: 'channelId required' })
  if (supabase) {
    await supabase.from('content_config').upsert({ key: 'youtube_channel_id', value: channelId.trim(), updated_at: new Date().toISOString() })
  }
  res.json({ success: true })
})

// Standalone channel stats refresh (no full brief needed)
app.post('/api/content/channel-stats/refresh', requireAuth, async (req, res) => {
  if (!hasTokens('kerry@shirtschool.com')) return res.status(401).json({ error: 'kerry@shirtschool.com not connected' })
  res.json({ success: true, message: 'Fetching channel stats…' })
  try {
    const channelStats = await fetchKerryChannelStats()
    if (channelStats && supabase) {
      await supabase.from('youtube_channel_stats').insert({
        fetched_at: new Date().toISOString(), channel_id: channelStats.channelId,
        channel_name: channelStats.channelName, subscriber_count: channelStats.subscriberCount,
        view_count: channelStats.totalViews, video_count: channelStats.videoCount,
        top_videos: channelStats.topVideos, recent_videos: channelStats.recentVideos, avg_views: channelStats.avgViews,
      })
    }
  } catch (err) {
    console.error('[Content] Channel stats refresh error:', err.message)
  }
})

// ─── Competitor Channels API ──────────────────────────────────────────────────

app.get('/api/content/competitors', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ competitors: [] })
  const { data, error } = await supabase.from('content_competitors').select('*').order('created_at')
  if (error) return res.status(500).json({ error: error.message })
  res.json({ competitors: data || [] })
})

app.post('/api/content/competitors', requireAuth, async (req, res) => {
  const { channelId, channelName, handle, thumbnail } = req.body
  if (!channelId?.trim() || !channelName?.trim()) return res.status(400).json({ error: 'channelId and channelName required' })
  if (!supabase) return res.json({ competitor: { id: crypto.randomUUID(), channel_id: channelId.trim(), channel_name: channelName.trim(), handle: handle || null, thumbnail: thumbnail || null, active: true } })
  const { data, error } = await supabase.from('content_competitors')
    .insert({ channel_id: channelId.trim(), channel_name: channelName.trim(), handle: handle || null, thumbnail: thumbnail || null, active: true })
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ competitor: data })
})

app.patch('/api/content/competitors/:id', requireAuth, async (req, res) => {
  const { active } = req.body
  if (!supabase) return res.json({ success: true })
  const { error } = await supabase.from('content_competitors').update({ active }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

app.delete('/api/content/competitors/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ success: true })
  const { error } = await supabase.from('content_competitors').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    gmailConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connectedAccounts: connectedAccounts(),
  })
})

// ─── Serve built frontend (production) ────────────────────────────────────────
const distPath = path.resolve('dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  // SPA catch-all: serve index.html for any non-API route
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ─── Startup: load persisted state then start server ─────────────────────────
async function init() {
  console.log('\nShirt School Dashboard starting...')

  if (supabase) {
    console.log('  Supabase: connected')

    // Load Gmail tokens
    for (const account of TARGET_ACCOUNTS) {
      const saved = await loadTokens(account)
      if (saved) {
        clients[account].setCredentials(saved)
        console.log(`  Loaded tokens for ${account}`)
      }
    }

    // Load category overrides into cache
    const { data: catRows } = await supabase.from('category_overrides').select('thread_id, category')
    if (catRows) {
      for (const row of catRows) categoryOverridesCache[row.thread_id] = row.category
      console.log(`  Loaded ${catRows.length} category override(s)`)
    }

    // Load folders into cache
    const { data: folderRows } = await supabase.from('folders').select('*').order('created_at')
    const { data: assignRows } = await supabase.from('folder_assignments').select('thread_id, folder_id')
    if (folderRows) {
      folderDataCache.folders = folderRows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }))
    }
    if (assignRows) {
      for (const row of assignRows) folderDataCache.assignments[row.thread_id] = row.folder_id
    }
    console.log(`  Loaded ${folderDataCache.folders.length} folder(s), ${Object.keys(folderDataCache.assignments).length} assignment(s)`)

    // Load saved drafts into cache
    const { data: draftRows } = await supabase.from('saved_drafts').select('thread_id')
    if (draftRows) {
      savedDraftsCache = new Set(draftRows.map((r) => r.thread_id))
      console.log(`  Loaded ${draftRows.length} saved draft(s)`)
    }

    // Load Slack notified thread IDs into cache
    const { data: slackRows } = await supabase.from('slack_notifications').select('thread_id, status, approved_at')
    if (slackRows) {
      for (const row of slackRows) slackNotifiedCache.add(row.thread_id)
      console.log(`  Loaded ${slackRows.length} Slack notification(s)`)

      // Recover any pending approval timers (server was restarted mid-countdown)
      const pendingApprovals = slackRows.filter((r) => r.status === 'approved' && r.approved_at)
      for (const row of pendingApprovals) {
        const elapsed = Date.now() - new Date(row.approved_at).getTime()
        const remaining = 5 * 60 * 1000 - elapsed
        if (remaining > 0) {
          console.log(`  Rescheduling Slack send for ${row.thread_id} in ${Math.round(remaining / 1000)}s`)
          scheduleApprovalSend(row.thread_id, remaining)
        } else {
          console.log(`  Sending overdue Slack approval for ${row.thread_id}`)
          sendApprovedEmail(row.thread_id)
        }
      }
    }
  } else {
    console.log('  Supabase: not configured — using local filesystem')

    // Load tokens from filesystem
    for (const account of TARGET_ACCOUNTS) {
      const saved = await loadTokens(account)
      if (saved) {
        clients[account].setCredentials(saved)
        console.log(`  Loaded tokens for ${account}`)
      }
    }

    // Load categories from filesystem
    try {
      if (fs.existsSync(CATEGORIES_PATH)) {
        categoryOverridesCache = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'))
      }
    } catch {}

    // Load folders from filesystem
    try {
      if (fs.existsSync(FOLDERS_PATH)) {
        folderDataCache = JSON.parse(fs.readFileSync(FOLDERS_PATH, 'utf8'))
      }
    } catch {}

    // Load saved drafts from filesystem
    try {
      if (fs.existsSync(DRAFTS_PATH)) {
        const drafts = JSON.parse(fs.readFileSync(DRAFTS_PATH, 'utf8'))
        savedDraftsCache = new Set(Object.keys(drafts))
      }
    } catch {}
  }

  if (!process.env.ANTHROPIC_API_KEY) console.warn('  WARNING: ANTHROPIC_API_KEY not set')
  if (!process.env.GOOGLE_CLIENT_ID) console.warn('  WARNING: GOOGLE_CLIENT_ID not set')
  console.log('  kerry-brain.md:', fs.existsSync(KERRY_BRAIN_PATH) ? 'loaded' : 'NOT FOUND — AI replies will have no context')
  const connected = connectedAccounts()
  console.log('  Connected:', connected.length ? connected.join(', ') : 'none')

  startSlackPolling()
  startContentBriefScheduler()

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`  Server → http://localhost:${PORT}\n`)
  })
}

init().catch((err) => { console.error('Startup error:', err); process.exit(1) })
