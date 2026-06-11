// ══════════════════════════════════════
//  COMMANDOCENTRUM — Ctrl+K: zoek door alles + acties (Fase 5)
// ══════════════════════════════════════
import { esc, displayName, berekenPrioriteit } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";

const PAL_MAX = { vves:3, taken:5, afgerond:3, logboek:3 };

// Pure zoekfunctie (testbaar): doorzoekt VvE's, open taken, afgerond en logboek.
function zoekAlles(q, data, max){
  max = max || PAL_MAX;
  const z=(q||'').trim().toLowerCase();
  const res={vves:[],taken:[],afgerond:[],logboek:[]};
  if(!z) return res;
  const hit=(...velden)=>velden.some(v=>String(v||'').toLowerCase().includes(z));
  res.vves=(data.alvo||[]).filter(r=>hit(r.code,r.naam)).slice(0,max.vves);
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(res.taken.length<max.taken && hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.opmerkingen)) res.taken.push(r);
  }));
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{
    if(res.afgerond.length<max.afgerond && hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.opmerking)) res.afgerond.push(r);
  }));
  res.logboek=(data.logboek||[])
    .filter(e=>hit(e.code,e.actie,e.veld,e.oudeWaarde,e.nieuweWaarde,displayName(e.gebruiker)))
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
    .slice(0,max.logboek);
  return res;
}

export { zoekAlles, PAL_MAX };
