(function () {
  'use strict';

  var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  if (dnt === '1' || dnt === 'yes' || navigator.globalPrivacyControl) return;
  if (!window.IntersectionObserver || !window.crypto || !crypto.getRandomValues) return;

  var path = location.pathname;
  if (path.indexOf('/edit') === 0 || path.indexOf('/logs') === 0) return;

  var bytes = crypto.getRandomValues(new Uint8Array(8));
  var visitId = [].map.call(bytes, function (b) {
    return b.toString(16).length < 2 ? '0' + b.toString(16) : b.toString(16);
  }).join('');

  var start = Date.now();
  var IDLE_AFTER = 60000;
  var MAX_EVENTS = 200;

  var areas = {};        // name -> { ms, views, since }
  var events = [];
  var maxScroll = 0;
  var lastInput = Date.now();
  var idle = false;
  var sent = { open: false, lastClose: 0 };

  var signals = {
    moves: 0, scrolls: 0, keys: 0, touches: 0,
    webdriver: navigator.webdriver === true,
    languages: (navigator.languages || []).length,
    screenW: screen.width || 0,
    screenH: screen.height || 0,
  };

  var SELECTORS = [
    ['#about', 'about'],
    ['#photo-about', 'about'],
    ['#projects', 'projects'],
    ['#contact', 'contact'],
    ['#photographs', 'gallery'],
    ['#not-found', 'notfound'],
    ['header', 'header'],
    ['footer', 'footer'],
  ];

  function label(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  function areaNameFor(el) {
    for (var i = 0; i < SELECTORS.length; i++) {
      if (el.matches(SELECTORS[i][0])) return SELECTORS[i][1];
    }
    if (el.matches('.project')) {
      var h = el.querySelector('h3');
      if (!h) return 'projects';
      var copy = h.cloneNode(true);
      [].forEach.call(copy.querySelectorAll('[aria-hidden="true"], .lang, .fill'), function (n) {
        n.parentNode.removeChild(n);
      });
      return 'projects:' + label(copy.textContent);
    }
    if (el.matches('.photo')) {
      var t = el.querySelector('.photo-title');
      return 'photo:' + label(t && t.textContent);
    }
    return null;
  }

  function running() {
    return !document.hidden && !idle;
  }

  function startClock(name) {
    var a = areas[name];
    if (!a || a.since) return;
    a.since = Date.now();
  }

  function stopClock(name) {
    var a = areas[name];
    if (!a || !a.since) return;
    a.ms += Date.now() - a.since;
    a.since = 0;
  }

  var visible = {};

  function sync() {
    for (var name in areas) {
      if (visible[name] && running()) startClock(name);
      else stopClock(name);
    }
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var name = entry.target.__area;
      if (!name) return;
      if (entry.isIntersecting) {
        if (!visible[name]) areas[name].views++;
        visible[name] = true;
      } else {
        visible[name] = false;
      }
    });
    sync();
  }, { threshold: [0.5] });

  function watch(el) {
    if (el.__area) return;
    var name = areaNameFor(el);
    if (!name) return;
    el.__area = name;
    if (!areas[name]) areas[name] = { ms: 0, views: 0, since: 0 };
    io.observe(el);
  }

  function scan() {
    var list = document.querySelectorAll(
      '#about, #photo-about, #projects, #contact, #photographs, #not-found, header, footer, .project, .photo'
    );
    [].forEach.call(list, watch);
  }

  scan();

  if (window.MutationObserver) {
    var pending = null;
    new MutationObserver(function () {
      clearTimeout(pending);
      pending = setTimeout(scan, 200);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function record(kind, target) {
    if (events.length >= MAX_EVENTS) return;
    events.push({ at: Date.now() - start, kind: kind, target: label(target) || null });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('a, button') : null;
    if (!el) return;

    if (el.id === 'theme-toggle') return record('theme', document.documentElement.dataset.theme);

    var href = el.getAttribute('href') || '';
    if (href.indexOf('/api/cv') === 0) return record('cv', href.indexOf('view') > -1 ? 'view' : 'download');

    if (/^https?:/.test(href)) {
      var u;
      try { u = new URL(href); } catch (err) { return; }
      if (u.host === location.host) return;
      var where = u.host + u.pathname;
      return record(u.host.indexOf('github.com') > -1 ? 'repo' : 'outbound', where);
    }

    if (el.classList.contains('email')) record('copy', 'email');
  }, true);

  var modal = document.getElementById('project-modal');
  if (modal && window.MutationObserver) {
    var wasOpen = !modal.hidden;
    new MutationObserver(function () {
      var open = !modal.hidden;
      if (open === wasOpen) return;
      wasOpen = open;
      var title = document.getElementById('modal-title-text');
      record(open ? 'modal_open' : 'modal_close', title && title.textContent);
    }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  }

  function input(kind) {
    return function () {
      signals[kind]++;
      lastInput = Date.now();
      if (idle) { idle = false; sync(); }
    };
  }

  addEventListener('pointermove', input('moves'), { passive: true });
  addEventListener('keydown', input('keys'), { passive: true });
  addEventListener('touchstart', input('touches'), { passive: true });
  addEventListener('scroll', function () {
    signals.scrolls++;
    lastInput = Date.now();
    if (idle) { idle = false; sync(); }
    var height = document.documentElement.scrollHeight;
    if (height > 0) {
      var pct = Math.round(((scrollY + innerHeight) / height) * 100);
      if (pct > maxScroll) maxScroll = Math.min(pct, 100);
    }
  }, { passive: true });

  setInterval(function () {
    var nowIdle = Date.now() - lastInput > IDLE_AFTER;
    if (nowIdle !== idle) { idle = nowIdle; sync(); }
  }, 5000);

  document.addEventListener('visibilitychange', function () {
    sync();
    if (document.hidden) send('close');
  });

  function device() {
    var w = innerWidth;
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent) && w < 768) return 'mobile';
    if (/Tablet|iPad/i.test(navigator.userAgent) || (w >= 768 && w < 1024)) return 'tablet';
    return 'desktop';
  }

  function payload(phase) {
    var out = {};
    for (var name in areas) {
      var a = areas[name];
      var ms = a.ms + (a.since ? Date.now() - a.since : 0);
      if (ms > 0) out[name] = { ms: ms, views: a.views };
    }
    return {
      id: visitId,
      phase: phase,
      path: path,
      host: location.host,
      referrer: document.referrer || null,
      duration: Date.now() - start,
      device: device(),
      viewport: innerWidth + 'x' + innerHeight,
      maxScroll: maxScroll,
      areas: out,
      events: events,
      signals: signals,
    };
  }

  function send(phase) {
    if (phase === 'open') {
      if (sent.open) return;
      sent.open = true;
    } else {
      if (Date.now() - sent.lastClose < 2000) return;
      sent.lastClose = Date.now();
    }
    var body = JSON.stringify(payload(phase));
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/collect', new Blob([body], { type: 'application/json' }));
        return;
      }
    } catch (err) {}
    try {
      fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (err) {}
  }

  send('open');
  addEventListener('pagehide', function () { sync(); send('close'); });
})();
