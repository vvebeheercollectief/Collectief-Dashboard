// ══════════════════════════════════════
//  SNELTOETSEN op de takenlijst (U8): j/k rij kiezen, e bewerken, a afronden, w wegleggen,
//  i in behandeling, ? overzicht
// ══════════════════════════════════════
// De 'focusrij' is een eigen begrip naast de muis: een rij met een dunne rand, gekozen met j/k of
// door erop te klikken. De toetsen werken alleen als er niets anders de toets kan willen: geen
// invoerveld met focus, geen open venster, niet het palet of de chat. De rij wordt op zijn
// SLEUTEL onthouden (data-uitklap = rijSleutel, het taaknummer), niet op positie: na elke
// hertekening wijst dezelfde taak weer aan, ook als hij van plek is geschoven.
import { state } from './state.js';
import { taakUitCache, openModal, completeTask } from './crud.js';
import { openSnoozeModal } from './snooze.js';
import { zetInBehandeling } from './inbehandeling.js';
import { palOpen } from './palette.js';
import { showToast } from './notifications.js';

function _bewerkbaar(el) {
  if (!el) return false;
  // De focus kan achterblijven in een veld van een venster dat net gesloten is (Escape op het
  // bewerkscherm laat de cursor in het verborgen tekstvak staan). Dat veld krijgt de toets niet,
  // dus het mag de sneltoetsen ook niet blokkeren; we halen de focus er meteen af.
  const bg = el.closest && el.closest('.modal-bg');
  if (bg && !bg.classList.contains('open')) { try { el.blur(); } catch (_) {} return false; }
  const t = el.tagName;
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
}
// '?' komt op de meeste toetsenborden als Shift+/ binnen; sommige lagen melden alleen de code.
const _isVraagteken = e => e.key === '?' || (e.shiftKey && (e.key === '/' || e.code === 'Slash'));
function _vrij() {
  return !document.querySelector('.modal-bg.open')
    && !document.getElementById('chat-bg')?.classList.contains('open')
    && !_bewerkbaar(document.activeElement);
}
const _rijen = () => [...document.querySelectorAll('#ntd-tbody tr[data-rid]')];

export function rijFocusTr() {
  const s = state._rijFocus;
  if (!s) return null;
  return document.querySelector(`#ntd-tbody tr[data-rid][data-uitklap="${CSS.escape(s)}"]`);
}
// Het rij-object van de focusrij (of null). Rechtstreeks uit de rendercache, zonder melding.
export function rijFocusTaak() {
  const tr = rijFocusTr();
  return tr ? (state._rowCache[+tr.dataset.rid] || null) : null;
}
export function markeerRijFocus() {
  document.querySelectorAll('#ntd-tbody tr.rij-focus').forEach(t => t.classList.remove('rij-focus'));
  const tr = rijFocusTr();
  if (tr) tr.classList.add('rij-focus');
}
function stap(d) {
  const rijen = _rijen();
  if (!rijen.length) return;
  const cur = rijFocusTr();
  let i = rijen.indexOf(cur);
  i = i < 0 ? (d > 0 ? 0 : rijen.length - 1) : Math.max(0, Math.min(rijen.length - 1, i + d));
  state._rijFocus = rijen[i].dataset.uitklap;
  markeerRijFocus();
  rijen[i].scrollIntoView({ block: 'nearest' });
}
function metFocusRij(fn) {
  const tr = rijFocusTr();
  if (!tr) {
    showToast('Kies eerst een taak', 'Gebruik j en k om een rij te kiezen, of klik er een aan.', null, 'label', { geenSysteemmelding: true });
    return;
  }
  fn(tr.dataset.rid);
}

// De acties, ook voor het palet (U3): één bron voor toets én menu.
export const RIJ_ACTIES = [
  { toets: 'e', lbl: 'Bewerken', ico: 'potlood', doe: rid => { const r = taakUitCache(rid); if (r) openModal(true, r); } },
  { toets: 'a', lbl: 'Afronden', ico: 'vink', doe: rid => completeTask(+rid) },
  { toets: 'w', lbl: 'Wegleggen', ico: 'pauze', doe: rid => openSnoozeModal(+rid) },
  { toets: 'i', lbl: 'In behandeling aan/uit', ico: 'afspelen', doe: rid => zetInBehandeling(+rid) },
];

export function toggleSneltoetsOverzicht(aan) {
  const bg = document.getElementById('sneltoets-bg');
  if (!bg) return;
  const open = aan == null ? !bg.classList.contains('open') : !!aan;
  bg.classList.toggle('open', open);
}
export function sluitSneltoetsOverzicht() { toggleSneltoetsOverzicht(false); }

export function initSneltoetsen() {
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (_isVraagteken(e)) {
      if (_bewerkbaar(e.target)) return;
      const open = document.querySelector('.modal-bg.open');
      if (open && open.id !== 'sneltoets-bg') return;
      e.preventDefault(); toggleSneltoetsOverzicht(); return;
    }
    if (!_vrij() || palOpen()) return;
    if (!document.getElementById('page-ntd')?.classList.contains('active')) return;
    if (e.key === 'j') stap(1);
    else if (e.key === 'k') stap(-1);
    else {
      const actie = RIJ_ACTIES.find(a => a.toets === e.key);
      if (!actie) return;
      metFocusRij(actie.doe);
    }
    e.preventDefault();
  });
  // Een klik op een rij maakt hem de focusrij, zodat j/k vanaf daar verdergaan.
  document.getElementById('ntd-tbody')?.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-rid]');
    if (!tr) return;
    state._rijFocus = tr.dataset.uitklap;
    markeerRijFocus();
  });
  document.getElementById('sneltoets-sluit')?.addEventListener('click', sluitSneltoetsOverzicht);
  document.getElementById('sneltoets-dicht')?.addEventListener('click', sluitSneltoetsOverzicht);
  const bg = document.getElementById('sneltoets-bg');
  let md = null;
  bg?.addEventListener('mousedown', e => { md = e.target; });
  bg?.addEventListener('click', e => { if (e.target === bg && md === bg) sluitSneltoetsOverzicht(); });
}
