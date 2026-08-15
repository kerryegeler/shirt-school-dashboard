/* Shirt School — Live Chat Widget
 *
 * Embeddable, dependency-free chat bubble. The visitor types on your landing
 * page, the message opens a thread in Slack, and your reply in that thread
 * appears back in their chat window. Works on Kajabi AND Go High Level, on any
 * domain.
 *
 * Embed (one line, in the page's footer / custom code box):
 *   <script src="https://<dashboard-host>/widgets/chat.js"
 *     data-widget="<widget-id>" async></script>
 *
 * Everything else — title, greeting, position, color — is configured in the
 * dashboard and fetched at load, so changing the look never means re-pasting
 * the embed code. Optional overrides, useful for one-off pages:
 *
 *   data-position   "bottom-right" (default) or "bottom-left"
 *   data-accent     accent color, e.g. "#e02b20"
 *   data-title      header title
 *   data-greeting   the first bubble the visitor sees
 *   data-open       "1" = start with the panel open (handy for testing)
 *
 * The conversation id + read token live in localStorage, so a visitor who
 * refreshes, or comes back an hour later, keeps the same thread instead of
 * starting a new one in your Slack channel.
 */
;(function () {
  'use strict'

  var script = document.currentScript
  if (!script || !script.src) return
  var cfg = script.dataset || {}
  var WIDGET_ID = cfg.widget || ''
  var API_BASE = new URL(script.src).origin

  if (window.__ssChatLoaded) return // two copies of the snippet = one bubble
  window.__ssChatLoaded = true

  // Poll fast while the visitor is reading the panel, slowly when it's closed
  // (just enough to light up the unread badge), and not at all in a background
  // tab — a landing page left open all day shouldn't hammer the server.
  var POLL_OPEN_MS = 4000
  var POLL_CLOSED_MS = 20000
  var IDLE_AFTER_MS = 30 * 60 * 1000 // stop polling a conversation gone quiet

  var STORE_KEY = 'ss_chat_' + (WIDGET_ID || 'default')

  var state = {
    conversationId: null,
    token: null,
    name: null,
    email: null,
    cursor: 0,
    open: false,
    lastActivity: Date.now(),
    unread: 0,
    sending: false,
    askedDetails: false,
    messages: [],
  }

  var conf = {
    title: cfg.title || 'Chat with Kerry',
    subtitle: 'Usually replies in a few minutes',
    greeting: cfg.greeting || 'Hey! Ask me anything — this goes straight to my phone.',
    position: cfg.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    accent: cfg.accent || '#e02b20',
    askEmail: true,
  }

  var els = {}
  var pollTimer = null

  // ── Storage ───────────────────────────────────────────────────────────────

  function loadStored() {
    try {
      var raw = localStorage.getItem(STORE_KEY)
      if (!raw) return
      var saved = JSON.parse(raw)
      if (!saved || !saved.conversationId || !saved.token) return
      state.conversationId = saved.conversationId
      state.token = saved.token
      state.name = saved.name || null
      state.email = saved.email || null
      state.askedDetails = !!saved.askedDetails
    } catch (e) {}
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        conversationId: state.conversationId,
        token: state.token,
        name: state.name,
        email: state.email,
        askedDetails: state.askedDetails,
      }))
    } catch (e) {}
  }

  // ── Network ───────────────────────────────────────────────────────────────

  function loadConfig(done) {
    if (!WIDGET_ID) return done()
    var xhr = new XMLHttpRequest()
    xhr.open('GET', API_BASE + '/api/chat/config?widget=' + encodeURIComponent(WIDGET_ID), true)
    xhr.onload = function () {
      try {
        var d = JSON.parse(xhr.responseText)
        if (d && d.widget) {
          var w = d.widget
          // Explicit data-attributes win over the dashboard settings
          conf.title = cfg.title || w.title || conf.title
          conf.subtitle = w.subtitle || conf.subtitle
          conf.greeting = cfg.greeting || w.greeting || conf.greeting
          conf.position = cfg.position ? conf.position : (w.position === 'bottom-left' ? 'bottom-left' : 'bottom-right')
          conf.accent = cfg.accent || w.accent || conf.accent
          conf.askEmail = w.askEmail !== false
        }
      } catch (e) {}
      done()
    }
    xhr.onerror = function () { done() }
    xhr.send()
  }

  // Sent as text/plain on purpose: it keeps the request "simple" so the browser
  // never fires a CORS preflight. Some mobile Safari configurations drop the
  // preflight entirely, which would silently swallow every message.
  function postMessage(text, done) {
    var xhr = new XMLHttpRequest()
    xhr.open('POST', API_BASE + '/api/chat/message', true)
    xhr.setRequestHeader('Content-Type', 'text/plain')
    xhr.onload = function () {
      var d = null
      try { d = JSON.parse(xhr.responseText) } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && d) done(null, d)
      else done((d && d.error) || 'Message failed to send')
    }
    xhr.onerror = function () { done('Message failed to send') }
    xhr.send(JSON.stringify({
      widgetId: WIDGET_ID,
      conversationId: state.conversationId,
      token: state.token,
      name: state.name,
      email: state.email,
      body: text,
      pageUrl: location.href,
      referrer: document.referrer || null,
    }))
  }

  function poll() {
    if (!state.conversationId || !state.token) return
    var xhr = new XMLHttpRequest()
    xhr.open('GET', API_BASE + '/api/chat/poll?conversation=' + encodeURIComponent(state.conversationId) +
      '&token=' + encodeURIComponent(state.token) + '&after=' + state.cursor, true)
    xhr.onload = function () {
      if (xhr.status === 404) {
        // The conversation was deleted server-side — forget it and start clean
        try { localStorage.removeItem(STORE_KEY) } catch (e) {}
        state.conversationId = null
        state.token = null
        return
      }
      var d = null
      try { d = JSON.parse(xhr.responseText) } catch (e) {}
      if (!d || !d.messages || !d.messages.length) return
      var gotAgentReply = false
      for (var i = 0; i < d.messages.length; i++) {
        var m = d.messages[i]
        if (m.seq > state.cursor) state.cursor = m.seq
        // Skip our own messages coming back around — they're already rendered
        if (m.role === 'visitor' && state.messages.some(function (x) { return x.seq === m.seq })) continue
        state.messages.push(m)
        appendBubble(m)
        if (m.role === 'agent') gotAgentReply = true
      }
      if (gotAgentReply) {
        state.lastActivity = Date.now()
        if (!state.open) {
          state.unread++
          renderBadge()
          chime()
        }
      }
    }
    xhr.send()
  }

  function schedulePoll() {
    clearTimeout(pollTimer)
    var interval = state.open ? POLL_OPEN_MS : POLL_CLOSED_MS
    pollTimer = setTimeout(function () {
      var idle = Date.now() - state.lastActivity > IDLE_AFTER_MS
      var hidden = document.hidden
      if (state.conversationId && !hidden && (!idle || state.open)) poll()
      schedulePoll()
    }, interval)
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  var CSS = [
    '.ssc-root{position:fixed;z-index:2147483000;bottom:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.ssc-root.ssc-right{right:20px}.ssc-root.ssc-left{left:20px}',
    '.ssc-bubble{width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--ssc-accent);color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;transition:transform .18s ease;position:relative;padding:0}',
    '.ssc-bubble:hover{transform:scale(1.06)}',
    '.ssc-bubble svg{width:26px;height:26px}',
    '.ssc-badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#111;color:#fff;font-size:12px;font-weight:700;line-height:20px;padding:0 5px;box-shadow:0 0 0 2px #fff}',
    '.ssc-panel{position:absolute;bottom:74px;width:352px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.24);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease}',
    '.ssc-root.ssc-right .ssc-panel{right:0}.ssc-root.ssc-left .ssc-panel{left:0}',
    '.ssc-panel.ssc-show{opacity:1;transform:none;pointer-events:auto}',
    '.ssc-head{background:var(--ssc-accent);color:#fff;padding:16px 18px;display:flex;align-items:center;gap:10px;flex:0 0 auto}',
    '.ssc-head-txt{flex:1;min-width:0}',
    '.ssc-title{font-size:15px;font-weight:700;line-height:1.2}',
    '.ssc-sub{font-size:12px;opacity:.85;margin-top:2px}',
    '.ssc-close{background:transparent;border:0;color:#fff;cursor:pointer;opacity:.85;padding:4px;line-height:0}',
    '.ssc-close:hover{opacity:1}.ssc-close svg{width:16px;height:16px}',
    '.ssc-log{flex:1;overflow-y:auto;padding:16px;background:#f7f7f8;display:flex;flex-direction:column;gap:8px}',
    '.ssc-msg{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.ssc-msg a{color:inherit}',
    '.ssc-them{align-self:flex-start;background:#fff;color:#1a1a1a;border-bottom-left-radius:5px;box-shadow:0 1px 2px rgba(0,0,0,.08)}',
    '.ssc-me{align-self:flex-end;background:var(--ssc-accent);color:#fff;border-bottom-right-radius:5px}',
    '.ssc-meta{font-size:11px;color:#8a8a8f;align-self:center;padding:2px 0}',
    '.ssc-form{flex:0 0 auto;padding:12px;background:#fff;border-top:1px solid #ececef;display:flex;flex-direction:column;gap:8px}',
    '.ssc-fields{display:flex;gap:8px}',
    '.ssc-input{width:100%;border:1px solid #ddd;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;color:#1a1a1a;background:#fff}',
    '.ssc-input:focus{border-color:var(--ssc-accent)}',
    '.ssc-row{display:flex;gap:8px;align-items:flex-end}',
    '.ssc-ta{resize:none;max-height:96px;line-height:1.4}',
    '.ssc-send{flex:0 0 auto;width:40px;height:40px;border-radius:10px;border:0;background:var(--ssc-accent);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
    '.ssc-send:disabled{opacity:.45;cursor:default}.ssc-send svg{width:18px;height:18px}',
    '.ssc-err{font-size:12px;color:#c02419;padding:0 2px}',
    '.ssc-foot{font-size:11px;color:#a0a0a6;text-align:center;padding:0 0 2px}',
    '@media (max-width:420px){.ssc-panel{width:calc(100vw - 32px);height:calc(100vh - 130px)}}',
  ].join('')

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.5 8.5 0 01-3.9-.9L3 21l1.9-5a8.4 8.4 0 01-.9-3.9 8.5 8.5 0 018.4-9h.6a8.5 8.5 0 018 8v.4z"/></svg>'
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>'

  function el(tag, cls, html) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (html != null) n.innerHTML = html
    return n
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  // Messages are rendered as escaped text; only bare URLs become links, so a
  // visitor can never inject markup into the page they're chatting from.
  function linkify(s) {
    return escapeHtml(s).replace(/(https?:\/\/[^\s<]+)/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>'
    })
  }

  function build() {
    var style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    var root = el('div', 'ssc-root ' + (conf.position === 'bottom-left' ? 'ssc-left' : 'ssc-right'))
    root.setAttribute('data-ss-chat', '1')
    root.style.setProperty('--ssc-accent', conf.accent)

    var panel = el('div', 'ssc-panel')

    var head = el('div', 'ssc-head')
    var headTxt = el('div', 'ssc-head-txt')
    headTxt.appendChild(el('div', 'ssc-title', escapeHtml(conf.title)))
    headTxt.appendChild(el('div', 'ssc-sub', escapeHtml(conf.subtitle)))
    var closeBtn = el('button', 'ssc-close', ICON_X)
    closeBtn.setAttribute('aria-label', 'Close chat')
    closeBtn.onclick = function () { toggle(false) }
    head.appendChild(headTxt)
    head.appendChild(closeBtn)

    var log = el('div', 'ssc-log')

    var form = el('form', 'ssc-form')
    // Without this the browser's own validation silently blocks submit on a
    // malformed email — no message sent, and the visitor sees only a native
    // tooltip. The widget validates the email itself, and never at the cost of
    // stopping someone from asking their question.
    form.noValidate = true
    var err = el('div', 'ssc-err')
    err.style.display = 'none'

    var fields = el('div', 'ssc-fields')
    var nameInput = el('input', 'ssc-input')
    nameInput.type = 'text'
    nameInput.placeholder = 'Your name'
    nameInput.autocomplete = 'name'
    var emailInput = el('input', 'ssc-input')
    emailInput.type = 'email'
    emailInput.placeholder = 'Email'
    emailInput.autocomplete = 'email'
    fields.appendChild(nameInput)
    fields.appendChild(emailInput)

    var row = el('div', 'ssc-row')
    var ta = el('textarea', 'ssc-input ssc-ta')
    ta.rows = 1
    ta.placeholder = 'Type your message…'
    var send = el('button', 'ssc-send', ICON_SEND)
    send.type = 'submit'
    send.setAttribute('aria-label', 'Send message')
    row.appendChild(ta)
    row.appendChild(send)

    form.appendChild(err)
    form.appendChild(fields)
    form.appendChild(row)

    panel.appendChild(head)
    panel.appendChild(log)
    panel.appendChild(form)

    var bubble = el('button', 'ssc-bubble', ICON_CHAT)
    bubble.setAttribute('aria-label', 'Open chat')
    bubble.onclick = function () { toggle(!state.open) }

    root.appendChild(panel)
    root.appendChild(bubble)
    document.body.appendChild(root)

    els = { root: root, panel: panel, log: log, form: form, err: err, fields: fields, name: nameInput, email: emailInput, ta: ta, send: send, bubble: bubble }

    // Details are asked once, up front — after that the row disappears so the
    // panel is just a conversation.
    if (!conf.askEmail || state.askedDetails) fields.style.display = 'none'
    if (state.name) nameInput.value = state.name
    if (state.email) emailInput.value = state.email

    // Enter sends, Shift+Enter makes a new line — what everyone expects.
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : send.click() }
    })
    ta.addEventListener('input', function () {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'
    })
    form.addEventListener('submit', onSubmit)
  }

  function appendBubble(m) {
    var node = el('div', 'ssc-msg ' + (m.role === 'agent' ? 'ssc-them' : 'ssc-me'), linkify(m.body))
    els.log.appendChild(node)
    els.log.scrollTop = els.log.scrollHeight
    return node
  }

  function appendMeta(text) {
    els.log.appendChild(el('div', 'ssc-meta', escapeHtml(text)))
    els.log.scrollTop = els.log.scrollHeight
  }

  function renderBadge() {
    var existing = els.bubble.querySelector('.ssc-badge')
    if (!state.unread) { if (existing) existing.remove(); return }
    if (!existing) {
      existing = el('span', 'ssc-badge')
      els.bubble.appendChild(existing)
    }
    existing.textContent = state.unread > 9 ? '9+' : String(state.unread)
  }

  function showError(msg) {
    els.err.textContent = msg
    els.err.style.display = msg ? '' : 'none'
  }

  // A short two-tone blip on a new reply. Built with WebAudio so the widget
  // stays a single file with no asset to host.
  function chime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      var ctx = new Ctx()
      var osc = ctx.createOscillator()
      var gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09)
      gain.gain.setValueAtTime(0.07, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32)
      osc.start()
      osc.stop(ctx.currentTime + 0.34)
      setTimeout(function () { try { ctx.close() } catch (e) {} }, 600)
    } catch (e) {}
  }

  function toggle(open) {
    state.open = open
    els.panel.classList.toggle('ssc-show', open)
    els.bubble.innerHTML = open ? ICON_X : ICON_CHAT
    if (open) {
      state.unread = 0
      renderBadge()
      state.lastActivity = Date.now()
      els.log.scrollTop = els.log.scrollHeight
      if (state.conversationId) poll()
      // Don't steal focus on touch devices — the keyboard covering the page on
      // open is worse than one extra tap.
      if (!('ontouchstart' in window)) els.ta.focus()
    } else {
      renderBadge() // setting innerHTML above dropped the badge node
    }
    schedulePoll()
  }

  function onSubmit(e) {
    e.preventDefault()
    if (state.sending) return
    var text = els.ta.value.trim()
    if (!text) return

    if (conf.askEmail && !state.askedDetails) {
      var email = els.email.value.trim()
      // The email is what lets Kerry follow up after they've left the page, so
      // it's worth one nudge — but never a hard block on asking a question.
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('That email doesn’t look right — fix it or clear it to continue.')
        return
      }
      state.name = els.name.value.trim() || null
      state.email = email || null
      state.askedDetails = true
      els.fields.style.display = 'none'
      persist()
    }

    showError('')
    state.sending = true
    els.send.disabled = true
    els.ta.value = ''
    els.ta.style.height = 'auto'

    var pending = appendBubble({ role: 'visitor', body: text })
    pending.style.opacity = '0.6'
    var isFirst = !state.conversationId

    postMessage(text, function (error, data) {
      state.sending = false
      els.send.disabled = false
      if (error) {
        pending.remove()
        els.ta.value = text
        showError(error)
        return
      }
      pending.style.opacity = ''
      state.conversationId = data.conversationId
      state.token = data.token
      if (data.message) {
        state.messages.push(data.message)
        if (data.message.seq > state.cursor) state.cursor = data.message.seq
      }
      state.lastActivity = Date.now()
      persist()
      if (isFirst) appendMeta('Sent — you’ll get a reply right here.')
      schedulePoll()
    })
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function start() {
    loadStored()
    loadConfig(function () {
      build()
      appendBubble({ role: 'agent', body: conf.greeting })
      // Returning visitor: replay their thread so the conversation continues
      // where it left off rather than looking like a fresh start.
      if (state.conversationId) {
        var xhr = new XMLHttpRequest()
        xhr.open('GET', API_BASE + '/api/chat/poll?conversation=' + encodeURIComponent(state.conversationId) +
          '&token=' + encodeURIComponent(state.token) + '&after=0', true)
        xhr.onload = function () {
          var d = null
          try { d = JSON.parse(xhr.responseText) } catch (e) {}
          if (d && d.messages) {
            for (var i = 0; i < d.messages.length; i++) {
              var m = d.messages[i]
              state.messages.push(m)
              appendBubble(m)
              if (m.seq > state.cursor) state.cursor = m.seq
            }
          }
          schedulePoll()
        }
        xhr.onerror = function () { schedulePoll() }
        xhr.send()
      } else {
        schedulePoll()
      }
      if (cfg.open === '1') setTimeout(function () { toggle(true) }, 400)
      // Coming back to the tab is the moment a waiting reply should appear
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && state.conversationId) poll()
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
