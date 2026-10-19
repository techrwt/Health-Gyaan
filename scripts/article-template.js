'use strict';
/* Article का पूरा HTML बनाने वाला template। build.js इसे इस्तेमाल करता है। */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// सुरक्षित inline formatting: **मोटा अक्षर**
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// schema/टाइटल के लिए सादा text (** हटाकर)
function plain(s) { return String(s == null ? '' : s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim(); }

// Google search result में लगभग 60-70 अक्षर दिखते हैं: साइट का नाम तभी जोड़ें जब जगह बचे
function seoTitle(t, siteName) {
  const full = t + ' | ' + siteName;
  return full.length <= 70 ? full : t;
}

const LABELS = {
  hi: { tip: 'सुझाव', warning: 'सावधानी', note: 'ध्यान दें', faq: 'अक्सर पूछे जाने वाले सवाल', published: 'प्रकाशित', home: 'होम', related: 'इस श्रेणी के और लेख' },
  en: { tip: 'Tip', warning: 'Caution', note: 'Note', faq: 'Frequently Asked Questions', published: 'Published', home: 'Home', related: 'More articles in this category' }
};

const DISCLAIMER = {
  hi: 'यह जानकारी सिर्फ शैक्षिक उद्देश्य से है, किसी भी इलाज से पहले डॉक्टर से सलाह लें।',
  en: 'This information is for educational purposes only. Please consult a doctor before any treatment.'
};

function renderBody(blocks, lang) {
  const L = LABELS[lang];
  return blocks.map(function (b) {
    switch (b.type) {
      case 'h2': return '<h2>' + inline(b.text) + '</h2>';
      case 'h3': return '<h3>' + inline(b.text) + '</h3>';
      case 'p': return '<p>' + inline(b.text) + '</p>';
      case 'ul': return '<ul>' + b.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</ul>';
      case 'ol': return '<ol>' + b.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</ol>';
      case 'tip':
      case 'warning':
      case 'note':
        return '<aside class="box box-' + b.type + '"><span class="box-title">' + esc(b.title || L[b.type]) + '</span><p>' + inline(b.text) + '</p></aside>';
      case 'faq':
        return '<section class="faq"><h2>' + esc(L.faq) + '</h2>' +
          b.items.map(function (f) {
            return '<details><summary>' + inline(f.q) + '</summary><p>' + inline(f.a) + '</p></details>';
          }).join('') + '</section>';
      default: return '';
    }
  }).join('\n');
}

function formatDate(date, lang) {
  const d = new Date(date + 'T00:00:00Z');
  try {
    return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch (e) { return date; }
}

/**
 * a = { slug, category, date, hi:{...}, en:{...} }
 * ctx = { siteUrl, category:{id,hi,en,color}, image:{path, width, height}, siteName }
 */
function renderArticle(a, ctx) {
  const url = ctx.siteUrl + '/articles/' + a.slug + '.html';
  const imgUrl = ctx.siteUrl + '/' + ctx.image.path;
  const cat = ctx.category;
  const hi = a.hi, en = a.en;
  const keywords = (hi.keywords || []).concat(en.keywords || []).join(', ');
  const titleHi = seoTitle(plain(hi.title), ctx.siteName);
  const titleEn = seoTitle(plain(en.title), ctx.siteName);

  const home = ctx.siteUrl + '/';
  const logoUrl = ctx.siteUrl + '/assets/images/Logo.png';
  const faq = hi.body.find(function (b) { return b.type === 'faq'; });
  const graph = [
    {
      '@type': 'Article',
      '@id': url + '#article',
      headline: plain(hi.title),
      alternativeHeadline: plain(en.title),
      description: plain(hi.description),
      image: [{ '@type': 'ImageObject', url: imgUrl, width: ctx.image.width, height: ctx.image.height }],
      datePublished: a.date,
      dateModified: a.date,
      inLanguage: ['hi', 'en'],
      keywords: keywords,
      articleSection: cat.en,
      isAccessibleForFree: true,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Organization', name: ctx.siteName, url: home },
      publisher: { '@type': 'Organization', name: ctx.siteName, url: home, logo: { '@type': 'ImageObject', url: logoUrl } }
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: LABELS.hi.home, item: home },
        { '@type': 'ListItem', position: 2, name: cat.hi, item: home + '?cat=' + cat.id },
        { '@type': 'ListItem', position: 3, name: plain(hi.title), item: url }
      ]
    }
  ];
  if (faq && Array.isArray(faq.items) && faq.items.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: faq.items.map(function (f) {
        return { '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } };
      })
    });
  }
  const schema = { '@context': 'https://schema.org', '@graph': graph };

  const crumb = '<nav class="crumbs" aria-label="breadcrumb"><a href="../index.html">' +
    '<span data-lang="hi">' + esc(LABELS.hi.home) + '</span><span data-lang="en">' + esc(LABELS.en.home) + '</span></a> › ' +
    '<a href="../index.html?cat=' + esc(cat.id) + '"><span data-lang="hi">' + esc(cat.hi) + '</span><span data-lang="en">' + esc(cat.en) + '</span></a></nav>';

  const tag = '<span class="tag"><span data-lang="hi">' + esc(cat.hi) + '</span><span data-lang="en">' + esc(cat.en) + '</span></span>';
  const dateHtml = '<time datetime="' + esc(a.date) + '">' +
    '<span data-lang="hi">' + esc(LABELS.hi.published) + ': ' + esc(formatDate(a.date, 'hi')) + '</span>' +
    '<span data-lang="en">' + esc(LABELS.en.published) + ': ' + esc(formatDate(a.date, 'en')) + '</span></time>';

  return '<!DOCTYPE html>\n' +
'<html lang="hi" translate="no" class="notranslate" data-root="../" data-title-hi="' + esc(titleHi) + '" data-title-en="' + esc(titleEn) + '">\n' +
'<head>\n' +
'  <meta charset="utf-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'  <meta name="google" content="notranslate">\n' +
'  <meta name="theme-color" content="#0B5D4B">\n' +
'  <title>' + esc(titleHi) + '</title>\n' +
'  <meta name="description" content="' + esc(plain(hi.description)) + '">\n' +
'  <link rel="icon" type="image/png" href="../assets/images/Logo.png">\n' +
'  <meta name="robots" content="index, follow, max-image-preview:large">\n' +
'  <link rel="canonical" href="' + esc(url) + '">\n' +
'  <meta property="og:type" content="article">\n' +
'  <meta property="og:site_name" content="' + esc(ctx.siteName) + '">\n' +
'  <meta property="og:title" content="' + esc(plain(hi.title)) + '">\n' +
'  <meta property="og:description" content="' + esc(plain(hi.description)) + '">\n' +
'  <meta property="og:url" content="' + esc(url) + '">\n' +
'  <meta property="og:image" content="' + esc(imgUrl) + '">\n' +
'  <meta property="og:image:width" content="' + ctx.image.width + '">\n' +
'  <meta property="og:image:height" content="' + ctx.image.height + '">\n' +
'  <meta property="og:image:alt" content="' + esc(plain(hi.title)) + '">\n' +
'  <meta property="og:locale" content="hi_IN">\n' +
'  <meta property="og:locale:alternate" content="en_IN">\n' +
'  <meta property="article:published_time" content="' + esc(a.date) + '">\n' +
'  <meta property="article:modified_time" content="' + esc(a.date) + '">\n' +
'  <meta property="article:section" content="' + esc(cat.en) + '">\n' +
'  <meta name="twitter:card" content="summary_large_image">\n' +
'  <meta name="twitter:title" content="' + esc(hi.title) + '">\n' +
'  <meta name="twitter:description" content="' + esc(hi.description) + '">\n' +
'  <meta name="twitter:image" content="' + esc(imgUrl) + '">\n' +
'  <script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>\n' +
'  <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'  <link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">\n' +
'  <link rel="stylesheet" href="../assets/css/style.css">\n' +
'  <script>try{var l=localStorage.getItem(\'rhg_lang\');if(l===\'en\'){document.documentElement.lang=\'en\';}}catch(e){}</script>\n' +
'</head>\n' +
'<body class="notranslate">\n' +
'  <div id="site-header"></div>\n\n' +
'  <main class="container article-wrap">\n' +
'    <article class="article" style="--c:' + esc(cat.color) + '">\n' +
'      ' + crumb + '\n' +
'      <header class="article-head">\n' +
'        <div class="article-meta">' + tag + dateHtml + '</div>\n' +
'        <h1 data-lang="hi">' + esc(hi.title) + '</h1>\n' +
'        <h1 data-lang="en">' + esc(en.title) + '</h1>\n' +
'      </header>\n' +
'      <p class="lead" data-lang="hi">' + inline(hi.description) + '</p>\n' +
'      <p class="lead" data-lang="en">' + inline(en.description) + '</p>\n' +
'      <figure class="hero-img"><img src="../' + esc(ctx.image.path) + '" alt="' + esc(plain(hi.title)) + '" width="' + ctx.image.width + '" height="' + ctx.image.height + '" fetchpriority="high" decoding="async"></figure>\n\n' +
'      <div class="article-body" data-lang="hi">\n' + renderBody(hi.body, 'hi') + '\n      </div>\n' +
'      <div class="article-body" data-lang="en">\n' + renderBody(en.body, 'en') + '\n      </div>\n\n' +
'      <p class="article-disclaimer" data-lang="hi">' + esc(DISCLAIMER.hi) + '</p>\n' +
'      <p class="article-disclaimer" data-lang="en">' + esc(DISCLAIMER.en) + '</p>\n' +
'    </article>\n\n' +
'    <section id="related" class="related article" style="--c:' + esc(cat.color) + '" data-slug="' + esc(a.slug) + '" data-cat="' + esc(cat.id) + '" hidden>\n' +
'      <h2 class="section-title"><span data-lang="hi">' + esc(LABELS.hi.related) + '</span><span data-lang="en">' + esc(LABELS.en.related) + '</span></h2>\n' +
'      <div class="grid"></div>\n' +
'    </section>\n' +
'  </main>\n\n' +
'  <div id="site-footer"></div>\n' +
'  <script src="../assets/js/app.js" defer></script>\n' +
'  <script src="../assets/js/article.js" defer></script>\n' +
'</body>\n</html>\n';
}

module.exports = { renderArticle, esc };
