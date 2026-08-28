import { state, D } from "./state.js";
import { SID, SKEYS, PROXY_URL, SECS, OMSCHRIJVING_SLEUTEL } from "./config.js";
import { _parseAnyDate, leegBijErfenis } from "./util.js";

// ── Offline-signaal ────────────────────────────────────────────────────────
// Uitdrukkelijk NIET state._syncFails gebruiken: die telt óók mislukte inlogpogingen, 401/403 en
// quota-fouten mee. In een quotum-incident zou het dashboard zichzelf dan op slot zetten op
// precies het moment dat het zich aan het herstellen is.
//
// Het onderscheid is scherp te maken: een fetch die REJECTET (geen netwerk, DNS weg,
// CORS-blokkade) gooit een TypeError zónder .status; élk antwoord van Google — ook 401, 429 en
// 500 — heeft er wél een. Alleen het eerste is bewijs dat de verbinding weg is.
// Deze regel wordt in de praktijk INGEBAKKEN toegepast en niet via deze functie aangeroepen:
// `_fetchGeteld` telt `state._netwerkFouten` op in zijn catch — precies de plek waar een fetch
// rejectet, dus waar er per definitie geen `.status` is — en zet hem op nul bij een antwoord.
// Deze helper is de los toetsbare formulering van diezelfde regel (zie de vijf asserts in
// tests.js). Wijzig je hier iets, dan verandert er dus NIETS aan `isOffline()`; de plek om te zijn
// is `_fetchGeteld`.
const _isNetwerkFout = e => !!e && e.status===undefined;

// Twee netwerkfouten op rij, zodat één hapering in een tunnel of een lift het dashboard niet
// meteen op slot zet. navigator.onLine=false is wél meteen genoeg: dan zegt het besturingssysteem
// zelf dat er geen verbinding is. Puur, dus los testbaar.
function _isOffline(browserOnline, netwerkFouten){
  if(!browserOnline) return true;
  return (netwerkFouten||0) >= 2;
}
// De live toestand. Bewust géén blijvende state.offline-vlag: die zou na een geslaagde ronde
// blijven hangen en door bestaande tests nooit teruggezet worden.
const isOffline = () => _isOffline(navigator.onLine, state._netwerkFouten||0);

// Hoe lang een enkel Sheets-verzoek hoogstens mag duren. Zonder deze grens hangt een verzoek dat
// nooit antwoordt (wifi zonder internet, een portal die de verbinding vasthoudt, een slapende
// mobiele verbinding) voor altijd: `fetch` kent geen eigen tijdslimiet. Eén zo'n verzoek zette het
// hele dashboard stil — `_loadInFlight` bleef staan, dus de 8s-poll sloeg elke ronde over, en de
// Vernieuwen-knop lift op diezelfde ronde mee en gaf dus ook niets meer. Alleen een herlading hielp.
// 20 seconden is ruim: een leesronde duurt normaal onder de seconde, en twee polls verder is een
// antwoord toch niet meer interessant. Tests verlagen hem via state._fetchTimeoutMs.
const FETCH_TIMEOUT_MS = 20_000;
// De AI-proxy is iets heel anders dan een Sheets-lezing: die doet eerst een tokeninfo-aanroep en
// daarna een NIET-streamende aanroep naar het model met max_tokens 1024 — het antwoord komt pas
// als het hele stuk tekst klaar is. Bij een groot dossier is 20 seconden daarvoor te krap, en dan
// zou de klok een gesprek afbreken dat gewoon onderweg was. Een minuut is ruim en houdt nog steeds
// de belofte dat de chat niet eeuwig op 'aan het typen…' blijft staan.
const AI_TIMEOUT_MS = 60_000;

// Dezelfde tijdslimiet, maar ZONDER de netwerkteller — voor verzoeken die niet naar Sheets gaan:
// het e-mailadres van de ingelogde gebruiker (auth.js) en de AI-proxy (askChat hieronder). Die
// twee liepen als enige zónder klok, en dat is precies waar deze grens voor bestaat: een `fetch`
// die nooit antwoordt hangt voor altijd, en beide aanroepers staan in een try/finally waarvan de
// finally dan óók nooit draait — `_authBezig` bleef 1 (Herladen-knop dood), `_herinlogBezig` bleef
// true (de 8s-poll sloeg vanaf dat moment élke ronde over) en de chat bleef op 'aan het typen…'.
// Bewust buiten `_netwerkFouten`: een storing bij de AI-proxy of bij userinfo mag het dashboard
// niet als 'offline' bestempelen en daarmee alle Sheets-schrijfacties blokkeren.
async function fetchMetKlok(url, opts, melding, ms){
  const ac = new AbortController();
  const klok = setTimeout(() => ac.abort(), state._fetchTimeoutMs || ms || FETCH_TIMEOUT_MS);
  // De klok wordt BEWUST niet gewist. `fetch` lost al op zodra de kop binnen is; het lichaam
  // wordt bij de aanroeper gelezen, en valt de verbinding daar weg, dan is de AbortController het
  // enige wat die leesactie nog kan afbreken. Een abort op een al gelezen antwoord doet niets.
  // Zelfde afweging als in _fetchGeteld hieronder.
  try { return await fetch(url, { ...(opts||{}), signal: ac.signal }); }
  catch(e){
    clearTimeout(klok);
    if(e && e.name==='AbortError') throw new Error(melding || 'Geen antwoord binnen 20 seconden');
    throw e;
  }
}

// Elke Sheets-fetch loopt hierlangs, zodat de teller op één plek klopt: een reject is een echte
// netwerkfout, en élk antwoord (ook 4xx en 5xx) bewijst dat er verbinding ís.
// Een afgebroken verzoek telt bewust als netwerkfout: van buitenaf is 'antwoordt niet binnen 20s'
// niet te onderscheiden van 'verbinding weg', en beide betekenen hetzelfde voor de gebruiker.
// AbortController i.p.v. AbortSignal.timeout(): dat laatste kent Safari pas vanaf 16.
async function _fetchGeteld(url, opts){
  const ac = new AbortController();
  const klok = setTimeout(() => ac.abort(), state._fetchTimeoutMs || FETCH_TIMEOUT_MS);
  let r;
  try{ r=await fetch(url, { ...(opts||{}), signal: ac.signal }); }
  catch(e){
    clearTimeout(klok);
    state._netwerkFouten=(state._netwerkFouten||0)+1;
    if(e && e.name==='AbortError') throw new Error('Geen antwoord van Google binnen 20 seconden');
    throw e;
  }
  // De klok loopt bij een GESLAAGDE kop BEWUST door en wordt hier NIET gewist. `fetch` lost al op
  // zodra de kop binnen is; het lichaam wordt bij de aanroeper gelezen (`await r.json()`), en dat
  // is bij de batchGet zo'n 200 kB. Valt de verbinding wég tijdens dat binnenhalen en is de klok
  // al gewist, dan is er geen AbortController meer die die leesactie kan afbreken: `r.json()`
  // blijft dan staan, `_loadInFlight` blijft true en de poll slaat vanaf dat moment élke ronde
  // over — precies de storing die deze tijdslimiet moet dichten, alleen een halve seconde later
  // in het verzoek. Een `abort()` op een al volledig gelezen antwoord doet niets, dus dit kost niets.
  state._netwerkFouten=0;
  return r;
}

// Publieke naam van dezelfde helper, voor de SCHRIJF-kant. De leeskant liep hier al langs; de
// rij-invoegingen en -verwijderingen (batchUpdate) en `getSheetIds` gingen langs een kale `fetch`
// en hadden dus GEEN tijdslimiet. Een verzoek dat nooit antwoordt liet `pendingWrites` boven nul
// staan: de 8s-ronde sloeg daarna élke keer over, de balk bleef op 'Opslaan…' hangen en alles wat
// je daarna deed verdween in een wachtrij die nooit meer vertrok — precies de storing die in
// augustus alleen voor de leeskant is verholpen.
//
// VEILIG bij een niet-idempotente batch: de afbreekfout ('Geen antwoord van Google binnen 20
// seconden') heeft geen .status en matcht niet op `_isTransient`, dus `_withRetry` probeert hem
// NIET opnieuw. Zou iemand die melding ooit aan `_isTransient` toevoegen, dan kan één taak twee
// keer afgerond worden — laat hem daar dus buiten.
const sheetsFetch = (url, opts) => _fetchGeteld(url, opts);

async function fetchSheet(name){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r=await _fetchGeteld(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(name)}`,{
    cache:'no-store',
    headers:{Authorization:`Bearer ${state.oauthToken}`}
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'API fout');err.status=r.status;throw err}
  return (await r.json()).values||[];
}
// Meerdere tabbladen in ÉÉN leesverzoek (values:batchGet). Cruciaal voor het quotum:
// Google staat 60 leesverzoeken per minuut per gebruiker toe, en de 8s-poll haalde
// 8 tabbladen apart op = 8 × 7,5 = precies 60 per minuut. Daardoor ging élke extra
// actie van de gebruiker (een vinkje zetten kost een rij-controle + een resync) over
// het quotum heen, met 'Quota exceeded' tot gevolg. Nu kost een poll 1 verzoek.
async function fetchSheets(names){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const qs=names.map(n=>`ranges=${encodeURIComponent(n)}`).join('&');
  const r=await _fetchGeteld(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchGet?${qs}`,{
    cache:'no-store',
    headers:{Authorization:`Bearer ${state.oauthToken}`}
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'API fout');err.status=r.status;throw err}
  const vr=(await r.json()).valueRanges||[];
  // batchGet levert valueRanges in dezelfde volgorde als de meegegeven ranges, maar we geven ze
  // op NAAM terug en niet op positie. Zolang de aanroeper op index uitpakte, verschoof élke
  // variabele zodra de gevraagde lijst veranderde: één bereik erbij of eraf (zoals de
  // staartlezing van het Logboek) zette dan stil het logboek in D.ontw, de kenmerken in
  // D.herhaal, enzovoort — zonder één foutmelding. De sleutel is exact de gevraagde reeks,
  // dus ook een bereik als "'Logboek'!A400:H" komt onder díe naam terug.
  // Een leeg tabblad komt terug zónder 'values'; dat wordt een lege lijst.
  const uit={};
  names.forEach((n,i)=>{ uit[n]=(vr[i]&&vr[i].values)||[]; });
  return uit;
}

// Formule-injectie-rem op ALLE frontend-writes (spiegel van cd_safeCell in Apps
// Script): een cel die met =, +, -, @, tab of CR begint zou via USER_ENTERED een
// levende formule worden — geplakte mailtekst met =IMPORTDATA(...) is dan een
// exfil-kanaal, en een telefoonnummer "+31 6…" een parse-fout. Een apostrof-prefix
// maakt de cel gegarandeerd tekst; Sheets toont de apostrof niet.
// Alleen STRINGS worden geraakt: datums ('21-07-2026'), TRUE/FALSE-strings,
// booleans en getallen blijven exact zoals ze waren, zodat USER_ENTERED ze blijft
// parsen zoals altijd (de datumles van v6.0 blijft intact).
const veiligeCel=v=>(typeof v==='string'&&/^[=+\-@\t\r]/.test(v))?"'"+v:v;
const _veiligeRij=values=>(values||[]).map(veiligeCel);

async function writeRange(range,values,method='PUT'){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const opts={method,headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:[_veiligeRij(values)]})};
  const r=await _fetchGeteld(url,opts);
  // .catch op het uitlezen van het foutlichaam: een 502 van een tussenliggende proxy stuurt HTML,
  // en dan gooide r.json() een SyntaxError zónder .status — die zou als 'netwerkfout' gelden en
  // het dashboard onterecht op offline zetten.
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Schrijffout');err.status=r.status;throw err}
  return r.json();
}
// Meerdere rijen in ÉÉN PUT, op een bereik dat al bestaat. Zelfde vorm als writeRange hierboven,
// maar dan met een blok rijen in plaats van één. Nodig sinds 'dezelfde taak voor meerdere VvE's':
// twaalf losse PUT's zouden twaalf momenten opleveren waarop het halverwege kan stukgaan, en dan
// staan er zes taken in de Sheet en zes niet.
async function writeRows(range,rows){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const lijst=(rows||[]).filter(Boolean);
  if(!lijst.length) return null;
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const opts={method:'PUT',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
              body:JSON.stringify({values:lijst.map(_veiligeRij)})};
  const r=await _fetchGeteld(url,opts);
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Schrijffout');err.status=r.status;throw err}
  return r.json();
}
// Meerdere rijen in ÉÉN append. Een bulk-actie op 20 taken schreef 20 losse logregels, dus 20
// schrijfverzoeken (~4,7 s 'Opslaan…') en een derde van het schrijfquotum van 60/min — voor
// regels die samen één handeling zijn. values.append neemt gewoon meerdere rijen aan en zet ze
// in de meegegeven volgorde aaneengesloten onderaan het tabblad: één rondreis, één uitkomst.
async function appendRows(range,rows){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const lijst=(rows||[]).filter(Boolean);
  if(!lijst.length) return null;                  // niets te schrijven → ook geen verzoek
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r=await _fetchGeteld(url,{method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:lijst.map(_veiligeRij)})});
  // err.status hoorde hier ook te staan: zonder status geldt een 429 of 500 van deze route als
  // netwerkfout (zie _isNetwerkFout) én komt hij niet door de transient-herkansing.
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Schrijffout');err.status=r.status;throw err}
  return r.json();
}
// Eén rij: doorgeefluik, zodat er maar één fetch-implementatie te onderhouden is.
const appendRange=(range,values)=>appendRows(range,[values]);

// Aantal lopende/wachtende achtergrond-schrijfacties. Zolang >0 slaat de 8s-poll
// over, zodat een optimistische wijziging niet kort teruggedraaid wordt.
// Seriële wachtrij: schrijfacties lopen één voor één, zodat rij-indexen in de Sheet
// niet door elkaar lopen bij snel opeenvolgende acties.

// Verschuift lokale _row-nummers mee bij invoegen/verwijderen van een Sheet-rij,
// zodat een volgende optimistische actie de juiste rij raakt. "Nog Te Doen" is één
// sheet met meerdere secties; alle rijen onder `fromRow` schuiven `delta` op.
// De koprijen van de secties schuiven MEE. Ze stonden er niet in, en dat is een stil gat: een
// sectie zonder taken heeft geen enkel rij-object, dus `colHeaderRow` is dan het énige houvast dat
// `getInsertRow` heeft. Werd er daarvóór in deze ronde een rij verwijderd (een taak afgerond), dan
// wees dat nummer één rij te laag en kon een nieuwe taak in een LEGE sectie voorbij de kop van de
// volgende sectie belanden — precies de verwisseling waarvoor getInsertRow liever een harde fout
// geeft. De stille resync repareert het binnen een seconde, maar niet als die faalt.
function _shiftNtdRows(fromRow, delta){
  SKEYS.forEach(s=>{ (D.ntd[s]||[]).forEach(row=>{ if(row._row>fromRow) row._row+=delta; }); });
  SKEYS.forEach(s=>{
    const info=(D.ntdSecInfo||{})[s];
    if(info && info.colHeaderRow>fromRow) info.colHeaderRow+=delta;
  });
}

// Dezelfde correctie voor het tabblad 'Afgerond'. Die bestond niet, en dat was een echt gat:
// `doCompleteTask` en `bulkAfronden` voegen daar wél rijen in, maar D.af hield de rijnummers van
// vóór die invoeging. De stille resync repareert dat pas als `pendingWrites` op 0 staat, dus twee
// afrondingen kort na elkaar rekenden allebei op hetzelfde, inmiddels verschoven anker. Landde de
// tweede archiefregel daardoor pal onder een sectiekop, dan gooit `parseSections` hem altijd weg
// als kolomkoprij — de taak stond dan in geen van beide tabbladen meer.
// Bewust een eigen functie en geen parameter op _shiftNtdRows: de twee bladen hebben een andere
// bron (D.ntd/D.ntdSecInfo tegenover D.af/D.afSecInfo) en de aanroepers verwarren zou precies de
// verwisseling opleveren die dit moet voorkomen.
function _shiftAfRows(fromRow, delta){
  SKEYS.forEach(s=>{ (D.af[s]||[]).forEach(row=>{ if(row._row>fromRow) row._row+=delta; }); });
  SKEYS.forEach(s=>{
    const info=(D.afSecInfo||{})[s];
    if(info && info.colHeaderRow>fromRow) info.colHeaderRow+=delta;
  });
}

// Herstel-idioom voor de rollback van een mislukte rij-DELETE (pure, testbaar):
// schuif alles wat op of onder de oude positie ligt terug omlaag, d.w.z. shiftFn met
// (oudeRow-1, +1) — de shift-conditie is '>', dus fromRow-1 betekent 'vanaf oudeRow'.
// Zonder de -1 bleef de buurregel die door de delete óp oudeRow was komen te staan
// hangen (duplicaat-rijnummer). Eén naam voor álle rollback-closures (crud/bulk/logboek),
// zodat het patroon nooit meer per plek kan verlopen.
function _herstelShift(shiftFn, oudeRow){ shiftFn(oudeRow-1, +1); }

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
  const r = await fetchMetKlok(PROXY_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${state.oauthToken}` },
    body: JSON.stringify({ system, messages }),
  }, 'De AI gaf binnen een minuut geen antwoord', AI_TIMEOUT_MS);
  const data = await r.json().catch(()=>({}));
  if(!r.ok){ const e=new Error(data.error||'AI-fout'); e.status=r.status; throw e; }
  return (data.antwoord || '').trim();
}

// ── Vingerafdruk van een rij ───────────────────────────────────────────────
// De guard vergeleek tot v9.5 alléén kolom A. Dat bewijst 'deze rij hoort nog bij dezelfde
// VvE', niet 'dit is nog dezelfde taak' — en voor een VvE met meerdere openstaande taken ving
// hij dus niets. Juist dat is het waarschijnlijke schadegeval, want rijen verschuiven bínnen
// een sectie.
//
// Alleen kolommen die het DASHBOARD bezit en die STABIEL zijn doen mee. Bewust buitengesloten:
//   N  escalatie   — alleen door Apps Script geschreven; cd_opvolgingMotor stempelt hem élke
//                    ochtend ±06:30. Meenemen zou stil álle schrijfacties blokkeren op precies
//                    de taken die het langst stilliggen.
//   F  prioriteit  — cd_recalcPrioriteiten herschrijft die dagelijks (alleen OPPAKKEN)
//   L  opvolgdatum — door de opvolgmotor geschreven
//   I,J            — afvink-selectievakje / ongebruikt; dragen TRUE/FALSE-erfenis
//   O,P            — buiten de gewone bewerkweg om geschreven; voegen niets toe aan identiteit
// De VvE-naam doet niet mee: dezelfde code betekent per definitie dezelfde naam.
// Alleen de twee tabbladen waar kolom A NIET onderscheidend genoeg is. Op Herhaalregels,
// Ontwikkeling, Logboek, Kenmerken en ALV's overzicht is de sleutel in kolom A al uniek genoeg
// (een ID, een titel, een timestamp, een VvE-code bij één rij per VvE); die blijven bewust op de
// kolom-A-controle staan. Een tabblad dat hier niet in staat valt terug op kolom A — precies het
// gedrag van vóór v9.6. Wie zo'n tabblad later wél wil verbreden, zet hem hier bij én breidt
// _rijNaarCellen uit; doe dat niet op de gok, maar controleer eerst de echte kolomindeling in de
// parser van dat tabblad (de veldnamen lopen niet gelijk op met de kolomvolgorde).
const FP_KOLOMMEN = {
  'Nog Te Doen': { tekst:[0,2], datum:null },  // A=code, C=actiepunt/periode/datumAangevraagd; deadline per sectie
  'Afgerond':    { tekst:[0,2], datum:[8]  },  // A=code, C=actiepunt, I=datum afgerond
  // Logboek: de HELE regel (A t/m H). Kolom A alleen was hier niet genoeg. Bulk-acties schrijven
  // meerdere logregels met exact dezelfde milliseconde, en — belangrijker — het bewerken van een
  // logregel verandert alléén kolom E/F/G. Vergeleken we alleen de timestamp, dan zag de guard
  // een bewerking van een collega niet en overschreef hij die stil met de oude tekst. Er komt
  // niets van Apps Script in dit tabblad, dus er is geen kolom die vanzelf verandert en vals
  // alarm zou geven.
  'Logboek':     { tekst:[0,1,2,3,4,5,6,7], datum:null },
  // Ontwikkeling: de HELE regel, want de titel is NIET afgedwongen uniek — twee items 'Bug in
  // filter' bestonden gewoon, en dan keurde de kolom-A-controle na een rijverschuiving stil het
  // gelijknamige buur-item goed (naloop 2026-08-28). De datumkolom als datum vergelijken: de
  // regel wordt met USER_ENTERED geschreven, dus Sheets kan '28-08-2026' als échte datum opslaan
  // en in een andere schrijfwijze terugformatteren.
  'Ontwikkeling': { tekst:[0,1,2,3,5], datum:[4] },
};
// Veldnamen per kolom voor tabbladen die NIET uit parseSections komen. De vingerafdruk moet
// beide kanten via dezelfde weg bouwen (rij-object → cellen), en buiten Nog Te Doen/Afgerond
// bestaat SECS[r._sec] niet.
const OBJ_KOLOMMEN = {
  'Logboek': ['timestamp','code','sectie','actie','veld','oudeWaarde','nieuweWaarde','gebruiker'],
  'Ontwikkeling': ['titel','categorie','inhoud','door','datum','status'],   // zie parseOntw
};
// Welke kolom de deadline draagt verschilt per sectie van 'Nog Te Doen' (zie SECS.keys):
// OPPAKKEN D(3) · VERGADERVERZOEKEN F(5) · OFFERTE-TRAJECTEN C(2)+F(5) · LOD F(5)
// · SUBSIDIE-TRAJECTEN F(5). Let op: bij subsidie is D de FASE, geen datum — daar
// mag dus geen datumopmaak op.
const NTD_DATUM = { OPPAKKEN:[3], VERGADERVERZOEKEN:[5], 'OFFERTE-TRAJECTEN':[2,5], LOD:[5], 'SUBSIDIE-TRAJECTEN':[5] };

// Welke kolom de OMSCHRIJVING draagt, per sectie — afgeleid uit OMSCHRIJVING_SLEUTEL (config.js)
// en de kolomvolgorde in SECS.keys, zodat er geen vierde plek ontstaat waar dezelfde afspraak
// los kan gaan lopen. Levert: OPPAKKEN/LOD/SUBSIDIE index 2 (kolom C, zat er al in via
// spec.tekst), VERGADERVERZOEKEN index 3 (kolom D, Agendapunten) en OFFERTE-TRAJECTEN index 6
// (kolom G, Opmerkingen).
//
// WAAROM dit erbij moet: de guard vergeleek alleen A, C en de deadlinekolom. Bij een
// vergaderverzoek of een offertetraject staat de eigenlijke tekst NIET in C, dus een collega die
// de agendapunten aanvult veranderde niets aan de vingerafdruk — en submitTask schrijft de HELE
// rij A..K terug. Zijn aanvulling verdween dan zonder melding en zonder spoor in het Logboek.
// D en G worden door niets in Apps Script op een bestaande rij geschreven (cd_createTaskRow raakt
// ze alleen bij het aanmaken), dus ze kunnen geen vals alarm van de backend geven.
const NTD_OMSCHRIJVING = Object.fromEntries(SKEYS.map(sec=>{
  const i=(SECS[sec]?.keys||[]).indexOf(OMSCHRIJVING_SLEUTEL[sec]);
  return [sec, i>=0 ? [i] : []];
}));

// Eén cel vergelijkbaar maken. isDatum → vergelijk op de GEPARSEERDE datum, nooit op de tekst:
// het dashboard houdt '17-06-2026' in het geheugen terwijl values.get (FORMATTED_VALUE)
// '17 juni 2026' teruggeeft. Onherkenbaar als datum → val terug op de tekst ('sept/okt', '2/3').
function _normCel(v, isDatum){
  const s=leegBijErfenis(v);
  if(!isDatum||!s) return s;
  const d=_parseAnyDate(s);              // geeft {y,m,d} of null
  return d ? `${d.y}-${d.m}-${d.d}` : s;
}

// Vingerafdruk van één rij. `rij` is ALTIJD een cel-array (zoals values.get hem teruggeeft);
// een rij-object gaat er eerst met _rijNaarCellen doorheen. Beide kanten van de vergelijking
// door dezelfde functie halen is de hele truc — anders lopen trim en datumvorm uiteen.
// Onbekend tabblad → val terug op kolom A, zodat een nieuw tabblad nooit stil de guard uitzet.
// `negeerNummer` maakt de vergelijking SYMMETRISCH: kent de kant die we verwachten geen
// taaknummer, dan mag de teruggelezen kant het zijne ook niet gebruiken. Zonder dat zou een
// rij-object zonder nummer tegenover een Sheet-rij mét nummer ALTIJD als mismatch gelden en dus
// elke schrijfactie blokkeren — een vals alarm, want 'ik ken het nummer niet' is geen bewijs dat
// het de verkeerde rij is. Gemeten op staging 2026-07-29; zonder deze regel blokkeerde zelfs een
// volstrekt ongewijzigde rij.
function vingerafdruk(sheetName, rij, sec, negeerNummer){
  const spec=FP_KOLOMMEN[sheetName];
  rij=rij||[];
  if(!spec) return _normCel(rij[0]);
  const datumKol=spec.datum || (sheetName==='Nog Te Doen' ? (NTD_DATUM[sec]||[]) : []);
  // De omschrijvingskolom telt alleen mee op 'Nog Te Doen'; daar is hij per sectie een andere.
  // Ontdubbelen: bij Oppakken/LOD/Subsidie is het kolom C, en die staat al in spec.tekst.
  const omsKol=(sheetName==='Nog Te Doen') ? (NTD_OMSCHRIJVING[sec]||[]) : [];
  const idx=[...new Set(spec.tekst.concat(datumKol, omsKol))].sort((a,b)=>a-b);
  // Ontbrekende cel → '' : values.get kapt afsluitende lege cellen én lege rijen af, dus een rij
  // met lege staartkolommen komt korter terug dan hij in de Sheet staat.
  const inhoud=idx.map(i=>_normCel(rij[i], datumKol.includes(i))).join('\x1f');
  // Het taaknummer (kolom Q) en de inhoud doen ALLEBEI mee, gescheiden door \x1e.
  //   nummer  → "schrijf ik naar de juiste RIJ?"  (dat lost fase 4 op)
  //   inhoud  → "heeft iemand deze taak intussen gewijzigd?"
  // Alleen op het nummer vergelijken zou het tweede laten vallen: een collega die met de hand
  // in de Sheet iets aanpast, zou dan zonder waarschuwing overschreven worden. Met z'n drieën
  // in dezelfde lijst is een stille overschrijving erger dan een extra melding.
  const nr=negeerNummer ? '' : leegBijErfenis(rij[16]);
  return (nr && nr!=='TaakID') ? 'T:'+nr+'\x1e'+inhoud : inhoud;
}

// Uit een vingerafdruk het nummer-deel halen (leeg als er geen nummer in zit). Hiermee kan de
// guard onderscheiden WAT er mis is: zelfde nummer + andere inhoud = iemand heeft deze taak
// gewijzigd; ander nummer = de rij is verschoven. Twee heel verschillende meldingen.
const _nummerDeel = fp => (fp||'').startsWith('T:') ? (fp.split('\x1e')[0]) : '';

// Rij-OBJECT → cel-array, zodat geheugen en verse lezing dezelfde weg volgen.
// 'Nog Te Doen' én 'Afgerond' komen allebei uit parseSections en dragen dus SECS-velden op de
// kolomvolgorde van hun sectie. Let op: die volgorde is NIET de volgorde waarin de velden in het
// object staan — 'actiepunt' is kolom C (index 2), niet index 1. Vandaar SECS.keys en geen
// eigen lijstje.
function _rijNaarCellen(sheetName, r){
  r=r||{};
  if(!FP_KOLOMMEN[sheetName]) return [];
  const eigen=OBJ_KOLOMMEN[sheetName];
  if(eigen) return eigen.map(k=>r[k] ?? '');   // vaste kolomvolgorde, niet via SECS
  const keys=(SECS[r._sec]||{}).keys||[];
  const uit=keys.map(k=>r[k] ?? '');
  while(uit.length<8) uit.push('');            // OFFERTE heeft 7 velden → vul tot H
  if(sheetName==='Afgerond') uit[8]=r.datum ?? '';   // I = datum afgerond
  // Q = vast taaknummer, op BEIDE tabbladen die het dragen. 'Afgerond' stond hier niet bij, en
  // juist dáár zijn bulk-afgeronde tweelingrijen inhoudelijk identiek (zelfde code, tekst en
  // datum) — alleen kolom Q onderscheidt ze nog. De undo-delete keurde dan de verkeerde tweeling
  // goed als het archief net verschoven was (naloop 2026-08-28).
  if((sheetName==='Nog Te Doen'||sheetName==='Afgerond') && r.taakId) uit[16]=r.taakId;
  return uit;
}
// Vingerafdruk rechtstreeks uit een rij-object.
const rijVingerafdruk=(sheetName, r)=>vingerafdruk(sheetName, _rijNaarCellen(sheetName, r), r&&r._sec);

// ── Bescherming tegen schrijven naar de verkeerde rij ──────────────────────
// Pure (testbaar): gegeven de teruggelezen rijen (vanaf minRow) en de verwachte checks → geef de
// eerste mismatch terug, of null als alles klopt. `maak` zet een ruwe rij om in de te vergelijken
// waarde; zonder `maak` is dat de kale kolom-A-waarde (het gedrag van vóór v9.6).
function _rowMismatch(vals, minRow, checks, maak){
  for(const c of checks){
    const ruw=vals[c.row-minRow]||[];
    const got=maak ? maak(ruw, c) : ((ruw[0]||'').toString().trim());
    const exp=(c.code||'').toString().trim();
    if(got!==exp) return { row:c.row, expected:exp, got };
  }
  return null;
}
// Bouwt de A1-range over de vingerafdruk-kolommen; escapet apostrofs in de tabblad-naam
// (bv. "ALV's overzicht" → 'ALV''s overzicht'!A..). Altijd t/m S: dat dekt élke kolom die in
// FP_KOLOMMEN voorkomt (die blijven binnen A..I), plus kolom Q met het vaste taaknummer en
// R/S met het bundelnummer en volgnummer. Het blijft ÉÉN aaneengesloten range en dus één
// leesverzoek — de guard wordt er niet duurder van; alleen twee cellen per rij breder.
//
// R en S doen in de VINGERAFDRUK niet mee en dat blijft zo (zie de kop van bundel-acties.js:
// wat wij zelf wijzigen mag de guard niet als verschil zien). Ze worden gelezen omdat
// `assertRowsMatch` de gelezen rijen teruggeeft en `koppelTaak` de bundelstand van de DOELrij
// uit de Sheet moet kunnen aflezen in plaats van uit zijn eigen, mogelijk verouderde geheugen.
// Nagemeten op 2026-08-18 via de API, op PROD én TEST: élk tabblad waar deze guard vandaag op
// draait is minstens 19 kolommen breed ('Nog Te Doen' precies 19, de rest 26). Komt er ooit een
// smaller blad bij, kijk dan eerst of values.get daar niet op struikelt.
function _a1Bereik(sheetName, minR, maxR){
  return `'${(sheetName||'').replace(/'/g,"''")}'!A${minR}:S${maxR}`;
}
// Leest de vingerafdruk-kolommen van de doelrij(en) terug en gooit een ROW_MISMATCH-fout als een
// rij niet meer dezelfde taak bevat. Eén GET dekt het hele rijbereik. backgroundWrite vangt de fout.
// Geeft de teruggelezen rijen terug als Map<rijnummer, cel-array>, zodat een aanroeper een kolom
// die BUITEN de vingerafdruk valt alsnog kan aflezen zonder een tweede leesverzoek. Dat is geen
// extraatje: `koppelTaak` moet weten wat er nú in kolom R van de doelrij staat, en die vraag is
// per definitie niet met de vingerafdruk te beantwoorden.
// Een check is óf {row, r} met het rij-OBJECT (volle vingerafdruk) óf {row, code} (alleen kolom A,
// de oude vorm — nog in gebruik op de tabbladen waar kolom A al onderscheidend genoeg is).
// Let op: deze guard zit binnen de writeFn en dus binnen _withRetry — bij een 429/5xx draait hij
// tot drie keer. Dat is bewust: een herkansing ná een storing moet opnieuw controleren.
async function assertRowsMatch(checks, sheetName='Nog Te Doen'){
  const cs=(checks||[]).filter(c=>c&&c.row).map(c=>{
    // Rij-object én een tabblad met vingerafdruk-spec → de volle vergelijking.
    if(c.r && FP_KOLOMMEN[sheetName]){
      // heeftNr: kent de verwachte kant een taaknummer? Zo niet, dan mag de teruggelezen kant
      // het zijne ook niet gebruiken — anders blokkeert de guard op 'ik weet het niet'.
      // Ook op 'Afgerond': archiefrijen dragen sinds fase 4 hetzelfde nummer in Q, en rijen van
      // vóór de backfill vallen via deze zelfde voorwaarde vanzelf terug op inhoud-alleen.
      const heeftNr=!!((sheetName==='Nog Te Doen'||sheetName==='Afgerond') && c.r.taakId);
      return { row:c.row, fp:true, sec:c.r._sec, heeftNr, code:rijVingerafdruk(sheetName, c.r) };
    }
    // Rij-object op een tabblad zónder spec: val terug op de sleutel in kolom A i.p.v. te
    // vergelijken met een lege vingerafdruk — dat laatste zou élke schrijfactie blokkeren.
    if(c.r) return { row:c.row, code:((c.r.code ?? c.r.id ?? c.r.titel ?? c.r.timestamp ?? '')+'').trim() };
    return { row:c.row, code:(c.code||'').toString().trim() };
  });
  if(!cs.length) return new Map();
  const rows=cs.map(c=>c.row), minR=Math.min(...rows), maxR=Math.max(...rows);
  const vals=await fetchSheet(_a1Bereik(sheetName, minR, maxR));
  const mm=_rowMismatch(vals, minR, cs, (ruw,c)=>c.fp
    ? vingerafdruk(sheetName, ruw, c.sec, !c.heeftNr)
    : ((ruw[0]||'').toString().trim()));
  if(mm){
    const err=new Error('De lijst was net gewijzigd — opnieuw geladen.');
    err.rowMismatch=true; err.detail=mm;
    // Zelfde taaknummer maar andere inhoud → het is wél de juiste rij, maar iemand heeft de taak
    // intussen aangepast. Dat is een heel ander verhaal dan 'de rij is verschoven', en verdient
    // een melding die de gebruiker ook echt kan plaatsen.
    const nrOud=_nummerDeel(mm.expected);
    err.zelfdeTaak = !!nrOud && nrOud===_nummerDeel(mm.got);
    err.melding = err.zelfdeTaak
      ? 'Iemand heeft deze taak net gewijzigd. Je scherm is bijgewerkt — kijk even en probeer opnieuw.'
      : 'De lijst was net gewijzigd — opnieuw geladen, probeer nog eens.';
    throw err;
  }
  return new Map(cs.map(c=>[c.row, vals[c.row-minR]||[]]));
}
// Achterwaarts compatibel: een STRING blijft de oude kolom-A-controle, een rij-OBJECT geeft de
// volle vingerafdruk. Zo kon elke callsite los mee, zonder big-bang.
const assertRowMatch=(row, bronOfCode, sheetName)=>assertRowsMatch(
  [(bronOfCode && typeof bronOfCode==='object') ? { row, r:bronOfCode } : { row, code:bronOfCode }], sheetName);

export { NTD_DATUM, isOffline, fetchMetKlok, _isOffline, _isNetwerkFout, fetchSheet, fetchSheets, writeRange, writeRows, appendRange, appendRows, veiligeCel, _veiligeRij, _shiftNtdRows, _shiftAfRows, _herstelShift, _isTransient, _withRetry, askChat, _rowMismatch, _a1Bereik, vingerafdruk, rijVingerafdruk, _nummerDeel, _normCel, _rijNaarCellen, assertRowsMatch, assertRowMatch, NTD_OMSCHRIJVING, sheetsFetch };
