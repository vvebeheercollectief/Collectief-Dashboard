// ══════════════════════════════════════
//  VERBINDING — één klikbare status in de zijbalk (U5)
// ══════════════════════════════════════
// De statusbalk kende vier losse standen (Live, Laden…/Opslaan…, Fout/Offline, Gepauzeerd) plus
// 'Selecteren — verversen staat stil', en geen van alle zei wát er aan de hand was of wat je kon
// doen. Een klik op de bol opent nu een klein paneel met precies dat, en met het tijdstip van de
// laatste geslaagde verversing — ook als de balk zelf 'Fout' of 'Offline' zegt.
//
// Geen eigen toestand: het paneel leest de bol (#dot), het label (#sync-lbl) en `state`. Een
// MutationObserver op die twee elementen houdt het bijschrift '· stand HH:MM' en een open paneel
// bij. Zo hoeft data.js hier niets van te weten en ontstaat er geen kringverwijzing.
import { state } from './state.js';
import { loadAll } from './data.js';
import { isOffline } from './api.js';
import { esc } from './util.js';

const HHMM = ms => ms ? new Date(ms).toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' }) : null;

// Puur (zelftest): wat zeggen we bij deze stand?
// s = { dot:''|'loading'|'err'|'pauze', label, laatsteMs, pendingWrites, bulkMode, offline, versieTeOud, authFails }
export function statusUitleg(s) {
  const laatst = HHMM(s.laatsteMs);
  const sinds = laatst ? `Laatste geslaagde verversing: ${laatst}.` : 'Nog geen geslaagde verversing in deze sessie.';
  let kop, tekst, stap = null, knop = null;
  if (s.versieTeOud) {
    kop = 'Verouderde versie';
    tekst = 'Er staat een nieuwere versie van het dashboard klaar. Wijzigen is geblokkeerd tot je herlaadt, zodat oude code niets meer wegschrijft.';
    stap = 'Herlaad het dashboard via de balk bovenin.';
  } else if (s.offline || s.label === 'Offline') {
    kop = 'Offline';
    tekst = 'Geen verbinding met Google Sheets. Je ziet de laatst bekende stand; wijzigen is geblokkeerd zodat er niets verloren gaat.';
    stap = 'Zodra de verbinding terug is, gaat het vanzelf verder. Duurt het lang, controleer dan je netwerk.';
  } else if (s.bulkMode) {
    kop = 'Selecteren — verversen staat stil';
    tekst = 'Zolang je taken selecteert komt er niets nieuws binnen, zodat je selectie niet onder je verschuift.';
    stap = 'Rond de selectie af of zet Selecteren uit; dan loopt het verversen weer.';
  } else if (s.dot === 'pauze') {
    kop = 'Gepauzeerd';
    tekst = 'Je Google-sessie is verlopen terwijl je in een ander venster zat. Vernieuwen opent een Google-venster, en dat doen we alleen als je hier werkt.';
    stap = 'Klik ergens in het dashboard; de sessie wordt dan vernieuwd en het verversen loopt weer.';
  } else if (s.dot === 'err' && (s.authFails || 0) >= 3) {
    kop = 'Sessie verlopen';
    tekst = 'Google accepteert de sessie niet meer; het dashboard kan niet lezen of schrijven.';
    stap = 'Log opnieuw in via de knop in de balk bovenin.';
  } else if (s.dot === 'err') {
    kop = 'Fout bij verversen';
    tekst = 'De laatste rondes bij Google Sheets mislukten (een storing, de limiet of een hapering onderweg). Je ziet de stand van de laatste geslaagde ronde.';
    stap = 'Het dashboard probeert het elke 8 seconden opnieuw. Blijft dit staan, klik dan op Vernieuwen.';
    knop = 'vernieuwen';
  } else if (s.dot === 'loading' && /^Opslaan/.test(s.label || '')) {
    const n = s.pendingWrites || 1;
    kop = 'Opslaan…';
    tekst = `${n} wijziging${n === 1 ? '' : 'en'} onderweg naar de Sheet.`;
    stap = 'Even wachten; sluit dit tabblad nog niet.';
  } else if (s.dot === 'loading') {
    kop = 'Laden…';
    tekst = 'De gegevens worden opgehaald.';
  } else {
    kop = 'Live';
    tekst = "Verbonden met Google Sheets. De lijst ververst elke 8 seconden; wijzigingen van collega's komen vanzelf binnen.";
    knop = 'vernieuwen';
  }
  return { kop, tekst, stap, sinds, knop };
}

function _stand() {
  return {
    dot: (document.getElementById('dot')?.className || '').replace('dot', '').trim(),
    label: document.getElementById('sync-lbl')?.textContent || '',
    laatsteMs: state._laatsteSyncMs || 0,
    pendingWrites: state.pendingWrites || 0,
    bulkMode: !!state.bulkMode,
    offline: isOffline(),
    versieTeOud: !!state._versieTeOud,
    authFails: state._authFails || 0,
  };
}

function _open() { return !document.getElementById('status-pop')?.hidden; }

function renderStatusPaneel() {
  const pop = document.getElementById('status-pop');
  if (!pop || pop.hidden) return;
  const u = statusUitleg(_stand());
  pop.innerHTML = `
    <div class="status-kop">${esc(u.kop)}</div>
    <p>${esc(u.tekst)}</p>
    ${u.stap ? `<p class="status-stap">${esc(u.stap)}</p>` : ''}
    <p class="status-sinds">${esc(u.sinds)}</p>
    ${u.knop === 'vernieuwen' ? `<button type="button" class="btn btn-sec btn-sm" data-action="status-vernieuwen">Nu vernieuwen</button>` : ''}`;
}

// Het bijschrift naast het label: het tijdstip van de laatste geslaagde ronde zodra het label dat
// zelf niet meer zegt (Fout, Offline, Gepauzeerd, Laden…). Bij 'Live · HH:MM' is het dubbel.
function zetSinds() {
  const el = document.getElementById('sync-sinds');
  if (!el) return;
  const s = _stand();
  const laatst = HHMM(s.laatsteMs);
  const toon = laatst && !/^Live/.test(s.label);
  el.hidden = !toon;
  el.textContent = toon ? `· stand ${laatst}` : '';
}

export function toggleStatusPaneel(aan) {
  const pop = document.getElementById('status-pop');
  const knop = document.getElementById('sync-btn');
  if (!pop) return;
  const open = aan == null ? pop.hidden : !!aan;
  pop.hidden = !open;
  knop?.setAttribute('aria-expanded', String(open));
  if (open) renderStatusPaneel();
}

export function initVerbinding() {
  const knop = document.getElementById('sync-btn');
  const pop = document.getElementById('status-pop');
  if (!knop || !pop) return;
  knop.addEventListener('click', () => toggleStatusPaneel());
  // Buiten het paneel klikken of Escape sluit het. Op `click` en niet `mousedown`, zodat de klik op
  // de knop zelf niet eerst sluit en dan weer opent.
  document.addEventListener('click', e => {
    if (!_open()) return;
    if (pop.contains(e.target) || knop.contains(e.target)) return;
    toggleStatusPaneel(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open()) { toggleStatusPaneel(false); e.stopPropagation(); } }, true);
  pop.addEventListener('click', e => {
    if (e.target.closest('[data-action="status-vernieuwen"]')) { toggleStatusPaneel(false); loadAll(); }
  });
  // Bol en label veranderen in data.js; wij kijken mee.
  const mo = new MutationObserver(() => { zetSinds(); renderStatusPaneel(); });
  const dot = document.getElementById('dot'), lbl = document.getElementById('sync-lbl');
  if (dot) mo.observe(dot, { attributes: true, attributeFilter: ['class'] });
  if (lbl) mo.observe(lbl, { childList: true, characterData: true, subtree: true });
  zetSinds();
}
