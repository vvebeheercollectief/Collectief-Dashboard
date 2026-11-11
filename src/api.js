// ══════════════════════════════════════
//  API — lezen en schrijven in de Google Sheet
// ══════════════════════════════════════
// Overgenomen uit v15 (src/api.js): de tijdslimiet, de netwerkteller, de herhaalpoging bij een
// tijdelijke Google-fout en veiligeCel. Wat weg is: de AI-proxy en de vingerafdrukken per rij;
// v16 zoekt een rij vlak vóór het schrijven opnieuw op (zie zoek.js).
import { state } from "./state.js";
import { SID } from "./config.js";

// Offline = de browser zegt het, of de laatste twee verzoeken kregen geen antwoord.
const _isNetwerkFout = e => !!e && e.status===undefined;
export function _isOffline(browserOnline, netwerkFouten){
  if(!browserOnline) return true;
  return (netwerkFouten||0) >= 2;
}
export const isOffline = () => _isOffline(navigator.onLine, state._netwerkFouten||0);

// Hoe lang een verzoek hoogstens mag duren. Zonder grens bleef een hangend verzoek 'Laden…' tonen.
const FETCH_TIMEOUT_MS = 20_000;

export async function fetchMetKlok(url, opts, melding, ms){
  const ac = new AbortController();
  const klok = setTimeout(() => ac.abort(), state._fetchTimeoutMs || ms || FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...(opts||{}), signal: ac.signal }); }
  catch(e){
    if(e && e.name==='AbortError') throw new Error(melding || 'Geen antwoord binnen 20 seconden');
    throw e;
  }
  finally { clearTimeout(klok); }
}

// Elke Sheets-fetch loopt hierlangs: één plek voor de netwerkteller en de minimumversie-rem.
async function _fetchGeteld(url, opts){
  if(state._versieTeOud && String((opts && opts.method) || 'GET').toUpperCase() !== 'GET'){
    throw Object.assign(new Error('Niet opgeslagen: herlaad eerst het dashboard (nieuwe versie).'),
      { versieTeOud:true, melding:'Niet opgeslagen: herlaad eerst het dashboard.' });
  }
  const ac = new AbortController();
  const klok = setTimeout(() => ac.abort(), state._fetchTimeoutMs || FETCH_TIMEOUT_MS);
  let r;
  try{ r=await fetch(url, { ...(opts||{}), signal: ac.signal }); }
  catch(e){
    state._netwerkFouten=(state._netwerkFouten||0)+1;
    if(e && e.name==='AbortError') throw new Error('Geen antwoord van Google binnen 20 seconden');
    throw e;
  }
  finally { clearTimeout(klok); }
  state._netwerkFouten=0;
  return r;
}
export const sheetsFetch = (url, opts) => _fetchGeteld(url, opts);

async function _fout(r, standaard){
  const e=await r.json().catch(()=>({}));
  if(r.status===401){ state.oauthToken=null; state.oauthExpiry=0; }
  const err=new Error(e.error?.message||standaard); err.status=r.status; return err;
}
const _kop = () => ({ Authorization:`Bearer ${state.oauthToken}`, 'Content-Type':'application/json' });
const _basis = `https://sheets.googleapis.com/v4/spreadsheets/${SID}`;
const _a1 = (tab, bereik) => `'${String(tab).replace(/'/g,"''")}'${bereik ? '!'+bereik : ''}`;
export { _a1 };

export async function fetchSheet(bereik){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r=await _fetchGeteld(`${_basis}/values/${encodeURIComponent(bereik)}`,
    { cache:'no-store', headers:{ Authorization:`Bearer ${state.oauthToken}` } });
  if(!r.ok) throw await _fout(r,'API-fout');
  return (await r.json()).values||[];
}

// Eén batchGet voor meerdere tabbladen: geeft { bereik: rijen } terug, op naam (niet op volgorde).
export async function fetchSheets(bereiken){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const qs=bereiken.map(n=>`ranges=${encodeURIComponent(n)}`).join('&');
  const r=await _fetchGeteld(`${_basis}/values:batchGet?${qs}`,
    { cache:'no-store', headers:{ Authorization:`Bearer ${state.oauthToken}` } });
  if(!r.ok) throw await _fout(r,'API-fout');
  const vr=(await r.json()).valueRanges||[];
  const uit={};
  bereiken.forEach((n,i)=>{ uit[n]=(vr[i]&&vr[i].values)||[]; });
  return uit;
}

// Formule-injectie: een cel die begint met = + - @ (of tab/CR) wordt tekst. Een getal met een
// voorloopnul (VvE-code 021002, telefoonnummer) ook — anders maakt Sheets er 21002 van.
// LET OP — SYNC met cd_safeCell in apps-script/Notifications.gs.
const CEL_MAX=49000;
const CEL_STAART=' …[afgekapt]';
export const kapCel=v=>(typeof v==='string'&&v.length>CEL_MAX)?v.slice(0,CEL_MAX)+CEL_STAART:v;
export const veiligeCel=v=>{
  v=kapCel(v);
  return (typeof v==='string'&&(/^[=+\-@\t\r']/.test(v)||/^0\d+$/.test(v)))?"'"+v:v;
};
export const _veiligeRij=values=>(values||[]).map(veiligeCel);

export async function writeRange(bereik, waarden){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r=await _fetchGeteld(`${_basis}/values/${encodeURIComponent(bereik)}?valueInputOption=USER_ENTERED`,
    { method:'PUT', headers:_kop(), body:JSON.stringify({ values:[_veiligeRij(waarden)] }) });
  if(!r.ok) throw await _fout(r,'Schrijffout');
  return r.json();
}

export async function appendRows(bereik, rijen){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const lijst=(rijen||[]).filter(Boolean);
  if(!lijst.length) return null;
  const r=await _fetchGeteld(`${_basis}/values/${encodeURIComponent(bereik)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method:'POST', headers:_kop(), body:JSON.stringify({ values:lijst.map(_veiligeRij) }) });
  if(!r.ok) throw await _fout(r,'Schrijffout');
  return r.json();
}

// Structuurwijzigingen (rij invoegen/verwijderen, vinkje zetten, tabblad maken) in één verzoek:
// slaagt of faalt als geheel.
export async function batchUpdate(requests){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r=await _fetchGeteld(`${_basis}:batchUpdate`,
    { method:'POST', headers:_kop(), body:JSON.stringify({ requests }) });
  if(!r.ok) throw await _fout(r,'Opslaan mislukt');
  return r.json();
}

// Tabbladnamen → sheetId. Onthouden per sessie; `vers` haalt opnieuw op (na het aanmaken van een tab).
export async function getSheetIds(vers){
  if(state._sheetIds && !vers) return state._sheetIds;
  const r=await _fetchGeteld(`${_basis}?fields=sheets.properties(sheetId,title,index,gridProperties)`,
    { headers:{ Authorization:`Bearer ${state.oauthToken}` } });
  if(!r.ok) throw await _fout(r,'Tabbladen ophalen mislukt');
  const d=await r.json();
  state._sheetIds={};
  state._sheetProps=(d.sheets||[]).map(s=>s.properties);
  state._sheetProps.forEach(p=>{ state._sheetIds[p.title]=p.sheetId; });
  return state._sheetIds;
}
// Zelfde tab, ongeacht hoofdletters/spaties aan het eind ("ALV's Overzicht ").
export function sheetIdVan(ids, naam){
  if(ids[naam]!=null) return ids[naam];
  const k=Object.keys(ids).find(t=>t.trim().toLowerCase()===naam.trim().toLowerCase());
  return k!=null ? ids[k] : null;
}

// Tijdelijke Google-fouten (te druk, even weg): twee keer opnieuw, met oplopende wachttijd.
export function _isTransient(e){
  if(!e) return false;
  if(e.status===429 || (e.status>=500 && e.status<600)) return true;
  return /quota|rate.?limit|resource_exhausted|backend error|internal error|unavailable|try again/i.test(e.message||'');
}
export async function _withRetry(fn){
  for(let poging=0;;poging++){
    try{ return await fn(); }
    catch(e){
      if(poging<2 && _isTransient(e)){ await new Promise(r=>setTimeout(r,600*Math.pow(2,poging))); continue; }
      throw e;
    }
  }
}
export { _isNetwerkFout };
