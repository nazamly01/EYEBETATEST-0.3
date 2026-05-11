/**
 * EYE — Behavioral Analytics Tracker (analytics.js)
 *
 * Tracks: page views, product views, time spent on product pages.
 * Saves events to Supabase `analytics_events` table.
 *
 * SETUP: Run supabase/EYE_analytics.sql in your Supabase SQL Editor first.
 */
const EyeAnalytics = (function () {
  let _sessionId = null;
  let _productViewStart = null;
  let _currentProductId = null;
  let _currentProductName = null;
  let _heartbeatTimer = null;
  let _ready = false;

  /* ── Session ID ────────────────────────────────────────── */
  function getSessionId() {
    if (_sessionId) return _sessionId;
    try {
      let sid = sessionStorage.getItem('eye_sid');
      if (!sid) {
        sid = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('eye_sid', sid);
      }
      _sessionId = sid;
    } catch (_) {
      _sessionId = 'sid_' + Date.now().toString(36);
    }
    return _sessionId;
  }

  /* ── Internal save ─────────────────────────────────────── */
  async function _save(payload) {
    try {
      if (typeof EyeApi === 'undefined' || !EyeApi.isRemote()) return;
      await EyeApi.saveAnalyticsEvent(payload);
    } catch (e) {
      /* silent — analytics must never break the page */
    }
  }

  /* ── Public API ────────────────────────────────────────── */

  /** Call once per page (pass activePage string e.g. 'home', 'shop', 'cart') */
  function trackPageView(page) {
    if (!_ready) { _ready = true; }
    _save({
      event_type: 'page_view',
      page: page || location.pathname,
      session_id: getSessionId(),
    });

    /* Heartbeat every 55 s — keeps session "alive" for live-visitor count */
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(() => {
      _save({
        event_type: 'heartbeat',
        page: page || location.pathname,
        session_id: getSessionId(),
      });
    }, 55000);
  }

  /** Call when a product detail page loads */
  function trackProductView(productId, productName) {
    _currentProductId = productId ? String(productId) : null;
    _currentProductName = productName || null;
    _productViewStart = Date.now();
    _save({
      event_type: 'product_view',
      product_id: _currentProductId,
      product_name: _currentProductName,
      session_id: getSessionId(),
    });
  }

  /** Call on page exit / visibility hidden to save time-on-page */
  function trackProductExit() {
    if (!_currentProductId || !_productViewStart) return;
    const durationSec = Math.round((Date.now() - _productViewStart) / 1000);
    if (durationSec < 2) { _productViewStart = null; _currentProductId = null; return; }
    _save({
      event_type: 'product_exit',
      product_id: _currentProductId,
      product_name: _currentProductName,
      duration_sec: durationSec,
      session_id: getSessionId(),
    });
    _productViewStart = null;
    _currentProductId = null;
  }

  /* Register exit handlers */
  window.addEventListener('beforeunload', trackProductExit);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') trackProductExit();
  });

  return { trackPageView, trackProductView, trackProductExit, getSessionId };
})();
