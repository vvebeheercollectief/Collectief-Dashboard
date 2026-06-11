// ══════════════════════════════════════
//  OAUTH / login
// ══════════════════════════════════════
import { clientId, ALLOWED_EMAILS } from "./config.js";
import { state } from "./state.js";
import { loadAll } from "./data.js";

function doOAuth(forcePrompt){
  return new Promise(resolve=>{
    if(!clientId){resolve(null);return}
    try{
      if(!state._gsiTokenClient){
        state._gsiTokenClient=google.accounts.oauth2.initTokenClient({
          client_id:clientId,
          scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
          callback:resp=>{
            if(resp.error){console.warn('OAuth fout:',resp.error);state.oauthToken=null;state.oauthExpiry=0;resolve(null);return}
            state.oauthToken=resp.access_token;
            state.oauthExpiry=Date.now()+((resp.expires_in||3600)-120)*1000;
            sessionStorage.setItem('oauthToken',state.oauthToken);
            sessionStorage.setItem('oauthExpiry',String(state.oauthExpiry));
            resolve(state.oauthToken);
          }
        });
      }
      state._gsiTokenClient.requestAccessToken(forcePrompt?{}:{prompt:''});
    }catch(e){console.error('OAuth:',e);resolve(null)}
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
}

async function ensureToken(){
  if(state.oauthToken && Date.now()<state.oauthExpiry) return true;
  state.oauthToken=null; state.oauthExpiry=0;
  await doOAuth(false);
  if(!state.oauthToken){
    await doOAuth(true);
    if(!state.oauthToken) return false;
  }
  if(state.currentUserEmail) return true;
  const email=await fetchUserEmail();
  if(!email||!ALLOWED_EMAILS.includes(email.toLowerCase())){state.oauthToken=null;state.oauthExpiry=0;return false}
  state.currentUserEmail=email;
  sessionStorage.setItem('currentUserEmail',email);
  return true;
}

export { doOAuth, fetchUserEmail, doLogin, ensureToken };
