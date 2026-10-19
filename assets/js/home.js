/* Rawat Health ज्ञान - home.js
   Home पेज के article cards: सिर्फ index.json से (हल्का), category filter बिना reload,
   "और लेख दिखाएँ" button। */
(function () {
  'use strict';

  var grid = document.getElementById('cards');
  var filtersBox = document.getElementById('filters');
  var moreWrap = document.getElementById('more-wrap');
  var moreBtn = document.getElementById('more-btn');
  var statusBox = document.getElementById('cards-status');
  if (!grid || !filtersBox) return;

  var articles = [];
  var active = 'all';
  var shown = 0;
  var pageSize = 9;

  function params() {
    try { return new URLSearchParams(location.search); } catch (e) { return null; }
  }

  function filtered() {
    return active === 'all' ? articles : articles.filter(function (a) { return a.category === active; });
  }

  function fmtDate(d, lang) {
    var dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return d;
    try {
      return dt.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return d; }
  }

  function setStatus(key) {
    if (!statusBox) return;
    if (!key) { statusBox.hidden = true; return; }
    statusBox.hidden = false;
    statusBox.setAttribute('data-i18n', key);
    statusBox.textContent = RHG.t(key);
  }

  function cardHTML(a) {
    var lang = RHG.lang();
    var c = RHG.catById(a.category) || { hi: a.category, en: a.category, color: '#1B8A5A' };
    var d = a[lang] || a.hi;
    var url = RHG.root + 'articles/' + encodeURIComponent(a.slug) + '.html';
    return '' +
      '<article class="card" style="--c:' + RHG.esc(c.color) + '" data-slug="' + RHG.esc(a.slug) + '">' +
        '<a class="card-img" href="' + url + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + RHG.root + RHG.esc(a.thumbnail) + '" alt="' + RHG.esc(d.title) + '" loading="lazy" decoding="async" width="400" height="250">' +
        '</a>' +
        '<div class="card-body">' +
          '<div class="card-meta"><span class="tag">' + RHG.esc(c[lang]) + '</span><time datetime="' + RHG.esc(a.date) + '">' + RHG.esc(fmtDate(a.date, lang)) + '</time></div>' +
          '<h3><a href="' + url + '">' + RHG.esc(d.title) + '</a></h3>' +
          '<p>' + RHG.esc(d.description) + '</p>' +
          '<a class="read" href="' + url + '">' + RHG.esc(RHG.t('card.read')) + '</a>' +
        '</div>' +
      '</article>';
  }

  function render(reset) {
    var list = filtered();
    if (reset) { grid.innerHTML = ''; shown = 0; }
    var next = list.slice(shown, shown + pageSize);
    grid.insertAdjacentHTML('beforeend', next.map(cardHTML).join(''));
    shown += next.length;
    moreWrap.hidden = shown >= list.length;
    setStatus(list.length === 0 ? 'card.empty' : null);
  }

  function rerenderKeepCount() {
    var count = Math.max(shown, pageSize);
    var list = filtered();
    grid.innerHTML = list.slice(0, count).map(cardHTML).join('');
    shown = Math.min(count, list.length);
    moreWrap.hidden = shown >= list.length;
  }

  function buildFilters() {
    var html = RHG.cats().map(function (c) {
      return '<button type="button" class="chip-btn" data-cat="' + RHG.esc(c.id) + '" style="--c:' + RHG.esc(c.color) + '">' + RHG.esc(c[RHG.lang()]) + '</button>';
    }).join('');
    html += '<button type="button" class="chip-btn all" data-cat="all" data-i18n="filter.all">' + RHG.esc(RHG.t('filter.all')) + '</button>';
    filtersBox.innerHTML = html;
    markActive();
  }

  function markActive() {
    var btns = filtersBox.querySelectorAll('.chip-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-cat') === active;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function updateUrl() {
    try {
      var url = active === 'all' ? location.pathname : location.pathname + '?cat=' + encodeURIComponent(active);
      history.replaceState(null, '', url);
    } catch (e) { /* file:// */ }
  }

  filtersBox.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.chip-btn') : null;
    if (!b) return;
    active = b.getAttribute('data-cat');
    markActive();
    updateUrl();
    render(true);
  });

  moreBtn.addEventListener('click', function () { render(false); });

  RHG.ready.then(function () {
    var site = RHG.site();
    if (site.pageSize && site.pageSize > 0) pageSize = site.pageSize;

    var p = params();
    var want = p ? p.get('cat') : null;
    if (want && RHG.catById(want)) active = want;

    buildFilters();
    setStatus('card.loading');

    return RHG.getJSON('index.json').then(function (data) {
      articles = (data && data.articles) || [];
      render(true);
    }).catch(function () {
      setStatus('card.error');
    });
  });

  RHG.onLang(function () {
    if (!filtersBox.children.length) return;
    var btns = filtersBox.querySelectorAll('.chip-btn[data-cat]');
    for (var i = 0; i < btns.length; i++) {
      var id = btns[i].getAttribute('data-cat');
      if (id !== 'all') {
        var c = RHG.catById(id);
        if (c) btns[i].textContent = c[RHG.lang()];
      }
    }
    if (articles.length) rerenderKeepCount();
  });
})();
