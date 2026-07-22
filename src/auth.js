// ══════════════════════════════════════
//  OAUTH / login
// ══════════════════════════════════════
import { clientId, ALLOWED_EMAILS } from "./config.js";
import { state } from "./state.js";
import { loadAll } from "./data.js";

function doOAuth(forcePrompt){
  return new Promise(resolve=>{
    if(!clientId){resolve(null);return}
    // Bezig-teller: zolang deze aanvraag loopt mag sw-update niet automatisch herladen
    // (inlogstoring 22-07-2026: een herlading midden in de Google-inlog gooide het
    // nog-niet-opgeslagen token weg). `klaar` verlaagt de teller op ÉLK eindpad.
    // `klaar` is één-malig: GIS kan voor dezelfde aanvraag zowel callback als
    // error_callback aanroepen. Zou dat twee keer aftellen, dan leest de app 'geen
    // inlog bezig' terwijl een gelijktijdige tweede aanvraag nog open staat.
    state._authBezig++;
    let afgehandeld=false;
    const klaar=v=>{
      if(afgehandeld) return;
      afgehandeld=true;
      state._authBezig=Math.max(0,state._authBezig-1);
      resolve(v);
    };
    try{
      if(!state._gsiTokenClient){
        state._gsiTokenClient=google.accounts.oauth2.initTokenClient({
          client_id:clientId,
          scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
          callback:()=>{}, // wordt per aanvraag overschreven (zie hieronder)
          // GIS leest error_callback alleen bij init → vast doorgeefluik naar de
          // per-aanvraag gebonden handler. Zonder deze callback bleef een gesloten
          // inlogvenster eeuwig hangen ("Even geduld…" + bezig-teller nooit omlaag).
          error_callback:e=>{if(state._gsiErrorCb)state._gsiErrorCb(e)},
        });
      }
      // De callback (en dus de resolve van DEZE aanroep) bij elke aanvraag opnieuw binden.
      // Anders bleef een tweede doOAuth (bv. token-refresh na expiry) hangen: de client
      // riep de eerste, al-afgehandelde resolve aan i.p.v. die van de nieuwe Promise.
      state._gsiTokenClient.callback=resp=>{
        if(resp.error){console.warn('OAuth fout:',resp.error);state.oauthToken=null;state.oauthExpiry=0;klaar(null);return}
        state.oauthToken=resp.access_token;
        state.oauthExpiry=Date.now()+((resp.expires_in||3600)-120)*1000;
        sessionStorage.setItem('oauthToken',state.oauthToken);
        sessionStorage.setItem('oauthExpiry',String(state.oauthExpiry));
        klaar(state.oauthToken);
      };
      state._gsiErrorCb=err=>{
        console.warn('OAuth geannuleerd/mislukt:',(err&&err.type)||err);
        klaar(null);
      };
      state._gsiTokenClient.requestAccessToken(forcePrompt?{}:{prompt:''});
    }catch(e){console.error('OAuth:',e);klaar(null)}
  });
}

async function fetchUserEmail(){
  if(!state.oauthToken) return null;
  try{
    const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${state.oauthToken}`}});
    if(!r.ok) return null;
    const d=await r.json();
    return d.email||null;
  }catch(e){return null}
}

async function doLogin(){
  const errEl=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  errEl.style.display='none';
  btn.textContent='Even geduld…';btn.disabled=true;
  // Bezig-teller over de HÉLE inlog (ook e-mail ophalen + allowlist + sessie-opslag):
  // pas als alles in sessionStorage staat mag een uitgestelde herlading doorgaan.
  state._authBezig++;
  try{
    await doOAuth(true);
    if(!state.oauthToken){errEl.textContent='Inloggen geannuleerd of mislukt.';errEl.style.display='block';btn.textContent='Inloggen met Google';btn.disabled=false;return}
    const email=await fetchUserEmail();
    if(!email){errEl.textContent='Kon e-mailadres niet ophalen.';errEl.style.display='block';btn.textContent='Inloggen met Google';btn.disabled=false;return}
    if(!ALLOWED_EMAILS.includes(email.toLowerCase())){
      state.oauthToken=null;state.oauthExpiry=0;
      errEl.textContent='Geen toegang. Gebruik je VvE Beheer Collectief account.';errEl.style.display='block';btn.textContent='Inloggen met Google';btn.disabled=false;return;
    }
    state.currentUserEmail=email;
    sessionStorage.setItem('currentUserEmail',email);
    document.getElementById('login-gate').style.display='none';
    loadAll();
  }finally{state._authBezig=Math.max(0,state._authBezig-1)}
}

async function ensureToken(){
  if(state.oauthToken && Date.now()<state.oauthExpiry) return true;
  // Bezig-teller over de hele vernieuwing: een auto-herlading midden in een
  // token-refresh zou met een verlopen sessie herstarten → terug op het inlogscherm.
  state._authBezig++;
  try{
    state.oauthToken=null; state.oauthExpiry=0;
    await doOAuth(false);
    if(!state.oauthToken){
      await doOAuth(true);
      if(!state.oauthToken) return false;
    }
    if(state.currentUserEmail) return true;
    const email=await fetchUserEmail();
    if(!email){ state.oauthToken=null;state.oauthExpiry=0;return false; } // mogelijk tijdelijk → sessie laten staan, later opnieuw
    if(!ALLOWED_EMAILS.includes(email.toLowerCase())){ logout('Geen toegang met dit account. Log in met je VvE Beheer Collectief-account.'); return false; }
    state.currentUserEmail=email;
    sessionStorage.setItem('currentUserEmail',email);
    return true;
  }finally{state._authBezig=Math.max(0,state._authBezig-1)}
}

// Schone uitlog: stopt poll + heartbeat, wist de sessie en toont de login-gate weer.
// Aangeroepen wanneer een token wél geldig is maar het account niet (meer) is toegestaan;
// ook bruikbaar achter een uitlog-knop. Voorkomt dat timers eindeloos blijven draaien.
function logout(reden){
  state.oauthToken=null; state.oauthExpiry=0; state.currentUserEmail=null;
  try{ ['oauthToken','oauthExpiry','currentUserEmail'].forEach(k=>sessionStorage.removeItem(k)); }catch(_){}
  if(state._notifPollTimer){ clearInterval(state._notifPollTimer); state._notifPollTimer=null; }
  if(state._resyncTimer){ clearInterval(state._resyncTimer); state._resyncTimer=null; }
  if(state._heartbeatTimer){ clearInterval(state._heartbeatTimer); state._heartbeatTimer=null; }
  if(state._notifVisibilityHandler){ document.removeEventListener('visibilitychange', state._notifVisibilityHandler); state._notifVisibilityHandler=null; }
  try{ if(window.OneSignal && OneSignal.logout) OneSignal.logout(); }catch(_){}
  const gate=document.getElementById('login-gate'); if(gate) gate.style.display='';
  const btn=document.getElementById('login-btn'); if(btn){ btn.textContent='Inloggen met Google'; btn.disabled=false; }
  const errEl=document.getElementById('login-error');
  if(errEl && reden){ errEl.textContent=reden; errEl.style.display='block'; }
}

export { doOAuth, fetchUserEmail, doLogin, ensureToken, logout };
