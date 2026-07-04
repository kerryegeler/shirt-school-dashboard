/* Shirt School — Social Proof Popup Widget
 *
 * Embeddable, dependency-free script that shows "Joe from Florida just grabbed
 * their ticket…" popups backed by REAL purchases from the dashboard's Kajabi
 * sync (via the public, sanitized /api/social-proof/purchases endpoint).
 *
 * Embed (one line, e.g. in a Kajabi page's footer code):
 *   <script src="https://<dashboard-host>/widgets/social-proof.js" async
 *     data-product="launch your brand challenge"></script>
 *
 * Optional data-attributes:
 *   data-product   product name filter, quote/punctuation-insensitive substring
 *                  (default: "launch your brand challenge")
 *   data-message   popup text. {name} = first name, {from} = " from Florida"
 *                  (default: "{name}{from} just grabbed their ticket to the
 *                  Launch Your Brand Challenge!")
 *   data-position  "bottom-left" (default) or "bottom-right"
 *   data-accent    accent color (default "#e02b20" to match the challenge page)
 *   data-delay     seconds before the first popup (default 6)
 *   data-duration  seconds each popup stays visible (default 7)
 *   data-gap       seconds between popups (default 14)
 *   data-days      how far back to show purchases (default 45)
 *   data-loop      "1" = keep cycling forever (default: one pass per page view)
 *   data-anon      "1" = include purchases with no name as "Someone"
 *   data-test      "1" = demo mode: starts fast, ignores dismissal, and shows
 *                  sample data if there are no real purchases. NEVER leave this
 *                  on a live page.
 */
;(function () {
  'use strict'

  var script = document.currentScript
  if (!script || !script.src) return
  var cfg = script.dataset || {}

  var API_BASE = new URL(script.src).origin
  var PRODUCT = cfg.product || 'launch your brand challenge'
  var MESSAGE = cfg.message || '{name}{from} just grabbed their ticket to the Launch Your Brand Challenge!'
  var POSITION = cfg.position === 'bottom-right' ? 'bottom-right' : 'bottom-left'
  var ACCENT = cfg.accent || '#e02b20'
  var DELAY = num(cfg.delay, 6) * 1000
  var DURATION = num(cfg.duration, 7) * 1000
  var GAP = num(cfg.gap, 14) * 1000
  var DAYS = num(cfg.days, 45)
  var LOOP = cfg.loop === '1'
  var ANON = cfg.anon === '1'
  var TEST = cfg.test === '1'
  var DISMISS_KEY = 'ss_social_proof_dismissed'

  function num(v, fallback) {
    var n = parseFloat(v)
    return isNaN(n) || n < 0 ? fallback : n
  }

  function dismissed() {
    if (TEST) return false
    try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch (e) { return false }
  }

  function timeAgo(iso) {
    var ms = Date.now() - new Date(iso).getTime()
    if (isNaN(ms) || ms < 0) return 'recently'
    var m = Math.floor(ms / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago')
    var h = Math.floor(m / 60)
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago')
    var d = Math.floor(h / 24)
    if (d <= 7) return d + (d === 1 ? ' day ago' : ' days ago')
    return 'recently'
  }

  var reducedMotion = false
  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {}

  function init() {
    if (dismissed()) return

    // Single instance: remove any previous copy of the widget (double-embeds,
    // dashboard demo re-runs).
    var prev = document.querySelectorAll('[data-ss-social-proof]')
    for (var i = 0; i < prev.length; i++) prev[i].parentNode.removeChild(prev[i])

    var qs = '?product=' + encodeURIComponent(PRODUCT) + '&days=' + DAYS + '&limit=20'
    fetch(API_BASE + '/api/social-proof/purchases' + qs)
      .then(function (r) { return r.ok ? r.json() : { purchases: [] } })
      .then(function (data) {
        var events = (data.purchases || []).filter(function (p) {
          return p && p.at && (p.name || ANON)
        })
        if (!events.length && TEST) {
          events = [
            { name: 'Kerry', location: 'Texas', at: new Date(Date.now() - 8 * 60000).toISOString() },
            { name: 'Sarah', location: 'Florida', at: new Date(Date.now() - 42 * 60000).toISOString() },
            { name: 'Mike', location: null, at: new Date(Date.now() - 3 * 3600000).toISOString() },
          ]
        }
        if (events.length) run(events)
      })
      .catch(function () {}) // social proof must never break the host page
  }

  function run(events) {
    var host = document.createElement('div')
    host.setAttribute('data-ss-social-proof', '')
    document.body.appendChild(host)
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host

    var style = document.createElement('style')
    style.textContent =
      '.wrap{position:fixed;bottom:16px;' + (POSITION === 'bottom-right' ? 'right:16px' : 'left:16px') + ';' +
        'bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;' +
        'pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      '.card{pointer-events:auto;display:flex;align-items:center;gap:12px;position:relative;' +
        'background:#fff;color:#1a1a1a;border:1px solid rgba(0,0,0,0.07);border-radius:14px;' +
        'box-shadow:0 6px 28px rgba(0,0,0,0.16),0 2px 6px rgba(0,0,0,0.08);' +
        'padding:13px 34px 13px 14px;width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;' +
        'opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.9,.3,1.1)}' +
      '.card.show{opacity:1;transform:translateY(0)}' +
      (reducedMotion ? '.card{transition:none}' : '') +
      '.avatar{flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
        'background:' + ACCENT + '1a;color:' + ACCENT + '}' +
      '.avatar svg{width:22px;height:22px}' +
      '.txt{min-width:0}' +
      '.msg{font-size:13.5px;line-height:1.4;font-weight:500}' +
      '.msg b{font-weight:700}' +
      '.sub{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:11.5px;color:#8a8a8a}' +
      '.sub svg{width:12px;height:12px;color:#18a558;flex:none}' +
      '.x{position:absolute;top:6px;right:6px;width:22px;height:22px;border:none;background:transparent;' +
        'color:#b5b5b5;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;padding:0}' +
      '.x:hover{color:#555;background:rgba(0,0,0,0.05)}' +
      '.x svg{width:11px;height:11px}' +
      '@media (max-width:640px){.wrap{left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px))}' +
        '.card{width:100%;max-width:none}}'
    root.appendChild(style)

    var wrap = document.createElement('div')
    wrap.className = 'wrap'
    root.appendChild(wrap)

    var card = document.createElement('div')
    card.className = 'card'
    card.setAttribute('role', 'status')
    card.setAttribute('aria-live', 'polite')
    wrap.appendChild(card)

    var PERSON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>'
    var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
    var X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'

    var stopped = false
    var timers = []
    function later(fn, ms) { timers.push(setTimeout(fn, ms)) }
    function stop() {
      stopped = true
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i])
      card.classList.remove('show')
      later(function () { if (host.parentNode) host.parentNode.removeChild(host) }, 400)
    }

    function render(ev) {
      // All dynamic strings go in via textContent — never innerHTML.
      card.innerHTML = ''

      var avatar = document.createElement('div')
      avatar.className = 'avatar'
      avatar.innerHTML = PERSON_SVG
      card.appendChild(avatar)

      var txt = document.createElement('div')
      txt.className = 'txt'

      var msg = document.createElement('div')
      msg.className = 'msg'
      var fromText = ev.location ? ' from ' + ev.location : ''
      var text = MESSAGE.replace('{from}', fromText)
      var parts = text.split('{name}')
      msg.appendChild(document.createTextNode(parts[0]))
      if (parts.length > 1) {
        var b = document.createElement('b')
        b.textContent = ev.name || 'Someone'
        msg.appendChild(b)
        msg.appendChild(document.createTextNode(parts.slice(1).join('{name}')))
      }
      txt.appendChild(msg)

      var sub = document.createElement('div')
      sub.className = 'sub'
      var check = document.createElement('span')
      check.innerHTML = CHECK_SVG
      check.style.display = 'inline-flex'
      sub.appendChild(check)
      sub.appendChild(document.createTextNode(timeAgo(ev.at) + ' · Verified purchase'))
      txt.appendChild(sub)

      card.appendChild(txt)

      var x = document.createElement('button')
      x.className = 'x'
      x.setAttribute('aria-label', 'Dismiss')
      x.innerHTML = X_SVG
      x.onclick = function () {
        try { sessionStorage.setItem(DISMISS_KEY, '1') } catch (e) {}
        stop()
      }
      card.appendChild(x)
    }

    function cycle(idx) {
      if (stopped) return
      if (idx >= events.length) {
        if (!LOOP) { stop(); return }
        idx = 0
      }
      render(events[idx])
      // Force a reflow so the transition replays for each popup
      void card.offsetWidth
      card.classList.add('show')
      later(function () {
        card.classList.remove('show')
        later(function () { cycle(idx + 1) }, GAP)
      }, DURATION)
    }

    later(function () { cycle(0) }, TEST ? 800 : DELAY)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
