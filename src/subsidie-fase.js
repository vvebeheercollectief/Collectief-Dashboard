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

// Volgorde vastgesteld met de gebruiker (2026-07-30): tussen indienen en toekennen
// zit een aparte periode waarin de aanvraag bij de verstrekker in behandeling is —
// en dáár zit het merendeel van de lopende trajecten in.
// LET OP: 'In behandeling' is hier een FASE in kolom D en staat volledig los van de
// kolom 'In behandeling' (H), die aangeeft of een collega de taak heeft opgepakt.
export const SUBSIDIE_FASES = ['Voorbereiden', 'Aangevraagd', 'In behandeling', 'Verleend', 'Afgerond'];

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

// Moet deze fase-overgang in het logboek? Geeft null als er niets te melden is,
// anders {van, naar} met de woorden zoals ze in de logregel horen te staan.
// Eén bron voor beide wegen waarlangs een fase kan wijzigen: een klik op een
// bolletje in de tabelrij, en Opslaan in het bewerkscherm.
// Een lege oude waarde telt als 'Voorbereiden' — dat is wat de rij toonde.
export function faseWijziging(oud, nieuw){
  const o = ((oud == null ? '' : oud) + '').trim();
  const n = ((nieuw == null ? '' : nieuw) + '').trim();
  if (!n || n === o) return null;
  return { van: o || SUBSIDIE_FASES[0], naar: n };
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
  return bouwFaseRij(SUBSIDIE_FASES, faseIndex(huidig), rid, extraClass,
                     'subsidie-fase', 'Fase van dit subsidietraject');
}

// De bolletjesbalk zelf, los van WELKE fases het zijn. Sinds het CRM-tabblad (v13.0) zijn er twee
// reeksen — deze vijf en de vier van CRM (crm-fase.js) — en die blijven inhoudelijk volledig
// gescheiden: eigen woorden, eigen klikactie, eigen kolom. Alleen de tekening is gedeeld, zodat een
// verbetering aan de balk (raakvlak, toegankelijkheid) niet in twee kopieën uit elkaar gaat lopen.
// De uitvoer voor Subsidie is teken-voor-teken dezelfde als vóór deze splitsing.
export function bouwFaseRij(fases, n, rid, extraClass, actie, groepLabel) {
  const aantal = fases.length;
  let rail = '';
  for (let i = 1; i <= aantal; i++) {
    const cls = i < n ? 'af' : i === n ? 'nu' : '';
    rail += `<button type="button" class="fase-bol ${cls}" data-action="${actie}"`
          + ` data-rid="${rid}" data-fase="${i}" aria-pressed="${i === n}"`
          + ` title="Zet op ${esc(fases[i - 1])}"`
          + ` aria-label="Zet op ${esc(fases[i - 1])}"></button>`;
    if (i < aantal) rail += `<span class="fase-lijn ${i < n ? 'af' : ''}"></span>`;
  }
  return `<div class="fase-rij ${extraClass || ''}" role="group" aria-label="${esc(groepLabel)}">`
       + `<div class="fase-rail">${rail}</div>`
       + `<div class="fase-lbl">${esc(fases[n - 1] || fases[0])}</div></div>`;
}
