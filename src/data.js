// ══════════════════════════════════════
//  DATA — laden, parsen, achtergrond-schrijven, sync-indicator
// ══════════════════════════════════════
import { parseDt } from "./util.js";
import { state, D } from "./state.js";
import { SKEYS, SECS } from "./config.js";
import { fetchSheet, _withRetry } from "./api.js";
import { ensureToken } from "./auth.js";
import { buildAnalytics, buildDash } from "./render-analytics.js";
import { renderNtdDonut } from "./render-lijsten.js";
import { parseOntw, parseLogboek } from "./render-overig.js";
import { showToast } from "./notifications.js";
import { renderAll } from "./main.js";

//  API
// ══════════════════════════════════════

// Voert een Sheets-schrijfactie op de achtergrond uit (serieel). De UI is al
// optimistisch bijgewerkt door de aanroeper. Bij fout draait `rollback` de lokale
// wijziging terug en verschijnt een foutmelding.
function backgroundWrite(writeFn, rollback, foutTitel){
  state.pendingWrites++;
  state._writeChain=state._writeChain.then(async()=>{
    try{
      await _withRetry(writeFn);
    }catch(e){
      try{ rollback(); renderAll(); }catch(_){}
      const msg=(e.message||'').toLowerCase();
      if(msg.includes('authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
        state.oauthToken=null;state.oauthExpiry=0;
        showToast(foutTitel,'Sessie verlopen — wijziging teruggezet. Probeer opnieuw.','#dc2626');
      }else{
        showToast(foutTitel,'Niet opgeslagen — wijziging teruggezet.','#dc2626');
      }
      console.error(foutTitel,e);
    }finally{
      state.pendingWrites--;
      if(state.pendingWrites===0){ loadAll(true); } // stille resync van rij-indexen
    }
  });
  return state._writeChain;
}

function setSyncing(){dot('loading');document.getElementById('sync-lbl').textContent='Laden…'}
function setSynced(){dot('');document.getElementById('sync-lbl').textContent='Live · '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
function setSyncErr(){dot('err');document.getElementById('sync-lbl').textContent='Fout'}
function dot(cls){const d=document.getElementById('dot');d.className='dot'+(cls?' '+cls:'')}

// Herhaal-slot: voorkomt dat twee loadAll-aanroepen tegelijk lopen en elkaars data
// overschrijven (8s-poll, schrijf-resync, refresh-knop, handmatige awaits).
async function loadAll(silent){
  if(state._loadInFlight){ state._loadAgain=true; return; }
  state._loadInFlight=true;
  try{
    if(!state.oauthToken){
      if(!await ensureToken()){setSyncErr();return}
    }
    if(!silent) setSyncing();
    const[ntdR,afR,alvoR,alfaR,ontwR,logR,hhR]=await Promise.all([
      fetchSheet("Nog Te Doen"),fetchSheet("Afgerond"),
      fetchSheet("ALV's overzicht"),fetchSheet("ALV's afgerond"),
      fetchSheet("Ontwikkeling").catch(()=>[]),
      fetchSheet("Logboek").catch(()=>[]),
      fetchSheet("Herhaalregels").catch(()=>[]),
    ]);
    // Kwam er tijdens het lezen een schrijfactie tussen? Dan is de lokale (optimistische)
    // staat leidend; de eigen resync van die schrijfactie haalt zo de verse data op.
    if(state.pendingWrites>0){ if(!silent) setSynced(); return; }
    const ntdP=parseSections(ntdR); D.ntd=ntdP.data; D.ntdSecInfo=ntdP.secInfo;
    const afP=parseSections(afR); D.af=afP.data; D.afSecInfo=afP.secInfo;
    SKEYS.forEach(s=>{if(D.af[s])D.af[s].sort((a,b)=>parseDt(b.datum)-parseDt(a.datum))});
    D.alvo=parseAlvo(alvoR);
    D.alfa=parseAlfa(alfaR);
    D.ontw=parseOntw(ontwR);
    D.logboek=parseLogboek(logR);
    D.herhaal=parseHerhaal(hhR);
    setSynced();
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek,D.herhaal]);
    if(hash!==state._lastDHash){
      state._lastDHash=hash;
      renderAll();
      // Re-render actieve detailpagina's met nieuwe data
      if(document.getElementById('page-analytics')?.classList.contains('active')) buildAnalytics();
      if(document.getElementById('page-dash')?.classList.contains('active')) buildDash();
      if(document.getElementById('page-ntd')?.classList.contains('active')) renderNtdDonut();
    }
  }catch(e){setSyncErr();console.error(e)}
  finally{
    state._loadInFlight=false;
    if(state._loadAgain){ state._loadAgain=false; loadAll(true); } // een onderdrukte aanroep alsnog uitvoeren
  }
}

// ══════════════════════════════════════
//  PARSE
// ══════════════════════════════════════
function parseSections(rows){
  const out={};
  const secInfo={};
  SKEYS.forEach(s=>{out[s]=[];secInfo[s]={colHeaderRow:null}});
  let cur=null, skip=false;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    if(!row||!row.length) continue;
    const first=(row[0]||'').trim();
    const upper=first.toUpperCase();
    if(SKEYS.includes(upper)){cur=upper;skip=true;continue}
    if(!cur) continue;
    if(skip){skip=false;secInfo[cur].colHeaderRow=i+1;continue}
    if(!first) continue;
    if(first==='VvE-Code'||first==='VvE Code'||SKEYS.includes(upper)) continue;
    const keys=SECS[cur].keys;
    const entry={_row:i+1,_sec:cur};
    keys.forEach((k,j)=>{entry[k]=(row[j]||'').trim()});
    const afOff=Math.max(keys.length,8);
    entry.datum=(row[afOff]||'').trim();
    entry.opmerking=(row[afOff+1]||'').trim();
    entry.subcategorie=(row[afOff+2]||'').trim();
    entry.opvolgdatum=((row[11]||'')+'').trim();  // L — Fase 4
    entry.herhaalId  =((row[12]||'')+'').trim();  // M
    entry.esc        =((row[13]||'')+'').trim();  // N (alleen door Apps Script geschreven)
    if(entry.code) out[cur].push(entry);
  }
  return {data:out,secInfo};
}

// Herhaalregels-tab (Fase 4): A=ID B=Omschrijving C=Sectie D=Code E=Naam F=Behandelaar
// G=Type H=IntervalMnd I=DagenVooraf J=VolgendeDeadline K=Status L=LaatstKlaargezet
function parseHerhaal(rows){
  if(!rows||rows.length<2) return [];
  return rows.slice(1).map((r,i)=>({
    _row:i+2,
    id:((r[0]||'')+'').trim(), omschrijving:((r[1]||'')+'').trim(),
    sectie:((r[2]||'')+'').trim().toUpperCase(),
    code:((r[3]||'')+'').trim(), naam:((r[4]||'')+'').trim(),
    behandelaar:((r[5]||'')+'').trim(), type:((r[6]||'')+'').trim().toLowerCase(),
    interval:((r[7]||'')+'').trim(), dagenVooraf:parseInt(r[8])||14,
    volgendeDeadline:((r[9]||'')+'').trim(),
    status:((r[10]||'ACTIEF')+'').trim().toUpperCase(),
    laatstKlaargezet:((r[11]||'')+'').trim(),
  })).filter(r=>r.id);
}

function parseAlvo(rows){
  return rows.slice(2).map((r,i)=>{
    const code=(r[0]||'').trim();
    if(!code||code.length>20) return null;
    // Skip stat rows
    if(['Totaal','Uitnodigingen','Notulen','Nog'].some(p=>code.startsWith(p))) return null;
    const uitn=(r[2]||'').trim()==='TRUE';
    const notu=(r[3]||'').trim()==='TRUE';
    const begr=(r[4]||'').trim()==='TRUE';
    const status=notu?'Afgerond':uitn?'Gepland':'Open';
    return{code,naam:(r[1]||'').trim(),uitnodiging:uitn,notulen:notu,begroting:begr,opmerkingen:(r[5]||'').trim(),status,_row:i+3};
  }).filter(Boolean);
}

function parseAlfa(rows){
  return rows.slice(1).map(r=>({
    code:(r[0]||'').trim(),naam:(r[1]||'').trim(),datum:(r[2]||'').trim()
  })).filter(r=>r.code);
}

// ══════════════════════════════════════

export {
  backgroundWrite, setSyncing, setSynced, setSyncErr, dot, loadAll, parseSections, parseAlvo, parseAlfa,
};
