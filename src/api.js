import { state, D } from "./state.js";
import { SID, SKEYS, PROXY_URL } from "./config.js";

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

export { fetchSheet, writeRange, appendRange, _shiftNtdRows, _isTransient, _withRetry, askChat };
