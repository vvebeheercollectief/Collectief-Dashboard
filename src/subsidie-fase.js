// ══════════════════════════════════════
//  SUBSIDIE-FASE — vijf stappen, opgeslagen als woord in kolom D
// ══════════════════════════════════════
// De fase staat bewust als leesbaar woord in de Sheet, niet als nummer: zo is de
// kolom ook bruikbaar als je het tabblad zelf openslaat. Alles wat hier binnenkomt
// komt dus uit mensenhanden — leeg, een typfout of een andere schrijfwijze mogen
// nooit een lege of kapotte tabel opleveren. Vandaar de terugval op stap 1.
//
// Deze module is met opzet PUUR: alleen esc() erbij, geen render- of api-import.
// Zou hij renderNtd importeren, dan ontstaat een kringloop
// (subsidie-fase → render-lijsten → render-tabel → subsidie-fase) en wordt de
// volgorde van initialisatie afhankelijk van wie er toevallig eerst geladen wordt.
// De schrijfweg (zetSubsidieFase) staat daarom in crud.js.
import { esc } from './util.js';

export const SUBSIDIE_FASES = ['Voorbereiden', 'Aangevraagd', 'Verleend', 'Uitgevoerd', 'Vastgesteld'];

// Woord → 1-gebaseerd stapnummer. Onbekend, leeg of null = 1 (Voorbereiden).
export function faseIndex(woord) {
  const w = ((woord == null ? '' : woord) + '').trim().toLowerCase();
  const i = SUBSIDIE_FASES.findIndex(f => f.toLowerCase() === w);
  return i < 0 ? 1 : i + 1;
}

// Stapnummer → woord. Buiten bereik = het eerste woord.
export function faseWoord(n) {
  return SUBSIDIE_FASES[(n | 0) - 1] || SUBSIDIE_FASES[0];
}

// Vijf knoppen op een lijn met het fasewoord eronder.
//   huidig     — het woord uit kolom D (mag rommel zijn)
//   rid        — index in state._rowCache, zodat de klik-actie de rij terugvindt;
//                zelfde patroon als de bewerk- en afrondknoppen in render-tabel.js
//   extraClass — 'fase-rij-modal' voor de variant in het bewerkscherm
// Echte <button>-elementen, geen klikbare spans: dat is de lijn die deze app sinds
// de toegankelijkheidsronde aanhoudt. Het fasewoord staat er als tekst onder, want
// kleur alleen is geen informatiedrager.
export function faseRijHtml(huidig, rid, extraClass) {
  const n = faseIndex(huidig);
  let rail = '';
  for (let i = 1; i <= 5; i++) {
    const cls = i < n ? 'af' : i === n ? 'nu' : '';
    rail += `<button type="button" class="fase-bol ${cls}" data-action="subsidie-fase"`
          + ` data-rid="${rid}" data-fase="${i}" aria-pressed="${i === n}"`
          + ` title="Zet op ${esc(SUBSIDIE_FASES[i - 1])}"`
          + ` aria-label="Zet op ${esc(SUBSIDIE_FASES[i - 1])}"></button>`;
    if (i < 5) rail += `<span class="fase-lijn ${i < n ? 'af' : ''}"></span>`;
  }
  return `<div class="fase-rij ${extraClass || ''}" role="group" aria-label="Fase van dit subsidietraject">`
       + `<div class="fase-rail">${rail}</div>`
       + `<div class="fase-lbl">${esc(faseWoord(n))}</div></div>`;
}
