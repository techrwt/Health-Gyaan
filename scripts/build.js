#!/usr/bin/env node
'use strict';
/*
  Rawat Health ज्ञान - build.js
  ----------------------------------------------------------
  हर run में:
   1. batches/*.json पढ़ता है (एक batch = एक article)
   2. images-incoming/ की image को WebP (1200px) + thumbnail (400px) में बदलता है
   3. articles/<slug>.html बनाता है (SEO के साथ)
   4. index.json अपडेट करता है
   5. sitemap.xml और robots.txt बनाता है
   6. processed batch को batches/processed/ में भेजता है

  एक batch में गलती हो तो उसका साफ error message दिखता है और बाकी batches चलते रहते हैं।
  Options:  --rebuild  => batches/processed/ की सभी files से सारे article HTML दोबारा बनाता है
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = {
  batches: path.join(ROOT, 'batches'),
  processed: path.join(ROOT, 'batches', 'processed'),
  failed: path.join(ROOT, 'batches', 'failed'),
  incoming: path.join(ROOT, 'images-incoming'),
  imgOut: path.join(ROOT, 'assets', 'images', 'articles'),
  thumbOut: path.join(ROOT, 'assets', 'images', 'articles', 'thumbs'),
  articles: path.join(ROOT, 'articles'),
  index: path.join(ROOT, 'index.json'),
  categories: path.join(ROOT, 'config', 'categories.json'),
  site: path.join(ROOT, 'config', 'site.json'),
  home: path.join(ROOT, 'index.html')
};

const { renderArticle, esc } = require('./article-template');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('::error::sharp library नहीं मिली। पहले `npm install` चलाइए।');
  process.exit(1);
}

const STATIC_PAGES = ['index.html', 'pages/about.html', 'pages/contact.html', 'pages/privacy.html', 'pages/terms.html', 'pages/disclaimer.html'];
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

const stats = { ok: 0, failed: 0, waiting: 0 };

/* ---------- छोटे helper ---------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function logOk(msg) { console.log('✅ ' + msg); }
function logErr(file, msg) {
  console.error('::error file=' + file + '::' + msg);
  console.error('❌ ' + file + ' → ' + msg);
}
function naturalSort(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }
function slugify(s) { return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function trimDesc(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

function siteUrl(site) {
  let u = (site.siteUrl || '').trim().replace(/\/+$/, '');
  if (u && !/YOUR-/i.test(u)) return u;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  if (repo) {
    const [owner, name] = repo.split('/');
    // user/org site (owner.github.io) हो तो repo नाम path में नहीं आता
    return name.toLowerCase() === (owner + '.github.io').toLowerCase()
      ? 'https://' + owner.toLowerCase() + '.github.io'
      : 'https://' + owner.toLowerCase() + '.github.io/' + name;
  }
  return 'https://YOUR-USERNAME.github.io/YOUR-REPO';
}

/* ---------- Validation ---------- */
function validateLang(obj, lang, errors) {
  if (!obj || typeof obj !== 'object') { errors.push('"' + lang + '" हिस्सा गायब है'); return; }
  ['title', 'description'].forEach(function (k) {
    if (typeof obj[k] !== 'string' || !obj[k].trim()) errors.push(lang + '.' + k + ' खाली या गायब है');
  });
  if (obj.keywords !== undefined && !Array.isArray(obj.keywords)) errors.push(lang + '.keywords एक list होनी चाहिए');
  if (!Array.isArray(obj.body) || obj.body.length === 0) { errors.push(lang + '.body एक खाली न होने वाली list होनी चाहिए'); return; }
  obj.body.forEach(function (b, i) {
    const where = lang + '.body[' + i + ']';
    if (!b || typeof b !== 'object') { errors.push(where + ' गलत है'); return; }
    switch (b.type) {
      case 'h2': case 'h3': case 'p':
        if (typeof b.text !== 'string' || !b.text.trim()) errors.push(where + ' (' + b.type + ') में "text" चाहिए');
        break;
      case 'tip': case 'warning': case 'note':
        if (typeof b.text !== 'string' || !b.text.trim()) errors.push(where + ' (' + b.type + ') में "text" चाहिए');
        break;
      case 'ul': case 'ol':
        if (!Array.isArray(b.items) || !b.items.length || b.items.some(function (x) { return typeof x !== 'string'; })) errors.push(where + ' (' + b.type + ') में "items" (text की list) चाहिए');
        break;
      case 'faq':
        if (!Array.isArray(b.items) || !b.items.length || b.items.some(function (x) { return !x || typeof x.q !== 'string' || typeof x.a !== 'string'; })) errors.push(where + ' (faq) में "items" [{"q":"","a":""}] चाहिए');
        break;
      default:
        errors.push(where + ' का type "' + b.type + '" मान्य नहीं है (h2, h3, p, ul, ol, tip, warning, note, faq)');
    }
  });
}

function validateBatch(a, categories) {
  const errors = [];
  if (!a || typeof a !== 'object' || Array.isArray(a)) return ['JSON में एक object ({ ... }) होना चाहिए, एक batch = एक article'];
  if (typeof a.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) errors.push('slug सिर्फ छोटे अंग्रेज़ी अक्षर, अंक और hyphen में होना चाहिए (जैसे: water-habits)');
  if (!categories.some(function (c) { return c.id === a.category; })) errors.push('category "' + a.category + '" config/categories.json में नहीं है। मान्य: ' + categories.map(function (c) { return c.id; }).join(', '));
  if (typeof a.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.date) || isNaN(new Date(a.date + 'T00:00:00Z').getTime())) errors.push('date YYYY-MM-DD format में होनी चाहिए (जैसे: 2026-10-19)');
  if (typeof a.image !== 'string' || !a.image.trim()) errors.push('image का नाम चाहिए (जैसे: water.png)');
  validateLang(a.hi, 'hi', errors);
  validateLang(a.en, 'en', errors);
  return errors;
}

/* ---------- Images ---------- */
function findIncomingImage(name) {
  if (!fs.existsSync(P.incoming)) return null;
  const base = path.parse(name).name.toLowerCase();
  const files = fs.readdirSync(P.incoming);
  // पहले exact नाम, फिर वही नाम किसी भी extension में
  const exact = files.find(function (f) { return f.toLowerCase() === name.toLowerCase(); });
  if (exact) return path.join(P.incoming, exact);
  const alt = files.find(function (f) {
    const p = path.parse(f);
    return p.name.toLowerCase() === base && IMG_EXT.includes(p.ext.toLowerCase());
  });
  return alt ? path.join(P.incoming, alt) : null;
}

async function convertImage(src, slug) {
  ensureDir(P.imgOut); ensureDir(P.thumbOut);
  const out = path.join(P.imgOut, slug + '.webp');
  const thumb = path.join(P.thumbOut, slug + '.webp');
  const buf = fs.readFileSync(src); // पहले पूरा पढ़ लें, ताकि same नाम की .webp होने पर भी सुरक्षित रहे
  await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
  await sharp(buf).rotate().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumb);
  const meta = await sharp(out).metadata();
  return { path: 'assets/images/articles/' + slug + '.webp', thumb: 'assets/images/articles/thumbs/' + slug + '.webp', width: meta.width, height: meta.height };
}

/* ---------- फ़ाइल ले जाना ---------- */
function uniqueTarget(dir, name) {
  ensureDir(dir);
  let target = path.join(dir, name);
  if (!fs.existsSync(target)) return target;
  const p = path.parse(name);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  target = path.join(dir, p.name + '-' + stamp + p.ext);
  let n = 1;
  while (fs.existsSync(target)) target = path.join(dir, p.name + '-' + stamp + '-' + (n++) + p.ext);
  return target;
}
function moveFile(src, dir) {
  const target = uniqueTarget(dir, path.basename(src));
  fs.renameSync(src, target);
  return target;
}
function moveToFailed(file, reason) {
  try {
    const target = moveFile(file, P.failed);
    fs.writeFileSync(target + '.error.txt', 'Error: ' + reason + '\nसुधारकर यह फ़ाइल दोबारा batches/ folder में डालिए।\n');
  } catch (e) { /* ignore */ }
}

/* ---------- एक batch process करना ---------- */
async function processBatch(file, state) {
  const rel = path.relative(ROOT, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    logErr(rel, 'JSON गलत है: ' + e.message);
    stats.failed++; moveToFailed(file, 'JSON गलत है: ' + e.message);
    return;
  }

  const errors = validateBatch(data, state.categories);
  if (errors.length) {
    const msg = errors.join(' | ');
    logErr(rel, msg);
    stats.failed++; moveToFailed(file, msg);
    return;
  }

  if (state.slugs.has(data.slug)) {
    const msg = 'slug "' + data.slug + '" पहले से मौजूद है (duplicate)। कोई नया अलग slug चुनिए।';
    logErr(rel, msg);
    stats.failed++; moveToFailed(file, msg);
    return;
  }

  const src = findIncomingImage(data.image);
  if (!src) {
    // image अभी नहीं आई: batch वहीं रहने दें, image डालने के बाद अगली बार अपने आप चलेगा
    logErr(rel, 'image "' + data.image + '" images-incoming/ में नहीं मिली। image डालकर दोबारा push कीजिए (यह batch वहीं रखा है)।');
    stats.waiting++;
    return;
  }

  let img;
  try {
    img = await convertImage(src, data.slug);
  } catch (e) {
    const msg = 'image को WebP में बदलने में दिक्कत: ' + e.message;
    logErr(rel, msg);
    stats.failed++; moveToFailed(file, msg);
    return;
  }

  const category = state.categories.find(function (c) { return c.id === data.category; });
  ensureDir(P.articles);
  fs.writeFileSync(path.join(P.articles, data.slug + '.html'), renderArticle(data, { siteUrl: state.siteUrl, category: category, image: img, siteName: state.siteName }));

  state.articles.unshift({
    slug: data.slug,
    category: data.category,
    date: data.date,
    image: img.path,
    thumbnail: img.thumb,
    hi: { title: data.hi.title.trim(), description: trimDesc(data.hi.description, 220) },
    en: { title: data.en.title.trim(), description: trimDesc(data.en.description, 220) }
  });
  state.slugs.add(data.slug);

  try { fs.unlinkSync(src); } catch (e) { /* ignore */ }
  moveFile(file, P.processed);
  stats.ok++;
  logOk('"' + data.slug + '" तैयार (' + rel + ' → batches/processed/)');
}

/* ---------- --rebuild: processed batches से सारे HTML दोबारा ---------- */
async function rebuildAll(state) {
  if (!fs.existsSync(P.processed)) return;
  const files = fs.readdirSync(P.processed).filter(function (f) { return f.endsWith('.json'); }).sort(naturalSort);
  for (const f of files) {
    const data = readJSON(path.join(P.processed, f), null);
    if (!data || validateBatch(data, state.categories).length) { console.warn('⚠️  छोड़ा: ' + f); continue; }
    const category = state.categories.find(function (c) { return c.id === data.category; });
    const imgFile = path.join(P.imgOut, data.slug + '.webp');
    if (!fs.existsSync(imgFile)) { console.warn('⚠️  image नहीं मिली, छोड़ा: ' + data.slug); continue; }
    const meta = await sharp(imgFile).metadata();
    fs.writeFileSync(path.join(P.articles, data.slug + '.html'), renderArticle(data, {
      siteUrl: state.siteUrl, category: category, siteName: state.siteName,
      image: { path: 'assets/images/articles/' + data.slug + '.webp', width: meta.width, height: meta.height }
    }));
    logOk('दोबारा बना: ' + data.slug);
  }
}

/* ---------- sitemap / robots ---------- */
function writeSitemap(state) {
  // lastmod सिर्फ तब, जब वह सच हो: Google नकली/रोज़ बदलती तारीख़ें नज़रअंदाज़ कर देता है
  const latest = state.articles.length ? state.articles[0].date : null;
  const urls = STATIC_PAGES.map(function (p) {
    const isHome = p === 'index.html';
    const loc = isHome ? state.siteUrl + '/' : state.siteUrl + '/' + p;
    return '  <url><loc>' + loc + '</loc>' + (isHome && latest ? '<lastmod>' + latest + '</lastmod>' : '') + '</url>';
  });
  state.articles.forEach(function (a) {
    urls.push('  <url><loc>' + state.siteUrl + '/articles/' + a.slug + '.html</loc><lastmod>' + a.date + '</lastmod></url>');
  });
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + state.siteUrl + '/sitemap.xml\n');
}

/* ---------- Home page का SEO हिस्सा (canonical, OG, schema, लेखों के links) ---------- */
function replaceBetween(html, start, end, content) {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a === -1 || b === -1 || b < a) return null;
  return html.slice(0, a + start.length) + '\n' + content + '\n' + html.slice(b);
}

function updateHomeSeo(state) {
  if (!fs.existsSync(P.home)) return;
  const html = fs.readFileSync(P.home, 'utf8');
  const home = state.siteUrl + '/';
  const logo = state.siteUrl + '/assets/images/Logo.png';
  const title = 'Rawat Health ज्ञान - सेहत की जानकारी आसान हिंदी में';
  const desc = 'घरेलू नुस्खे, आयुर्वेद, डाइट और योग की शैक्षिक जानकारी हिंदी और English में।';
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': home + '#website', name: state.siteName, url: home, inLanguage: ['hi', 'en'], publisher: { '@id': home + '#org' } },
      { '@type': 'Organization', '@id': home + '#org', name: state.siteName, url: home, logo: { '@type': 'ImageObject', url: logo } }
    ]
  };
  const head = [
    '  <meta name="robots" content="index, follow, max-image-preview:large">',
    '  <link rel="canonical" href="' + esc(home) + '">',
    '  <link rel="icon" type="image/png" href="assets/images/Logo.png">',
    '  <meta property="og:url" content="' + esc(home) + '">',
    '  <meta property="og:image" content="' + esc(logo) + '">',
    '  <meta name="twitter:card" content="summary_large_image">',
    '  <meta name="twitter:title" content="' + esc(title) + '">',
    '  <meta name="twitter:description" content="' + esc(desc) + '">',
    '  <meta name="twitter:image" content="' + esc(logo) + '">',
    '  <script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>'
  ].join('\n');

  let out = replaceBetween(html, '<!--SEO-START-->', '<!--SEO-END-->', head);
  if (out === null) { console.warn('⚠️  index.html में <!--SEO-START--> / <!--SEO-END--> markers नहीं मिले, home SEO अपडेट नहीं हुआ।'); return; }

  const list = state.articles.slice(0, 60).map(function (a) {
    return '      <li><a href="articles/' + a.slug + '.html">' + esc(a.hi.title) + '</a></li>';
  }).join('\n');
  const withLinks = replaceBetween(out, '<!--LINKS-START-->', '<!--LINKS-END-->', '    <noscript>\n    <ul>\n' + list + '\n    </ul>\n    </noscript>');
  if (withLinks !== null) out = withLinks;
  else console.warn('⚠️  index.html में <!--LINKS-START--> / <!--LINKS-END--> markers नहीं मिले, लेखों के links नहीं जुड़े।');

  if (out !== html) fs.writeFileSync(P.home, out);
}

/* ---------- main ---------- */
(async function main() {
  const site = readJSON(P.site, {});
  const catData = readJSON(P.categories, null);
  if (!catData || !Array.isArray(catData.categories) || !catData.categories.length) {
    console.error('::error::config/categories.json गलत या खाली है।');
    process.exit(1);
  }

  const indexData = readJSON(P.index, { articles: [] });
  const state = {
    siteUrl: siteUrl(site),
    siteName: site.name || 'Rawat Health ज्ञान',
    categories: catData.categories,
    articles: Array.isArray(indexData.articles) ? indexData.articles : [],
    slugs: new Set()
  };
  state.articles.forEach(function (a) { state.slugs.add(a.slug); });

  [P.batches, P.processed, P.incoming, P.articles, P.imgOut, P.thumbOut].forEach(ensureDir);

  // Site URL बदला हो (जैसे पहली बार repo बनने पर) तो पुराने articles के canonical/OG links भी ठीक किए जाते हैं
  const urlChanged = Boolean(indexData.siteUrl) && indexData.siteUrl !== state.siteUrl;
  if (urlChanged) console.log('ℹ️  Site URL बदला (' + indexData.siteUrl + ' → ' + state.siteUrl + '), सभी articles दोबारा बन रहे हैं।');
  if (process.argv.includes('--rebuild') || urlChanged) await rebuildAll(state);

  const files = fs.readdirSync(P.batches)
    .filter(function (f) { return f.toLowerCase().endsWith('.json') && fs.statSync(path.join(P.batches, f)).isFile(); })
    .sort(naturalSort);

  if (!files.length) console.log('ℹ️  batches/ में कोई नई batch फ़ाइल नहीं है।');

  for (const f of files) {
    try {
      await processBatch(path.join(P.batches, f), state);
    } catch (e) {
      logErr('batches/' + f, 'अनपेक्षित गलती: ' + e.message);
      stats.failed++;
    }
  }

  // नई तारीख वाले लेख ऊपर (stable sort: एक ही तारीख में हाल का batch पहले)
  state.articles = state.articles
    .map(function (a, i) { return { a: a, i: i }; })
    .sort(function (x, y) { return x.a.date < y.a.date ? 1 : x.a.date > y.a.date ? -1 : x.i - y.i; })
    .map(function (x) { return x.a; });

  fs.writeFileSync(P.index, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), siteUrl: state.siteUrl, count: state.articles.length, articles: state.articles }, null, 2) + '\n');
  writeSitemap(state);
  updateHomeSeo(state);

  console.log('\n— सारांश: ' + stats.ok + ' सफल, ' + stats.failed + ' गलत (batches/failed/ में), ' + stats.waiting + ' image का इंतज़ार में। कुल लेख: ' + state.articles.length);
  console.log('— Site URL: ' + state.siteUrl);
})().catch(function (e) {
  console.error('::error::build.js रुक गया: ' + e.stack);
  process.exit(1);
});
