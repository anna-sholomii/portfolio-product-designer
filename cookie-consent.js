/*!
 * Cookie / tracking consent gate for anna-sholomii.vercel.app
 *
 * Loaded first, in <head>, before any tracking script. It:
 *  - shows a small banner on first visit (Accept / Decline)
 *  - only loads Hotjar and Mixpanel (mixpanel-analytics.js) after "Accept"
 *  - remembers the choice in localStorage so returning visitors aren't asked again
 *
 * Nothing here sends data anywhere by itself - it only decides whether the
 * other two tracking scripts get loaded at all.
 */
(function () {
  'use strict';

  var CONSENT_KEY = 'cookie_consent'; // 'granted' | 'denied'

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }

  window.hasTrackingConsent = function () { return getConsent() === 'granted'; };

  // ---------------------------------------------------------------------
  // Gated loaders - identical to what used to be hardcoded on every page.
  // ---------------------------------------------------------------------
  function loadHotjar() {
    if (window._hjSettings) return;
    (function (h, o, t, j, a, r) {
      h.hj = h.hj || function () { (h.hj.q = h.hj.q || []).push(arguments); };
      h._hjSettings = { hjid: 6764823, hjsv: 6 };
      a = o.getElementsByTagName('head')[0];
      r = o.createElement('script'); r.async = 1;
      r.src = t + h._hjSettings.hjid + j + h._hjSettings.hjsv;
      a.appendChild(r);
    })(window, document, 'https://static.hotjar.com/c/hotjar-', '.js?sv=');
  }

  function loadMixpanel() {
    if (document.getElementById('mp-cdn-script')) return;
    var cdn = document.createElement('script');
    cdn.id = 'mp-cdn-script';
    cdn.src = 'https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js';
    cdn.onload = function () {
      var app = document.createElement('script');
      app.src = '/mixpanel-analytics.js';
      document.head.appendChild(app);
    };
    document.head.appendChild(cdn);
  }

  function loadTrackingScripts() {
    loadHotjar();
    loadMixpanel();
  }

  // Consent already granted on a previous visit - load right away.
  if (getConsent() === 'granted') loadTrackingScripts();

  // Consent already declined - do nothing, ever (until storage is cleared).
  if (getConsent() === 'denied') return;

  // No decision yet - ask, once the page has a <body> to attach the banner to.
  if (getConsent() === null) {
    document.addEventListener('DOMContentLoaded', showBanner);
  }

  function grant() {
    setConsent('granted');
    loadTrackingScripts();
    hideBanner();
  }
  function decline() {
    setConsent('denied');
    hideBanner();
  }

  var bannerEl = null;

  function injectStyles() {
    if (document.getElementById('cookie-consent-styles')) return;
    var style = document.createElement('style');
    style.id = 'cookie-consent-styles';
    style.textContent = [
      '#cookie-consent-banner{position:fixed;left:14px;bottom:14px;max-width:280px;background:rgba(26,26,24,.88);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:rgba(255,255,255,.82);font-family:\'Figtree\',sans-serif;font-size:0.6875rem;line-height:1.5;padding:10px 12px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.12);z-index:9999;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;pointer-events:none}',
      '#cookie-consent-banner.is-visible{opacity:1;transform:translateY(0);pointer-events:auto}',
      '#cookie-consent-banner p{margin:0 0 8px}',
      '#cookie-consent-banner .cc-actions{display:flex;gap:14px;justify-content:flex-end}',
      '#cookie-consent-banner button{font-family:\'Figtree\',sans-serif;font-size:0.6875rem;font-weight:500;cursor:pointer;border:none;background:none;color:rgba(255,255,255,.7);padding:0;text-decoration:underline;text-underline-offset:2px;transition:opacity .15s}',
      '#cookie-consent-banner .cc-accept{color:#fff;font-weight:600}',
      '#cookie-consent-banner button:hover{opacity:.8}'
    ].join('');
    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById('cookie-consent-banner')) return;
    injectStyles();
    bannerEl = document.createElement('div');
    bannerEl.id = 'cookie-consent-banner';
    bannerEl.setAttribute('role', 'dialog');
    bannerEl.setAttribute('aria-label', 'Cookie consent');
    bannerEl.innerHTML =
      '<p>This site uses analytics (Mixpanel, Hotjar). Nothing is sold or shared.</p>' +
      '<div class="cc-actions">' +
      '<button type="button" class="cc-decline">Decline</button>' +
      '<button type="button" class="cc-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(bannerEl);
    bannerEl.querySelector('.cc-accept').addEventListener('click', grant);
    bannerEl.querySelector('.cc-decline').addEventListener('click', decline);
    requestAnimationFrame(function () { bannerEl.classList.add('is-visible'); });
  }

  function hideBanner() {
    if (!bannerEl) bannerEl = document.getElementById('cookie-consent-banner');
    if (!bannerEl) return;
    bannerEl.classList.remove('is-visible');
    setTimeout(function () {
      if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    }, 300);
  }
})();
