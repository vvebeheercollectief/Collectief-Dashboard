// ══════════════════════════════════════
//  OAUTH / login
// ══════════════════════════════════════
import { clientId, ALLOWED_EMAILS } from "./config.js";
import { state, _shownToasts } from "./state.js";
import { loadAll, laadUitCache, wisCache } from "./data.js";
import { toonKaart } from "./login-splash.js";
import { refreshNotifUI, herstelNotifKoppeling } from "./notifications.js";
import { fetchMetKlok } from "./api.js";

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
      state.oauthToken=null;state.oauthExpiry=0;
      errEl.textContent='Geen toegang. Gebruik je VvE Beheer Collectief account.';errEl.style.display='block';btn.classList.remove('is-signing');btn.disabled=false;return;
    }
    state.currentUserEmail=email;
    sessionStorage.setItem('currentUserEmail',email);
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
async function ensureToken(magVragen=true){
  if(state.oauthToken && Date.now()<state.oauthExpiry) return true;
  // Bezig-teller over de hele vernieuwing: een auto-herlading midden in een
  // token-refresh zou met een verlopen sessie herstarten → terug op het inlogscherm.
  state._authBezig++;
  try{
    state.oauthToken=null; state.oauthExpiry=0;
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
  try{ _shownToasts.clear(); }catch(_){}
  // De 8s-poll, de token-heartbeat en de meldingen-visibilityhandler worden UITSLUITEND bij
  // DOMContentLoaded gestart (main.js). Stopten we ze hier, dan kwamen ze na een tweede inlog
  // in hetzelfde tabblad nooit meer terug: het dashboard laadde dan één keer en bevroor daarna
  // stil — geen verversing meer, geen tokenvernieuwing, geen meldingen.
  // Stoppen is ook niet nodig: alle drie hebben ze hun eigen sessiepoort en liggen na deze
  // logout vanzelf stil.
  //   · de 8s-poll      → magPollen() eist state.currentUserEmail, hierboven leeggemaakt
  //   · de heartbeat    → keert terug op !state.oauthToken
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
  try{ document.querySelectorAll('.modal-bg.open').forEach(bg=>bg.classList.remove('open')); }catch(_){}
  state.editMode=false; state.editRowData=null; state.editSec=null;
  state._completeRow=null; state._completeRid=null;
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

export { doOAuth, fetchUserEmail, doLogin, ensureToken, logout, _wisTokenSessie };
