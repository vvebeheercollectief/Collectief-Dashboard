// ══════════════════════════════════════
//  DATA — laden, verversen, opslaan in volgorde, leescache
// ══════════════════════════════════════
import { state, D } from './state.js';
import { TAB, APP_VERSION, POLL_MS, emailToegestaan } from './config.js';
import { fetchSheets, _withRetry, isOffline, _a1 } from './api.js';
import { ensureToken, doOAuth, fetchUserEmail, logout, _wisTokenSessie, vernieuwMetFocus, installeerVernieuwTriggers } from './auth.js';
import { parseDossiers, parseAlvo, parseAlfa, parseTaken } from './parse.js';
import { zetStatus, toonBanner, verbergBanner, toast, meldFout } from './ui.js';
import { toonVersieBalk } from './versie.js';
import { leesbareFout, datumSleutel } from './util.js';

// ── Hertekenen ──────────────────────────────────────────────────────────
// Elk scherm meldt hier zijn tekenfunctie aan; na verse gegevens (of een terugdraai) lopen ze allemaal.
const _tekenaars=[];
export const bijNieuweData = fn => _tekenaars.push(fn);
export function tekenAlles(){
  for(const fn of _tekenaars){ try{ fn(); }catch(e){ console.error('[tekenen]', e); } }
}

// ── Wat we lezen ────────────────────────────────────────────────────────
export const BEREIK = {
  ntd:   _a1(TAB.NTD, 'A:S'),
  alvo:  _a1(TAB.ALVO, 'A:G'),
  alfa:  _a1(TAB.ALFA, 'A:C'),
  taken: _a1(TAB.TAKEN, 'A:H'),
};
// 'Mijn taken' kan nog ontbreken (het dashboard maakt het tabblad pas bij de eerste taak aan).
// Een batchGet met een onbekend tabblad faalt in zijn geheel (400); dan lezen we de rest zonder,
// en proberen we het tabblad na een minuut opnieuw — misschien heeft een collega het intussen gemaakt.
const TAKEN_HERKANS_MS = 60_000;
function bereikenNu(){
  const lijst=[BEREIK.ntd, BEREIK.alvo, BEREIK.alfa];
  if(!state.takenTabOntbreekt || Date.now()-(state._takenGemistMs||0) > TAKEN_HERKANS_MS) lijst.push(BEREIK.taken);
  return lijst;
}

// ── Laden ───────────────────────────────────────────────────────────────
// Eén ronde tegelijk. Wie vraagt terwijl er een loopt, krijgt de afloop van een extra ronde daarna.
export async function loadAll(silent){
  if(state._loadInFlight){ state._loadAgain=true; return state._loadWacht; }
  state._loadInFlight=true;
  let klaar; state._loadWacht=new Promise(r=>{ klaar=r; });
  let ok=false;
  try{ ok=await _ronde(silent); }
  finally{
    state._loadInFlight=false;
    if(state._loadAgain){ state._loadAgain=false; ok=await loadAll(true); }
    klaar(ok);
  }
  return ok;
}

async function _ronde(silent){
  if(silent && state._herinlogBezig) return false;
  if(silent && (state._authFails||0)>=3 && !(state.oauthToken && Date.now()<state.oauthExpiry)) return false;
  const genBijStart=state._schrijfGen;
  try{
    if(!await ensureToken(!silent)){
      if(state._tokenGepauzeerd){ zetStatus('pauze'); return false; }
      state._syncFails++;
      if(isOffline()){ zetStatus('offline'); toonOffline(); return false; }
      zetStatus('fout');
      if(state.currentUserEmail){
        state._authFails=(state._authFails||0)+1;
        if(state._authFails>=3) toonSessieVerlopen();
      }
      return false;
    }
    state._authFails=0;
    if(!silent) zetStatus('laden');

    const bereiken=bereikenNu();
    let R;
    try{ R=await _withRetry(()=>fetchSheets(bereiken)); }
    catch(e){
      if(e.status===400 && bereiken.includes(BEREIK.taken)){
        R=await _withRetry(()=>fetchSheets(bereiken.filter(b=>b!==BEREIK.taken)));
        state.takenTabOntbreekt=true; state._takenGemistMs=Date.now();
      } else throw e;
    }
    if(R[BEREIK.taken]!==undefined) state.takenTabOntbreekt=false;
    state._syncFails=0; state._na401=false;

    // Liep er intussen een schrijfactie, dan kan deze lezing ouder zijn dan wat er al in beeld
    // staat (de optimistische wijziging). Niet overnemen; de schrijfactie start zelf een nieuwe ronde.
    if(state.pendingWrites>0 || state._schrijfGen!==genBijStart){ state._loadAgain = state.pendingWrites===0; return false; }

    D.dossiers=parseDossiers(R[BEREIK.ntd]);
    D.alvo=parseAlvo(R[BEREIK.alvo]);
    D.alfa=parseAlfa(R[BEREIK.alfa]).sort((a,b)=>datumSleutel(b.datum)-datumSleutel(a.datum));
    if(R[BEREIK.taken]!==undefined) D.taken=parseTaken(R[BEREIK.taken]);
    else if(state.takenTabOntbreekt) D.taken=[];

    state._uitCache=false;
    zetStatus('ok');
    verbergBanner();
    const hash=JSON.stringify(D);
    if(hash!==state._lastHash){
      state._lastHash=hash;
      tekenAlles();
      bewaarCache(hash);
    }
    return true;
  }catch(e){
    state._syncFails++;
    console.error('[laden]', e);
    if(e && e.status===401 && !state._na401){ state._na401=true; state._loadAgain=true; return false; }
    if(isOffline()){ zetStatus('offline'); toonOffline(); return false; }
    zetStatus('fout');
    if(!silent || state._syncFails>=3) toonBanner('Kon de gegevens niet laden. Controleer je verbinding.', 'Opnieuw proberen', ()=>loadAll());
    return false;
  }
}

const toonOffline = () => toonBanner('Geen verbinding. Kijken kan, wijzigen lukt nu niet.', 'Opnieuw proberen', ()=>loadAll());

// De Google-sessie is drie keer niet stil te vernieuwen geweest: één knop om opnieuw in te loggen,
// mét accountkiezer. Een ander account dan waarmee je begon, wordt uitgelogd.
function toonSessieVerlopen(){
  toonBanner('Je Google-sessie is verlopen. Je ziet oudere gegevens.', 'Opnieuw inloggen', async ()=>{
    state._authFails=0; state._herinlogBezig=true;
    let email=null;
    try{
      await doOAuth(true);
      if(state.oauthToken) email=await fetchUserEmail();
    }finally{ state._herinlogBezig=false; }
    if(!email){ state.oauthToken=null; state.oauthExpiry=0; _wisTokenSessie(); state._authFails=3; toonSessieVerlopen(); return; }
    if(!emailToegestaan(email) || (state.currentUserEmail && email.toLowerCase()!==state.currentUserEmail.toLowerCase())){
      logout('Je logde in met een ander account. Log in met je VvE Beheer Collectief-account.');
      return;
    }
    state.currentUserEmail=email;
    sessionStorage.setItem('currentUserEmail', email);
    loadAll();
  });
}

// ── Mag er nu geschreven worden? ────────────────────────────────────────
// Vóór elke wijziging, nog vóór iets in beeld verandert.
export function magSchrijven(){
  if(isOffline()){
    zetStatus('offline'); toonOffline();
    toast('Geen verbinding','Wijzigen lukt niet zonder internet. Er is niets gewijzigd.','fout',{geenDedup:true});
    return false;
  }
  if(state._versieTeOud){
    try{ toonVersieBalk(); }catch(_){}
    toast('Niet opgeslagen','Herlaad eerst het dashboard (er is een nieuwe versie).','fout');
    return false;
  }
  if(state._uitCache){
    toast('Even wachten','De gegevens worden nog vernieuwd. Probeer het over een seconde opnieuw.','info',{geenDedup:true});
    return false;
  }
  return true;
}

// ── Opslaan ─────────────────────────────────────────────────────────────
// Schrijfacties lopen één voor één (een rij invoegen verschuift de rijnummers van de volgende).
// `terugdraaien` zet de optimistische wijziging in beeld terug als het opslaan mislukt.
// Geeft true/false terug: gelukt of niet.
export function schrijf(foutTitel, schrijfFn, terugdraaien){
  state.pendingWrites++;
  state._schrijfGen++;
  zetStatus('opslaan');
  const beurt=state._writeChain.then(async()=>{
    try{
      if(isOffline()) throw Object.assign(new Error('Geen verbinding'), { melding:'Geen verbinding. De wijziging is teruggezet.' });
      if(!await ensureToken()) throw Object.assign(new Error('Niet ingelogd'), { melding:'Je Google-sessie is verlopen. De wijziging is teruggezet; probeer het opnieuw.' });
      return (await _withRetry(schrijfFn)) ?? true;
    }catch(e){
      console.error(foutTitel, e);
      try{ if(terugdraaien) terugdraaien(); }catch(_){}
      tekenAlles();
      meldFout(leesbareFout(e), foutTitel);
      return false;
    }finally{
      state.pendingWrites--;
      if(state.pendingWrites===0){ zetStatus('ok'); loadAll(true); }
    }
  });
  state._writeChain=beurt.then(()=>{}, ()=>{});
  return beurt;
}

// Een conflict: de rij die we wilden wijzigen staat er niet meer zoals wij hem kenden.
export const conflict = (melding='Een collega heeft dit net gewijzigd. Je scherm is bijgewerkt; probeer het opnieuw.') =>
  Object.assign(new Error('Rij gewijzigd'), { melding, conflict:true });

// ── Leescache (sessionStorage, alleen dit tabblad) ──────────────────────
// Na een herlaadbeurt staat meteen de laatst bekende stand in beeld; de eerste verse ronde vervangt
// hem. Tot dan mag er niet geschreven worden (`_uitCache`, zie magSchrijven).
const CACHE_PREFIX='cd16_cache_';
const _cacheSleutel = email => `${CACHE_PREFIX}${APP_VERSION}_${(email||'onbekend').toLowerCase()}`;
const CACHE_MAX_MS = 14*864e5;
function bewaarCache(json){
  if(location.search.includes('test=1')) return;
  try{ sessionStorage.setItem(_cacheSleutel(state.currentUserEmail), '{"t":'+Date.now()+',"d":'+json+'}'); }catch(_){}
}
export function laadUitCache(){
  try{
    const ruw=sessionStorage.getItem(_cacheSleutel(state.currentUserEmail));
    if(!ruw) return false;
    const o=JSON.parse(ruw);
    if(!o || Date.now()-o.t > CACHE_MAX_MS || !o.d) return false;
    Object.assign(D, o.d);
    state._uitCache=true;
    tekenAlles();
    return true;
  }catch(_){ return false; }
}
export function wisCache(){
  for(const opslag of [sessionStorage, localStorage]){
    try{
      for(let i=opslag.length-1;i>=0;i--){
        const k=opslag.key(i);
        if(k && (k.startsWith(CACHE_PREFIX) || k.startsWith('cd_cache_'))) opslag.removeItem(k);
      }
    }catch(_){}
  }
}

// ── Verversen ───────────────────────────────────────────────────────────
// Elke POLL_MS zolang het venster in beeld is en er de laatste vijf minuten iets gebeurde; daarna
// elke halve minuut. Nooit tijdens een schrijfactie of terwijl er een venster open staat.
const RUST_NA_MS=5*60_000, RUST_MS=30_000;
export function startVerversen(){
  state._laatsteInvoer=Date.now();
  const tik=(geforceerd)=>{
    if(document.hidden || !state.currentUserEmail) return;
    if(state._loadInFlight || state.pendingWrites>0 || state._herinlogBezig) return;
    if(document.querySelector('.modal-bg.open')) return;
    const nu=Date.now();
    const rustig=(nu-state._laatsteInvoer)>RUST_NA_MS || !document.hasFocus();
    if(!geforceerd && rustig && nu-(state._laatstePollMs||0)<RUST_MS) return;
    state._laatstePollMs=nu;
    loadAll(true);
  };
  setInterval(()=>tik(false), POLL_MS);
  const invoer=()=>{
    const was=Date.now()-state._laatsteInvoer>RUST_NA_MS;
    state._laatsteInvoer=Date.now();
    if(was) tik(true);
  };
  ['pointerdown','keydown','wheel','touchstart'].forEach(t=>document.addEventListener(t, invoer, { capture:true, passive:true }));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) tik(true); });
  // De Google-token stil vernieuwen voordat hij verloopt (alleen met focus; zie auth.js).
  setInterval(()=>vernieuwMetFocus(5*60*1000), 4*60*1000);
  installeerVernieuwTriggers(document, window);
}
