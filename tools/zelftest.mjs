// Zelftest in een headless browser (v15.6) — draait in GitHub Actions bij elke push
// (.github/workflows/zelftest.yml) en lokaal met `npm run zelftest`.
//
// 1. De volledige zelftest (index.html?test=1) op de ONVERKLEINDE bron. Veel toetsen lezen de
//    brontekst; dat kan alleen hier, niet op de verkleinde productieversie.
// 2. Een rooktest van dist/ (de verkleinde build, tools/bouw.mjs): laadt het inlogscherm en eist
//    dat elke module laadt en er geen scriptfout is. Zo valt een build die de app breekt hier om,
//    en niet pas bij een collega.
//
// Alles van buiten (Google, OneSignal, Chart.js) wordt geblokkeerd: de zelftest stubt zelf.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

function serveer(map, poort) {
  const server = http.createServer(async (req, res) => {
    const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let bestand = join(map, pad === '/' ? 'index.html' : pad);
    try {
      if ((await stat(bestand)).isDirectory()) bestand = join(bestand, 'index.html');
      const body = await readFile(bestand);
      res.writeHead(200, { 'content-type': TYPES[extname(bestand)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('niet gevonden'); }
  });
  return new Promise(ok => server.listen(poort, '127.0.0.1', () => ok(server)));
}

async function pagina(browser, poort) {
  const ctx = await browser.newContext({ locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
  const page = await ctx.newPage();
  await page.route('**/*', r => r.request().url().startsWith(`http://127.0.0.1:${poort}/`) ? r.continue() : r.abort());
  return page;
}

const browser = await chromium.launch();
let fout = false;

// ── 1. Zelftest op de bron ──
{
  const server = await serveer(ROOT, 8771);
  const page = await pagina(browser, 8771);
  const fails = [];
  page.on('console', m => { if (/\bFAIL\b/.test(m.text())) fails.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => fails.push('PAGINAFOUT ' + e.message));
  await page.goto('http://127.0.0.1:8771/index.html?test=1');
  await page.waitForFunction(() => window._testResult, null, { timeout: 10 * 60 * 1000 });
  const uitslag = await page.evaluate(() => window._testResult);
  console.log('Zelftest:', uitslag);
  if (!/ 0 FAIL$/.test(uitslag)) { fout = true; fails.forEach(f => console.log('  ' + f)); }
  server.close();
}

// ── 2. Rooktest van de build ──
{
  execFileSync(process.execPath, [join(ROOT, 'tools/bouw.mjs')], { stdio: 'inherit' });
  const server = await serveer(join(ROOT, 'dist'), 8772);
  const page = await pagina(browser, 8772);
  const fouten = [];
  page.on('pageerror', e => fouten.push('paginafout: ' + e.message));
  page.on('response', r => { if (r.url().startsWith('http://127.0.0.1:8772/') && r.status() >= 400) fouten.push(`${r.status()} ${r.url()}`); });
  await page.goto('http://127.0.0.1:8772/index.html', { waitUntil: 'load' });
  // 'is-ready' zet login-splash.js pas als main.js en zijn hele modulegraaf geladen en gestart zijn.
  await page.waitForFunction(() => document.getElementById('login-gate')?.classList.contains('is-ready'), null, { timeout: 30000 })
    .catch(() => fouten.push('inlogscherm verscheen niet'));
  const modules = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/src/')).length);
  console.log(`Rooktest build: ${modules} modules geladen, ${fouten.length} fouten`);
  if (modules < 40) fouten.push(`maar ${modules} modules geladen`);
  if (fouten.length) { fout = true; fouten.forEach(f => console.log('  ' + f)); }
  server.close();
}

await browser.close();
process.exit(fout ? 1 : 0);
