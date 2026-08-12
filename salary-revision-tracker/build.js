/* Bundles the app into one self-contained HTML file.
 *
 *   node build.js
 *   → Salary-Revision-Tracker.html
 *
 * Every stylesheet and script referenced by index.html is inlined, so the
 * result is a single file that can be emailed, dropped on a shared drive, or
 * double-clicked. No folder to keep together, nothing fetched at runtime.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var OUT = path.join(ROOT, 'Salary-Revision-Tracker.html');

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* A </script> sequence inside inlined JS would close the tag early. */
function safeScript(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

var inlined = { css: 0, js: 0 };

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, function (_, href) {
  inlined.css++;
  return '<style>\n' + read(href) + '\n</style>';
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  inlined.js++;
  return '<script>\n' + safeScript(read(src)) + '\n</script>';
});

/* The favicon is a separate file; inline it as a data URI so the tab icon
 * survives too. */
html = html.replace(/<link rel="icon" href="([^"]+)">/g, function (_, href) {
  var svg = read(href);
  return '<link rel="icon" href="data:image/svg+xml;base64,' +
    Buffer.from(svg, 'utf8').toString('base64') + '">';
});

if (/(<script src=|<link rel="stylesheet")/.test(html)) {
  console.error('Something was not inlined — check index.html for unusual tag formatting.');
  process.exit(1);
}

var banner = '<!--\n' +
  '  Euler — Salary Revision Tracker\n' +
  '  A single self-contained file. Open it in any browser; nothing to install.\n' +
  '  Built ' + new Date().toISOString().slice(0, 10) + ' from the sources in this repository.\n' +
  '-->\n';

fs.writeFileSync(OUT, banner + html);

console.log('Wrote ' + path.basename(OUT));
console.log('  inlined ' + inlined.css + ' stylesheet(s), ' + inlined.js + ' script(s)');
console.log('  ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + ' MB');
