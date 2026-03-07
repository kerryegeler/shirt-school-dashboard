import 'dotenv/config'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import { google } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

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
  'openid',
  'email',
  'profile',
]

// ─── Anthropic ────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Category override storage ────────────────────────────────────────────────
const CATEGORIES_PATH = path.resolve('.categories.json')

function loadCategoryOverrides() {
  try {
    if (fs.existsSync(CATEGORIES_PATH)) return JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'))
  } catch {}
  return {}
}

function saveCategoryOverride(id, category) {
  const data = loadCategoryOverrides()
  data[id] = category
  fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(data, null, 2))
}

// ─── Folder storage ────────────────────────────────────────────────────────────
const FOLDERS_PATH = path.resolve('.folders.json')

function loadFolders() {
  try {
    if (fs.existsSync(FOLDERS_PATH)) return JSON.parse(fs.readFileSync(FOLDERS_PATH, 'utf8'))
  } catch {}
  return { folders: [], assignments: {} }
}

function saveFolders(data) {
  fs.writeFileSync(FOLDERS_PATH, JSON.stringify(data, null, 2))
}

// ─── Per-account token storage ────────────────────────────────────────────────
function tokenPath(account) {
  return path.resolve(`.tokens-${account.split('@')[0]}.json`)
}

function loadTokens(account) {
  try {
    const p = tokenPath(account)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {}
  return null
}

function saveTokens(account, tokens) {
  fs.writeFileSync(tokenPath(account), JSON.stringify(tokens, null, 2))
}

function clearTokens(account) {
  const p = tokenPath(account)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}

// ─── One OAuth2 client per target account ────────────────────────────────────
const clients = {}

for (const account of TARGET_ACCOUNTS) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  )
  const saved = loadTokens(account)
  if (saved) {
    client.setCredentials(saved)
    console.log(`  Loaded tokens for ${account}`)
  }
  client.on('tokens', (newTokens) => {
    const current = loadTokens(account) || {}
    const merged = { ...current, ...newTokens }
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

    const merged = { ...(loadTokens(email) || {}), ...tokens }
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

app.get('/api/emails', requireAuth, async (req, res) => {
  const { archived } = req.query
  const connected = connectedAccounts()
  try {
    const threadsByAccount = await Promise.all(
      connected.map(async (account) => {
        const gmail = google.gmail({ version: 'v1', auth: clients[account] })
        const q = archived === 'true' ? '-in:inbox -in:trash -in:spam -in:draft' : 'in:inbox'
        const listRes = await gmail.users.threads.list({ userId: 'me', maxResults: 25, q })
        if (!listRes.data.threads?.length) return []
        const threads = await Promise.all(
          listRes.data.threads.map((t) =>
            gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' }).then((r) => r.data)
          )
        )
        return threads.map((t) => buildThreadObject(t, account)).filter(Boolean)
      })
    )
    // Deduplicate threads that appear in both accounts (same thread ID = same conversation)
    // and merge their messages chronologically
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
    const emails = [...threadMap.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    res.json({ emails })
  } catch (error) {
    console.error('Gmail fetch error:', error.message)
    res.status(error.code === 401 ? 401 : 500).json({ error: 'Failed to fetch emails from Gmail.' })
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
  const { email, draft, fromAccount } = req.body
  if (!email || !draft) return res.status(400).json({ error: 'Missing email or draft' })

  const sendFrom =
    fromAccount && TARGET_ACCOUNTS.includes(fromAccount) && hasTokens(fromAccount)
      ? fromAccount
      : email.account

  if (!hasTokens(sendFrom)) {
    return res.status(400).json({ error: `${sendFrom} is not connected. Connect it first.` })
  }

  const gmail = google.gmail({ version: 'v1', auth: clients[sendFrom] })
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: clients[sendFrom] })
    const { data: userInfo } = await oauth2.userinfo.get()

    const raw = buildReplyRaw({
      from: `${userInfo.name || sendFrom} <${sendFrom}>`,
      to: `${email.name} <${email.from}>`,
      subject: email.subject,
      inReplyTo: email.messageId,
      references: email.messageId,
      body: draft,
    })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: email.threadId } })
    res.json({ success: true, sentFrom: sendFrom })
  } catch (error) {
    console.error('Gmail send error:', error.message)
    res.status(500).json({ error: 'Failed to send email via Gmail.' })
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

app.post('/api/folders', requireAuth, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Folder name required' })
  const data = loadFolders()
  const folder = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString() }
  data.folders.push(folder)
  saveFolders(data)
  res.json({ folder })
})

app.delete('/api/folders/:id', requireAuth, (req, res) => {
  const { id } = req.params
  const data = loadFolders()
  data.folders = data.folders.filter((f) => f.id !== id)
  for (const [threadId, folderId] of Object.entries(data.assignments)) {
    if (folderId === id) delete data.assignments[threadId]
  }
  saveFolders(data)
  res.json({ success: true })
})

app.patch('/api/emails/:id/folder', requireAuth, (req, res) => {
  const { id } = req.params
  const { folderId } = req.body
  const data = loadFolders()
  if (folderId) {
    data.assignments[id] = folderId
  } else {
    delete data.assignments[id]
  }
  saveFolders(data)
  res.json({ success: true, folderId: folderId || null })
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

app.post('/api/generate-reply', async (req, res) => {
  const { email, category } = req.body
  if (!email || !category) return res.status(400).json({ error: 'Missing email or category' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' })

  const kerryBrain = loadKerryBrain()
  const personaName = PERSONA_NAMES[category] || 'Kerry'

  const systemPrompt = `You are an AI email assistant for Shirt School. Your job is to draft email replies on behalf of Kerry or the Shirt School Support Team.

${kerryBrain ? `--- BEGIN CONTEXT ---\n${kerryBrain}\n--- END CONTEXT ---\n` : ''}
The email you are replying to is categorized as: ${category}

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nShirt School API server → http://localhost:${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) console.warn('  WARNING: ANTHROPIC_API_KEY not set')
  if (!process.env.GOOGLE_CLIENT_ID) console.warn('  WARNING: GOOGLE_CLIENT_ID not set')
  console.log('  kerry-brain.md:', fs.existsSync(KERRY_BRAIN_PATH) ? 'loaded' : 'NOT FOUND — AI replies will have no context')
  const connected = connectedAccounts()
  console.log('  Connected:', connected.length ? connected.join(', ') : 'none')
})
