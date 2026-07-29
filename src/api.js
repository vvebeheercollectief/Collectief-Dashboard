import { state, D } from "./state.js";
import { SID, SKEYS, PROXY_URL, SECS } from "./config.js";
import { _parseAnyDate, leegBijErfenis } from "./util.js";

async function fetchSheet(name){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(name)}`,{
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
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchGet?${qs}`,{
    cache:'no-store',
    headers:{Authorization:`Bearer ${state.oauthToken}`}
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'API fout');err.status=r.status;throw err}
  const vr=(await r.json()).valueRanges||[];
  // batchGet levert valueRanges in dezelfde volgorde als de meegegeven ranges.
  // Een leeg tabblad komt terug zónder 'values'; dat wordt een lege lijst.
  return names.map((_,i)=>(vr[i]&&vr[i].values)||[]);
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
  const r=await fetch(url,opts);
  if(!r.ok){const e=await r.json();if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Schrijffout');err.status=r.status;throw err}
  return r.json();
}
async function appendRange(range,values){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:[_veiligeRij(values)]})});
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
  const r = await fetch(PROXY_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${state.oauthToken}` },
    body: JSON.stringify({ system, messages }),
  });
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
};
// Welke kolom de deadline draagt verschilt per sectie van 'Nog Te Doen' (zie SECS.keys):
// OPPAKKEN D(3) · VERGADERVERZOEKEN F(5) · OFFERTE-TRAJECTEN C(2)+F(5) · LOD F(5).
const NTD_DATUM = { OPPAKKEN:[3], VERGADERVERZOEKEN:[5], 'OFFERTE-TRAJECTEN':[2,5], LOD:[5] };

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
function vingerafdruk(sheetName, rij, sec){
  const spec=FP_KOLOMMEN[sheetName];
  rij=rij||[];
  if(!spec) return _normCel(rij[0]);
  // Heeft de rij een vast taaknummer (kolom Q), dan ÍS dat de identiteit en doet de rest niet
  // meer mee. Dit is het eindstation waar fase 4 op mikte: de vingerafdruk blijft alleen het
  // vangnet voor rijen van vóór de backfill of van een client die nog oude code draait.
  const nr=leegBijErfenis(rij[16]);
  if(nr && nr!=='TaakID') return 'T:'+nr;
  const datumKol=spec.datum || (sheetName==='Nog Te Doen' ? (NTD_DATUM[sec]||[]) : []);
  const idx=spec.tekst.concat(datumKol).sort((a,b)=>a-b);
  // Ontbrekende cel → '' : values.get kapt afsluitende lege cellen én lege rijen af, dus een rij
  // met lege staartkolommen komt korter terug dan hij in de Sheet staat.
  return idx.map(i=>_normCel(rij[i], datumKol.includes(i))).join('\x1f');
}

// Rij-OBJECT → cel-array, zodat geheugen en verse lezing dezelfde weg volgen.
// 'Nog Te Doen' én 'Afgerond' komen allebei uit parseSections en dragen dus SECS-velden op de
// kolomvolgorde van hun sectie. Let op: die volgorde is NIET de volgorde waarin de velden in het
// object staan — 'actiepunt' is kolom C (index 2), niet index 1. Vandaar SECS.keys en geen
// eigen lijstje.
function _rijNaarCellen(sheetName, r){
  r=r||{};
  if(!FP_KOLOMMEN[sheetName]) return [];
  const keys=(SECS[r._sec]||{}).keys||[];
  const uit=keys.map(k=>r[k] ?? '');
  while(uit.length<8) uit.push('');            // OFFERTE heeft 7 velden → vul tot H
  if(sheetName==='Afgerond') uit[8]=r.datum ?? '';   // I = datum afgerond
  if(sheetName==='Nog Te Doen' && r.taakId) uit[16]=r.taakId;   // Q = vast taaknummer
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
// (bv. "ALV's overzicht" → 'ALV''s overzicht'!A..). Altijd t/m I: dat dekt élke kolom die in
// FP_KOLOMMEN voorkomt, plus kolom Q met het vaste taaknummer. Het blijft ÉÉN aaneengesloten
// range en dus één leesverzoek — de guard wordt er niet duurder van.
function _a1Bereik(sheetName, minR, maxR){
  return `'${(sheetName||'').replace(/'/g,"''")}'!A${minR}:Q${maxR}`;
}
// Leest de vingerafdruk-kolommen van de doelrij(en) terug en gooit een ROW_MISMATCH-fout als een
// rij niet meer dezelfde taak bevat. Eén GET dekt het hele rijbereik. backgroundWrite vangt de fout.
// Een check is óf {row, r} met het rij-OBJECT (volle vingerafdruk) óf {row, code} (alleen kolom A,
// de oude vorm — nog in gebruik op de tabbladen waar kolom A al onderscheidend genoeg is).
// Let op: deze guard zit binnen de writeFn en dus binnen _withRetry — bij een 429/5xx draait hij
// tot drie keer. Dat is bewust: een herkansing ná een storing moet opnieuw controleren.
async function assertRowsMatch(checks, sheetName='Nog Te Doen'){
  const cs=(checks||[]).filter(c=>c&&c.row).map(c=>{
    // Rij-object én een tabblad met vingerafdruk-spec → de volle vergelijking.
    if(c.r && FP_KOLOMMEN[sheetName]) return { row:c.row, fp:true, sec:c.r._sec, code:rijVingerafdruk(sheetName, c.r) };
    // Rij-object op een tabblad zónder spec: val terug op de sleutel in kolom A i.p.v. te
    // vergelijken met een lege vingerafdruk — dat laatste zou élke schrijfactie blokkeren.
    if(c.r) return { row:c.row, code:((c.r.code ?? c.r.id ?? c.r.titel ?? c.r.timestamp ?? '')+'').trim() };
    return { row:c.row, code:(c.code||'').toString().trim() };
  });
  if(!cs.length) return;
  const rows=cs.map(c=>c.row), minR=Math.min(...rows), maxR=Math.max(...rows);
  const vals=await fetchSheet(_a1Bereik(sheetName, minR, maxR));
  const mm=_rowMismatch(vals, minR, cs, (ruw,c)=>c.fp
    ? vingerafdruk(sheetName, ruw, c.sec)
    : ((ruw[0]||'').toString().trim()));
  if(mm){ const err=new Error('De lijst was net gewijzigd — opnieuw geladen.'); err.rowMismatch=true; err.detail=mm; throw err; }
}
// Achterwaarts compatibel: een STRING blijft de oude kolom-A-controle, een rij-OBJECT geeft de
// volle vingerafdruk. Zo kon elke callsite los mee, zonder big-bang.
const assertRowMatch=(row, bronOfCode, sheetName)=>assertRowsMatch(
  [(bronOfCode && typeof bronOfCode==='object') ? { row, r:bronOfCode } : { row, code:bronOfCode }], sheetName);

export { fetchSheet, fetchSheets, writeRange, appendRange, veiligeCel, _veiligeRij, _shiftNtdRows, _herstelShift, _isTransient, _withRetry, askChat, _rowMismatch, _a1Bereik, vingerafdruk, rijVingerafdruk, _normCel, _rijNaarCellen, assertRowsMatch, assertRowMatch };
