#!/usr/bin/env node
'use strict';
/*
  रंग जाँचने वाली script: साइट की फ़ाइलों में काला / सफ़ेद / ग्रे रंग खोजती है।
  चलाइए:  node scripts/check-colors.js
  कुछ मिला तो exit code 1 और जगह की सूची; नहीं मिला तो "साफ़"।
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'batches', 'images-incoming']);
const EXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml']);
const SKIP_FILES = new Set(['package-lock.json', 'package.json', 'batch-sample.json', 'index.json']);

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (EXT.has(path.extname(e.name).toLowerCase()) && !SKIP_FILES.has(e.name)) out.push(path.join(dir, e.name));
  });
  return out;
}

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map(function (c) { return c + c; }).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// काला / सफ़ेद / ग्रे (कम रंगत वाला) या लगभग काला-सफ़ेद?
function badRgb(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min <= 24) return true;            // ग्रे shades (काला और सफ़ेद भी इसी में)
  if (max < 45) return true;                   // लगभग काला
  if (min >= 242) return true;                 // लगभग सफ़ेद
  return false;
}

const NAME_RE = /(?:color|background|border|outline|fill|stroke|shadow)\s*[:=][^;}"'\n]*?\b(black|white|gray|grey|silver|gainsboro|whitesmoke|dimgray|lightgray|darkgray|slategray|snow)\b(?!-)/i;

const problems = [];
walk(ROOT, []).forEach(function (file) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach(function (line, i) {
    let m;
    const hexRe = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
    while ((m = hexRe.exec(line))) {
      // HTML entity या anchor जैसा (#39;) नहीं हो
      if (line[m.index + m[0].length] === ';') continue;
      const rgb = hexToRgb(m[0]);
      if (badRgb(rgb[0], rgb[1], rgb[2])) problems.push(rel + ':' + (i + 1) + '  ' + m[0]);
    }
    const fnRe = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi;
    while ((m = fnRe.exec(line))) {
      if (badRgb(+m[1], +m[2], +m[3])) problems.push(rel + ':' + (i + 1) + '  ' + m[0] + ')');
    }
    if (/hsla?\(\s*\d+[\s,]+(\d+)%/i.test(line)) {
      const s = line.match(/hsla?\(\s*\d+[\s,]+(\d+)%/i);
      if (s && +s[1] < 10) problems.push(rel + ':' + (i + 1) + '  ' + s[0]);
    }
    if ((m = NAME_RE.exec(line))) problems.push(rel + ':' + (i + 1) + '  रंग का नाम "' + m[1] + '"');
  });
});

if (problems.length) {
  console.error('❌ ये रंग काला/सफ़ेद/ग्रे जैसे लगते हैं:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('✅ साफ़: काला, सफ़ेद या ग्रे रंग कहीं नहीं मिला।');
