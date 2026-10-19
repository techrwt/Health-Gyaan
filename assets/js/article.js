/* Rawat Health ज्ञान - article.js
   Article पेज के अंत में उसी category के और लेख (index.json से) दिखाता है। */
(function () {
  'use strict';

  var box = document.getElementById('related');
  if (!box) return;
  var slug = box.getAttribute('data-slug');
  var cat = box.getAttribute('data-cat');
  var items = [];

  function fmt(a) {
    var lang = RHG.lang();
    var c = RHG.catById(a.category) || { hi: a.category, en: a.category, color: '#1B8A5A' };
    var d = a[lang] || a.hi;
    var url = encodeURIComponent(a.slug) + '.html';
    return '<article class="card" style="--c:' + RHG.esc(c.color) + '">' +
      '<a class="card-img" href="' + url + '" tabindex="-1" aria-hidden="true"><img src="' + RHG.root + RHG.esc(a.thumbnail) + '" alt="' + RHG.esc(d.title) + '" loading="lazy" decoding="async" width="400" height="250"></a>' +
      '<div class="card-body"><h3><a href="' + url + '">' + RHG.esc(d.title) + '</a></h3>' +
      '<a class="read" href="' + url + '">' + RHG.esc(RHG.t('card.read')) + '</a></div></article>';
  }

  function paint() {
    var list = box.querySelector('.grid');
    if (list) list.innerHTML = items.map(fmt).join('');
  }

  RHG.ready.then(function () {
    return RHG.getJSON('index.json');
  }).then(function (data) {
    items = ((data && data.articles) || []).filter(function (a) { return a.category === cat && a.slug !== slug; }).slice(0, 3);
    if (!items.length) return;
    box.hidden = false;
    paint();
  }).catch(function () { /* related न मिले तो कोई बात नहीं */ });

  RHG.onLang(function () { if (items.length) paint(); });
})();
