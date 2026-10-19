/* Rawat Health ज्ञान - app.js
   काम: header/footer बनाना, Hindi <-> English toggle, भाषा localStorage में याद रखना।
   कोई बाहरी library नहीं। */
(function () {
  'use strict';

  var root = document.documentElement;
  var ROOT = root.getAttribute('data-root') || '';
  var LS_KEY = 'rhg_lang';

  var state = { lang: 'hi', i18n: { hi: {}, en: {} }, cats: [], site: {} };
  var listeners = [];

  function savedLang() {
    try {
      var l = localStorage.getItem(LS_KEY);
      if (l === 'hi' || l === 'en') return l;
    } catch (e) { /* private mode */ }
    return 'hi';
  }

  function t(key) {
    var d = state.i18n[state.lang] || {};
    return d[key] !== undefined ? d[key] : key;
  }

  function getJSON(path) {
    return fetch(ROOT + path).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function catById(id) {
    for (var i = 0; i < state.cats.length; i++) if (state.cats[i].id === id) return state.cats[i];
    return null;
  }

  /* ---------- Header / Footer ---------- */
  var NAV = [
    ['nav.home', 'index.html'],
    ['nav.about', 'pages/about.html'],
    ['nav.contact', 'pages/contact.html'],
    ['nav.privacy', 'pages/privacy.html'],
    ['nav.terms', 'pages/terms.html'],
    ['nav.disclaimer', 'pages/disclaimer.html']
  ];

  function currentFile() {
    var p = location.pathname;
    var parts = p.split('/').filter(Boolean);
    var last = parts[parts.length - 1] || 'index.html';
    if (last.indexOf('.') === -1) last = 'index.html';
    var inPages = parts.length > 1 && parts[parts.length - 2] === 'pages';
    return (inPages ? 'pages/' : '') + last;
  }

  function buildHeader() {
    var cur = currentFile();
    var isArticle = cur.indexOf('/') === -1 && cur !== 'index.html';
    var nav = NAV.map(function (n) {
      var active = n[1] === cur ? ' class="active" aria-current="page"' : '';
      return '<a href="' + ROOT + n[1] + '"' + active + ' data-i18n="' + n[0] + '">' + esc(t(n[0])) + '</a>';
    }).join('');
    void isArticle;

    return '' +
      '<header class="site-header">' +
        '<div class="container topbar">' +
          '<a class="brand" href="' + ROOT + 'index.html">' +
            '<img class="logo" src="' + ROOT + 'assets/images/Logo.png" alt="Rawat Health ज्ञान" height="56" ' +
              'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline\'">' +
            '<span class="brand-text notranslate">Rawat Health ज्ञान</span>' +
          '</a>' +
          '<nav class="nav" id="main-nav" aria-label="' + esc(t('nav.aria')) + '" data-i18n-aria-label="nav.aria">' + nav + '</nav>' +
          '<div class="top-actions">' +
            '<button type="button" class="lang-toggle" id="lang-toggle" aria-label="' + esc(t('lang.aria')) + '" data-i18n-aria-label="lang.aria">' +
              '<span data-l="hi">हिन्दी</span><span data-l="en">English</span>' +
            '</button>' +
            '<button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="main-nav" aria-label="' + esc(t('nav.menu')) + '" data-i18n-aria-label="nav.menu">' +
              '<i></i><i></i><i></i>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="logoline" aria-hidden="true">' +
          '<img src="' + ROOT + 'assets/images/Logo%20Line.png" alt="" height="46" onerror="this.style.display=\'none\'">' +
        '</div>' +
      '</header>';
  }

  function buildFooter() {
    var quick = NAV.map(function (n) {
      return '<li><a href="' + ROOT + n[1] + '" data-i18n="' + n[0] + '">' + esc(t(n[0])) + '</a></li>';
    }).join('');

    var cats = state.cats.map(function (c) {
      return '<li><a href="' + ROOT + 'index.html?cat=' + encodeURIComponent(c.id) + '" data-cat-name="' + esc(c.id) + '">' +
        '<span class="foot-dot" style="--c:' + esc(c.color) + '"></span>' + esc(c[state.lang]) + '</a></li>';
    }).join('');

    return '' +
      '<footer class="site-footer">' +
        '<div class="container footer-grid">' +
          '<div>' +
            '<div class="footer-name notranslate">Rawat Health ज्ञान</div>' +
            '<p data-i18n="footer.about">' + esc(t('footer.about')) + '</p>' +
          '</div>' +
          '<div><h4 data-i18n="footer.quick">' + esc(t('footer.quick')) + '</h4><ul>' + quick + '</ul></div>' +
          '<div><h4 data-i18n="footer.categories">' + esc(t('footer.categories')) + '</h4><ul id="footer-cats">' + cats + '</ul></div>' +
          '<div><h4 data-i18n="footer.legal">' + esc(t('footer.legal')) + '</h4><ul>' +
            '<li><a href="' + ROOT + 'pages/privacy.html" data-i18n="nav.privacy">' + esc(t('nav.privacy')) + '</a></li>' +
            '<li><a href="' + ROOT + 'pages/terms.html" data-i18n="nav.terms">' + esc(t('nav.terms')) + '</a></li>' +
            '<li><a href="' + ROOT + 'pages/disclaimer.html" data-i18n="nav.disclaimer">' + esc(t('nav.disclaimer')) + '</a></li>' +
          '</ul></div>' +
        '</div>' +
        '<div class="container">' +
          '<div class="footer-disclaimer"><strong data-i18n="footer.disclaimerTitle">' + esc(t('footer.disclaimerTitle')) + ':</strong> ' +
            '<span data-i18n="footer.disclaimer">' + esc(t('footer.disclaimer')) + '</span></div>' +
        '</div>' +
        '<div class="footer-bottom notranslate" data-i18n="footer.copyright">' + esc(t('footer.copyright')) + '</div>' +
      '</footer>';
  }

  /* ---------- भाषा लागू करना ---------- */
  function applyLang(lang) {
    state.lang = lang;
    root.setAttribute('lang', lang);
    try { localStorage.setItem(LS_KEY, lang); } catch (e) { /* ignore */ }

    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      var val = t(key);
      // footer disclaimer title में ':' जोड़ा गया है, उसे बनाए रखें
      els[i].textContent = key === 'footer.disclaimerTitle' ? val + ':' : val;
    }

    var aria = document.querySelectorAll('[data-i18n-aria-label]');
    for (var j = 0; j < aria.length; j++) aria[j].setAttribute('aria-label', t(aria[j].getAttribute('data-i18n-aria-label')));

    var spans = document.querySelectorAll('.lang-toggle span');
    for (var k = 0; k < spans.length; k++) {
      spans[k].classList.toggle('on', spans[k].getAttribute('data-l') === lang);
    }
    var tg = document.getElementById('lang-toggle');
    if (tg) tg.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');

    var catLinks = document.querySelectorAll('#footer-cats a');
    for (var m = 0; m < catLinks.length; m++) {
      var c = catById(catLinks[m].getAttribute('data-cat-name'));
      if (c) {
        var dot = catLinks[m].querySelector('.foot-dot');
        catLinks[m].textContent = '';
        if (dot) catLinks[m].appendChild(dot);
        catLinks[m].appendChild(document.createTextNode(c[lang]));
      }
    }

    var title = root.getAttribute('data-title-' + lang);
    if (title) document.title = title;

    for (var n = 0; n < listeners.length; n++) {
      try { listeners[n](lang); } catch (e) { /* ignore */ }
    }
  }

  function setupInteractions() {
    var tg = document.getElementById('lang-toggle');
    if (tg) tg.addEventListener('click', function () { applyLang(state.lang === 'hi' ? 'en' : 'hi'); });

    var mb = document.getElementById('menu-btn');
    var hdr = document.querySelector('.site-header');
    if (mb && hdr) {
      mb.addEventListener('click', function () {
        var open = hdr.classList.toggle('nav-open');
        mb.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  /* ---------- Public API ---------- */
  window.RHG = {
    root: ROOT,
    t: t,
    esc: esc,
    lang: function () { return state.lang; },
    cats: function () { return state.cats; },
    site: function () { return state.site; },
    catById: catById,
    getJSON: getJSON,
    onLang: function (fn) { listeners.push(fn); },
    ready: null
  };

  window.RHG.ready = Promise.all([
    getJSON('i18n/hi.json'),
    getJSON('i18n/en.json'),
    getJSON('config/categories.json'),
    getJSON('config/site.json').catch(function () { return {}; })
  ]).then(function (res) {
    state.i18n.hi = res[0];
    state.i18n.en = res[1];
    state.cats = res[2].categories || [];
    state.site = res[3] || {};
    state.lang = savedLang();

    var h = document.getElementById('site-header');
    var f = document.getElementById('site-footer');
    if (h) h.innerHTML = buildHeader();
    if (f) f.innerHTML = buildFooter();
    setupInteractions();
    applyLang(state.lang);

    // Contact पेज के email भरना
    var mails = document.querySelectorAll('[data-site-email]');
    for (var i = 0; i < mails.length; i++) {
      var email = state.site.contactEmail || '';
      mails[i].textContent = email;
      if (mails[i].tagName === 'A') mails[i].setAttribute('href', 'mailto:' + email);
    }
    return state;
  }).catch(function (err) {
    if (window.console) console.error('Rawat Health ज्ञान: शुरुआती फ़ाइलें लोड नहीं हुईं', err);
    throw err;
  });
})();
