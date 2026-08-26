/**
 * Build a Wild Apricot Custom HTML launcher gadget.
 *
 * WA CSP blocks Apps Script, so this is NOT the full app — it shows the public
 * club total when we can bake/fetch it, plus a single CTA to the hosted tracker
 * (GitHub Pages).
 *
 * Usage:
 *   WORKER_URL='https://step-counter.you.workers.dev' \
 *   WA_SITE_URL='https://www.aiwcduesseldorf.org' \
 *   APP_URL='https://you.github.io/step-tracker/' \
 *   npm run build:widget
 *
 * Output: dist/aiwcd-steps-widget.html
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAX_CHARS = 2_048_000;

const apiUrl = (
  process.env.WORKER_URL ||
  process.env.APPS_SCRIPT_URL ||
  'REPLACE_WITH_WORKER_OR_APPS_SCRIPT_URL'
).replace(/\/$/, '');
const waSiteUrl = process.env.WA_SITE_URL || 'https://www.aiwcduesseldorf.org';
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

const outdir = path.join(ROOT, 'dist');
await fs.mkdir(outdir, { recursive: true });

/** Best-effort bake of public total at build time (WA page cannot fetch Apps Script). */
let bakedTotal = null;
if (!apiUrl.includes('REPLACE_WITH')) {
  try {
    const res = await fetch(`${apiUrl}?action=public_total`, {
      redirect: 'follow',
    });
    const data = await res.json();
    if (data && data.ok && typeof data.totalSteps === 'number') {
      bakedTotal = data.totalSteps;
      console.log(`Baked public total: ${bakedTotal}`);
    }
  } catch (err) {
    console.log(`Could not bake public total (${err.message || err}) — CTA-only fallback`);
  }
}

let css = await fs.readFile(path.join(ROOT, 'styles.css'), 'utf8');
css = css.replace(/^body\s*\{[^}]*\}\s*/m, '');

const trackerHref = appUrl || '#';
const totalLabel =
  bakedTotal === null ? '' : Number(bakedTotal).toLocaleString('en-US');
const showTotalBlock = bakedTotal !== null;

const clubSite = waSiteUrl.replace(/\/$/, '');
const logoUrl = `${clubSite}/resources/Pictures/AIWCD_Logo/AIWCD_logo_horizontal_flame-right_color_white-text.png`;

const markup = `
<div id="aiwcd-step-counter" class="aiwcd-step-counter embedded launcher" data-aiwcd-part="launcher">
  <header class="site-header">
    <div class="site-header__inner">
      <a class="site-header__brand" href="${clubSite}/" target="_blank" rel="noopener noreferrer">
        <img class="site-header__logo" src="${logoUrl}" alt="AIWCD" width="220" height="44" />
      </a>
      <p class="site-header__title">Walkathon Step Challenge</p>
    </div>
  </header>
  <div class="page">
    ${
      showTotalBlock
        ? `<section class="hero" aria-labelledby="total-heading">
      <h1 id="total-heading" class="hero__label">Club total</h1>
      <p id="launcher-total" class="hero__total">${totalLabel}</p>
    </section>`
        : ''
    }
    <section class="panel launcher__cta" aria-labelledby="launcher-heading">
      <h2 id="launcher-heading" class="panel__title">Step tracker</h2>
      <p class="lede">See the leaderboard, log your daily steps, and track our club total together.</p>
      <p>
        <a id="launcher-open" class="btn btn--primary" href="${trackerHref}">Go to the step tracker</a>
      </p>
      ${
        appUrl
          ? ''
          : `<p class="msg msg--error">Rebuild with APP_URL set to your GitHub Pages tracker URL.</p>`
      }
    </section>
  </div>
  <footer class="site-footer">
    <p class="site-footer__text"><a href="${clubSite}/" target="_blank" rel="noopener noreferrer">AIWCD</a> · American International Women's Club of Düsseldorf</p>
  </footer>
</div>
`.trim();

// Tiny client: try live public_total (works off WA; usually blocked on WA by CSP).
const launcherJs = `
(function () {
  var api = ${JSON.stringify(apiUrl)};
  var baked = ${JSON.stringify(bakedTotal)};
  var root = document.getElementById('aiwcd-step-counter');
  if (!root || !api || api.indexOf('REPLACE_WITH') === 0) return;

  function formatSteps(n) {
    return (Number(n) || 0).toLocaleString('en-US');
  }

  function ensureTotalEl() {
    var el = document.getElementById('launcher-total');
    if (el) return el;
    var page = root.querySelector('.page');
    if (!page) return null;
    var section = document.createElement('section');
    section.className = 'hero';
    section.setAttribute('aria-labelledby', 'total-heading');
    section.innerHTML = '<h1 id="total-heading" class="hero__label">Club total</h1><p id="launcher-total" class="hero__total">' +
      (baked == null ? '…' : formatSteps(baked)) + '</p>';
    page.insertBefore(section, page.firstChild);
    return document.getElementById('launcher-total');
  }

  fetch(api + '?action=public_total', { method: 'GET', credentials: 'omit', redirect: 'follow' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok || typeof data.totalSteps !== 'number') return;
      var el = ensureTotalEl();
      if (el) el.textContent = formatSteps(data.totalSteps);
    })
    .catch(function () { /* WA CSP or offline — keep baked total or CTA-only */ });
})();
`.trim();

const snippet = `<!-- AIWCD Steps launcher — generated by npm run build:widget -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Raleway:wght@600;700&display=swap" rel="stylesheet" />
<style>
${css}
.aiwcd-step-counter.launcher .launcher__cta { text-align: left; }
.aiwcd-step-counter.launcher .btn--primary { display: inline-block; }
</style>
${markup}
<script>
${launcherJs}
</script>
`;

const outFile = path.join(outdir, 'aiwcd-steps-widget.html');
await fs.writeFile(outFile, snippet, 'utf8');

const chars = snippet.length;
console.log(`Wrote ${outFile}`);
console.log(
  `  Characters: ${chars.toLocaleString()} / ${MAX_CHARS.toLocaleString()} (${((chars / MAX_CHARS) * 100).toFixed(2)}% of WA limit)`,
);
if (chars > MAX_CHARS) {
  console.error('ERROR: widget exceeds Wild Apricot Custom HTML character limit');
  process.exit(1);
}
if (!appUrl) {
  console.log('NOTE: Set APP_URL to your GitHub Pages tracker URL.');
}
if (apiUrl.includes('REPLACE_WITH')) {
  console.log('NOTE: Set WORKER_URL (or APPS_SCRIPT_URL) when building for production paste.');
}
