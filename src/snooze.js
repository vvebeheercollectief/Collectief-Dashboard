// ══════════════════════════════════════
//  SNOOZE — taak wegleggen tot een opvolgdatum (Fase 4)
//  Schrijft kolom L in 'Nog Te Doen'; deadline wint altijd (waarschuwing).
// ══════════════════════════════════════
import { state } from "./state.js";
import { toDutchDate, toISODate, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt, taakTitel } from "./util.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { renderAll } from "./main.js";
import { showToast } from "./notifications.js";
import { taakUitCache } from "./crud.js";
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
  document.getElementById('snooze-title').textContent = `Wegleggen — ${r.code} ${r.naam||''}`;
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
async function snoozeOpslaan(){
  const r = state._snoozeRow; if(!r) return;
  const iso = document.getElementById('snooze-datum').value;
  if(!iso){ alert('Kies een datum.'); return; }
  const nieuw = toDutchDate(iso);
  const p = _parseAnyDate(nieuw);
  const d = new Date(p.y, p.m-1, p.d);
  if(_verschilInKalenderdagen(d, _vandaagAmsterdam()) <= 0){ alert('Kies een datum in de toekomst.'); return; }
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
  const r = state._snoozeRow; if(!r) return;
  schrijfOpvolgdatum(r, '', 'Opvolgdatum gewist');
  closeSnoozeModal();
}
async function schrijfOpvolgdatum(r, nieuw, actie){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const oud = r.opvolgdatum || '';
  r.opvolgdatum = nieuw;
  renderAll();
  backgroundWrite(
    async ()=>{
      await assertRowMatch(r._row, r); // bescherming: rij nog dezelfde TAAK vóór L-write (kolom L zit niet in de vingerafdruk)
      await writeRange(`'Nog Te Doen'!${OPVOLG_KOLOM}${r._row}:${OPVOLG_KOLOM}${r._row}`, [nieuw]);
      await logEvent(r.code, r._sec, actie, 'opvolgdatum', oud, nieuw);
      // Bevestiging pas ná de write; onderaan de writeFn zodat een herkansing er niet twee geeft.
      showToast(nieuw ? 'Weggelegd tot '+nieuw : 'Opvolgdatum gewist',
                // Via de centrale `taakTitel` en niet via een eigen terugvalketen: die kende
                // `opmerkingen` (Offerte-trajecten) niet en viel daar terug op de VvE-naam, zodat
                // de bevestiging de VERENIGING noemde in plaats van de taak. Zelfde keuze als in
                // inbehandeling.js en deleteTaskRow.
                `${r.code} — ${taakTitel(r, r._sec)||r.naam||''}`, null, nieuw ? 'pauze' : 'bel',
                {geenDedup:true,geenSysteemmelding:true});
    },
    ()=>{ r.opvolgdatum = oud; },
    'Wegleggen mislukt'
  );
}
export { openSnoozeModal, closeSnoozeModal, snoozeKies, snoozeOpslaan, snoozeWis };
