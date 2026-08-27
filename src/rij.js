// ══════════════════════════════════════
//  RIJ — wie is deze rij, NU?
// ══════════════════════════════════════
// Dit bestand bestaat om één fout onmogelijk te maken, en die fout is in dit dashboard al vier keer
// in vier verschillende gedaantes teruggekomen:
//
//   Een handeling pakt een rij-OBJECT (uit `state._rowCache`, uit een klik van seconden geleden,
//   uit een venster dat openstond) en muteert daar later D mee. Maar `loadAll` vervangt élk
//   rij-object in D bij iedere geslaagde ronde, terwijl `renderAll` — en dus de rendercache —
//   alleen draait als de datahash wijzigde. Bleef de inhoud gelijk, dan wijst dat bewaarde object
//   nergens meer naar. `arr.indexOf(r)` geeft dan -1 en het gevolg is elke keer hetzelfde patroon:
//   de zichtbare lijst en de Sheet lopen uiteen, en een rollback zet de rij er als TWEEDE
//   exemplaar bij.
//
// Waar dat eerder misging: `subtakenVan` (v11.2), `doCompleteTask` en `deleteTaskRow` (26-08),
// de undo van een bulk-veldactie (26-08). Elke keer op een andere plek, elke keer dezelfde vorm.
//
// DE REGEL: identiteit boven positie. Een taak is zijn vaste TAAKNUMMER (kolom Q), niet zijn plek
// in een array en niet het object dat je toevallig nog vasthoudt.
//
// Alle mutatiewegen horen hier doorheen te gaan. Er staat een toets op (zie 'verouderde rij' in
// tests.js) die élke rij-actie met een verouderd object voert en nagaat dat hij de JUISTE rij
// raakt — en die weigert groen te worden zodra er een rij-actie bij komt die er niet in staat.
//
// Bewust alleen `state` en `config` als import: zo kan iedere module dit gebruiken zonder een
// kringverwijzing te maken.
import { D } from './state.js';
import { SECS } from './config.js';

const tekst = v => (v == null ? '' : String(v)).trim();

// De inhoudelijke vingerafdruk van een taakrij. ALLEEN als terugval voor rijen zonder taaknummer:
// van vóór de backfill, of aangemaakt door een oude client. De acht sectievelden plus de kolommen
// die twee taken van dezelfde VvE uit elkaar houden.
// LET OP — SYNC: deze velden komen uit `SECS[sec].keys` (config.js) plus de staartkolommen die
// `parseSections` (data.js) leest. Komt daar een kolom bij, dan hoort hij hier ook bij.
function _inhoudSleutel(r){
  const keys = (SECS[r && r._sec] || {}).keys || [];
  return keys.map(k => tekst(r[k]))
    .concat([tekst(r.subcategorie), tekst(r.opvolgdatum), tekst(r.herhaalId),
             tekst(r.fase), tekst(r.aannemers), tekst(r.bundelId), tekst(r.bundelVolg)])
    .join('\x1f');
}

// Waar staat deze rij NU in die lijst? -1 als hij er niet meer in staat of als het antwoord
// dubbelzinnig is.
//
// Dubbelzinnig telt bewust als 'niet gevonden'. Twee rijen zonder taaknummer die inhoudelijk
// identiek zijn kunnen we niet uit elkaar houden, en dan is niets doen beter dan gokken: de
// verkeerde rij overschrijven is de duurste fout die dit dashboard kent.
export function rijIndex(lijst, r){
  const arr = lijst || [];
  if (!r) return -1;
  // Snelle weg: hetzelfde object staat er nog gewoon in. Dat is het gewone geval.
  const direct = arr.indexOf(r);
  if (direct > -1) return direct;
  const nr = tekst(r.taakId);
  if (nr) {
    const treffers = [];
    for (let i = 0; i < arr.length; i++) if (tekst(arr[i].taakId) === nr) treffers.push(i);
    return treffers.length === 1 ? treffers[0] : -1;
  }
  const sleutel = _inhoudSleutel(r);
  const treffers = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i]._sec === r._sec && _inhoudSleutel(arr[i]) === sleutel) treffers.push(i);
  }
  return treffers.length === 1 ? treffers[0] : -1;
}

// Het VERSE object voor deze rij, of null. Zonder lijst wordt de sectie van de rij zelf gepakt.
// `null` betekent: deze taak bestaat niet meer, of we weten het niet zeker — en dan hoort de
// aanroeper te stoppen en dat te zeggen, niet door te gaan op een object dat nergens meer bij hoort.
export function verseRij(r, lijst){
  if (!r || !SECS[r._sec]) return null;
  const arr = lijst || D.ntd[r._sec] || [];
  const i = rijIndex(arr, r);
  return i > -1 ? arr[i] : null;
}

// Staat deze rij nog in de lijst? Bewust een eigen naam: `rijIndex(...) > -1` leest als een
// positievraag, terwijl het antwoord over identiteit gaat.
export function rijBestaatNog(r, lijst){ return rijIndex(lijst || (r && D.ntd[r._sec]) || [], r) > -1; }

// Dezelfde vraag voor de tabbladen die NIET uit D.ntd komen: Herhaalregels, Ontwikkeling, Logboek.
// Die hebben hun eigen sleutel, dus die geef je hier mee. De vorm van de fout is identiek — een
// rollback die seconden later draait houdt een object vast dat `loadAll` intussen vervangen heeft,
// `indexOf` geeft -1 en de rollback zet er een TWEEDE exemplaar bij.
//
// `sleutel` mag leeg zijn: dan blijft alleen de object-identiteit over, en dat is de eerlijke
// uitkomst voor een lijst zonder eigen sleutel.
export function regelIndex(lijst, r, sleutel){
  const arr = lijst || [];
  if (!r) return -1;
  const direct = arr.indexOf(r);
  if (direct > -1) return direct;
  if (typeof sleutel !== 'function') return -1;
  const k = tekst(sleutel(r));
  if (!k) return -1;
  const treffers = [];
  for (let i = 0; i < arr.length; i++) if (tekst(sleutel(arr[i])) === k) treffers.push(i);
  return treffers.length === 1 ? treffers[0] : -1;
}
