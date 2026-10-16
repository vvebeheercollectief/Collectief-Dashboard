// ══════════════════════════════════════
//  SNOOZE — taak wegleggen tot een opvolgdatum (Fase 4)
//  Schrijft kolom L in 'Nog Te Doen'; deadline wint altijd (waarschuwing).
// ══════════════════════════════════════
import { state } from "./state.js";
import { toDutchDate, toISODate, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt, taakTitel } from "./util.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline, blokkeerVersie } from "./data.js";
import { renderAll } from "./main.js";
import { showToast, showUndoToast, meldFout } from "./notifications.js";
import { taakUitCache } from "./crud.js";
import { verseRij } from "./rij.js";
import { logEvent } from "./render-overig.js";
import { vraagBevestiging } from "./bevestig.js";

const OPVOLG_KOLOM = 'L'; // Nog Te Doen: L=Opvolgdatum (M=Herhaal-ID, N=Esc)

function openSnoozeModal(rid){
  // Zelfde antwoord als elders wanneer de aangeklikte rij niet meer bestaat (zie taakUitCache):
  // hier gebeurde er helemaal niets, en een knop die een venster hoort te openen en dat niet doet
  // is niet te onderscheiden van een kapotte app.
  const r = taakUitCache(rid);
  if(!r) return;
  state._snoozeRow = r;
  // De TAAK noemen, niet alleen de VvE: heeft een VvE twee open taken, dan was hier niet te zien
  // wélke je weglegt. Zelfde bron als de titel van het afrondvenster (completeTaskRow, crud.js).
  document.getElementById('snooze-title').textContent = `Wegleggen — ${taakTitel(r, r._sec)||r.code||''}`;
  document.getElementById('snooze-datum').value = toISODate(r.opvolgdatum||'');
  document.getElementById('snooze-wis').style.display = r.opvolgdatum ? '' : 'none';
  document.getElementById('snooze-bg').classList.add('open');
}
function closeSnoozeModal(){
  document.getElementById('snooze-bg').classList.remove('open');
  state._snoozeRow = null;
}
function snoozeKies(dagen){
  const d = new Date(); d.setDate(d.getDate()+dagen);
  document.getElementById('snooze-datum').value =
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  snoozeOpslaan();
}
// Async sinds de eigen bevestigingsvraag. Beide aanroepers laten het resultaat liggen — de
// Wegleggen-knop (main.js) en `snoozeKies` — en er gebeurt bij allebei niets ná de aanroep, dus
// die hoefden niet mee te veranderen.
// De rij VERS opzoeken op het klikmoment (zelfde reden als `_bewerkRijVers` in crud.js): de stille
// resync ná een eerdere schrijfactie vervangt alle rij-objecten in D terwijl dit venster openstaat,
// en dan muteerde `schrijfOpvolgdatum` een wees — de Sheet werd goed beschreven, maar het scherm
// liet niets zien tot de volgende ronde (naloop 2026-10-16).
function _snoozeRijVers(){
  const bewaard = state._snoozeRow; if(!bewaard) return null;
  const r = verseRij(bewaard);
  if(!r){
    showToast('Taak niet gevonden','De lijst is intussen ververst. Probeer het opnieuw.','var(--rd)','waarschuwing',{geenDedup:true,geenSysteemmelding:true});
    closeSnoozeModal();
    return null;
  }
  state._snoozeRow = r;
  return r;
}
async function snoozeOpslaan(){
  const r = _snoozeRijVers(); if(!r) return;
  // Minimumversie-rem hier al: hieronder sluit het venster ongeacht de rem in schrijfOpvolgdatum.
  if(blokkeerVersie()) return;
  const iso = document.getElementById('snooze-datum').value;
  if(!iso){ meldFout('Kies een datum.'); return; }
  const nieuw = toDutchDate(iso);
  const p = _parseAnyDate(nieuw);
  const d = new Date(p.y, p.m-1, p.d);
  if(_verschilInKalenderdagen(d, _vandaagAmsterdam()) <= 0){ meldFout('Kies een datum in de toekomst.'); return; }
  const dl = parseDt(r.deadline);
  // De constatering in de tekst, de vraag zelf op de knop — het venster stelt zijn vraag mét
  // knoppen, en de `\n` uit de oude `confirm()`-tekst zou hier toch geen regelovergang meer geven
  // (het venster zet zijn tekst via `textContent`). Niet 'gevaarlijk': wegleggen zet een datum en
  // is met dezelfde knop terug te draaien.
  // De vraag staat vóór `schrijfOpvolgdatum`, en die remt pas daarbinnen op offline — zelfde
  // volgorde als hiervoor, en dezelfde als bij `deleteTaskRow` in crud.js: een 'nee' kost dan
  // niets, en andersom zou je eerst deze vraag beantwoorden om dán pas te horen dat er geen
  // verbinding is.
  if(dl && d.getTime() > dl &&
     !await vraagBevestiging({
       titel:'Wegleggen ná de deadline?',
       tekst:`Deze opvolgdatum ligt ná de deadline (${r.deadline}). `+
             `De taak wordt op de deadline gewoon "Te laat".`,
       bevestigTekst:'Toch wegleggen' })) return;
  // `schrijfOpvolgdatum` bewust NIET geAWAIT: die is al async en liep ook vóór dit traject door
  // terwijl het venster hieronder al sloot (hij komt tot `await ensureToken()` en geeft dan terug).
  // Een `await` erbij zou het venster pas laten sluiten als de schrijfactie in de wachtrij staat —
  // een zichtbare vertraging die er niet was.
  schrijfOpvolgdatum(r, nieuw, 'Weggelegd');
  closeSnoozeModal();
}
function snoozeWis(){
  const r = _snoozeRijVers(); if(!r) return;
  if(blokkeerVersie()) return;   // zie snoozeOpslaan: venster open laten
  schrijfOpvolgdatum(r, '', 'Opvolgdatum gewist');
  closeSnoozeModal();
}
// `opties.zonderUndo`: dit IS al de undo — geen tweede knop (anders ping-pong). `opties.titel`:
// de bevestigingstitel van die undo ('Wegleggen ongedaan gemaakt').
async function schrijfOpvolgdatum(r, nieuw, actie, opties){
  const o = opties || {};
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ showToast('Inloggen mislukt','Probeer het opnieuw.','var(--rd)','waarschuwing',{geenDedup:true,geenSysteemmelding:true}); return; }
  const oud = r.opvolgdatum || '';
  // Momentopname VÓÓR de mutatie, voor de rij-controle. De controle draait pas als deze schrijfactie
  // in de seriële wachtrij aan de beurt is; een actie die daarna is ingeschreven maar al optimistisch
  // in `r` staat (een opgeslagen bewerking, 'Opgevolgd') zou anders in de vingerafdruk zitten terwijl
  // de Sheet nog de oude waarde heeft — vals 'Iemand heeft deze taak net gewijzigd' en een
  // teruggedraaide weglegging (naloop 2026-10-16). Zelfde idioom als `snap` in offerte-aannemers.js.
  const snap = {...r};
  r.opvolgdatum = nieuw;
  renderAll();
  backgroundWrite(
    async ()=>{
      const rij = r._row;   // Eén keer gelezen: een afronding elders schuift `_row` optimistisch op (_shiftNtdRows); tussen
      // controle en schrijven mag hij dus niet opnieuw gelezen worden (naloop 25-09).
      await assertRowMatch(rij, snap); // bescherming: rij nog dezelfde TAAK vóór L-write (kolom L zit niet in de vingerafdruk)
      await writeRange(`'Nog Te Doen'!${OPVOLG_KOLOM}${rij}:${OPVOLG_KOLOM}${rij}`, [nieuw]);
      await logEvent(r.code, r._sec, actie, 'opvolgdatum', oud, nieuw);
      // Bevestiging pas ná de write; onderaan de writeFn zodat een herkansing er niet twee geeft.
      // Via de centrale `taakTitel` en niet via een eigen terugvalketen: die kende `opmerkingen`
      // (Offerte-trajecten) niet en viel daar terug op de VvE-naam, zodat de bevestiging de
      // VERENIGING noemde in plaats van de taak. Zelfde keuze als in inbehandeling.js en deleteTaskRow.
      const titel = o.titel || (nieuw ? 'Weggelegd tot '+nieuw : 'Opvolgdatum gewist');
      const tekst = `${r.code} — ${taakTitel(r, r._sec)||r.naam||''}`;
      // Mét 'Ongedaan maken' (U7): de oude opvolgdatum terug (of weer leeg). De undo zoekt de rij
      // op dát moment vers op — dezelfde taak, ook als de lijst intussen hertekend is.
      if(o.zonderUndo) showToast(titel, tekst, null, nieuw ? 'pauze' : 'bel', {geenDedup:true,geenSysteemmelding:true});
      else showUndoToast(titel, tekst, ()=>maakWeglegOngedaan(r, oud), nieuw ? 'pauze' : 'bel', {geenDedup:true, sleutel:r.taakId||(r._sec+':'+r._row)});
    },
    ()=>{ r.opvolgdatum = oud; },
    'Wegleggen mislukt'
  );
}
// De undo-knop uit de toast: zet de opvolgdatum terug op wat hij was. Zelfde schrijfweg, dus ook
// dezelfde rij-controle en logregel ('Opvolgdatum teruggezet' bestaat al als actienaam).
async function maakWeglegOngedaan(rij, oud){
  const r = verseRij(rij);
  if(!r){ showToast('Niet ongedaan gemaakt','De taak is intussen afgerond of verwijderd.','var(--am)','waarschuwing',{geenDedup:true,geenSysteemmelding:true}); return; }
  await schrijfOpvolgdatum(r, oud, oud ? 'Opvolgdatum teruggezet' : 'Opvolgdatum gewist',
                           { zonderUndo:true, titel:'Wegleggen ongedaan gemaakt' });
}
export { openSnoozeModal, closeSnoozeModal, snoozeKies, snoozeOpslaan, snoozeWis, maakWeglegOngedaan };
