// Bouwstap voor Vercel (v15.6): zet de publieke site in dist/, verkleind.
//
// Twee dingen tegelijk:
// 1. ALLOWLIST. Alleen wat hieronder staat komt online. Tot v15.5 ging de hele repository mee
//    behalve wat .vercelignore uitsloot, en die lijst liep twee keer uit de pas (AUDIT.md, tools/).
//    Een nieuw bestand is nu standaard NIET publiek.
// 2. VERKLEINEN. Commentaar en witruimte eruit (JS ~1,2 MB → ~0,4 MB, CSS 177 → ~95 kB). Namen
//    blijven staan (minifyIdentifiers uit): een fout in de console noemt dan nog de echte functie.
//
// Bewust NIET mee: src/tests.js en src/urgentie.js (alleen de zelftest). De zelftest draait in
// GitHub Actions op de onverkleinde bron (tools/zelftest.mjs, workflow zelftest.yml); veel toetsen
// lezen de brontekst, en die is in dist/ verkleind.
//
// Gebruik: node tools/bouw.mjs   (Vercel: buildCommand in vercel.json)
import { transform } from 'esbuild';
import { readFile, writeFile, mkdir, rm, readdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'dist');

const ONGEWIJZIGD = ['index.html', 'manifest.json', 'versie.json',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'logo-sidebar.png',
  'beeldmerk-wit.svg', 'logo-gestapeld-leisteen.svg'];
const SCRIPTS = ['sw.js', 'sw-strategie.js', 'zoek-tools.js', 'allowed-emails.js'];
const NIET_PUBLIEK = new Set(['tests.js', 'urgentie.js']);

const JS = { loader: 'js', minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
             legalComments: 'none', target: 'esnext', charset: 'utf8' };

async function verkleinJs(pad) {
  const bron = await readFile(join(ROOT, pad), 'utf8');
  const { code } = await transform(bron, { ...JS, sourcefile: pad });
  await schrijf(pad, code);
  return [bron.length, code.length];
}
async function schrijf(pad, inhoud) {
  await mkdir(dirname(join(UIT, pad)), { recursive: true });
  await writeFile(join(UIT, pad), inhoud);
}

await rm(UIT, { recursive: true, force: true });
await mkdir(UIT, { recursive: true });

let voor = 0, na = 0;
for (const f of ONGEWIJZIGD) await copyFile(join(ROOT, f), join(UIT, f));
const modules = (await readdir(join(ROOT, 'src'))).filter(f => f.endsWith('.js') && !NIET_PUBLIEK.has(f));
for (const f of [...SCRIPTS, ...modules.map(m => 'src/' + m)]) {
  const [b, c] = await verkleinJs(f); voor += b; na += c;
}
{
  const bron = await readFile(join(ROOT, 'styles.css'), 'utf8');
  const { code } = await transform(bron, { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' });
  await schrijf('styles.css', code); voor += bron.length; na += code.length;
}

// ── Controles: een kapotte uitrol hier tegenhouden, niet pas in de browser ──
const fouten = [];
const bestaat = async p => { try { return (await stat(join(UIT, p))).isFile(); } catch { return false; } };
// 1. Alles wat de service worker vooraf cachet, staat er.
const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
const shell = [...sw.slice(sw.indexOf('const APP_SHELL')).split('];')[0].matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
if (shell.length < 20) fouten.push('APP_SHELL niet gevonden in sw.js');
for (const p of shell) if (!(await bestaat(p))) fouten.push(`APP_SHELL noemt ${p}, maar dat staat niet in dist/`);
// 2. Elke statische en dynamische import van een module wijst naar een bestand in dist/.
for (const f of ['src/main.js', ...modules.map(m => 'src/' + m)]) {
  const code = await readFile(join(UIT, f), 'utf8');
  for (const m of code.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
    const doel = join(dirname(f), m[1]).replace(/\\/g, '/');
    if (NIET_PUBLIEK.has(doel.replace(/^src\//, ''))) continue;   // ?test=1-pad
    if (!(await bestaat(doel))) fouten.push(`${f} importeert ${m[1]}, maar ${doel} staat niet in dist/`);
  }
}
// 3. Wat Apps Script van het live dashboard leest (Code.gs, eenmalige blokken) moet herkenbaar blijven.
if (!(await readFile(join(UIT, 'src/crm-fase.js'), 'utf8')).includes('CRM_FASES')) fouten.push('src/crm-fase.js mist CRM_FASES');
if (!(await readFile(join(UIT, 'src/api.js'), 'utf8')).includes('/^0\\d+$/')) fouten.push('src/api.js mist /^0\\d+$/');

if (fouten.length) { console.error('Bouwen afgebroken:\n- ' + fouten.join('\n- ')); process.exit(1); }
console.log(`dist/ klaar: JS+CSS ${(voor / 1024).toFixed(0)} kB → ${(na / 1024).toFixed(0)} kB, ${shell.length} app-shellbestanden gecontroleerd.`);
