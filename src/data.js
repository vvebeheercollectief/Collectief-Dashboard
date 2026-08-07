// ══════════════════════════════════════
//  DATA — laden, parsen, achtergrond-schrijven, sync-indicator
// ══════════════════════════════════════
import { parseDt, _parseAnyDate, coerceDagenVooraf, leegBijErfenis } from "./util.js";
import { state, D } from "./state.js";
import { SKEYS, SECS, APP_VERSION } from "./config.js";
import { fetchSheet, fetchSheets, _withRetry, isOffline } from "./api.js";
import { ensureToken } from "./auth.js";
import { buildAnalytics, buildDash } from "./render-analytics.js";
import { renderNtdDonut } from "./render-lijsten.js";
import { parseOntw, parseLogboek, _nogNietBevestigd } from "./render-overig.js";
import { parseKenmerken } from "./kenmerken.js";
import { checkSecties, checkNummers } from "./structuurcheck.js";
import { ico } from "./icons.js";
// (kringverwijzing data ⇄ kenmerken: aanroepen gebeuren op runtime — live bindings, veilig)
import { showToast, verwerkMeldingRijen, toonMeldingen, getCurrentWho, getNotifPrefs } from "./notifications.js";
// (kringverwijzing data ⇄ main: renderAll wordt pas op runtime aangeroepen — live binding, veilig.
//  Bewust niet ontvlochten: een aparte render-orchestrator zou puur cosmetisch zijn, geen bug.)
import { renderAll } from "./main.js";

//  API
// ══════════════════════════════════════

// Voert een Sheets-schrijfactie op de achtergrond uit (serieel). De UI is al
// optimistisch bijgewerkt door de aanroeper. Bij fout draait `rollback` de lokale
// wijziging terug en verschijnt een foutmelding.
function backgroundWrite(writeFn, rollback, foutTitel){
  state.pendingWrites++;
  setSaving();
  state._writeChain=state._writeChain.then(async()=>{
    state._writeStart=Date.now();   // pas hier begint deze write écht (de wachtrij is serieel)
    try{
      // Laatste lijn. De aanroeper hoort al geblokkeerd te hebben (zie blokkeerOffline): het
      // contract van backgroundWrite is dat de UI al optimistisch gemuteerd is, dus hier komen
      // we te laat om dat te voorkomen. Maar een gemiste schrijfweg mag niet stil doorlopen —
      // dit levert gratis de bestaande rollback en foutmelding op.
      if(isOffline()) throw Object.assign(new Error('Geen verbinding'), {offline:true});
      await _withRetry(writeFn);
    }catch(e){
      try{ rollback(); renderAll(); }catch(_){}
      const msg=(e.message||'').toLowerCase();
      if(e&&e.offline){
        showToast(foutTitel,'Geen verbinding — de wijziging is teruggezet. Probeer het opnieuw zodra je weer online bent.','var(--rd)');
      }else if(e&&e.rowMismatch){
        // De doelrij was verschoven (Sheet tussentijds gewijzigd) → niet geschreven, teruggedraaid.
        showToast(foutTitel, e.melding || 'De lijst was net gewijzigd — opnieuw geladen, probeer nog eens.','var(--rd)');
      }else if(msg.includes('authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
        state.oauthToken=null;state.oauthExpiry=0;
        showToast(foutTitel,'Sessie verlopen — wijziging teruggezet. Probeer opnieuw.','var(--rd)');
      }else{
        showToast(foutTitel,'Niet opgeslagen — wijziging teruggezet.','var(--rd)');
      }
      console.error(foutTitel,e);
    }finally{
      state._writeStart=null;
      state.pendingWrites--;
      if(state.pendingWrites===0){ loadAll(true); } // stille resync van rij-indexen; zet ook de balk weer op Live
    }
  });
  return state._writeChain;
}

// Loopt er een schrijfactie die het sluiten van het tabblad zou moeten tegenhouden?
// Puur (nu meegegeven i.p.v. Date.now()) zodat de regel los testbaar is.
// De bovengrens vangt een vastgelopen write af: anders zou het tabblad nooit meer zonder
// waarschuwing te sluiten zijn. Hij telt vanaf het ECHTE begin van de write — een write die
// nog in de seriële wachtrij staat heeft _writeStart null en waarschuwt dus altijd.
const WRITE_VAST_MS = 30000;
function schrijfActieLoopt(nu){
  if(state.pendingWrites<=0) return false;
  if(state._writeStart && (nu - state._writeStart) > WRITE_VAST_MS) return false;
  return true;
}

// Markeert een schrijfweg die NIET via backgroundWrite loopt als 'lopend'. Zonder dit zijn
// de gevaarlijkste paden (undo's, ALV-reset, Ontwikkeling) onzichtbaar voor de statusbalk,
// de sluit-waarschuwing én de poll-rem — en is een 'eerlijke' status alleen een
// geloofwaardiger onwaarheid.
// Fouten gaan ONGEMOEID door naar de aanroeper: die paden hebben hun eigen foutafhandeling.
//
// BELANGRIJK voor de aanroepers: omhul alléén het echt-schrijvende deel, nooit een `loadAll`
// of een `await state._writeChain`. loadAll gooit zijn verse data namelijk weg zolang
// pendingWrites>0 ("de optimistische stand is leidend"), dus een loadAll bínnen dit omhulsel
// laadt niets — wat bijvoorbeeld bulkUndoAfronden op een stale D.af zou laten werken en de
// afgeronde rijen in bèide lijsten zou achterlaten.
async function metWriteMarkering(fn){
  state.pendingWrites++;
  setSaving();
  const eerder=state._writeStart;
  state._writeStart=Date.now();
  try{ return await fn(); }
  finally{
    state._writeStart=eerder;
    state.pendingWrites--;
    if(state.pendingWrites===0) setSynced();
  }
}

// ── Leescache ──────────────────────────────────────────────────────────────
// Comfort bij het openen: meteen de laatst bekende stand in beeld in plaats van een leeg scherm.
// Uitdrukkelijk GEEN offline-vermogen — bij een koude start is inloggen netwerkafhankelijk.
//
// De sleutel hangt aan APP_VERSION én aan het e-mailadres. localStorage is origin-gebonden en
// niet gebruiker-gebonden, dus zonder dat adres ziet collega B bij het openen eerst de stand van
// collega A. De versie erin zodat een gewijzigd dataformaat nooit een oude cache leest.
const CACHE_PREFIX='cd_cache_';
const _cacheSleutel = email => `${CACHE_PREFIX}${APP_VERSION}_${(email||'onbekend').toLowerCase()}`;

// Alles wat níet de sleutel van nu is, weg. Zonder dit blijft er per uitgebrachte versie ~1 MB
// achter in een ruimte van ~5 MB — na een paar releases loopt localStorage vol en faalt élke
// setItem, óók die van de voorkeuren (thema, dichtheid).
function _ruimOudeCache(huidig){
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const k=localStorage.key(i);
      if(k && k.startsWith(CACHE_PREFIX) && k!==huidig) localStorage.removeItem(k);
    }
  }catch(_){}
}

// hashJson is de string die loadAll al voor de wijzigings-vergelijking heeft gebouwd; die
// hergebruiken we in plaats van een tweede keer een halve megabyte te serialiseren.
// ntdSecInfo en afSecInfo zitten NIET in die hash maar moeten wél mee: zonder die twee valt
// getInsertRow terug en belandt een nieuwe taak bovenaan 'Nog Te Doen' in plaats van in zijn
// sectie. De logboeklijst gaat er ongewijzigd in — niet hersorteren, niet ontdubbelen: _row is
// bewust de ruwe Sheet-index en daar hangt bewerken/verwijderen van logregels aan.
// In de testomgeving niets bewaren: de suite draait loadAll met verzonnen data, en die zou dan
// bij de volgende echte start één ronde lang in beeld staan. De vlag is omzetbaar zodat de
// cache-test zélf de echte schrijfweg kan beproeven.
let _cacheGeblokkeerd = location.search.includes('test=1');
const _zetCacheBlokkade = aan => { _cacheGeblokkeerd = !!aan; };

function bewaarCache(hashJson){
  if(_cacheGeblokkeerd) return;
  const sleutel=_cacheSleutel(state.currentUserEmail);
  try{
    _ruimOudeCache(sleutel);
    localStorage.setItem(sleutel, '{"d":'+hashJson+',"s":'+JSON.stringify([D.ntdSecInfo,D.afSecInfo])+'}');
  }catch(e){
    // Vol of geweigerd (privémodus): stil opgeven en de eigen sleutel weghalen. Een cache is
    // comfort; hij mag nooit een laadronde of een voorkeur-setItem in de weg zitten.
    try{ localStorage.removeItem(sleutel); }catch(_){}
  }
}

// Zet de laatst bewaarde stand in D en meld of dat gelukt is. Bewust ná de inlog aangeroepen:
// vóór het e-mailadres bekend is, is er geen sleutel om te lezen.
function laadUitCache(){
  try{
    const ruw=localStorage.getItem(_cacheSleutel(state.currentUserEmail));
    if(!ruw) return false;
    const o=JSON.parse(ruw);
    const [ntd,af,alvo,alfa,ontw,logboek,herhaal,kenmerken]=o.d||[];
    if(!ntd||!af) return false;
    D.ntd=ntd; D.af=af; D.alvo=alvo||[]; D.alfa=alfa||[]; D.ontw=ontw||[];
    // Optimistische regels (_row 0) horen NIET uit een cache terug te komen: dat zijn eigen
    // wijzigingen waarvan nooit bevestigd is dat ze in de Sheet staan. Uit een vorige sessie
    // zouden ze een blijvende onwaarheid in de tijdlijn zijn.
    D.logboek=(logboek||[]).filter(r=>r&&r._row>0); D.herhaal=herhaal||[]; D.kenmerken=kenmerken||[];
    D.ntdSecInfo=(o.s||[])[0]||{}; D.afSecInfo=(o.s||[])[1]||{};
    // Deze stand kan uren oud zijn en de rijnummers erin dus verschoven. Schrijven blijft
    // geblokkeerd tot de eerste verse ronde binnen is — dat is een seconde of twee, en het
    // voorkomt dat een klik meteen op een verouderd rijnummer landt. De hoogwaterstand van het
    // Logboek gaat NIET mee in de cache, dus die eerste ronde leest het logboek volledig.
    state._uitCache=true;
    renderAll();
    return true;
  }catch(_){ return false; }
}
function wisCache(){
  try{
    for(let i=localStorage.length-1;i>=0;i--){
      const k=localStorage.key(i);
      if(k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  }catch(_){}
}

// ── Offline: blokkeren vóór de optimistische wijziging ─────────────────────
// Poort vóór élke schrijfactie. Tot nu toe veranderde de rij eerst op het scherm en draaide
// backgroundWrite hem daarna terug: het dashboard deed dus alsof er iets was opgeslagen terwijl
// er niets was vertrokken. Nu gebeurt er niets, met één duidelijke melding.
// ensureToken is hiervoor géén poort: met een geldig token in het geheugen doet die geen
// netwerkverkeer en geeft hij offline gewoon 'true'.
// Bewust NIET gebruiken bij logEvent, queueNotif en sendTestNotif: die drie zijn
// fire-and-forget en falen vandaag al stil. Blokkeren zou een logregel definitief laten
// verdwijnen zonder dat iemand het ziet — erger dan de huidige situatie.
function blokkeerOffline(){
  // Geen verbinding is de meest specifieke reden en krijgt dus voorrang op de cache-rem hieronder.
  if(isOffline()){
    showOfflineBanner();
    setSyncOffline();   // de balk moet hetzelfde zeggen als de banner, ook als de poll nog niet faalde
    // geenDedup: élke poging verdient een antwoord. Met de 15s-ontdubbeling bleef de tweede klik
    // stil, en stilte leest als 'het is gelukt' — precies wat deze poort moet voorkomen.
    showToast('Geen verbinding','Wijzigen lukt niet zonder internet. Er is niets gewijzigd — probeer het opnieuw zodra je weer online bent.','var(--rd)','waarschuwing',{geenDedup:true,geenSysteemmelding:true});
    return true;
  }
  // Nog geen verse ronde binnen: het scherm komt uit de leescache en de rijnummers erin kunnen
  // uren oud en dus verschoven zijn. Normaal duurt dit een seconde of twee; slaagt de eerste ronde
  // niet, dan blijft de rem staan — dan is het beter niet te schrijven dan een taak in het
  // verkeerde sectieblok te zetten.
  if(state._uitCache){
    const gefaald=(state._syncFails||0)>0;
    showToast(gefaald ? 'Gegevens niet vernieuwd' : 'Even wachten',
      gefaald ? 'De gegevens konden niet worden opgehaald. Klik op Vernieuwen voordat je iets wijzigt.'
              : 'De gegevens worden nog vernieuwd — probeer het over een seconde opnieuw.',
      'var(--am)','zandloper',{geenDedup:true,geenSysteemmelding:true});
    return true;
  }
  return false;
}

// Zelfde patroon als showLoadError: één banner, idempotent, met role="alert" zodat een
// schermlezer hem voorleest. Bewust géén knoppen body-breed dempen: een half uitgeschakelde
// interface leest verwarrender dan één duidelijke melding op het moment dat je iets probeert te
// wijzigen, en `disabled` knoppen halen de focus-trap van modal-a11y.js onderuit (dan houdt een
// venster geen enkel focusdoel meer over).
function showOfflineBanner(){
  clearLoadError();                                  // niet twee banners over elkaar
  if(document.getElementById('offline-banner')) return;
  const b=document.createElement('div');
  b.id='offline-banner'; b.className='load-err'; b.setAttribute('role','alert');
  b.innerHTML='<span>'+ico('waarschuwing',15)+' Geen verbinding — kijken kan, wijzigen lukt nu niet.</span>';
  document.body.appendChild(b);
}
function clearOfflineBanner(){ document.getElementById('offline-banner')?.remove(); }

function setSyncing(){dot('loading');document.getElementById('sync-lbl').textContent='Laden…'}
function setSaving(){dot('loading');document.getElementById('sync-lbl').textContent='Opslaan…'}
// Guard: zolang er een schrijfactie loopt mag NIETS 'Live · HH:MM' over de 'Opslaan…'-stand
// heen zetten. Zonder deze regel liegt de balk opnieuw zodra iemand midden in een schrijfactie
// op Vernieuwen klikt (data.js keert dan vroegtijdig terug en riep setSynced aan).
function setSynced(){
  if(state.pendingWrites>0) return;
  dot('');
  document.getElementById('sync-lbl').textContent='Live · '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  clearLoadError();
  clearOfflineBanner();
}
function setSyncErr(){dot('err');document.getElementById('sync-lbl').textContent='Fout'}
// 'Fout' suggereert een storing aan de andere kant; 'Offline' benoemt wat er werkelijk aan de
// hand is en waarom wijzigen nu niet lukt.
function setSyncOffline(){dot('err');document.getElementById('sync-lbl').textContent='Offline'}
function dot(cls){const d=document.getElementById('dot');d.className='dot'+(cls?' '+cls:'')}

// Nette foutmelding in beeld bij een harde laadfout (niet de zwijgende achtergrond-polls).
// Een verlopen sessie wordt elders al via het inlogscherm afgevangen; dit vangt
// netwerk-/API-fouten zodat de gebruiker geen blanco scherm ziet maar uitleg + actie.
function showLoadError(){
  clearOfflineBanner();   // ze staan op dezelfde plek; twee banners over elkaar is onleesbaar
  if(document.getElementById('load-err-banner')) return;
  const b=document.createElement('div');
  b.id='load-err-banner'; b.className='load-err'; b.setAttribute('role','alert');
  b.innerHTML='<span>'+ico('waarschuwing',15)+' Kon de gegevens niet laden — controleer je verbinding.</span>'
    +'<button class="btn btn-pri btn-sm" id="load-err-retry">Opnieuw proberen</button>';
  document.body.appendChild(b);
  b.querySelector('#load-err-retry').onclick=()=>{ clearLoadError(); loadAll(); };
}
function clearLoadError(){ document.getElementById('load-err-banner')?.remove(); }

// Herhaal-slot: voorkomt dat twee loadAll-aanroepen tegelijk lopen en elkaars data
// overschrijven (8s-poll, schrijf-resync, refresh-knop, handmatige awaits).
// De acht tabbladen die elke poll gelezen worden. Sinds fase 5 wordt er niet meer op positie
// uitgepakt maar op naam (zie fetchSheets), dus deze reeks bepaalt alleen nog WAT er gevraagd
// wordt — niet meer welke variabele wat krijgt.
//
// BEWUST alle acht elke ronde. Het ontwerp stelde een trage groep voor (vijf tabbladen elke
// 60 s), maar de meting op productie wees uit dat het Logboek 1.261 van de ~1.700 regels was en
// de vier andere kandidaten samen 222 (ALV's afgerond 202, Kenmerken 14, Ontwikkeling 5,
// Herhaalregels 0). Met het Logboek incrementeel (zie _logBereik) valt er op die vier niets
// meer te winnen, terwijl minder vaak lezen het venster verlengt waarin twee collega's elkaars
// wijziging kunnen overschrijven — op precies de tabbladen waar de rij-guard alleen de sleutel
// vergelijkt en niet de inhoud. Prijs en risico stonden niet in verhouding.
const POLL_TABS=["Nog Te Doen","Afgerond","ALV's overzicht","ALV's afgerond",
                 "Ontwikkeling","Logboek","Herhaalregels","Kenmerken"];

// Tabbladen die in de terugvaltak GEEN .catch krijgen: zonder deze vier kan het dashboard niet
// zinnig renderen, dus daar is hard falen beter dan stilzwijgend een lege lijst tonen. De andere
// vier zijn optioneel (ze bestaan niet op elke kopie van de Sheet) en worden wél afgevangen.
// Dit legt expliciet vast wat eerder in de hand uitgeschreven Promise.all-regels stond — waar
// het verschil tussen wél en géén .catch alleen uit de vorm van de regel te lezen was.
const VERPLICHTE_TABS=new Set(["Nog Te Doen","Afgerond","ALV's overzicht","ALV's afgerond"]);

// Is de terugval op losse reads hier zinvol? Alleen bij een 400: dan wees Google één bereik af
// (een tabblad dat op deze kopie van de Sheet niet bestaat) en levert per-tabblad lezen de rest
// alsnog op. Bij 429/5xx is het omgekeerde waar — _withRetry heeft het al drie keer geprobeerd,
// en 7-8 losse reads mét eigen herkansingen zetten juist op het drukste moment nóg meer druk op
// hetzelfde quotum: één verzoek werd er zo tot 24. Bij 401 en bij een netwerkfout (geen .status)
// levert de terugval alleen dezelfde fout, acht keer. Puur, dus los testbaar.
const magTerugvalLosseReads = e => !!e && e.status===400;

// ── Logboek: alleen de staart lezen ────────────────────────────────────────
// Het Logboek is het enige tabblad dat onbeperkt groeit — 1.261 regels op het moment van bouwen,
// ~60% van alles wat elke 8 seconden binnenkwam, en dat werd elke ronde volledig opnieuw
// ingelezen. Na de eerste volledige lezing wordt alleen nog opgehaald wat erbij kwam, en dat
// blijft even goedkoop bij 6.000 regels.
//
// Het bereik begint bij de hoogwaterstand ZELF en niet bij +1: die ene regel is het ANKER.
// Komt hij niet terug, of staat er iets anders, dan heeft iemand een logregel verwijderd en zijn
// alle rijnummers eronder opgeschoven → meteen volledig herlezen. Zonder die controle zou het
// logboek stil bevriezen: de hoogwaterstand staat dan boven het einde van het tabblad, het
// staartbereik geeft voor altijd niets terug, en nieuwe regels landen op rijnummers die we nooit
// meer opvragen. Bewerken en verwijderen van logregels zou dan op verkeerde rijnummers werken.
const _logBereik=(hoogwater)=>`'Logboek'!A${hoogwater}:H`;

// Een staartlezing ziet alleen NIEUWE rijen. Bewerkt een collega de tékst van een bestaande
// logregel, dan verandert kolom A niet en schuift er niets op: die wijziging komt dus nooit binnen,
// waar élke ronde dat vóór fase 5 binnen 8 seconden bijwerkte. Daarom af en toe volledig lezen —
// maar alleen als er iemand naar logboektekst kíjkt (de Logboek-pagina of een VvE-dossier), en dan
// hoogstens één keer per minuut. Staat er geen logboek in beeld, dan doet verouderde tekst geen
// kwaad en dekt de rij-guard op 'Logboek' (die de hele regel vergelijkt) de schrijfkant.
// Puur, dus los testbaar.
const LOG_VOL_MS=60000;
function _logVolledigNodig(luid, hoogwater, kijktNaarLog, laatsteVolledigMs, nu){
  if(luid || !hoogwater) return true;                       // handmatige verversing of eerste ronde
  if(!kijktNaarLog) return false;
  return !laatsteVolledigMs || (nu-laatsteVolledigMs)>=LOG_VOL_MS;
}
// Staat er logboektekst in beeld? De Logboek-pagina en het VvE-dossier (dat de tijdlijn toont en
// waar logregels óók bewerkt en verwijderd kunnen worden).
function _kijktNaarLog(){
  return !!(document.getElementById('page-logboek')?.classList.contains('active')
         || document.getElementById('page-vve')?.classList.contains('active'));
}

// ── 'ALV's afgerond': het archief hoeft niet elke acht seconden mee ─────────
// Gemeten op 30-07: 21 kB per ronde, na het Logboek de laatste post die de moeite waard was.
// Dit tabblad is bijzonder omdat het dashboard er NOOIT naartoe schrijft — geen enkele schrijfweg
// raakt het — en het verandert alleen bij de jaarlijkse ALV-reset. Verouderde gegevens kunnen hier
// dus per definitie niets overschrijven; het enige risico is dat je een archiefregel even later
// ziet. Daarom dezelfde regel als bij het Logboek: elke ronde meelezen zolang iemand ernaar kijkt,
// anders hoogstens één keer per minuut. Puur, dus los testbaar.
const ALFA_MS=60000;
function _alfaNodig(luid, kijkt, laatsteMs, nu){
  if(luid || !laatsteMs) return true;      // handmatige verversing of nog nooit gelezen
  if(kijkt) return true;
  return (nu-laatsteMs)>=ALFA_MS;
}
// Alle plekken die D.alfa tonen: de archieflijst zelf, Analytics en het Dashboard (KPI
// 'vergaderingen uitgeschreven') en het VvE-dossier ('laatst gehouden ALV').
function _kijktNaarAlfa(){
  return ['page-alfa','page-analytics','page-dash','page-vve']
    .some(id=>document.getElementById(id)?.classList.contains('active'));
}

// ── 'Meldingen': meeliften op de batchGet in plaats van een eigen verzoek ──
// Dit tabblad werd elke 10 seconden in zijn geheel opgehaald met een eigen values:get, buiten
// POLL_TABS om: 6 van de ~13,5 leesverzoeken per minuut, bijna de helft van het Google-quotum van
// 60 per minuut. Meesturen in de batchGet die er tóch al is kost 0 extra verzoeken (zie
// fetchSheets), en brengt het totaal op 7,5 per minuut.
//
// Waarom een VENSTER en niet het hele tabblad: de cadans gaat van 6 naar 7,5 rondes per minuut,
// dus alles meesturen zou het leesvolume juist opdrijven (7,5 × 34 kB tegen 6 × 34 kB nu).
//
// Waarom GEEN anker op rijnummer zoals bij het Logboek: cd_schrijfMelding houdt het tabblad op
// MELDING_MAX=200 rijen door bovenaan te knippen, en het zit dáár nu op (gemeten op productie:
// laatste gevulde rij 201). Elke nieuwe melding verschuift dus álle rijnummers. Een rij-anker zou
// bij élke melding mismatchen en een volledige herlezing uitlokken: 2 verzoeken per ronde in plaats
// van 1, het tegenovergestelde van de bedoeling. De identiteit hier is de tijdstempel, niet de rij.
//
// De koprij komt als apart minibereik mee (~50 bytes, zelfde verzoek): de verwerking zoekt de
// kolommen op naam op, en een staartbereik bevat de koprij niet.
const MELD_MARGE=40;
const MELD_KOP="'Meldingen'!A1:E1";
const _meldBereik=(start)=>`'Meldingen'!A${Math.max(2,start||2)}:E`;
// Volgend venster: eindig bij de laatst gelezen rij en tel MELD_MARGE terug. De marge is gemeten,
// niet gegokt: de zwaarste burst op productie was 23 meldingen in 40 seconden (de deadline-motor,
// 31-07 04:27:47→04:28:27), dus ~0,6 rij per seconde. 40 rijen dekt ruim een minuut achterstand,
// tegen een cadans van 8 seconden. En als het tóch niet genoeg is, ziet _verwerkMeldingen dat —
// zie gatMogelijk. Puur, dus los testbaar.
function _meldVolgendeStart(start, aantal, marge){
  const laatsteRij=(start||2)+(aantal||0)-1;
  return Math.max(2, laatsteRij-(marge||MELD_MARGE)+1);
}

// Verwerkt de meldingen-lezing. Doet zelf GEEN netwerkverkeer: staat er een gat, dan leest de
// vólgende ronde volledig — dat kost niets extra omdat het bereik in dezelfde batchGet zit
// (anders dan bij het Logboek, waar een verschoven anker wél een tweede verzoek kost).
function _verwerkMeldingen(R, bereik, start){
  const kop=R[MELD_KOP], rijen=R[bereik];
  if(kop===undefined || rijen===undefined) return;   // niet gevraagd deze ronde → niets doen
  // Leeg venster: het tabblad is korter dan waar wij begonnen (opgeschoond, of MELDING_MAX omlaag).
  // Niets verwerken, basislijn laten staan, volgende ronde vanaf rij 2.
  if(!rijen.length){ if(start>2) state._meldStart=0; return; }
  const uit=verwerkMeldingRijen(kop[0]||[], rijen, state._lastNotifTs, getCurrentWho(), getNotifPrefs());
  if(uit.kopStuk){ console.warn('[meldingen] koprij mist Timestamp/Titel — niets verwerkt'); return; }
  // Reikt het venster niet terug tot de basislijn, dan kan er een melding tussen gevallen zijn.
  // Volgende ronde volledig lezen en deze ronde niets tonen; de basislijn blijft staan, dus er
  // gaat niets verloren — het komt hoogstens 8 seconden later.
  // Bij een volledige lezing (start===2) accepteren we altijd: verder terug dan rij 2 bestaat niet
  // meer op dit tabblad, en anders zou dit eeuwig blijven herlezen zonder ooit iets te tonen.
  if(start>2 && uit.gatMogelijk){
    console.warn('[meldingen] venster reikt niet tot de basislijn — volgende ronde volledig');
    state._meldStart=0; return;
  }
  toonMeldingen(uit.toon);
  state._lastNotifTs=uit.watermerk;
  state._meldStart=_meldVolgendeStart(start, rijen.length, MELD_MARGE);
}

// Hoogwaterstand + anker uit de RUWE lezing: het hoogste rijnummer dat we gezien hebben en de
// kolom-A-waarde die daar stond. Bewust de ruwe rijen en niet D.logboek: parseLogboek filtert
// verborgen acties eruit en keert de lijst om, dus de laatste regel van D.logboek is niet per se
// de laatste Sheet-rij. Geen bruikbaar anker (lege kolom A) → terug naar volledig lezen; liever
// een duurdere ronde dan een anker dat op elke rij 'klopt'.
function _zetLogAnker(rows, eersteRij){
  const ts=(((rows||[])[(rows||[]).length-1]||[])[0]||'').toString().trim();
  if(!rows||!rows.length||!ts){ state._logHoogwater=0; state._logAnkerTs=''; return; }
  state._logHoogwater=eersteRij+rows.length-1;
  state._logAnkerTs=ts;
}

// Verwerkt de Logboek-lezing. Staat als enige tabblad in een eigen functie omdat hij een tweede
// leesverzoek kan doen: als het anker verschoven is, moet er in dezelfde ronde volledig herlezen
// worden — één extra verzoek in een zeldzaam geval, in plaats van een logboek dat achterblijft.
async function _verwerkLogboek(R, naam, volledig, lees){
  let rows=R[naam];
  if(rows===undefined) return;                     // niet gevraagd deze ronde → laat staan
  if(!volledig){
    const anker=((rows[0]||[])[0]||'').toString().trim();
    if(!rows.length || !state._logAnkerTs || anker!==state._logAnkerTs){
      console.warn('[logboek] anker verschoven — volledige herlezing');
      rows=await lees('Logboek').catch(()=>undefined);
      if(rows===undefined){ state._logHoogwater=0; state._logAnkerTs=''; return; }
      volledig=true;
    }
  }
  const optimistisch=(D.logboek||[]).filter(x=>x._row===0);
  if(volledig){
    const nieuw=parseLogboek(rows);
    D.logboek=_nogNietBevestigd(optimistisch, nieuw).concat(nieuw);
    _zetLogAnker(rows, 1);
    // Pas hier bijhouden dat er volledig gelezen is, niet bij het opvragen: een ronde die
    // hierboven strandt mag de klok van de volgende volledige lezing niet vooruitzetten.
    state._logVolledigMs=Date.now();
    return;
  }
  const staart=rows.slice(1);                      // rows[0] is het anker; die hadden we al
  if(!staart.length) return;                       // niets nieuws → D.logboek onaangeroerd
  const nieuw=parseLogboek(staart, state._logHoogwater+1);
  const bestaand=(D.logboek||[]).filter(x=>x._row>0);
  // Volgorde: eigen nog-niet-bevestigde regels bovenaan (daar zet unshift ze ook), dan de nieuwe
  // staart (parseLogboek keert die al om: nieuwste eerst), dan wat we al hadden.
  D.logboek=_nogNietBevestigd(optimistisch, nieuw).concat(nieuw, bestaand);
  _zetLogAnker(staart, state._logHoogwater+1);
}

// Mag de achtergrond-verversing draaien? Alleen met een echte sessie. Zonder deze rem
// vroeg de 8s-timer óók op het inlogscherm elke ronde zelf een token aan. Elke aanvraag
// herbindt de Google-callback (zie auth.js), dus tikte de timer terwijl de gebruiker in
// het Google-venster zijn account koos, dan ving de timer dát antwoord op en bleef de
// eigen inlogpoging eeuwig hangen — de gebruiker viel terug op het inlogscherm.
// Pure functie, zodat de regel testbaar is los van timers en DOM.
function magPollen(s){ return !!(s && s.currentUserEmail); }

async function loadAll(silent){
  if(state._loadInFlight){ state._loadAgain=true; if(!silent) state._loadAgainLoud=true; return; }
  state._loadInFlight=true;
  try{
    // Altijd een geldige token garanderen (ook bij Vernieuwen-knop / schrijf-resync):
    // een verlopen-maar-niet-null token gaf anders een 401 → onnodige 'Fout'.
    // Mislukt dat, dan moet de gebruiker dat uiteindelijk ZIEN: voorheen keerde de
    // 8s-poll hier stilzwijgend terug en bleef 'Live · HH:MM' staan terwijl er niets
    // meer binnenkwam. Zelfde tolerantie als bij leesfouten: één stille hapering mag,
    // vanaf de tweede op rij (of bij een handmatige verversing) tonen we 'Fout'.
    if(!await ensureToken()){
      state._syncFails=(state._syncFails||0)+1;
      if(isOffline()){ setSyncOffline(); showOfflineBanner(); return; }
      if(!silent || state._syncFails>=2) setSyncErr();
      if(!silent) showLoadError();
      return;
    }
    if(!silent) setSyncing();
    // Reads met herkansing bij tijdelijke API-fouten (429 / 5xx / netwerk-blip), zodat
    // één hapering niet meteen de hele ronde laat falen en 'Fout' toont.
    const lees=(naam)=>_withRetry(()=>fetchSheet(naam));
    // Een handmatige verversing (de knop in de titelbalk, of het herstel ná een verwijderde
    // logregel) leest het Logboek altijd volledig: dat is precies het moment waarop iemand wil
    // zien wat een ánder heeft gewijzigd of weggehaald, en de staart kent alleen nieuwe rijen.
    // De stille 8s-poll leest de staart.
    const logVolledig=_logVolledigNodig(!silent, state._logHoogwater, _kijktNaarLog(), state._logVolledigMs, Date.now());
    const logNaam=logVolledig ? 'Logboek' : _logBereik(state._logHoogwater);
    const alfaMee=_alfaNodig(!silent, _kijktNaarAlfa(), state._alfaMs, Date.now());
    const namen=POLL_TABS.map(n=>n==='Logboek' ? logNaam : n)
                         .filter(n=>alfaMee || n!=="ALV's afgerond");
    // De meldingenbereiken zitten bewust NIET in POLL_TABS: ze landen nergens in D en mogen nooit
    // meetellen als een tabblad waarvan het dashboard afhangt.
    const meldStart=Math.max(2, state._meldStart||2);
    const meldBereik=_meldBereik(meldStart);
    const meldBereiken=state._meldUit ? [] : [MELD_KOP, meldBereik];
    let R;
    try{
      // Eén batchGet i.p.v. acht losse reads — zie fetchSheets: acht aparte verzoeken
      // per poll was precies de Google-leeslimiet van 60 per minuut, waardoor elke
      // gebruikersactie erbovenop 'Quota exceeded' opleverde.
      R=await _withRetry(()=>fetchSheets(namen.concat(meldBereiken)));
    }catch(e){
      // batchGet faalt in z'n geheel als één bereik niet bestaat, en 'Meldingen' wordt door Apps
      // Script pas lui aangemaakt bij de eerste melding. Op een verse Sheet-kopie zou élke ronde
      // dus stranden en in de dure terugval belanden — méér verzoeken dan vóór deze wijziging,
      // waarmee een storing in het meldingenpad het hele dashboard zou meetrekken. Eén keer
      // proberen zonder de meldingenbereiken; lukt dat, dan blijven ze deze sessie achterwege.
      // Alleen bij 400 (onparseerbaar bereik): 429/5xx zijn tijdelijk en heeft _withRetry al gehad.
      if(e.status===400 && meldBereiken.length && !state._meldUit){
        try{
          R=await fetchSheets(namen);
          state._meldUit=true;
          console.warn('[meldingen] tabblad niet leesbaar — meldingen blijven deze sessie uit');
        }catch(_){ R=null; }
      }
      if(!R){
        // Alleen een afgewezen bereik (400) is met losse reads te repareren. Bij 429/5xx/401 of
        // een netwerkfout gooien we door naar de buitenste catch: die telt _syncFails, laat de
        // bestaande gegevens staan en toont vanaf de tweede mislukking 'Fout'. Acht seconden
        // later probeert de poll het gewoon opnieuw — met één verzoek in plaats van acht.
        if(!magTerugvalLosseReads(e)) throw e;
        // Terugval op losse reads. De oude weg levert de optionele tabbladen dan alsnog los aan
        // (duurder, maar werkt). Per tabblad beslissen of hij mag falen: een uniforme .catch zou
        // een ontbrekend 'Nog Te Doen' in stilte als lege lijst doorlaten en het dashboard
        // leegvegen. De meldingen gaan hier bewust NIET los opgehaald worden: dat zou de ronde
        // van 8 naar 10 verzoeken tillen voor iets wat alleen een toast oplevert.
        console.warn('batchGet mislukt, terugval op losse reads:', e.message);
        R={};
        await Promise.all(namen.map(async n=>{
          R[n]=VERPLICHTE_TABS.has(n) ? await lees(n) : await lees(n).catch(()=>[]);
        }));
      }
    }
    state._syncFails=0; // alle reads geslaagd
    // Meldingen VÓÓR de pendingWrites-terugkeer hieronder: een toast is alleen-lezen en heeft geen
    // belang bij de regel 'de optimistische stand is leidend'. Die regel bestaat om D niet te
    // overschrijven, niet om meldingen tegen te houden. Stond dit bij de zetAls-regels, dan zou
    // een vinkje dat net tijdens de lezing gezet wordt de al opgehaalde meldingen weggooien.
    _verwerkMeldingen(R, meldBereik, meldStart);
    // Kwam er tijdens het lezen een schrijfactie tussen? Dan is de lokale (optimistische)
    // staat leidend; de eigen resync van die schrijfactie haalt zo de verse data op.
    if(state.pendingWrites>0){ if(!silent) setSynced(); return; }
    // Toekennen op NAAM. Een tabblad dat niet in deze ronde zat, behoudt zijn vorige waarde in
    // plaats van door parseX(undefined) leeggeveegd te worden. Vandaag zit alles er elke ronde
    // in; de vorm is er zodat een gemiste of afwijkend gevraagde reeks nooit stil data wist.
    const zetAls=(naam,fn)=>{ if(R[naam]!==undefined) fn(R[naam]); };
    zetAls('Nog Te Doen', r=>{ const p=parseSections(r); D.ntd=p.data; D.ntdSecInfo=p.secInfo; });
    zetAls('Afgerond',    r=>{ const p=parseSections(r); D.af=p.data; D.afSecInfo=p.secInfo;
                               SKEYS.forEach(s=>{if(D.af[s])D.af[s].sort((a,b)=>parseDt(b.datum)-parseDt(a.datum))}); });
    // Fase 3, trap 1: alleen meekijken. Zodra dit een tijd lang stil blijft op gezonde data
    // gaat de banner aan (trap 2). Nooit blokkerend — dit mag het laden niet beïnvloeden.
    try{
      const bev=[...checkSecties(R['Nog Te Doen']||[]), ...checkSecties(R['Afgerond']||[]),
                 ...checkNummers(Object.values(D.ntd||{}).flat())];
      if(bev.length) console.warn('[structuurcheck]', bev);
    }catch(e){ console.warn('[structuurcheck] overgeslagen:', e.message); }
    zetAls("ALV's overzicht", r=>{ D.alvo=parseAlvo(r); });
    // Pas ná het toekennen bijhouden dat het archief gelezen is: een ronde die eerder strandt mag
    // de klok van de volgende lezing niet vooruitzetten. Werd het tabblad deze ronde overgeslagen,
    // dan behoudt zetAls vanzelf de vorige D.alfa.
    zetAls("ALV's afgerond",  r=>{ D.alfa=parseAlfa(r); state._alfaMs=Date.now(); });
    zetAls('Ontwikkeling',    r=>{ D.ontw=parseOntw(r); });
    await _verwerkLogboek(R, logNaam, logVolledig, lees);
    zetAls('Herhaalregels',   r=>{ D.herhaal=parseHerhaal(r); });
    zetAls('Kenmerken',       r=>{ D.kenmerken=parseKenmerken(r); });
    // Verse data staat in D: de leescache-stand is niet langer de basis, dus de schrijf-rem eraf.
    // Bewust hier en niet in het finally: bij een MISLUKTE eerste ronde staat het scherm nog op de
    // cache van gisteren, en dan mag er niet geschreven worden — getInsertRow zou de verouderde
    // ntdSecInfo gebruiken en een nieuwe taak in het verkeerde sectieblok zetten. De 8s-poll heft
    // de rem op zodra er één ronde slaagt.
    state._uitCache=false;
    setSynced();
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek,D.herhaal,D.kenmerken]);
    if(hash!==state._lastDHash){
      state._lastDHash=hash;
      // Alleen bij een echte wijziging naar de leescache, niet elke 8 seconden: localStorage
      // schrijft synchroon naar schijf en dit is ~1 MB. Zo blijft het een handjevol keer per
      // sessie in plaats van 450 keer per uur.
      bewaarCache(hash);
      renderAll();
      // Re-render actieve detailpagina's met nieuwe data
      if(document.getElementById('page-analytics')?.classList.contains('active')) buildAnalytics();
      if(document.getElementById('page-dash')?.classList.contains('active')) buildDash();
      if(document.getElementById('page-ntd')?.classList.contains('active')) renderNtdDonut();
    }
  }catch(e){
    // Eén mislukte stille poll mag de indicator niet meteen op 'Fout' zetten — die
    // herstelt zich vaak vanzelf bij de volgende ronde. Pas na 2 mislukkingen op rij
    // (of bij een handmatige, niet-stille verversing) tonen we 'Fout'.
    state._syncFails=(state._syncFails||0)+1;
    if(isOffline()){
      // Meteen eerlijk zijn, ook bij een stille poll: de verbinding is weg, dat herstelt zich
      // niet vanzelf bij de volgende ronde en het bepaalt of wijzigen nu kan.
      setSyncOffline(); showOfflineBanner();
    }else{
      if(!silent || state._syncFails>=2) setSyncErr();
      if(!silent) showLoadError(); // alleen bij eerste/handmatige lading, niet bij zwijgende polls
    }
    console.error(e);
  }
  finally{
    state._loadInFlight=false;
    if(state._loadAgain){ const loud=state._loadAgainLoud; state._loadAgain=false; state._loadAgainLoud=false; loadAll(!loud); } // onderdrukte aanroep alsnog uitvoeren; luid als er een handmatige verversing tussen zat
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
    // Checkbox-erfenis (rijen erven TRUE/FALSE-validatie in K/L/M/N) telt als leeg.
    // Gedeeld met de schrijf-guard in api.js — zie leegBijErfenis in util.js.
    const _f4v=leegBijErfenis;
    entry.subcategorie=_f4v(row[afOff+2]);
    entry.opvolgdatum=_f4v(row[11]);  // L — Fase 4
    entry.herhaalId  =_f4v(row[12]);  // M
    entry.esc        =_f4v(row[13]);  // N (alleen door Apps Script geschreven)
    entry.fase       =_f4v(row[14]);  // O — offerte-fase (offerte-motor)
    entry.aannemers  =_f4v(row[15]);  // P — aannemerslijst (naam|0/1 per regel)
    entry.taakId     =_f4v(row[16]);  // Q — vast taaknummer (fase 4). Leeg = nog niet genummerd:
                                      // rijen van vóór de backfill en rijen die een oude client
                                      // aanmaakte. De guard valt dan terug op de vingerafdruk.
    // Legacy 'Afgerond'-rijen (oude onEdit-vinkjes, vóór juni): 5-koloms vorm
    // [code,naam,actiepunt,behandelaar,datum] met de afronddatum op kolom E i.p.v. I.
    // Herken ze — geen datum op I, maar kolom E (in entry.behandelaar) is wél een datum —
    // en herstel datum + behandelaar zodat ze mét datum tonen. Moderne 12-kol rijen hebben
    // datum op I en kolom E = behandelaar (een naam), dus deze guard raakt ze niet.
    if(!entry.datum && _parseAnyDate(entry.behandelaar||'')){
      entry.datum=entry.behandelaar;
      entry.behandelaar=(row[3]||'').trim();
      entry.deadline='';
    }
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
    interval:((r[7]||'')+'').trim(), dagenVooraf:coerceDagenVooraf(r[8]),
    volgendeDeadline:((r[9]||'')+'').trim(),
    status:((r[10]||'ACTIEF')+'').trim().toUpperCase(),
    laatstKlaargezet:((r[11]||'')+'').trim(),
  })).filter(r=>r.id);
}

// Samenvattings-/statregels onderaan het ALV-overzicht hebben in kolom A een hele zin
// ('Totaal …', 'Uitnodigingen …') i.p.v. een korte VvE-code. Een echte code is kort;
// alles langer dan deze grens is zo'n statregel en hoort niet als VvE in het overzicht.
const MAX_VVE_CODE_LEN = 20;
function parseAlvo(rows){
  return rows.slice(2).map((r,i)=>{
    const code=(r[0]||'').trim();
    if(!code||code.length>MAX_VVE_CODE_LEN) return null;
    // Skip stat rows
    if(['Totaal','Uitnodigingen','Notulen','Nog'].some(p=>code.startsWith(p))) return null;
    const uitn=(r[2]||'').trim()==='TRUE';
    const notu=(r[3]||'').trim()==='TRUE';
    const begr=(r[4]||'').trim()==='TRUE';
    // Kolom G: de stap vóór 'Uitnodiging verstuurd' — agenda uitgeschreven, klaar om te versturen.
    const klaar=(r[6]||'').trim()==='TRUE';
    const opm=(r[5]||'').trim();
    // Budgetpakket-markering: kolom F bevat exact "Budget" (of voluit "Budgetpakket"),
    // hoofdletterongevoelig. Vrije-tekst-opmerkingen ("Naar budget per…","Vergaderen zelf") tellen bewust niet mee.
    const budget=/^budget(pakket)?$/i.test(opm);
    const status=notu?'Afgerond':uitn?'Gepland':klaar?'Klaargezet':'Open';
    return{code,naam:(r[1]||'').trim(),uitnodiging:uitn,notulen:notu,begroting:begr,klaargezet:klaar,opmerkingen:opm,budget,status,_row:i+3};
  }).filter(Boolean);
}

function parseAlfa(rows){
  return rows.slice(1).map(r=>({
    code:(r[0]||'').trim(),naam:(r[1]||'').trim(),datum:(r[2]||'').trim()
  })).filter(r=>r.code);
}

// ══════════════════════════════════════

export {
  backgroundWrite, schrijfActieLoopt, metWriteMarkering, setSyncing, setSaving, setSynced, setSyncErr, dot, loadAll, magPollen, parseSections, parseAlvo, parseAlfa, parseHerhaal,
  POLL_TABS, VERPLICHTE_TABS, magTerugvalLosseReads, _logBereik, _zetLogAnker, _verwerkLogboek, _logVolledigNodig, _alfaNodig,
  MELD_KOP, MELD_MARGE, _meldBereik, _meldVolgendeStart, _verwerkMeldingen,
  blokkeerOffline, showOfflineBanner, clearOfflineBanner, setSyncOffline,
  bewaarCache, laadUitCache, wisCache, _cacheSleutel, CACHE_PREFIX, _zetCacheBlokkade,
};
