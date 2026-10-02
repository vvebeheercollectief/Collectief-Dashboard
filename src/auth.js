// ══════════════════════════════════════
//  OAUTH / login
// ══════════════════════════════════════
import { clientId, ALLOWED_EMAILS } from "./config.js";
import { state, _shownToasts } from "./state.js";
import { loadAll, laadUitCache, wisCache } from "./data.js";
import { startVersieBewaking } from "./versie.js";
import { toonKaart } from "./login-splash.js";
import { refreshNotifUI, herstelNotifKoppeling } from "./notifications.js";
import { fetchMetKlok } from "./api.js";
import { beantwoordBevestiging } from "./bevestig.js";

// Hoe lang een tokenaanvraag zonder antwoord de bezig-teller mag bezetten. Eindig — zie het
// vangnet in doOAuth. Tests kunnen dit verlagen via state._authTimeoutMs.
//
// Twee waarden, want het zijn twee heel verschillende dingen. Een STILLE verversing praat alleen
// met Google en is binnen een seconde klaar; 90 s is daar al royaal. Een inlog MÉT venster wacht op
// een mens: accountkeuze, toestemmingsscherm, en bij tweestapsverificatie ook nog even de telefoon
// erbij pakken. Dat haalt de 90 s regelmatig niet, en dan werd de inlog als 'geannuleerd of
// mislukt' gemeld terwijl het token even later gewoon binnenkwam — het staat dan al in de sessie,
// dus een tweede klik lukte meteen, maar de melding klopte niet en dat leest als een storing.
const AUTH_ANTWOORD_TIMEOUT = 90_000;          // stille verversing
const AUTH_ANTWOORD_TIMEOUT_VENSTER = 300_000; // inlog met venster: vijf minuten

// Hoogstens ÉÉN lopende aanvraag per prompt-stand. GIS kent per client maar één callback: bindt
// een tweede aanvraag hem opnieuw, dan landen béíde antwoorden bij de tweede en lost de eerste
// pas op via het vangnet hieronder — 90 seconden waarin de bezig-teller >0 blijft en sw-update
// niet herlaadt. Meeliften haalt die overschrijving bij de wortel weg; het vangnet blijft als
// tweede lijn staan. Op prompt-stand gescheiden: een stille verversing en een aanvraag mét
// inlogvenster zijn niet uitwisselbaar.
let _lopendeAanvraag=null, _lopendePrompt=null;

function doOAuth(forcePrompt){
  if(_lopendeAanvraag && _lopendePrompt===!!forcePrompt) return _lopendeAanvraag;
  const p=_doOAuth(forcePrompt);
  _lopendeAanvraag=p; _lopendePrompt=!!forcePrompt;
  p.finally(()=>{ if(_lopendeAanvraag===p){ _lopendeAanvraag=null; _lopendePrompt=null; } });
  return p;
}

function _doOAuth(forcePrompt){
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
    // VANGNET (storing 2026-08-06). GIS kent per client maar ÉÉN callback: de laatst
    // gebonden. Overlappen twee aanvragen — de 4-minuten-hartslag bovenop een
    // ensureToken van de poll — dan landen béíde antwoorden op de handler van de
    // TWEEDE, telt de eerste nooit af en blijft _authBezig eeuwig >0. sw-update ziet
    // dan permanent 'bezig' en herlaadt nooit meer: de balk "Er is een nieuwe versie"
    // bleef staan met een Herladen-knop die niets deed. Een antwoord dat helemaal
    // uitblijft mag de app dus nooit blijvend vastzetten.
    let tid=0;
    const klaar=v=>{
      if(afgehandeld) return;
      afgehandeld=true;
      clearTimeout(tid);
      state._authBezig=Math.max(0,state._authBezig-1);
      resolve(v);
    };
    tid=setTimeout(()=>{
      console.warn('OAuth: geen antwoord binnen de tijd — aanvraag losgelaten');
      klaar(null);
    }, state._authTimeoutMs || (forcePrompt ? AUTH_ANTWOORD_TIMEOUT_VENSTER : AUTH_ANTWOORD_TIMEOUT));
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
        // Alleen een STILLE vernieuwing van een al ingelogde sessie delen met de andere tabbladen.
        // Een aanvraag mét venster toont de accountkiezer: van wie dát token is weten we pas na
        // `fetchUserEmail` + de allowlist, en die wegen (doLogin, de knop 'Opnieuw inloggen')
        // delen zelf, ná die controle.
        if(!forcePrompt && state.currentUserEmail) deelToken();
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
    // Mét tijdslimiet. Dit was de enige netwerkaanroep van de app zonder klok, en hij staat in
    // twee try/finally-blokken die de app anders permanent bezet achterlaten: `doLogin` telt
    // `_authBezig` pas in zijn finally af (de Herladen-knop van de versiebalk leest die vlag) en
    // de knop 'Opnieuw inloggen' in data.js wist `_herinlogBezig` daar — en zolang die true is
    // slaat de 8s-poll élke ronde over. Bij een afbreking valt hij gewoon in de catch hieronder
    // en levert null: beide aanroepers hebben daar al een nette weg voor.
    const r=await fetchMetKlok('https://www.googleapis.com/oauth2/v3/userinfo',
                               {headers:{Authorization:`Bearer ${state.oauthToken}`}},
                               'Geen antwoord van Google binnen 20 seconden');
    if(!r.ok) return null;
    const d=await r.json();
    return d.email||null;
  }catch(e){return null}
}

// De twee token-sleutels uit sessionStorage. `state.oauthToken` op null zetten is maar de helft:
// bij het opstarten leest main.js de sessie uit sessionStorage terug, dus een achtergebleven token
// komt na één herlading gewoon weer boven — inclusief het geval waarvoor we hem juist weggooiden
// (een token van een ánder account, want doOAuth(true) toont de accountkiezer).
function _wisTokenSessie(){
  try{ sessionStorage.removeItem('oauthToken'); sessionStorage.removeItem('oauthExpiry'); }catch(_){}
}

async function doLogin(){
  const errEl=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  errEl.style.display='none';
  // Loading-state: toont de spinner + "Doorsturen naar Google…" (styles.css).
  // Blijft staan tot succes (gate verdwijnt) of annulering/fout (hieronder terug).
  btn.classList.add('is-signing');btn.disabled=true;
  // Bezig-teller over de HÉLE inlog (ook e-mail ophalen + allowlist + sessie-opslag):
  // pas als alles in sessionStorage staat mag een uitgestelde herlading doorgaan.
  state._authBezig++;
  try{
    await doOAuth(true);
    if(!state.oauthToken){errEl.textContent='Inloggen geannuleerd of mislukt.';errEl.style.display='block';btn.classList.remove('is-signing');btn.disabled=false;return}
    const email=await fetchUserEmail();
    // Token WEG als we niet kunnen vaststellen van wie hij is. `doOAuth(true)` toont de
    // accountkiezer, dus dit token kan van een heel ander (privé-)account zijn. Bleef hij staan,
    // dan had de sessie een geldig token zonder gecontroleerd adres — en dat is precies de stand
    // waarin `ensureToken` meteen `true` teruggeeft en het dashboard achter de inlogkaart alsnog
    // gaat lezen en schrijven. `ensureToken` ruimt hier al op; deze weg deed dat niet.
    if(!email){state.oauthToken=null;state.oauthExpiry=0;_wisTokenSessie();errEl.textContent='Kon e-mailadres niet ophalen.';errEl.style.display='block';btn.classList.remove('is-signing');btn.disabled=false;return}
    if(!ALLOWED_EMAILS.includes(email.toLowerCase())){
      // Ook uit sessionStorage: de callback in doOAuth heeft hem daar al neergezet, en een token van
      // een niet-toegestaan account hoort nergens achter te blijven — zie `_wisTokenSessie`.
      state.oauthToken=null;state.oauthExpiry=0;_wisTokenSessie();
      errEl.textContent='Geen toegang. Gebruik je VvE Beheer Collectief account.';errEl.style.display='block';btn.classList.remove('is-signing');btn.disabled=false;return;
    }
    state.currentUserEmail=email;
    sessionStorage.setItem('currentUserEmail',email);
    deelToken();   // een gepauzeerd tabblad van dezelfde gebruiker kan meteen verder
    document.getElementById('login-gate').style.display='none';
    // De schil weer bedienbaar. Zie `logout()` voor waarom `inert` er überhaupt op gaat.
    document.getElementById('app')?.removeAttribute('inert');
    // De OneSignal-koppeling terugzetten. `logout()` gooit de externe id én alle tags weg, en
    // niets zette ze daarna terug: op een gedeelde computer (of na een uitlog-inlog in hetzelfde
    // tabblad) kwam er daardoor geen enkele pushmelding meer aan, zonder dat het scherm iets
    // liet zien.
    // NADRUKKELIJK `herstelNotifKoppeling` en niet `saveNotifPrefs`: die laatste leest de
    // SCHAKELAARS van het instellingenvenster, en dat venster is bij het inloggen nog nooit
    // geopend — alle vijf staan dan uit in de HTML. Eén keer inloggen zou dan alle meldingen
    // uitzetten, in de app én bij OneSignal. Deze leest de opgeslagen stand.
    // Bewust NIET geawait: het is een netwerkactie naar OneSignal en mag het inloggen niet ophouden.
    // De .catch hoort erbij omdat het een async functie is — een try/catch eromheen vangt niets.
    herstelNotifKoppeling().catch(()=>{});
    laadUitCache();   // meteen de laatst bekende stand in beeld; loadAll vervangt hem
    loadAll();
    startVersieBewaking();   // minimumversie-rem: meteen, elke 5 min en bij terugkeer (versie.js)
  }finally{state._authBezig=Math.max(0,state._authBezig-1)}
}

// `magVragen=false` betekent: alléén de STILLE vernieuwing proberen, en bij mislukking gewoon
// `false` teruggeven. De 8s-poll gebruikt dat. Zonder die rem deed elke stille ronde na een
// verlopen sessie een `doOAuth(true)`, en dat opent het inlogvenster van Google — zonder klik, dus
// zonder gebruikersgebaar. De browser blokkeert zo'n venster meestal, maar niet altijd: vlak na
// een klik ergens anders komt hij er wél doorheen, en dan springt er elke acht seconden een
// Google-venster op waar niemand om gevraagd heeft. Dat botst bovendien met wat de sessie-banner
// (data.js, showLoadError) belooft: 'een KLIK is een gebruikersgebaar, en alleen dán mag het
// inlogvenster open'. De weg terug loopt via die banner, en die verschijnt vanzelf zodra de stille
// vernieuwing drie keer op rij mislukt.
//
// GEEN FOCUS → GEEN VERNIEUWING (v13.5, zie 'Geen inlogflits' hieronder). Ook de stille
// vernieuwing opent een Google-venster, dus zonder focus op dit dashboardvenster geeft
// ensureToken meteen `false` en zet hij `state._tokenGepauzeerd`. De 8s-ronde leest die vlag en
// toont dan 'gepauzeerd' i.p.v. een fout (en telt niet mee voor de sessiebanner). Schrijfacties
// starten altijd vanuit een klik en hebben dus focus; die merken hier niets van.
async function ensureToken(magVragen=true){
  if(state.oauthToken && Date.now()<state.oauthExpiry){ state._tokenGepauzeerd=false; return true; }
  if(!heeftFocus()){ state._tokenGepauzeerd=true; return false; }
  state._tokenGepauzeerd=false;
  // Bezig-teller over de hele vernieuwing: een auto-herlading midden in een
  // token-refresh zou met een verlopen sessie herstarten → terug op het inlogscherm.
  state._authBezig++;
  try{
    state.oauthToken=null; state.oauthExpiry=0;
    state._laatsteStilPoging=Date.now();   // de klik/focus-vernieuwing wacht dan even (POGING_REM_MS)
    await doOAuth(false);
    if(!state.oauthToken){
      if(!magVragen) return false;
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

// ══════════════════════════════════════
//  GEEN INLOGFLITS (v13.5)
// ══════════════════════════════════════
// KLACHT: elke 5-15 minuten flitste er een Google-inlogvenster voorbij, en dat trok de gebruiker
// uit het programma waarin hij werkte (TwinQ, mail).
// OORZAAK: in het GIS-tokenmodel opent ook een 'stille' vernieuwing (`requestAccessToken` met
// `prompt:''`) altijd een popupvenster dat meteen weer sluit — dat is de flits, en dat venster
// pakt de focus. Het token leeft een uur. De 4-minutenhartslag (main.js) en de 8s-ronde (via
// ensureToken) vernieuwden vanuit een TIMER, dus ook als het dashboard verborgen was of de
// gebruiker in een ander programma zat. En sessionStorage is per tabblad: elk open dashboard-
// tabblad of -venster vernieuwde voor zichzelf. Met een paar tabbladen op een paar computers
// geeft dat precies de flits om de 5-15 minuten.
// REGEL: een stille vernieuwing start ALLEEN als de gebruiker op dat moment in dít dashboard-
// venster zit (zichtbaar én focus). Dan zit hij er al, en dan is de flits geen kaping meer.
//   · klikt hij in het dashboard en is het token nog < 15 min geldig → op dat moment vernieuwen;
//   · komt hij terug in het venster (focus) met een verlopen of bijna verlopen token → idem,
//     en meteen een leesronde als het bijwerken stillag;
//   · verloopt het token terwijl hij elders werkt → de 8s-ronde pauzeert stil ('gepauzeerd' in
//     de statusbalk, telt NIET als fout) tot hij terugkomt;
//   · vernieuwt één tabblad, dan krijgen de andere tabbladen van dezelfde gebruiker het nieuwe
//     token via een BroadcastChannel en hoeven zelf niet.

// Heeft de gebruiker dít venster nu voor zich? Injecteerbaar voor de zelftest (`state._focusFn`):
// in een headless of voorbeeldvenster is `document.hasFocus()` altijd false.
function heeftFocus(){
  if(typeof state._focusFn==='function') return !!state._focusFn();
  try{ return document.visibilityState==='visible' && document.hasFocus(); }catch(_){ return false; }
}

const VERNIEUW_VOORAF_MS = 15*60*1000;   // bij een klik vernieuwen zodra er minder dan dit over is
const POGING_REM_MS      = 10_000;       // hoogstens één poging per 10 s (vijf klikken = één venster)

// Eén stille vernieuwing, alleen met focus. Geeft true als er daarna een vers token staat.
// `voorafMs`: hoe lang het huidige token nog minstens geldig moet zijn om NIET te vernieuwen.
async function vernieuwMetFocus(voorafMs=VERNIEUW_VOORAF_MS){
  const nu=Date.now();
  if(!state.currentUserEmail) return false;                              // inlogscherm: doLogin doet het werk
  if(state.oauthToken && state.oauthExpiry-nu > voorafMs) return false;  // nog ruim geldig
  if(!heeftFocus()) return false;
  // De knop 'Opnieuw inloggen' heeft een eigen aanvraag mét venster open; een tweede aanvraag
  // herbindt de GIS-callback en laat die van de knop los (storing v10.10/v10.11).
  if(state._herinlogBezig) return false;
  // De sessiebanner staat: stil vernieuwen is al drie keer mislukt, en elke poging is een flits.
  // De knop in de banner is dan de weg terug.
  if((state._authFails||0)>=3) return false;
  if(_lopendeAanvraag) return false;                                     // er loopt er al een
  if(nu-(state._laatsteStilPoging||0) < POGING_REM_MS) return false;
  state._laatsteStilPoging=nu;
  const oudT=state.oauthToken, oudE=state.oauthExpiry;
  state._authBezig++;
  try{
    // Geslaagd = doOAuth levert een token op (bij een gesloten/geblokkeerd venster levert hij
    // null en staat het oude token er nog — dat is géén vernieuwing).
    const vers=await doOAuth(false);
    if(vers && state.oauthToken===vers && Date.now()<state.oauthExpiry){ state._tokenGepauzeerd=false; return true; }
    // Mislukt. De callback zet het token bij een fout op null, maar het OUDE was nog geldig
    // (we vernieuwen vooraf): dat terugzetten, anders verliest de sessie een kwartier voor niets.
    if(oudT && Date.now()<oudE){
      state.oauthToken=oudT; state.oauthExpiry=oudE;
      try{ sessionStorage.setItem('oauthToken',oudT); sessionStorage.setItem('oauthExpiry',String(oudE)); }catch(_){}
    }
    return false;
  }finally{ state._authBezig=Math.max(0,state._authBezig-1); }
}

// Vernieuwen en, als het bijwerken stillag, meteen een leesronde. Dezelfde remmen als de 8s-ronde
// (main.js): een verversing mag geen open venster, bulk-selectie of lopende undo onder de
// gebruiker weghalen — dan pakt de volgende ronde het op.
async function _vernieuwEnHervat(){
  const lagStil = !!state._tokenGepauzeerd || !(state.oauthToken && Date.now()<state.oauthExpiry);
  const ok=await vernieuwMetFocus();
  if(ok && lagStil){
    if(document.querySelector('.modal-bg.open')) return ok;
    if(state.pendingWrites>0 || state.bulkMode || state._animBusy || state._undoInFlight || state._loadInFlight) return ok;
    loadAll(true);
  }
  return ok;
}

// Een klik in het dashboard (main.js hangt dit in de capture-fase aan `click`). Bewust `click` en
// niet `pointerdown`/`keydown`: het venster opent pas ná de klik, dus de klik zelf landt nog
// gewoon in het dashboard; en een toets in een tekstveld start nooit een venster dat dan de
// volgende letters opeet. Een knop met Enter/spatie geeft óók een click.
// Uitgesteld tot ná de eigen klikafhandeling van de app: start die knop zelf een aanvraag
// ('Opnieuw inloggen' zet `_herinlogBezig`, een schrijfactie loopt via ensureToken), dan ziet
// deze vernieuwing dat en blijft hij eraf. Een venster openen mag binnen ~5 s na een klik nog.
function opGebaar(){
  return new Promise(res=>setTimeout(()=>{ _vernieuwEnHervat().then(res,()=>res(false)); },0));
}

// Terug in het venster (window 'focus', of het tabblad wordt weer zichtbaar mét focus).
function opFocusTerug(){
  if(!heeftFocus()) return Promise.resolve(false);
  return _vernieuwEnHervat().catch(()=>false);
}

// ── Token delen tussen tabbladen ─────────────────────────────────────────────────────────────
// Eén BroadcastChannel per tabblad. Alleen in het geheugen en in sessionStorage, NOOIT in
// localStorage: het token hoort niet op schijf. Zonder BroadcastChannel werkt alles gewoon, maar
// vernieuwt elk tabblad voor zich.
const TOKEN_KANAAL='cd-token';
let _kanaal;   // undefined = nog niet geprobeerd, null = niet beschikbaar
function _tokenKanaal(){
  if(_kanaal!==undefined) return _kanaal;
  try{
    _kanaal = (typeof BroadcastChannel==='function') ? new BroadcastChannel(TOKEN_KANAAL) : null;
    if(_kanaal) _kanaal.onmessage = e => _opTokenBericht(e && e.data);
  }catch(_){ _kanaal=null; }
  return _kanaal;
}
function _post(bericht){ try{ _tokenKanaal()?.postMessage(bericht); }catch(_){} }
function _eigenToken(){
  const nu=Date.now();
  if(!state.currentUserEmail || !state.oauthToken || state.oauthExpiry-nu < 60_000) return null;
  return { soort:'token', token:state.oauthToken, expiry:state.oauthExpiry, email:state.currentUserEmail };
}

// Stuur het eigen (verse) token naar de andere tabbladen.
function deelToken(){ const t=_eigenToken(); if(t) _post(t); }

// Is dit een bruikbaar token van een ánder tabblad voor de gebruiker `email`? Pure regel.
function _bruikbaarToken(m, email, nu){
  return !!(m && m.soort==='token' && typeof m.token==='string' && m.token
    && typeof m.expiry==='number' && m.expiry-nu > 60_000
    && typeof m.email==='string' && ALLOWED_EMAILS.includes(m.email.toLowerCase())
    && (!email || m.email.toLowerCase()===String(email).toLowerCase()));
}

// Neem een gedeeld token over in `s` (de app-toestand). Alleen voor DEZELFDE gebruiker (een tabblad
// zonder ingelogde gebruiker neemt niets over: daar doet de inlogkaart het werk) en alleen als het
// nieuwer is dan wat er al staat. Geeft true als er iets is overgenomen.
function neemTokenOver(s, m, nu=Date.now()){
  if(!s || !s.currentUserEmail) return false;
  if(!_bruikbaarToken(m, s.currentUserEmail, nu)) return false;
  if(s.oauthToken && m.expiry <= (s.oauthExpiry||0)) return false;
  s.oauthToken=m.token; s.oauthExpiry=m.expiry; s._tokenGepauzeerd=false;
  return true;
}

function _opTokenBericht(m){
  if(!m || typeof m!=='object') return;
  if(m.soort==='vraag'){ const t=_eigenToken(); if(t) _post(t); return; }
  if(m.soort!=='token') return;
  if(neemTokenOver(state, m)){
    try{ sessionStorage.setItem('oauthToken',state.oauthToken); sessionStorage.setItem('oauthExpiry',String(state.oauthExpiry)); }catch(_){}
  }
}

// Bij het opstarten zonder geldig token: kort (300 ms) de andere tabbladen om een token vragen.
// Geeft {token, expiry, email} of null. `email` = het adres uit deze sessie (als dat er nog staat):
// dan alleen een token van dezelfde gebruiker. Een helemaal nieuw tabblad neemt het token én de
// gebruiker over van een ander tabblad in deze browser — mits het adres op de allowlist staat.
function vraagTokenBijAnderen(email, wachtMs=300){
  const k=_tokenKanaal();
  if(!k) return Promise.resolve(null);
  return new Promise(res=>{
    let klaar=false;
    const luister=e=>{
      if(klaar || !_bruikbaarToken(e && e.data, email, Date.now())) return;
      klaar=true; k.removeEventListener('message', luister); res(e.data);
    };
    k.addEventListener('message', luister);
    setTimeout(()=>{ if(!klaar){ klaar=true; k.removeEventListener('message', luister); res(null); } }, wachtMs);
    _post({ soort:'vraag' });
  });
}

// Het kanaal openen zodat dit tabblad vragen van andere tabbladen kan beantwoorden (main.js).
function startTokenDelen(){ _tokenKanaal(); }

// Schone uitlog: stopt poll + heartbeat, wist de sessie en toont de login-gate weer.
// Aangeroepen wanneer een token wél geldig is maar het account niet (meer) is toegestaan;
// ook bruikbaar achter een uitlog-knop. Voorkomt dat timers eindeloos blijven draaien.
function logout(reden){
  state.oauthToken=null; state.oauthExpiry=0; state.currentUserEmail=null;
  try{ ['oauthToken','oauthExpiry','currentUserEmail'].forEach(k=>sessionStorage.removeItem(k)); }catch(_){}
  wisCache();   // anders blijft de stand van de vorige gebruiker op een gedeelde computer staan
  // De schrijf-rem van de leescache weer AAN. `D` en de getekende tabellen blijven na een uitlog
  // staan (die worden pas bij de eerste verse ronde vervangen), en `doLogin` verbergt de gate
  // vóórdat die ronde binnen is. Zonder deze regel mocht er in dat venster geschreven worden op
  // rijnummers uit een cache van de vórige sessie — en `getInsertRow` zou een nieuwe taak dan in
  // het verkeerde sectieblok zetten. `loadAll` zet hem op false zodra er verse data staat.
  state._uitCache=true;
  // Meldingen-stand terug naar koude start. Zonder dit zou een volgende gebruiker op dezelfde
  // computer verder werken met de basislijn én de al-getoond-lijst van de vórige: meldingen van
  // vóór zijn sessie zouden alsnog als toast langskomen, of juist stil overgeslagen worden.
  state._lastNotifTs=null; state._meldStart=0; state._meldUit=false;
  // ÓÓK de twee 'wie ben ik'-velden in het instellingenvenster leegmaken. `getCurrentWho()` leest
  // die select EERST en pas daarna de per-account-sleutel in localStorage, en het venster is de
  // enige plek die hem ooit terugzet. Bleef de naam van de vorige gebruiker staan, dan schreef de
  // volgende op dezelfde computer zijn logregels, dossiernotities en kenmerk-wijzigingen onder
  // díé naam, en filterde het 'voor mij'-filter op de verkeerde persoon — precies waar de
  // per-account-sleutel (_whoSleutel) voor gebouwd is.
  try{
    const _who=document.getElementById('notif-who'); if(_who) _who.value='';
    const _whoAnders=document.getElementById('notif-who-other');
    if(_whoAnders){ _whoAnders.value=''; _whoAnders.style.display='none'; }
  }catch(_){}
  // Ook de tellers en vlaggen van de storingsmeldingen terug naar nul: een volgende gebruiker op
  // dezelfde computer hoort niet te beginnen met de sessiebanner of de structuurmelding van zijn
  // voorganger, en een blijven-hangen vlag zou de 8s-ronde of het opslaan blokkeren.
  state._authFails=0; state._renderFails=0; state._structErnstig=null;
  state._syncLblVoorBulk=null; state._submitBezig=false; state._herinlogBezig=false;
  state._tokenGepauzeerd=false; state._laatsteStilPoging=0;
  try{ _shownToasts.clear(); }catch(_){}
  // De 8s-poll, de token-heartbeat en de meldingen-visibilityhandler worden UITSLUITEND bij
  // DOMContentLoaded gestart (main.js). Stopten we ze hier, dan kwamen ze na een tweede inlog
  // in hetzelfde tabblad nooit meer terug: het dashboard laadde dan één keer en bevroor daarna
  // stil — geen verversing meer, geen tokenvernieuwing, geen meldingen.
  // Stoppen is ook niet nodig: alle drie hebben ze hun eigen sessiepoort en liggen na deze
  // logout vanzelf stil.
  //   · de 8s-poll      → magPollen() eist state.currentUserEmail, hierboven leeggemaakt
  //   · de heartbeat    → vernieuwMetFocus keert terug op !state.currentUserEmail
  //   · klik/focus-vernieuwing → idem
  //   · onNotifVisibility → keert terug op !state.oauthToken
  // OneSignal.logout() koppelt dit toestel los van de externe id én gooit de tags weg (in v16 komt
  // de subscriptie op een nieuwe anonieme gebruiker te staan). Het scherm moet dat eerlijk laten
  // zien: bleef `isSubscribed` op true staan, dan toonde het instellingenpaneel bij de volgende
  // gebruiker 'meldingen staan aan' terwijl er geen enkele tag meer aan zijn naam hing en er dus
  // niets meer aankwam. De terugweg loopt via `doLogin`, die na een geslaagde inlog de tags
  // opnieuw wegschrijft.
  try{ if(window.OneSignal && OneSignal.logout) OneSignal.logout(); }catch(_){}
  state.isSubscribed=false;
  try{ refreshNotifUI(); }catch(_){}
  // ÉÉRST alle open vensters sluiten. Ze staan buiten #app (rechtstreeks in <body>), dus `inert`
  // hieronder raakt ze niet: een bewerkscherm dat openstond op het moment van uitloggen blijft
  // achter de inlogkaart gewoon 'open', en dan trekt de Tab-val in modal-a11y.js de focus er
  // steeds weer in — het toetsenbord komt niet meer bij de inlogknop. `MODAL_SLUITERS` niet
  // gebruiken: dat zou een kringverwijzing naar main.js opleveren, en de vensters hoeven hier
  // alleen dícht. De bijbehorende toestand wordt hieronder toch al leeggemaakt.
  // Een openstaande ja/nee-vraag éérst BEANTWOORDEN (met 'nee') in plaats van alleen het venster
  // te sluiten. De kale class-verwijdering hieronder liet `_openVraag` in bevestig.js staan, en
  // die is tegelijk de dubbelklik-rem: elke volgende vraag — ook na een nieuwe inlog in ditzelfde
  // tabblad — kreeg dan meteen stil 'nee' terug, tot een herlaad (naloop 2026-08-28).
  try{ beantwoordBevestiging(false); }catch(_){}
  try{ document.querySelectorAll('.modal-bg.open').forEach(bg=>bg.classList.remove('open')); }catch(_){}
  // Het chatpaneel draagt geen `.modal-bg` (het is bewust NIET-modaal, zie dossier-chat.js) en
  // valt dus buiten de query hierboven. Het staat wél buiten #app, dus `inert` raakt het ook niet:
  // zonder deze regel bleef het gesprek van de vorige gebruiker open en bedienbaar achter de
  // inlogkaart staan — met de dossiergegevens van een VvE er nog in.
  try{ document.getElementById('chat-bg')?.classList.remove('open'); }catch(_){}
  state._chatHistorie=null; state._chatVve=null; state._chatBezig=false;
  state.editMode=false; state.editRowData=null; state.editFoto=null; state.editSec=null;
  state._completeRow=null; state._completeRid=null; state._completeNotitie=null;
  // Het inlogscherm is een `position:fixed`-overlay: hij dekt het dashboard alleen VISUEEL af.
  // Zonder `inert` bleven alle knoppen erachter met Tab bereikbaar én klikbaar via het
  // toetsenbord — dertig stuks, gemeten — en die knoppen doen echte dingen (verversen, een taak
  // afronden). `inert` haalt de hele schil uit de tabvolgorde én uit de toegankelijkheidsboom,
  // in één attribuut. De twee plekken die de gate verbergen halen hem er weer af.
  const app=document.getElementById('app'); if(app) app.setAttribute('inert','');
  const gate=document.getElementById('login-gate'); if(gate) gate.style.display='';
  toonKaart(); // meteen de login-kaart (geen splash-herhaling bij uitloggen)
  const btn=document.getElementById('login-btn'); if(btn){ btn.classList.remove('is-signing'); btn.disabled=false; }
  const errEl=document.getElementById('login-error');
  if(errEl && reden){ errEl.textContent=reden; errEl.style.display='block'; }
}

// De uitlogknop (zijbalk). Uitloggen is LOKAAL: `logout` gooit het token uit het geheugen en uit
// sessionStorage, wist de leescache en de schermstand en zet het inlogscherm terug. Het token NIET
// bij Google intrekken (`google.accounts.oauth2.revoke`): dat trekt de toestemming van de
// gebruiker voor deze client op ALLE apparaten in — de telefoon en een tweede tabblad kregen dan
// een 401 en moesten opnieuw toestemming geven (review 2026-10-02). Een achtergebleven token is
// hooguit een uur geldig en staat na deze uitlog nergens meer in deze browser.
// Stil opnieuw hetzelfde account inloggen kan daarna niet: de inlogknop roept `doOAuth(true)`,
// en die vraagt het token zonder `prompt:''` aan — GIS toont dan de accountkiezer. One Tap
// (`google.accounts.id`, met zijn auto-select) gebruikt deze app niet.
function uitloggen(){
  logout();
}

export { doOAuth, fetchUserEmail, doLogin, ensureToken, logout, uitloggen, _wisTokenSessie,
  heeftFocus, vernieuwMetFocus, opGebaar, opFocusTerug, deelToken, neemTokenOver, vraagTokenBijAnderen,
  startTokenDelen, VERNIEUW_VOORAF_MS, TOKEN_KANAAL };
