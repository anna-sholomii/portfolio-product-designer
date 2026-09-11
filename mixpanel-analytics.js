/*!
 * Mixpanel instrumentation for anna-sholomii.vercel.app (static multi-page site)
 * Loaded on every page, right after the Mixpanel CDN script tag.
 *
 * Implements: page_viewed, session_started, engagement_returned,
 * hero_cta_clicked, project_list_viewed, project_card_clicked,
 * case_study_section_viewed, case_study_cta_clicked, contact_intent_started.
 *
 * contact_form_completed is NOT auto-fired here: contact.html has no real
 * <form> today (just mailto / LinkedIn / resume-download links), so there is
 * nothing that "completes". A ready-to-call helper is exposed as
 * window.mpTrackContactFormCompleted(details) for whenever a real form
 * (e.g. Formspree/Netlify Forms) is added - wire its submit-success handler
 * to call it. See project README / chat summary for details.
 */
(function () {
  'use strict';

  var TOKEN = '5885b57ccf5ab2860c7782b2bb92e405';
  if (typeof mixpanel === 'undefined') return;

  mixpanel.init(TOKEN, {
    debug: true,
    track_pageview: false, // page_viewed is fired manually below per the tracking spec
    persistence: 'localStorage'
  });

  var pageLoadTs = Date.now();

  // ---------------------------------------------------------------------
  // Page metadata (per-file, since this is a static multi-page site, not an SPA)
  // ---------------------------------------------------------------------
  var file = (location.pathname.split('/').pop() || 'index.html');
  var PAGE_META = {
    'index.html': { type: 'home' },
    '': { type: 'home' },
    'work.html': { type: 'work_list' },
    'about.html': { type: 'about' },
    'resume.html': { type: 'resume' },
    'contact.html': { type: 'contact' },
    'ambassador-case-study.html': { type: 'case_study', caseStudyId: 'ambassador' },
    'schoolmap-case-study.html': { type: 'case_study', caseStudyId: 'schoolmap' },
    'telo-case-study.html': { type: 'case_study', caseStudyId: 'telo' }
  };
  var meta = PAGE_META[file] || { type: 'other' };

  // Total distinct projects/case studies on the site today - update this if more are added.
  var TOTAL_CASE_STUDIES = 3;
  var CASE_STUDY_ORDER = { ambassador: 1, schoolmap: 2, telo: 3 };

  mixpanel.register({
    page_path: location.pathname,
    page_type: meta.type
  });

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function genId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function getParam(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }

  function deviceType() {
    var w = window.innerWidth;
    if (w <= 767) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  function guessUserIntent() {
    var hay = ((getParam('utm_source') || '') + ' ' + (getParam('utm_medium') || '') + ' ' + (document.referrer || '')).toLowerCase();
    if (!hay.trim()) return undefined;
    if (/linkedin|indeed|wellfound|angel\.co|glassdoor|\brecruit|\bhiring\b/.test(hay)) return 'recruiter';
    if (/producthunt|upwork|contra\.com|dribbble|behance|freelanc/.test(hay)) return 'small_business';
    return undefined; // no confident signal - omit rather than guess
  }

  function entryPointFromPath(pathname) {
    if (!pathname) return 'direct';
    var f = pathname.split('/').pop() || 'index.html';
    var m = PAGE_META[f];
    if (!m) return 'direct';
    if (m.type === 'home') return 'hero';
    if (m.type === 'case_study') return 'case_study';
    return m.type; // work_list / about / resume / contact
  }

  function scrollDepthPct() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
  }

  function secondsSincePageLoad() {
    return Math.max(0, Math.round((Date.now() - pageLoadTs) / 1000));
  }

  function secondsSinceSessionStart() {
    var t0 = Number(sessionStorage.getItem('mp_session_start_perf')) || pageLoadTs;
    return Math.max(0, Math.round((Date.now() - t0) / 1000));
  }

  function isExternal(href) {
    if (!href) return false;
    try {
      var u = new URL(href, location.href);
      return u.origin !== location.origin;
    } catch (e) { return false; }
  }

  // Watches for `selector` to exist (handles content injected later, e.g. the
  // NDA-gated case study that decrypts its body client-side after a password
  // is entered), then fires `callback` once the element is >=30% in view.
  function trackSectionEntry(selector, callback) {
    var fired = false;
    function attach(el) {
      if (!el || el._mpObserved) return;
      el._mpObserved = true;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !fired) {
            fired = true;
            callback();
            io.disconnect();
          }
        });
      }, { threshold: 0.3 });
      io.observe(el);
    }
    var existing = document.querySelector(selector);
    if (existing) { attach(existing); return; }
    var mo = new MutationObserver(function () {
      var el = document.querySelector(selector);
      if (el) { attach(el); mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 30000);
  }

  // ---------------------------------------------------------------------
  // 1. page_viewed - every page load
  // ---------------------------------------------------------------------
  var pageViewedProps = {
    page_location: location.href,
    referrer: document.referrer || 'direct'
  };
  var utmSource = getParam('utm_source');
  if (utmSource) pageViewedProps.utm_source = utmSource;
  var userIntent = guessUserIntent();
  if (userIntent) pageViewedProps.user_intent = userIntent;
  mixpanel.track('page_viewed', pageViewedProps);

  // ---------------------------------------------------------------------
  // 2. session_started + 10. engagement_returned - session bookkeeping
  // ---------------------------------------------------------------------
  (function sessionBookkeeping() {
    var isNewSession = !sessionStorage.getItem('mp_session_id');

    if (isNewSession) {
      var prevStartTs = localStorage.getItem('mp_session_start_ts');
      if (prevStartTs) {
        var deltaDays = Math.round((Date.now() - Number(prevStartTs)) / 86400000);
        var bucket = deltaDays <= 1 ? 1 : (deltaDays <= 7 ? 7 : (deltaDays <= 30 ? 30 : deltaDays));
        var prevPages = [];
        try { prevPages = JSON.parse(localStorage.getItem('mp_session_pages') || '[]'); } catch (e) {}
        mixpanel.track('engagement_returned', {
          return_window_days: bucket,
          previous_pages_top: prevPages.slice(0, 3),
          referrer: document.referrer || 'direct',
          landing_page: location.href
        });
      }

      var sid = genId();
      sessionStorage.setItem('mp_session_id', sid);
      sessionStorage.setItem('mp_session_start_perf', String(Date.now()));
      sessionStorage.setItem('mp_landing_page', location.href);
      localStorage.setItem('mp_session_start_ts', String(Date.now()));
      localStorage.setItem('mp_session_pages', JSON.stringify([location.pathname]));

      mixpanel.track('session_started', {
        session_id: sid,
        landing_page: location.href,
        utm_campaign: getParam('utm_campaign'),
        device_type: deviceType()
      });
    } else {
      var pages = [];
      try { pages = JSON.parse(localStorage.getItem('mp_session_pages') || '[]'); } catch (e) {}
      pages.push(location.pathname);
      if (pages.length > 20) pages = pages.slice(-20);
      localStorage.setItem('mp_session_pages', JSON.stringify(pages));
    }
  })();

  // ---------------------------------------------------------------------
  // 3. hero_cta_clicked - the primary CTA directly under the home hero
  //    ("View all work ->", the first thing after the hero on index.html)
  // ---------------------------------------------------------------------
  (function heroCta() {
    var el = document.querySelector('.home-hero + .home-section .cs-preview-more');
    if (!el) return;
    el.addEventListener('click', function () {
      var href = el.getAttribute('href') || '';
      mixpanel.track('hero_cta_clicked', {
        cta_label: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        cta_target: href,
        placement: 'home_hero_primary',
        external: isExternal(href)
      });
    });
  })();

  // ---------------------------------------------------------------------
  // 4 & 5. project_list_viewed / project_card_clicked
  //    "Project list" = the case-study cards shown on index.html/about.html
  //    (home carousel) and the case-study index on work.html.
  // ---------------------------------------------------------------------
  (function projectList() {
    var isHomeOrAbout = meta.type === 'home' || meta.type === 'about';
    var isWorkList = meta.type === 'work_list';
    if (!isHomeOrAbout && !isWorkList) return;

    var listSelector = isWorkList ? '.cs-idx-layout' : '.about-cs-scroll';
    var version = isWorkList ? 'work_index_v1' : (meta.type === 'home' ? 'home_carousel_v1' : 'about_carousel_v1');

    trackSectionEntry(listSelector, function () {
      mixpanel.track('project_list_viewed', {
        projects_section_version: version,
        projects_count: TOTAL_CASE_STUDIES,
        scroll_depth_pct: scrollDepthPct(),
        time_on_page_sec: secondsSincePageLoad()
      });
    });

    document.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.about-cs-card, .cs-idx-row, #cs-idx-panel-link') : null;
      if (!card) return;
      // Skip the accessibility-hidden marquee duplicates (they exist purely
      // for the seamless-loop visual effect, not distinct list items).
      if (card.getAttribute('aria-hidden') === 'true') return;
      // On case study pages, .about-cs-card belongs to the "related case
      // studies" strip, not a project list - handled by caseStudyCtas() instead.
      if (meta.type === 'case_study') return;

      var href, title, position;
      if (card.matches('.cs-idx-row')) {
        href = null; // navigation happens via JS (csOpen); infer from data-idx
        position = Number(card.getAttribute('data-idx')) + 1;
        title = (card.querySelector('.cs-idx-title') || {}).textContent || '';
      } else if (card.id === 'cs-idx-panel-link') {
        href = card.getAttribute('href');
        title = (document.getElementById('cs-idx-panel-title') || {}).textContent || '';
        position = null;
      } else {
        href = card.getAttribute('href');
        title = (card.querySelector('.hcp-slide-title') || {}).textContent || '';
      }

      var slug = href ? href.replace(/^\/?/, '').replace(/-case-study\.html$/, '').replace(/\.html$/, '') : null;
      if (!position && slug && CASE_STUDY_ORDER[slug]) position = CASE_STUDY_ORDER[slug];

      mixpanel.track('project_card_clicked', {
        project_id: slug || 'unknown',
        project_title: (title || '').replace(/\s+/g, ' ').trim(),
        position_in_list: position || null,
        source_section: isWorkList ? 'work_index' : 'projects_list'
      });
    }, true);
  })();

  // ---------------------------------------------------------------------
  // 6 & 7. case_study_section_viewed / case_study_cta_clicked
  //    Only on the three dedicated case-study pages.
  // ---------------------------------------------------------------------
  (function caseStudy() {
    if (meta.type !== 'case_study') return;

    trackSectionEntry('.cs-intro, .hero', function () {
      mixpanel.track('case_study_section_viewed', {
        case_studies_count: TOTAL_CASE_STUDIES,
        layout_variant: 'longform_v1',
        scroll_depth_pct: scrollDepthPct(),
        time_on_page_sec: secondsSincePageLoad()
      });
    });

    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('a') : null;
      if (!el) return;
      var href = el.getAttribute('href') || '';

      // "Explore case studies" related cards at the bottom of the page.
      var relatedCard = el.closest('.next-cs .about-cs-card');
      if (relatedCard && relatedCard.getAttribute('aria-hidden') !== 'true') {
        mixpanel.track('case_study_cta_clicked', {
          cta_label: (relatedCard.querySelector('.hcp-slide-title') || {}).textContent || 'View case study',
          cta_target: href,
          case_study_id: meta.caseStudyId,
          external: isExternal(href)
        });
        return;
      }

      // The Contact link, clicked while reading a case study.
      if (href.indexOf('contact.html') !== -1) {
        mixpanel.track('case_study_cta_clicked', {
          cta_label: (el.textContent || '').replace(/\s+/g, ' ').trim() || 'Contact',
          cta_target: href,
          case_study_id: meta.caseStudyId,
          external: false
        });
      }
    }, true);
  })();

  // ---------------------------------------------------------------------
  // 8. contact_intent_started - choosing a contact method on contact.html
  // ---------------------------------------------------------------------
  (function contactIntent() {
    if (meta.type !== 'contact') return;
    document.querySelectorAll('.contact-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var href = card.getAttribute('href') || '';
        var method = 'form';
        if (href.indexOf('mailto:') === 0) method = 'email';
        else if (href.indexOf('linkedin.com') !== -1) method = 'social';
        else if (href.indexOf('.pdf') !== -1) method = 'resume'; // not in the base spec's enum, kept for accuracy

        mixpanel.track('contact_intent_started', {
          entry_point: entryPointFromPath(document.referrer ? new URL(document.referrer, location.href).pathname : ''),
          contact_method: method,
          source_page: document.referrer || location.href,
          time_since_landing_sec: secondsSinceSessionStart()
        });
      });
    });
  })();

  // ---------------------------------------------------------------------
  // 9. contact_form_completed - no live form to bind to today.
  //    Call this from a real form's submit-success handler once one exists.
  // ---------------------------------------------------------------------
  window.mpTrackContactFormCompleted = function (details) {
    details = details || {};
    mixpanel.track('contact_form_completed', {
      submission_status: details.submission_status || 'success',
      lead_type: details.lead_type || 'general',
      message_length_chars: typeof details.message_length_chars === 'number' ? details.message_length_chars : null,
      captcha_used: !!details.captcha_used
    });
  };
})();
