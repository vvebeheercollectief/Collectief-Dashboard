// ══════════════════════════════════════
//  WEERGAVEN — opgeslagen filtercombinaties op Nog Te Doen (U6)
// ══════════════════════════════════════
// Een weergave is de hele stand van de takenlijst: tabblad, zoekterm, VvE-code, behandelaar,
// prioriteit, statuspil (te laat / weggelegd), kolomsortering en 'Per VvE'. Opgeslagen in
// localStorage van déze browser — bewust geen opslag in de Sheet: het is een persoonlijke
// kijkinstelling, geen gegeven over een VvE.
import { state, pgs } from './state.js';
import { esc } from './util.js';
import { SECS } from './config.js';
import { renderNtd, renderNtdStats, setNtd } from './render-lijsten.js';
import { showToast } from './notifications.js';
import { vraagBevestiging } from './bevestig.js';

const SLEUTEL = 'ntdWeergaven';
const MAX = 12;

export function leesWeergaven() {
  try {
    const l = JSON.parse(localStorage.getItem(SLEUTEL) || '[]');
    return Array.isArray(l) ? l.filter(w => w && typeof w.naam === 'string' && w.naam.trim()) : [];
  } catch (_) { return []; }
}
function bewaar(lijst) { try { localStorage.setItem(SLEUTEL, JSON.stringify(lijst)); } catch (_) {} }

const v = id => document.getElementById(id)?.value || '';

// De stand van nu, in de vorm waarin hij bewaard wordt.
export function huidigeWeergave() {
  return {
    tab: state.activeNtd, q: v('s-ntd'), code: v('f-code-ntd'), beh: v('f-beh-ntd'), prio: v('f-prio-ntd'),
    status: state.ntdStatus || '',
    sort: { key: (state.ntdSort && state.ntdSort.key) || null, asc: !(state.ntdSort && state.ntdSort.asc === false) },
    perVve: !!state.ntdPerVve,
  };
}

const _n = s => String(s || '').trim().toLowerCase();
// Puur: komt een bewaarde weergave overeen met de stand van nu?
export function weergaveActief(w, nu) {
  if (!w || !nu) return false;
  return w.tab === nu.tab && _n(w.q) === _n(nu.q) && _n(w.code) === _n(nu.code) && (w.beh || '') === (nu.beh || '')
    && (w.prio || '') === (nu.prio || '') && (w.status || '') === (nu.status || '')
    && ((w.sort && w.sort.key) || null) === ((nu.sort && nu.sort.key) || null)
    && (!w.sort || !w.sort.key || !!w.sort.asc === !!nu.sort.asc)
    && !!w.perVve === !!nu.perVve;
}

// Puur: een leesbare samenvatting voor de titel van de knop.
export function weergaveOmschrijving(w) {
  const d = [];
  if (w.tab && SECS[w.tab]) d.push(SECS[w.tab].label);
  if (w.q) d.push(`zoek "${w.q}"`);
  if (w.code) d.push(`code ${w.code}`);
  if (w.beh) d.push(w.beh);
  if (w.prio) d.push(`prioriteit ${w.prio}`);
  if (w.status === 'telaat') d.push('te laat');
  if (w.status === 'weggelegd') d.push('weggelegd');
  if (w.sort && w.sort.key) d.push(`sortering ${w.sort.key === 'code' ? 'VvE-code' : 'deadline'} ${w.sort.asc ? '▲' : '▼'}`);
  if (w.perVve) d.push('per VvE');
  return d.join(' · ') || 'standaardweergave';
}

export function pasWeergaveToe(w) {
  if (!w) return;
  if (state.bulkMode) {
    showToast('Zet Selecteren eerst uit', 'Een weergave wisselen zou je selectie leegmaken.', 'var(--am)', 'label', { geenDedup: true, geenSysteemmelding: true });
    return;
  }
  const zet = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  zet('s-ntd', w.q); zet('f-code-ntd', w.code); zet('f-beh-ntd', w.beh); zet('f-prio-ntd', w.prio);
  state.ntdStatus = w.status || '';
  state.ntdSort = { key: (w.sort && w.sort.key) || null, asc: !(w.sort && w.sort.asc === false) };
  state.ntdPerVve = !!w.perVve;
  try { localStorage.setItem('ntdPerVve', state.ntdPerVve ? '1' : '0'); } catch (_) {}
  pgs.ntd = 1;
  if (w.tab && SECS[w.tab] && w.tab !== state.activeNtd) setNtd(w.tab); else renderNtd();
  renderNtdStats();
}

export function bewaarWeergave(naam) {
  const n = String(naam || '').trim().slice(0, 40);
  if (!n) return false;
  const lijst = leesWeergaven().filter(w => _n(w.naam) !== _n(n));
  lijst.unshift({ naam: n, ...huidigeWeergave() });
  bewaar(lijst.slice(0, MAX));
  renderWeergaven();
  showToast('Weergave bewaard', n, null, 'opslaan', { geenDedup: true, geenSysteemmelding: true });
  return true;
}

export async function verwijderWeergave(naam) {
  if (!await vraagBevestiging({ titel: 'Weergave verwijderen?', tekst: `"${naam}" verdwijnt uit deze browser. De taken zelf veranderen niet.`, bevestigTekst: 'Verwijderen', gevaarlijk: true })) return;
  bewaar(leesWeergaven().filter(w => w.naam !== naam));
  renderWeergaven();
}

let _invoerOpen = false;
export function toonWeergaveInvoer(aan) {
  _invoerOpen = !!aan;
  renderWeergaven();
  if (_invoerOpen) setTimeout(() => document.getElementById('wg-naam')?.focus(), 0);
}

// De rij met knopjes boven de tabel. Wordt na elke renderNtd bijgewerkt (de actieve weergave
// volgt de filters), dus goedkoop houden: een handvol knoppen.
export function renderWeergaven() {
  const el = document.getElementById('ntd-weergaven');
  if (!el) return;
  const lijst = leesWeergaven();
  const nu = huidigeWeergave();
  const chips = lijst.map(w => {
    const aan = weergaveActief(w, nu);
    return `<span class="wg-chip${aan ? ' aan' : ''}" role="button" tabindex="0" data-action="weergave-kies" data-naam="${esc(w.naam)}" aria-pressed="${aan}" title="${esc(weergaveOmschrijving(w))}">${esc(w.naam)}<span class="wg-x" role="button" tabindex="0" data-action="weergave-weg" data-naam="${esc(w.naam)}" aria-label="Weergave ${esc(w.naam)} verwijderen" title="Verwijderen">×</span></span>`;
  }).join('');
  const nieuw = _invoerOpen
    ? `<input type="text" id="wg-naam" class="wg-naam" maxlength="40" placeholder="Naam van deze weergave… (Enter)" aria-label="Naam van de weergave">`
    : `<button type="button" class="wg-chip wg-nieuw" data-action="weergave-opslaan" title="De huidige filters, sortering en groepering bewaren als weergave">+ Weergave opslaan</button>`;
  el.innerHTML = `<span class="wg-lbl">Weergaven</span>${chips}${nieuw}`;
  el.hidden = false;
}

export function initWeergaven() {
  const el = document.getElementById('ntd-weergaven');
  if (!el) return;
  el.addEventListener('keydown', e => {
    if (e.target && e.target.id === 'wg-naam') {
      if (e.key === 'Enter') { e.preventDefault(); if (bewaarWeergave(e.target.value)) _invoerOpen = false; renderWeergaven(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toonWeergaveInvoer(false); }
      return;
    }
    // Enter/spatie op een chip (span met role=button) gedraagt zich als een klik.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-action]')) { e.preventDefault(); e.target.click(); }
  });
  el.addEventListener('focusout', e => {
    if (e.target && e.target.id === 'wg-naam') setTimeout(() => { if (document.activeElement?.id !== 'wg-naam' && _invoerOpen && !e.target.value.trim()) toonWeergaveInvoer(false); }, 0);
  });
  renderWeergaven();
}
