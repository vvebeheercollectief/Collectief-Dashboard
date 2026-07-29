// ══════════════════════════════════════
//  DATA — laden, parsen, achtergrond-schrijven, sync-indicator
// ══════════════════════════════════════
import { parseDt, _parseAnyDate, coerceDagenVooraf, leegBijErfenis } from "./util.js";
import { state, D } from "./state.js";
import { SKEYS, SECS } from "./config.js";
import { fetchSheet, fetchSheets, _withRetry } from "./api.js";
import { ensureToken } from "./auth.js";
import { buildAnalytics, buildDash } from "./render-analytics.js";
import { renderNtdDonut } from "./render-lijsten.js";
import { parseOntw, parseLogboek } from "./render-overig.js";
import { parseKenmerken } from "./kenmerken.js";
import { checkSecties, checkNummers } from "./structuurcheck.js";
import { ico } from "./icons.js";
// (kringverwijzing data ⇄ kenmerken: aanroepen gebeuren op runtime — live bindings, veilig)
import { showToast } from "./notifications.js";
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
      await _withRetry(writeFn);
    }catch(e){
      try{ rollback(); renderAll(); }catch(_){}
      const msg=(e.message||'').toLowerCase();
      if(e&&e.rowMismatch){
        // De doelrij was verschoven (Sheet tussentijds gewijzigd) → niet geschreven, teruggedraaid.
        showToast(foutTitel,'De lijst was net gewijzigd — opnieuw geladen, probeer nog eens.','var(--rd)');
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
}
function setSyncErr(){dot('err');document.getElementById('sync-lbl').textContent='Fout'}
function dot(cls){const d=document.getElementById('dot');d.className='dot'+(cls?' '+cls:'')}

// Nette foutmelding in beeld bij een harde laadfout (niet de zwijgende achtergrond-polls).
// Een verlopen sessie wordt elders al via het inlogscherm afgevangen; dit vangt
// netwerk-/API-fouten zodat de gebruiker geen blanco scherm ziet maar uitleg + actie.
function showLoadError(){
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
// De acht tabbladen die elke poll gelezen worden, in de volgorde waarin loadAll ze uitpakt.
const POLL_TABS=["Nog Te Doen","Afgerond","ALV's overzicht","ALV's afgerond",
                 "Ontwikkeling","Logboek","Herhaalregels","Kenmerken"];

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
      if(!silent || state._syncFails>=2) setSyncErr();
      if(!silent) showLoadError();
      return;
    }
    if(!silent) setSyncing();
    // Reads met herkansing bij tijdelijke API-fouten (429 / 5xx / netwerk-blip), zodat
    // één hapering niet meteen de hele ronde laat falen en 'Fout' toont.
    const lees=(naam)=>_withRetry(()=>fetchSheet(naam));
    let ntdR,afR,alvoR,alfaR,ontwR,logR,hhR,kmkR;
    try{
      // Eén batchGet i.p.v. acht losse reads — zie fetchSheets: acht aparte verzoeken
      // per poll was precies de Google-leeslimiet van 60 per minuut, waardoor elke
      // gebruikersactie erbovenop 'Quota exceeded' opleverde.
      [ntdR,afR,alvoR,alfaR,ontwR,logR,hhR,kmkR]=await _withRetry(()=>fetchSheets(POLL_TABS));
    }catch(e){
      // Terugval op losse reads. batchGet faalt in z'n geheel als één tabblad ontbreekt;
      // de oude weg levert de optionele tabbladen dan alsnog los aan (duurder, maar werkt).
      console.warn('batchGet mislukt, terugval op losse reads:', e.message);
      [ntdR,afR,alvoR,alfaR,ontwR,logR,hhR,kmkR]=await Promise.all([
        lees("Nog Te Doen"),lees("Afgerond"),
        lees("ALV's overzicht"),lees("ALV's afgerond"),
        lees("Ontwikkeling").catch(()=>[]),
        lees("Logboek").catch(()=>[]),
        lees("Herhaalregels").catch(()=>[]),
        lees("Kenmerken").catch(()=>[]),
      ]);
    }
    state._syncFails=0; // alle reads geslaagd
    // Kwam er tijdens het lezen een schrijfactie tussen? Dan is de lokale (optimistische)
    // staat leidend; de eigen resync van die schrijfactie haalt zo de verse data op.
    if(state.pendingWrites>0){ if(!silent) setSynced(); return; }
    const ntdP=parseSections(ntdR); D.ntd=ntdP.data; D.ntdSecInfo=ntdP.secInfo;
    const afP=parseSections(afR); D.af=afP.data; D.afSecInfo=afP.secInfo;
    // Fase 3, trap 1: alleen meekijken. Zodra dit een tijd lang stil blijft op gezonde data
    // gaat de banner aan (trap 2). Nooit blokkerend — dit mag het laden niet beïnvloeden.
    try{
      const bev=[...checkSecties(ntdR), ...checkSecties(afR), ...checkNummers(Object.values(D.ntd||{}).flat())];
      if(bev.length) console.warn('[structuurcheck]', bev);
    }catch(e){ console.warn('[structuurcheck] overgeslagen:', e.message); }
    SKEYS.forEach(s=>{if(D.af[s])D.af[s].sort((a,b)=>parseDt(b.datum)-parseDt(a.datum))});
    D.alvo=parseAlvo(alvoR);
    D.alfa=parseAlfa(alfaR);
    D.ontw=parseOntw(ontwR);
    D.logboek=parseLogboek(logR);
    D.herhaal=parseHerhaal(hhR);
    D.kenmerken=parseKenmerken(kmkR);
    setSynced();
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek,D.herhaal,D.kenmerken]);
    if(hash!==state._lastDHash){
      state._lastDHash=hash;
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
    if(!silent || state._syncFails>=2) setSyncErr();
    if(!silent) showLoadError(); // alleen bij eerste/handmatige lading, niet bij zwijgende polls
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
};
