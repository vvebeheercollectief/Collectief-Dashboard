// ══════════════════════════════════════
//  SNOOZE — taak wegleggen tot een opvolgdatum (Fase 4)
//  Schrijft kolom L in 'Nog Te Doen'; deadline wint altijd (waarschuwing).
// ══════════════════════════════════════
import { state } from "./state.js";
import { toDutchDate, toISODate, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt } from "./util.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite } from "./data.js";
import { renderAll } from "./main.js";
import { showToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";

const OPVOLG_KOLOM = 'L'; // Nog Te Doen: L=Opvolgdatum (M=Herhaal-ID, N=Esc)

function openSnoozeModal(rid){
  const r = state._rowCache[rid];
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
function snoozeOpslaan(){
  const r = state._snoozeRow; if(!r) return;
  const iso = document.getElementById('snooze-datum').value;
  if(!iso){ alert('Kies een datum.'); return; }
  const nieuw = toDutchDate(iso);
  const p = _parseAnyDate(nieuw);
  const d = new Date(p.y, p.m-1, p.d);
  if(_verschilInKalenderdagen(d, _vandaagAmsterdam()) <= 0){ alert('Kies een datum in de toekomst.'); return; }
  const dl = parseDt(r.deadline);
  if(dl && d.getTime() > dl &&
     !confirm(`Let op: deze opvolgdatum ligt ná de deadline (${r.deadline}).\nDe taak wordt op de deadline gewoon "Te laat". Toch wegleggen?`)) return;
  schrijfOpvolgdatum(r, nieuw, 'Weggelegd');
  closeSnoozeModal();
}
function snoozeWis(){
  const r = state._snoozeRow; if(!r) return;
  schrijfOpvolgdatum(r, '', 'Opvolgdatum gewist');
  closeSnoozeModal();
}
async function schrijfOpvolgdatum(r, nieuw, actie){
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const oud = r.opvolgdatum || '';
  r.opvolgdatum = nieuw;
  renderAll();
  showToast(nieuw ? '⏸ Weggelegd tot '+nieuw : '🔔 Opvolgdatum gewist',
            `${r.code} — ${r.actiepunt||r.periode||r.naam||''}`, null);
  backgroundWrite(
    async ()=>{
      await assertRowMatch(r._row, r.code); // bescherming: rij nog van deze VvE vóór L-write
      await writeRange(`'Nog Te Doen'!${OPVOLG_KOLOM}${r._row}:${OPVOLG_KOLOM}${r._row}`, [nieuw]);
      logEvent(r.code, r._sec, actie, 'opvolgdatum', oud, nieuw);
    },
    ()=>{ r.opvolgdatum = oud; },
    'Wegleggen mislukt'
  );
}
export { openSnoozeModal, closeSnoozeModal, snoozeKies, snoozeOpslaan, snoozeWis };
