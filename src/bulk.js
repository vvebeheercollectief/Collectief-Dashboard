// ══════════════════════════════════════
//  BULK-ACTIES — selecteren + groepsacties op de NTD-lijst (Fase 5)
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";
import { toDutchDate, berekenPrioriteit, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt, kiesAfgerondRij } from "./util.js";
import { SID } from "./config.js";
import { ensureToken } from "./auth.js";
import { _shiftNtdRows, _herstelShift, assertRowsMatch, _veiligeRij } from "./api.js";
import { getSheetIds, getAfInsertRow, getInsertRow, insertAndWriteRow, serializeNtdUndo, afrondWaarden } from "./crud.js";
import { backgroundWrite, loadAll, metWriteMarkering, blokkeerOffline } from "./data.js";
import { showToast, showUndoToast, fireNotifEvent } from "./notifications.js";
import { vraagBevestiging } from "./bevestig.js";
import { logEvents } from "./render-overig.js";
import { renderAll } from "./main.js";

const _sel = new Set();   // geselecteerde taak-objecten (rij-referenties in D)

// Pure helper (testbaar): verwerk-volgorde hoog→laag _row, zodat
// rij-verwijderingen in de Sheet elkaars indexen niet verschuiven.
function _bulkVolgorde(rows){ return [...rows].sort((a,b)=>b._row-a._row); }

function bulkGeselecteerd(r){ return _sel.has(r); }
function bulkSelectie(){ return _bulkVolgorde(_sel); }

function toggleBulkMode(){
  state.bulkMode=!state.bulkMode;
  _sel.clear();
  document.getElementById('bulk-btn').classList.toggle('on',state.bulkMode);
  renderNtd();
  renderBulkUi();
}
function bulkVink(rid){
  const r=state._rowCache[rid]; if(!r) return;
  _sel.has(r)?_sel.delete(r):_sel.add(r);
  renderNtd();
  renderBulkUi();
}
function bulkWis(){ _sel.clear(); }
function renderBulkUi(){
  const teller=document.getElementById('bulk-teller');
  const balk=document.getElementById('bulk-balk');
  teller.style.display=state.bulkMode?'':'none';
  teller.textContent=`${_sel.size} geselecteerd`;
  balk.style.display=(state.bulkMode&&_sel.size>0)?'flex':'none';
  document.body.classList.toggle('bulk', state.bulkMode); // zwevende chat-knop wijkt voor de bulk-balk
  if(!state.bulkMode) _sluitMenus();
}
function toggleBulkMenu(menu){
  const el=document.getElementById('bb-menu-'+menu);
  const open=el.classList.contains('open');
  _sluitMenus();
  if(!open) el.classList.add('open');
}
function _sluitMenus(){ document.querySelectorAll('.bb-menu').forEach(m=>m.classList.remove('open')); }

// ── Bulk-acties ─────────────────────────────────────────────────────────
// Kolomletters in 'Nog Te Doen': behandelaar is overal E (keys-index 4);
// deadline is D bij OPPAKKEN (index 3) en F bij de andere vier (index 5).
const BULK_BEH_KOLOM='E';
const BULK_DEADLINE_KOLOM={OPPAKKEN:'D',VERGADERVERZOEKEN:'F','OFFERTE-TRAJECTEN':'F',LOD:'F','SUBSIDIE-TRAJECTEN':'F'};
const OPVOLG_KOLOM='L';

// Serialiseer een taakrij naar de NTD-kolomwaarden — gedeelde bron in crud.js
// (serializeNtdUndo: kolommen A..P incl. offerte-fase O + aannemers P).
const _ntdValues=serializeNtdUndo;

function _eindBulk(){
  state.bulkMode=false; bulkWis();
  document.getElementById('bulk-btn').classList.remove('on');
  renderAll(); renderBulkUi();
}

async function bulkDoe(el){
  const wat=el.dataset.wat;
  const rows=bulkSelectie();             // hoog→laag _row
  if(!rows.length) return;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  _sluitMenus();
  if(wat==='afronden')    bulkAfronden(rows);
  else if(wat==='geven')  bulkVeld(rows,'geven',el.dataset.naam);
  else if(wat==='wegleggen'){
    let iso=document.getElementById('bb-datum-weg').value;
    if(el.dataset.dagen){ const d=new Date(); d.setDate(d.getDate()+ +el.dataset.dagen);
      iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    if(!iso){ alert('Kies een datum.'); return; }
    // Zelfde guards als de losse snooze: geen verleden-datum, en waarschuw bij ná-deadline.
    const nieuw=toDutchDate(iso);
    const p=_parseAnyDate(nieuw); const dWeg=p?new Date(p.y,p.m-1,p.d):null;
    if(!dWeg||_verschilInKalenderdagen(dWeg,_vandaagAmsterdam())<=0){ alert('Kies een datum in de toekomst.'); return; }
    const naDeadline=rows.filter(r=>{ const dl=parseDt(r.deadline); return dl && dWeg.getTime()>dl; });
    // De staart van de vraag ('Toch wegleggen?') zit in het knoplabel en niet in de tekst: het
    // venster stelt zijn vraag mét knoppen, en dan zou hij er twee keer staan. Waar `confirm()` de
    // twee zinnen met een `\n` scheidde, doet het venster dat met titel/tekst — dit venster zet zijn
    // tekst via `textContent`, dus een `\n` zou daar geen regelovergang meer geven.
    // Niet 'gevaarlijk' (de rode knop): wegleggen verplaatst een datum en is met dezelfde knop terug
    // te draaien. Het rood hangt in deze app aan de drie verwijder-vragen en aan niets anders —
    // zelfs afronden vraagt met de gewone knop (crud.js), want dat opent alleen het afrond-scherm.
    // De vraag blijft staan wáár `confirm()` stond: ná `blokkeerOffline`/`ensureToken` bovenaan
    // `bulkDoe`. Dat is de omgekeerde volgorde van de losse snooze (die vraagt eerst), maar
    // veranderen zou hier meer omgooien dan dit traject beoogt — beide poorten gelden voor álle
    // bulk-acties samen en staan daarom vóór de vertakking.
    if(naDeadline.length && !await vraagBevestiging({
        titel:'Wegleggen ná de deadline?',
        tekst:`Voor ${naDeadline.length} van de ${rows.length} ${rows.length===1?'taak':'taken'} ligt deze opvolgdatum ná de deadline. `+
              `${naDeadline.length===1?'Die taak wordt':'Die taken worden'} op de deadline gewoon "Te laat".`,
        bevestigTekst:'Toch wegleggen' })) return;
    bulkVeld(rows,'wegleggen',nieuw);
  }
  else if(wat==='deadline'){
    const iso=document.getElementById('bb-datum-dl').value;
    if(!iso){ alert('Kies een datum.'); return; }
    bulkVeld(rows,'deadline',toDutchDate(iso));
  }
  // Als enige tak geAWAIT: `bulkVerwijderen` is sinds de eigen bevestigingsvraag async, en de
  // andere takken zijn dat niet. Zonder `await` zou `bulkDoe` al klaar zijn terwijl de vraag nog in
  // beeld staat. Voor de app maakt dat vandaag niets uit — de klik-delegatie in actions.js doet
  // `if (fn) fn(el, e);` en kijkt niet naar wat er terugkomt — maar het houdt het contract van
  // `bulkDoe` heel: hij is pas klaar als de handeling klaar is. Dat contract staat of valt met één
  // assert in de zelftest ('bulkDoe blijft lopen zolang de vraag onbeantwoord is'), die `bulkDoe`
  // ECHT await en meet dat hij nog loopt terwijl het venster openstaat. Zonder die ene assert zou
  // het weghalen van deze `await` de hele suite groen laten: de testhelper `vraag()` wacht op het
  // ÓPENEN van het venster, en dat gebeurt al synchroon binnen `bulkVerwijderen`.
  else if(wat==='verwijderen') await bulkVerwijderen(rows);
}

// ── Afronden (verplaats naar 'Afgerond') ────────────────────────────────
function bulkAfronden(rows){
  const d=new Date();
  const vandaag=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const items=rows.map(r=>{
    // Zelfde bron als de losse afrond-modal (crud.js), zodat bulk en modal niet uiteen kunnen
    // lopen — vroeger stond dezelfde kolomvolgorde hier een tweede keer uitgeschreven. Bulk
    // kent geen toelichtingveld, vandaar de lege J. De oude `default`-tak was letterlijk de
    // LOD-opbouw; die staat nu als eigen case in afrondWaarden.
    const values=afrondWaarden(r, r._sec, vandaag, '');
    return { r, sec:r._sec, origRow:r._row, afValues:values, ntdValues:_ntdValues(r), code:r.code };
  });
  // optimistisch: hoog→laag lokaal verwijderen + indexen meeschuiven
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  _eindBulk();
  showUndoToast(`${items.length} taken afgerond`,items.map(i=>i.code).join(', '),()=>bulkUndoAfronden(items),'vinkCirkel');
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'], ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null||ntdSheetId==null) throw new Error('Sheet niet gevonden');
    await assertRowsMatch(items.map(it=>({row:it.origRow, r:it.r}))); // bescherming: alle rijen nog dezelfde TAAK vóór bulk-afronden
    // Atomair: ALLE items in één batchUpdate (Sheets past die alles-of-niets toe). Voorheen
    // liep dit per item in aparte fetches; faalde item 3, dan stonden 1 en 2 al server-side
    // afgerond terwijl de lokale rollback ze terugzette → spook-dubbels na de resync.
    // Verwerkvolgorde hoog→laag _row (deletes verschuiven elkaar niet); Afgerond-inserts op
    // dezelfde index stapelen correct binnen één batch.
    const requests=[];
    for(const it of items){
      const afAfterRow=getAfInsertRow(it.sec);
      requests.push(
        {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
        {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:it.afValues.length},
          rows:[{values:it.afValues.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
        {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}
      );
    }
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests})});
    if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-afronden fout');err.status=resp.status;throw err}
    // for…of i.p.v. forEach: in een forEach-callback kun je niet awaiten, en zonder await valt
    // de schrijfteller naar 0 terwijl de logboek-appends nog lopen (resync te vroeg, regel weg).
    // Eén append voor de hele bulk i.p.v. één per taak: 20 taken kostten zo 20 schrijfverzoeken.
    await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Afgerond',veld:'status',oudeWaarde:'Nog Te Doen',nieuweWaarde:'Afgerond op '+vandaag+' (bulk)'})));
  },()=>{ // rollback: laag→hoog terugzetten
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _herstelShift(_shiftNtdRows,it.origRow); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-afronden mislukt');
}
// Pure helper (testbaar): kies per item de ZOJUIST afgeronde Afgerond-rij. De keuze zelf staat in
// `kiesAfgerondRij` (util.js) en is gedeeld met de losse undo in notifications.js: eerst op het
// vaste taaknummer uit `ntdValues[16]`, en pas als dat er niet is op de VvE-code binnen de
// nieuwste-eerst gesorteerde lijst. Op code alleen is dat een gok zodra twee afrondingen van
// dezelfde VvE op dezelfde dag in dezelfde sectie staan — zie de toelichting bij die functie.
// Claim per rij zodat twee items met dezelfde code verschillende rijen pakken.
// Resultaat hoog→laag _row, zodat verwijderen de indexen niet door elkaar schuift.
function _bulkUndoAfDoelRijen(items, afPerSec){
  const claimed=new Set(), doel=[];
  for(const it of items){
    const r=kiesAfgerondRij(afPerSec[it.sec]||[], (it.ntdValues||[])[16], it.code, claimed);
    if(r){ claimed.add(r); doel.push(r); }
  }
  return doel.sort((a,b)=>b._row-a._row);
}

async function bulkUndoAfronden(items){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;
    await loadAll(true);                       // verse D.af zodat we de zojuist afgeronde rijen vinden
    // Pas hierná de teller ophogen: bínnen metWriteMarkering zou loadAll zijn verse data
    // weggooien (pendingWrites>0) en werkten we op een stale D.af.
    await metWriteMarkering(async()=>{
      const ids=await getSheetIds();
      // 1) Bepaal welke Afgerond-rijen weg moeten (nieuwste per code), hoog→laag _row.
      const teVerwijderen=_bulkUndoAfDoelRijen(items, D.af);
      // 2) EERST terugzetten in Nog Te Doen (per-sectie offset, getInsertRow verandert niet
      //    tussendoor), DAN pas weghalen uit Afgerond. Breekt de verbinding ertussen, dan staat
      //    de taak dubbel (zichtbaar, herstelbaar) in plaats van nergens (onzichtbaar, verloren).
      const offset={};
      for(const it of items){
        await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec)+(offset[it.sec]||0),it.ntdValues);
        offset[it.sec]=(offset[it.sec]||0)+1;
      }
      // Pas ná de lus loggen, in één append: de logregels zijn een journaal van deze ene
      // handeling en hoeven niet tussen de inserts door. Scheelt bij 20 taken 19 verzoeken.
      await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Teruggezet',veld:'status',oudeWaarde:'Afgerond',nieuweWaarde:'Nog Te Doen (bulk-undo)'})));
      // 3) Verwijder de Afgerond-rijen in één batch in aflopende _row-volgorde, zodat de
      //    delete-indexen elkaar niet verschuiven (i.t.t. de oude code die de oudste rij koos).
      //    De inserts hierboven raakten een ánder tabblad, dus deze _row-nummers kloppen nog.
      if(teVerwijderen.length){
        // 'Afgerond' had als énige tabblad een positionele deleteDimension zónder guard, en juist
        // op de undo-weg: de rij wordt weggegooid op grond van een onthouden rijnummer. Klopte dat
        // nummer niet meer, dan verdween er stil een ándere afronding. Nu eerst controleren.
        await assertRowsMatch(teVerwijderen.map(af=>({row:af._row, r:af})), 'Afgerond');
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:teVerwijderen.map(af=>({deleteDimension:{range:{sheetId:ids['Afgerond'],dimension:'ROWS',startIndex:af._row-1,endIndex:af._row}}}))})});
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-undo verwijderfout');err.status=resp.status;throw err}
      }
    });
    showToast('Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)','ongedaan');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// ── Verwijderen ─────────────────────────────────────────────────────────
// Async sinds de eigen bevestigingsvraag; zie de `await` bij de aanroep in `bulkDoe`.
async function bulkVerwijderen(rows){
  // Het aantal staat in de TITEL en niet op de knop: dat getal is waar de gebruiker zijn besluit op
  // neemt, en boven het venster is het niet te missen. De knop houdt het bij de handeling zelf.
  // `gevaarlijk` (de rode knop) omdat dit rijen uit de Sheet haalt — dezelfde keuze als bij het
  // losse verwijderen in crud.js. Er is een undo-toast, maar die is een vangnet en geen vrijbrief.
  // Bewust géén opsomming van de codes in de tekst: bij twintig taken wordt dat een muur waar de
  // vraag zelf in verdwijnt. Ze staan wél in de undo-toast hieronder.
  // 'Meteen daarna' is geen stijlkeuze maar een grens: die knop zit in de undo-toast, en die ruimt
  // zichzelf op na UNDO_DURATION — 8 seconden (notifications.js). Een kale belofte dat het 'nog
  // ongedaan te maken is' leest als onbeperkt, en dat is op een verwijdervraag precies de zin
  // waarop iemand te makkelijk doorklikt. De tijd zelf staat er niet in: de toast kan ook eerder
  // weg zijn, en een getal in deze tekst zou stil verouderen zodra die constante wijzigt.
  if(!await vraagBevestiging({
      titel:`${rows.length} ${rows.length===1?'taak':'taken'} verwijderen?`,
      tekst:`${rows.length===1?'Deze taak wordt':'Deze taken worden'} uit 'Nog Te Doen' gehaald. `+
            `Meteen daarna kun je dit nog ongedaan maken met de knop in de melding.`,
      bevestigTekst:'Verwijderen', gevaarlijk:true })) return;
  const items=rows.map(r=>({r,sec:r._sec,origRow:r._row,ntdValues:_ntdValues(r),code:r.code}));
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  _eindBulk();
  showUndoToast(`${items.length} taken verwijderd`,items.map(i=>i.code).join(', '),()=>bulkUndoVerwijderen(items),'prullenbak');
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const sheetId=ids['Nog Te Doen'];
    if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    await assertRowsMatch(items.map(it=>({row:it.origRow, r:it.r}))); // bescherming: alle rijen nog dezelfde TAAK vóór bulk-verwijderen
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:items.map(it=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}))})});
    if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-verwijderfout');err.status=resp.status;throw err}
    await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Verwijderd',veld:'',oudeWaarde:it.ntdValues[2]||'',nieuweWaarde:'(bulk)'})));
  },()=>{
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _herstelShift(_shiftNtdRows,it.origRow); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-verwijderen mislukt');
}
async function bulkUndoVerwijderen(items){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;
    await metWriteMarkering(async()=>{
      // Offset per sectie: getInsertRow leest D.ntd (verandert niet tussen inserts), dus zonder
      // offset belanden alle rijen op dezelfde positie en stapelen ze in omgekeerde volgorde.
      const offset={};
      for(const it of items){
        await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec)+(offset[it.sec]||0),it.ntdValues);
        offset[it.sec]=(offset[it.sec]||0)+1;
      }
      await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:'Teruggezet',veld:'status',oudeWaarde:'Verwijderd',nieuweWaarde:'Nog Te Doen (bulk-undo)'})));
    });
    showToast('Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)','ongedaan');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// ── Veld-acties: geven / wegleggen / deadline (cel-schrijfacties) ───────
function bulkVeld(rows,soort,waarde){
  const conf={
    geven:    { veld:'behandelaar', kolom:()=> BULK_BEH_KOLOM,             titel:`${rows.length} taken aan ${waarde} gegeven`,  icoon:'persoon',  log:'Behandelaar gewijzigd' },
    wegleggen:{ veld:'opvolgdatum', kolom:()=> OPVOLG_KOLOM,               titel:`${rows.length} taken weggelegd tot ${waarde}`, icoon:'belUit',   log:'Weggelegd' },
    deadline: { veld:'deadline',    kolom:(r)=>BULK_DEADLINE_KOLOM[r._sec],titel:`${rows.length} deadlines → ${waarde}`,        icoon:'kalender', log:'Deadline gewijzigd' },
  }[soort];
  // OPPAKKEN: een nieuwe deadline herberekent de opgeslagen prioriteit-kolom F mee
  // (zoals de losse bewerk-flow). Anders blijft F stale voor externe lezers.
  const oppDl = soort==='deadline';
  const items=rows.map(r=>({r,sec:r._sec,code:r.code,oud:r[conf.veld]||'',oudPrio:r.prioriteit||''}));
  items.forEach(it=>{
    it.r[conf.veld]=waarde;
    if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=berekenPrioriteit(waarde,'OPPAKKEN').prioriteit;
  });
  _eindBulk();
  // Atomair: ALLE cel-writes in één Sheets-batchUpdate (alles-of-niets), net als bulkAfronden.
  // Voorheen liep dit per item in losse writeRange-calls; faalde item k halverwege na een
  // niet-transient fout, dan stonden 0..k-1 al server-side terwijl de lokale rollback ze terugzette
  // → de Sheet liep vóór op het scherm tot de resync (en bij OPPAKKEN kon F/prio uit de pas lopen).
  // De `gelogd`-vlag (één voor de hele batch) overleeft _withRetry-herkansingen en houdt logEvent
  // (een append) idempotent: de updateCells zelf zijn idempotent (vaste waarde overschrijven).
  const schrijf=(welkeWaarde)=>{
    let gelogd=false, gemeld=false;
    return async()=>{
      // Bescherming: alle rijen nog dezelfde TAAK vóór bulk-celschrijf.
      // Let op de richting. Deze closure schrijft zowel de nieuwe waarde als (bij undo) de oude
      // terug, en het rij-object is op dát moment al bijgewerkt. De guard moet vergelijken met
      // wat er NU in de Sheet hoort te staan, en dat is juist de waarde die we NIET schrijven:
      // bij 'nieuw' staat de oude waarde er nog, bij 'oud' (undo) de zojuist geschreven nieuwe.
      // Zonder deze omkering zou elke bulk-deadline en elke bulk-undo gegarandeerd vals afgaan,
      // want de deadline zit in de vingerafdruk.
      await assertRowsMatch(items.map(it=>({
        row: it.r._row,
        r: { ...it.r, [conf.veld]: (welkeWaarde==='oud' ? waarde : it.oud) },
      })));
      // values:batchUpdate met USER_ENTERED — één atomaire POST (alles-of-niets) én zelfde
      // invoer-parsing als de modal-flow (writeRange): een datum-string wordt zo óók via bulk
      // een echte datum-waarde, niet platte tekst. (updateCells/stringValue zou RAW opslaan.)
      // Formule-rem: veiligeCel zit alleen in writeRange/appendRange, en deze route gebruikt
      // óók USER_ENTERED maar liep erlangs. Zonder _veiligeRij zou een behandelaarsnaam of
      // opvolgnotitie die met =,+,-,@ begint hier alsnog als formule in de Sheet landen.
      const data=[];
      for(const it of items){
        const kol=conf.kolom(it.r);
        const val=welkeWaarde==='oud'?it.oud:waarde;
        data.push({range:`'Nog Te Doen'!${kol}${it.r._row}`, values:[_veiligeRij([val])]});
        if(oppDl && it.sec==='OPPAKKEN'){
          const prio=welkeWaarde==='oud'?it.oudPrio:berekenPrioriteit(waarde,'OPPAKKEN').prioriteit;
          data.push({range:`'Nog Te Doen'!F${it.r._row}`, values:[_veiligeRij([prio])]}); // F=prioriteit, herberekend bij nieuwe deadline
        }
      }
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({valueInputOption:'USER_ENTERED', data})});
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-actie fout');err.status=resp.status;throw err}
      if(!gelogd){ await logEvents(items.map(it=>({code:it.code,sec:it.sec,actie:conf.log,veld:conf.veld,oudeWaarde:welkeWaarde==='oud'?waarde:it.oud,nieuweWaarde:welkeWaarde==='oud'?it.oud:waarde}))); gelogd=true; }
      // Melding aan de nieuwe behandelaar. Eén taak toewijzen deed dit al (crud.js, submitTask);
      // bulk deed het helemaal niet, dus wie acht taken in één keer kreeg hoorde er niets van.
      // Bewust ÉÉN melding en niet acht: acht pushes voor één handeling leest als een storing.
      // De tekst noemt het aantal en de eerste codes, zodat de ontvanger weet waar hij moet kijken.
      // Alleen bij 'nieuw' — een ongedaan-making hoort niet als een nieuwe toewijzing te klinken.
      // Wie aan zichzelf toewijst krijgt niets: de ontvanger-is-de-actor-regel zit in
      // fireNotifEvent en in Apps Script (name !== actor).
      if(soort==='geven' && waarde && welkeWaarde==='nieuw' && !gemeld){
        const codes=[...new Set(items.map(it=>it.code).filter(Boolean))];
        const kop  = items.length===1 ? (codes[0]||'') : `${items.length} taken`;
        const rest = items.length===1 ? (items[0].r.naam||'')
                   : codes.slice(0,3).join(', ') + (codes.length>3 ? ` en ${codes.length-3} andere` : '');
        fireNotifEvent('assigned',{sec:items[0].sec, code:kop, naam:rest, behandelaar:waarde});
        gemeld=true;
      }
    };
  };
  showUndoToast(conf.titel,items.map(i=>i.code).join(', '),async()=>{
    await state._writeChain;
    if(blokkeerOffline()) return;   // vóór het terugzetten: anders staat het scherm op 'oud' terwijl de Sheet 'nieuw' houdt
    items.forEach(it=>{ it.r[conf.veld]=it.oud; if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=it.oudPrio; });
    renderAll();
    backgroundWrite(schrijf('oud'),()=>{},'Undo mislukt');
  },conf.icoon);
  backgroundWrite(schrijf('nieuw'),
    ()=>{ items.forEach(it=>{ it.r[conf.veld]=it.oud; if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=it.oudPrio; }); },
    'Bulk-actie mislukt');
}

export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis,
         renderBulkUi, toggleBulkMenu, _sluitMenus, bulkDoe, bulkVeld, BULK_DEADLINE_KOLOM, _bulkUndoAfDoelRijen };
