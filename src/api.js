import { state, D } from "./state.js";
import { SID, SKEYS, PROXY_URL, MEMO_PROXY_URL } from "./config.js";

async function fetchSheet(name){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(name)}`,{
    cache:'no-store',
    headers:{Authorization:`Bearer ${state.oauthToken}`}
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'API fout');err.status=r.status;throw err}
  return (await r.json()).values||[];
}
async function writeRange(range,values,method='PUT'){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const opts={method,headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:[values]})};
  const r=await fetch(url,opts);
  if(!r.ok){const e=await r.json();if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Schrijffout');err.status=r.status;throw err}
  return r.json();
}
async function appendRange(range,values){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:[values]})});
  if(!r.ok){const e=await r.json();if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}throw new Error(e.error?.message||'Schrijffout')}
  return r.json();
}

// Aantal lopende/wachtende achtergrond-schrijfacties. Zolang >0 slaat de 8s-poll
// over, zodat een optimistische wijziging niet kort teruggedraaid wordt.
// Seriële wachtrij: schrijfacties lopen één voor één, zodat rij-indexen in de Sheet
// niet door elkaar lopen bij snel opeenvolgende acties.

// Verschuift lokale _row-nummers mee bij invoegen/verwijderen van een Sheet-rij,
// zodat een volgende optimistische actie de juiste rij raakt. "Nog Te Doen" is één
// sheet met meerdere secties; alle rijen onder `fromRow` schuiven `delta` op.
function _shiftNtdRows(fromRow, delta){
  SKEYS.forEach(s=>{ (D.ntd[s]||[]).forEach(row=>{ if(row._row>fromRow) row._row+=delta; }); });
}

// Herkent tijdelijke API-fouten (rate-limit 429 / serverfout 5xx) die een herkansing
// rechtvaardigen — i.t.t. een echte fout (verkeerde data, geen rechten) die direct faalt.
function _isTransient(e){
  if(!e) return false;
  if(e.status===429 || (e.status>=500 && e.status<600)) return true;
  return /quota|rate.?limit|resource_exhausted|backend error|internal error|unavailable|try again/i.test(e.message||'');
}
// Voert een schrijfactie uit met max. 2 herkansingen (exponentiële backoff) bij transient fouten.
async function _withRetry(fn){
  for(let attempt=0;;attempt++){
    try{ return await fn(); }
    catch(e){
      if(attempt<2 && _isTransient(e)){ await new Promise(r=>setTimeout(r,600*Math.pow(2,attempt))); continue; }
      throw e;
    }
  }
}

// Stuurt de systeem-instructie + gespreksgeschiedenis naar de Vercel-proxy, die
// server-side Claude aanroept. Geeft de antwoordtekst terug. Vereist een ingelogde
// gebruiker (OAuth-token gaat mee voor de allowlist-check in de proxy).
async function askChat(system, messages){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r = await fetch(PROXY_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${state.oauthToken}` },
    body: JSON.stringify({ system, messages }),
  });
  const data = await r.json().catch(()=>({}));
  if(!r.ok){ const e=new Error(data.error||'AI-fout'); e.status=r.status; throw e; }
  return (data.antwoord || '').trim();
}

// ── Spraakmemo-loket ───────────────────────────────────────────────────
// POST naar het token-beveiligde Apps Script web-app-endpoint. Het OAuth-token
// gaat mee in de body (Apps Script geeft request-headers niet door). _withRetry
// vangt transient fouten (429/5xx/netwerk-blip) net als de Sheets-schrijfacties.
// Acties + payload (zie contract §Loket-API):
//   'uploadmemo'      {list,code,sectie,itemId,snapshot,durationSec,mime,audioB64} -> {ok,memoId,fileId,timestamp}
//   'getmemo'         {memoId}            -> {ok,mime,audioB64}
//   'deletememo'      {memoId}            -> {ok}
//   'deleteitemmemos' {list,itemId}       -> {ok,removed}
async function callMemoLoket(action, payload){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  return _withRetry(async ()=>{
    // Via de same-origin Vercel-proxy /api/memo (zie config.MEMO_PROXY_URL). Een DIRECTE
    // browser→Apps Script POST faalt op CORS (preflight bij JSON; Safari blokkeert de
    // redirect van het antwoord). De proxy stuurt server-side door en geeft JSON terug.
    let r;
    try{
      r=await fetch(MEMO_PROXY_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(Object.assign({action,token:state.oauthToken},payload||{})),
      });
    }catch(netErr){
      throw new Error('Geen verbinding met de memo-server ('+(netErr.message||'netwerkfout')+')');
    }
    const data=await r.json().catch(()=>({}));
    if(!r.ok || data.error){
      const err=new Error(data.error||('Memo-loket fout '+r.status+' ('+action+')'));
      err.status=r.status;
      throw err;
    }
    return data;
  });
}

// ── Bescherming tegen schrijven naar de verkeerde rij ──────────────────────
// Pure (testbaar): gegeven de teruggelezen kolom-A-waarden (vanaf minRow) en de
// verwachte {row,code}-checks → geef de eerste mismatch terug, of null als alles klopt.
function _rowMismatch(vals, minRow, checks){
  for(const c of checks){
    const got=(((vals[c.row-minRow]||[])[0])||'').toString().trim();
    if(got!==(c.code||'').toString().trim()) return { row:c.row, expected:(c.code||'').toString().trim(), got };
  }
  return null;
}
// Bouwt de A1-range voor kolom A; escapet apostrofs in de tabblad-naam
// (bv. "ALV's overzicht" → 'ALV''s overzicht'!A..). Testbaar gehouden.
function _a1ColA(sheetName, minR, maxR){
  return `'${(sheetName||'').replace(/'/g,"''")}'!A${minR}:A${maxR}`;
}
// Leest kolom A van de doelrij(en) terug en gooit een ROW_MISMATCH-fout als een
// rij niet meer de verwachte sleutel (VvE-code/ID/titel) bevat (de Sheet verschoof
// sinds de render). Eén GET dekt het hele rijbereik. backgroundWrite vangt de fout.
async function assertRowsMatch(checks, sheetName='Nog Te Doen'){
  checks=(checks||[]).filter(c=>c&&c.row);
  if(!checks.length) return;
  const rows=checks.map(c=>c.row), minR=Math.min(...rows), maxR=Math.max(...rows);
  const vals=await fetchSheet(_a1ColA(sheetName, minR, maxR));
  const mm=_rowMismatch(vals, minR, checks);
  if(mm){ const err=new Error('De lijst was net gewijzigd — opnieuw geladen.'); err.rowMismatch=true; err.detail=mm; throw err; }
}
const assertRowMatch=(row, code, sheetName)=>assertRowsMatch([{ row, code }], sheetName);

export { fetchSheet, writeRange, appendRange, _shiftNtdRows, _isTransient, _withRetry, askChat, callMemoLoket, _rowMismatch, _a1ColA, assertRowsMatch, assertRowMatch };
