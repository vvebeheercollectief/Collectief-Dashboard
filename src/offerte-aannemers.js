// ══════════════════════════════════════
//  OFFERTE-AANNEMERS — per-traject aannemerslijst (kolom P 'Nog Te Doen')
//  Bron van waarheid = de rauwe kolom-P-string r.aannemers; de render-verrijking
//  leidt daaruit r._aannemers én de "X/N binnen"-teller (r.offertes) af.
//  Optimistisch schrijven met rollback (backgroundWrite).
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { parseAannemers, serializeAannemers } from "./util.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite } from "./data.js";
import { renderNtd } from "./render-lijsten.js";

function _vindRij(code){
  return (D.ntd['OFFERTE-TRAJECTEN']||[]).find(r=>r.code===code) || null;
}

// Render direct (optimistisch) en schrijf de al-gemuteerde r.aannemers weg naar kolom P.
// backgroundWrite rolt terug + her-rendert bij falen (zie data.js).
async function _bewaar(r, vorige){
  renderNtd();
  if(!r._row) return; // zonder rijnummer geen schrijfdoel (zeldzaam) — alleen lokaal
  if(!await ensureToken()){ r.aannemers=vorige; renderNtd(); return; }
  let gedaan=false;
  backgroundWrite(
    async()=>{ if(!gedaan){ await assertRowMatch(r._row, r.code); await writeRange(`'Nog Te Doen'!P${r._row}`,[r.aannemers]); gedaan=true; } },
    ()=>{ r.aannemers=vorige; },
    'Aannemers opslaan'
  );
}

function addAannemer(code, naam){
  const r=_vindRij(code); if(!r) return;
  naam=((naam||'')+'').replace(/[|\n]/g,' ').trim();
  if(!naam) return;
  const lijst=parseAannemers(r.aannemers);
  if(lijst.some(a=>a.naam.toLowerCase()===naam.toLowerCase())) return; // dubbel: niets doen
  const vorige=r.aannemers;
  lijst.push({naam, binnen:false});
  r.aannemers=serializeAannemers(lijst);
  state.offerteAannOpen.add(code); // paneel open houden
  _bewaar(r, vorige);
}

function toggleAannemerBinnen(code, idx){
  const r=_vindRij(code); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  const vorige=r.aannemers;
  lijst[idx].binnen=!lijst[idx].binnen;
  r.aannemers=serializeAannemers(lijst);
  _bewaar(r, vorige);
}

function verwijderAannemer(code, idx){
  const r=_vindRij(code); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  const vorige=r.aannemers;
  lijst.splice(idx,1);
  r.aannemers=serializeAannemers(lijst);
  _bewaar(r, vorige);
}

export { addAannemer, toggleAannemerBinnen, verwijderAannemer };
