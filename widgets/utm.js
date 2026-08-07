/* Shirt School — UTM Lead Tracker
 *
 * Embeddable, dependency-free script that answers one question: which platform
 * sent this lead? Works on Kajabi AND Go High Level, on any domain.
 *
 * ── How to embed ───────────────────────────────────────────────────────────
 *
 * On the LANDING / REGISTRATION page (records the visit + remembers the source):
 *   <script src="https://<dashboard-host>/widgets/utm.js" async></script>
 *
 * On the THANK-YOU / CONFIRMATION page (records the lead):
 *   <script src="https://<dashboard-host>/widgets/utm.js" data-event="lead" async></script>
 *
 * That's it. Paste into the page's footer/custom-code box on either platform.
 *
 * Optional data-attributes:
 *   data-event      "lead" on thank-you pages. Default "visit".
 *   data-campaign   pin this page to one funnel. Recommended on thank-you pages
 *                   when you run more than one funnel: a visitor who converted
 *                   on a different campaign weeks ago still carries that source
 *                   around, and this stops it being credited here.
 *   data-debug      "1" = log what it's doing to the browser console.
 *
 * ── How attribution survives the hop ───────────────────────────────────────
 *
 * The landing page URL carries ?utm_source=youtube&utm_campaign=webinar-aug17.
 * This script reads those, saves them under the landing page's own origin, and
 * mints an anonymous visitor id. On the thank-you page it looks the source back
 * up, in this order:
 *
 *   1. utm_* params on the current URL      (visitor landed straight here)
 *   2. ?ssv=<id> on the current URL         (crossed to a different domain —
 *                                            the server resolves the source)
 *   3. localStorage, 90 days                (same domain, the normal case)
 *
 * Because funnel pages usually share a domain, (3) covers most traffic. When a
 * funnel spans two domains — say kerryegeler.com → a Go High Level page — this
 * script rewrites cross-domain links to carry ssv, and the server falls back to
 * matching on a salted IP hash if even that is missing.
 *
 * No cookies, no third-party requests, no personal data beyond an email address
 * if the opt-in form on the page happens to expose one.
 */
;(function () {
  'use strict'

  var STORAGE_KEY = 'ss_utm_attr'
  var VISITOR_KEY = 'ss_utm_vid'
  var SENT_KEY = 'ss_utm_sent'
  var TTL_DAYS = 90

  // ── Locate ourselves ───────────────────────────────────────────────────────
  // The API lives on whatever host served this file, so the same snippet works
  // unchanged from kerryegeler.com, shirtschool.com, or a Go High Level domain.
  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script')
      for (var i = all.length - 1; i >= 0; i--) {
        if ((all[i].src || '').indexOf('/widgets/utm.js') !== -1) return all[i]
      }
      return null
    })()

  if (!script) return

  var API_BASE = script.src.replace(/\/widgets\/utm\.js.*$/, '')
  var EVENT_TYPE = (script.getAttribute('data-event') || 'visit').toLowerCase()
  var FORCED_CAMPAIGN = script.getAttribute('data-campaign') || null
  var DEBUG = script.getAttribute('data-debug') === '1'

  function log() {
    if (!DEBUG) return
    try {
      var args = ['[ss-utm]'].concat([].slice.call(arguments))
      console.log.apply(console, args)
    } catch (e) {}
  }

  // ── Storage helpers (never throw — Safari private mode disables these) ─────

  function store(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {}
  }

  function load(key) {
    try {
      var raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  }

  function param(name) {
    try {
      var v = new URLSearchParams(location.search).get(name)
      return v && v.trim() ? v.trim() : null
    } catch (e) {
      return null
    }
  }

  // ── Visitor id ─────────────────────────────────────────────────────────────
  // Anonymous and random — it identifies a browser across the funnel, nothing
  // more. An id arriving via ?ssv= (a cross-domain hop) always wins so both
  // domains agree on who this is.

  function uuid() {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID()
    } catch (e) {}
    return 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }

  var incomingVid = param('ssv')
  var visitorId = incomingVid || load(VISITOR_KEY) || uuid()
  store(VISITOR_KEY, visitorId)

  // ── Attribution ────────────────────────────────────────────────────────────

  function readUtmFromUrl() {
    var source = param('utm_source')
    var campaign = param('utm_campaign')
    if (!source && !campaign) return null
    return {
      source: source,
      campaign: campaign,
      medium: param('utm_medium'),
      content: param('utm_content'),
      term: param('utm_term'),
      landing_url: location.href.split('#')[0],
      at: Date.now(),
    }
  }

  function readStoredAttribution() {
    var saved = load(STORAGE_KEY)
    if (!saved || !saved.at) return null
    if (Date.now() - saved.at > TTL_DAYS * 24 * 60 * 60 * 1000) return null
    return saved
  }

  // Fresh tags on the URL start a new session and overwrite whatever was saved
  // — the most recent click is the one that gets credit.
  var fromUrl = readUtmFromUrl()
  if (fromUrl) store(STORAGE_KEY, fromUrl)
  var attribution = fromUrl || readStoredAttribution() || {}

  // Guard against crediting one funnel's lead to another funnel's source. A
  // visitor who registered for the webinar three weeks ago still carries that
  // attribution; if they later reach the challenge thank-you page by typing the
  // URL, the saved webinar source must not follow them. Setting data-campaign on
  // the page makes it authoritative and discards attribution from anywhere else.
  if (FORCED_CAMPAIGN && !fromUrl) {
    if (attribution.campaign && attribution.campaign !== FORCED_CAMPAIGN) {
      log('discarding stale attribution from campaign', attribution.campaign)
      attribution = {}
    }
    attribution.campaign = FORCED_CAMPAIGN
  }

  // ── Email, captured only if the page hands it to us ────────────────────────

  function emailFromUrl() {
    var candidates = ['email', 'contact_email', 'Email', 'user_email']
    for (var i = 0; i < candidates.length; i++) {
      var v = param(candidates[i])
      if (v && v.indexOf('@') !== -1) return v.toLowerCase()
    }
    return null
  }

  function rememberEmail(value) {
    if (!value || value.indexOf('@') === -1) return
    store('ss_utm_email', { email: String(value).trim().toLowerCase(), at: Date.now() })
  }

  function recalledEmail() {
    var saved = load('ss_utm_email')
    if (!saved || !saved.email) return null
    if (Date.now() - saved.at > 24 * 60 * 60 * 1000) return null
    return saved.email
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  function send(eventType) {
    var payload = {
      event_type: eventType,
      visitor_id: visitorId,
      campaign: attribution.campaign || FORCED_CAMPAIGN || null,
      source: attribution.source || null,
      medium: attribution.medium || null,
      content: attribution.content || null,
      term: attribution.term || null,
      landing_url: attribution.landing_url || null,
      page_url: location.href.split('#')[0],
      referrer: document.referrer || null,
      email: emailFromUrl() || recalledEmail() || null,
    }

    // One lead per visitor per campaign — refreshing the thank-you page or
    // hitting back-then-forward must not inflate the count. The server enforces
    // this too; this check just avoids the pointless round trip.
    var sentKey = null
    if (eventType === 'lead') {
      sentKey = visitorId + ':' + (payload.campaign || 'direct')
      var alreadySent = load(SENT_KEY)
      if (alreadySent && alreadySent.key === sentKey) {
        log('lead already recorded for', sentKey)
        return
      }
    }

    log('sending', payload)

    var url = API_BASE + '/api/utm/collect'
    var body = JSON.stringify(payload)

    // Only mark it sent once a send actually got underway. Marking up front
    // would lose the lead for good if the request never left the browser — and
    // the server deduplicates anyway, so a retry costs nothing.
    function markSent() {
      if (sentKey) store(SENT_KEY, { key: sentKey, at: Date.now() })
    }

    // The body is JSON, but it MUST go out as text/plain. Content types beyond
    // text/plain, form-urlencoded and multipart are not CORS-safelisted, so
    // application/json forces a preflight — and iOS Safari silently drops any
    // sendBeacon that would need one. That made iPhone traffic vanish while
    // Chrome worked fine. text/plain skips the preflight entirely and saves a
    // round trip; the server parses the string back into JSON. Do not "fix"
    // this back to application/json.
    //
    // sendBeacon first because it survives the page unloading mid-request,
    // which matters on thank-you pages that redirect straight somewhere else.
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
        if (navigator.sendBeacon(url, blob)) {
          markSent()
          return
        }
      }
    } catch (e) {}

    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body,
        keepalive: true,
        mode: 'cors',
      }).then(markSent).catch(function () {})
    } catch (e) {}
  }

  // ── Carry the visitor id across domains ────────────────────────────────────
  // Only rewrites links that leave this domain, so same-domain funnels (the
  // common case) are untouched and rely on localStorage instead.

  function decorateCrossDomainLinks() {
    var links = document.getElementsByTagName('a')
    for (var i = 0; i < links.length; i++) {
      var a = links[i]
      var href = a.getAttribute('href')
      if (!href || href.charAt(0) === '#') continue
      try {
        var u = new URL(href, location.href)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
        if (u.hostname === location.hostname) continue
        if (u.searchParams.get('ssv')) continue
        u.searchParams.set('ssv', visitorId)
        a.setAttribute('href', u.toString())
      } catch (e) {}
    }
  }

  // ── Watch opt-in forms for an email address ────────────────────────────────
  // Purely opportunistic: it makes leads easier to reconcile later, and nothing
  // breaks when the form has no email field or is inside a cross-origin iframe.

  function watchForms() {
    document.addEventListener(
      'submit',
      function (e) {
        try {
          var form = e.target
          if (!form || !form.getElementsByTagName) return
          var inputs = form.getElementsByTagName('input')
          for (var i = 0; i < inputs.length; i++) {
            var input = inputs[i]
            var looksLikeEmail =
              input.type === 'email' ||
              /email/i.test(input.name || '') ||
              /email/i.test(input.id || '')
            if (looksLikeEmail && input.value && input.value.indexOf('@') !== -1) {
              rememberEmail(input.value)
              log('captured email from form')
              break
            }
          }
        } catch (err) {}
      },
      true
    )
  }

  // ── Go ─────────────────────────────────────────────────────────────────────

  function start() {
    send(EVENT_TYPE === 'lead' ? 'lead' : 'visit')
    watchForms()
    decorateCrossDomainLinks()
    // Kajabi and GHL both inject content after load; re-decorate once things settle.
    setTimeout(decorateCrossDomainLinks, 1500)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
