// ══════════════════════════════════════
//  BULK-ACTIES — selecteren + groepsacties op de NTD-lijst (Fase 5)
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";
import { toDutchDate, berekenPrioriteit, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt } from "./util.js";
import { SECS, SID } from "./config.js";
import { ensureToken } from "./auth.js";
import { _shiftNtdRows, assertRowsMatch } from "./api.js";
import { getSheetIds, getAfInsertRow, getInsertRow, insertAndWriteRow, serializeNtdUndo } from "./crud.js";
import { backgroundWrite, loadAll } from "./data.js";
import { showToast, showUndoToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";
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
// deadline is D bij OPPAKKEN (index 3) en F bij de andere drie (index 5).
const BULK_BEH_KOLOM='E';
const BULK_DEADLINE_KOLOM={OPPAKKEN:'D',VERGADERVERZOEKEN:'F','OFFERTE-TRAJECTEN':'F',LOD:'F'};
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
    if(naDeadline.length && !confirm(`Let op: voor ${naDeadline.length} van de ${rows.length} ${rows.length===1?'taak':'taken'} ligt deze opvolgdatum ná de deadline.\nDie ${naDeadline.length===1?'taak wordt':'taken worden'} op de deadline gewoon "Te laat". Toch wegleggen?`)) return;
    bulkVeld(rows,'wegleggen',nieuw);
  }
  else if(wat==='deadline'){
    const iso=document.getElementById('bb-datum-dl').value;
    if(!iso){ alert('Kies een datum.'); return; }
    bulkVeld(rows,'deadline',toDutchDate(iso));
  }
  else if(wat==='verwijderen') bulkVerwijderen(rows);
}

// ── Afronden (verplaats naar 'Afgerond') ────────────────────────────────
function bulkAfronden(rows){
  const d=new Date();
  const vandaag=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const items=rows.map(r=>{
    let values;
    switch(r._sec){
      case 'OPPAKKEN':          values=[r.code,r.naam,r.actiepunt||'',r.deadline||'',r.behandelaar||'',r.prioriteit||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];break;
      case 'VERGADERVERZOEKEN': values=[r.code,r.naam,r.periode||'',r.agendapunten||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];break;
      case 'OFFERTE-TRAJECTEN': values=[r.code,r.naam,r.datumAangevraagd||'',r.offertes||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'','',vandaag,'',r.subcategorie||''];break;
      default:                  values=[r.code,r.naam,r.actiepunt||'',r.status||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];
    }
    values.push(r.herhaalId||''); // L in 'Afgerond': Herhaal-ID (Fase 4-motor)
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
  showUndoToast(`✅ ${items.length} taken afgerond`,items.map(i=>i.code).join(', '),()=>bulkUndoAfronden(items));
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'], ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null||ntdSheetId==null) throw new Error('Sheet niet gevonden');
    await assertRowsMatch(items.map(it=>({row:it.origRow, code:it.code}))); // bescherming: alle rijen nog van hun VvE vóór bulk-afronden
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
    items.forEach(it=>logEvent(it.code,it.sec,'Afgerond','status','Nog Te Doen','Afgerond op '+vandaag+' (bulk)'));
  },()=>{ // rollback: laag→hoog terugzetten
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _shiftNtdRows(it.origRow,+1); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-afronden mislukt');
}
// Pure helper (testbaar): kies per item de ZOJUIST afgeronde Afgerond-rij — de nieuwste op
// code. afPerSec[sec] is nieuwste-eerst gesorteerd (zoals D.af in data.js), dus de eerste
// code-match is de nieuwste. Claim per rij zodat twee items met dezelfde code verschillende
// rijen pakken. Resultaat hoog→laag _row, zodat verwijderen de indexen niet door elkaar schuift.
function _bulkUndoAfDoelRijen(items, afPerSec){
  const claimed=new Set(), doel=[];
  for(const it of items){
    const entries=afPerSec[it.sec]||[];
    const r=entries.find(x=>x.code===it.code && !claimed.has(x));
    if(r){ claimed.add(r); doel.push(r); }
  }
  return doel.sort((a,b)=>b._row-a._row);
}

async function bulkUndoAfronden(items){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;
    await loadAll(true);                       // verse D.af zodat we de zojuist afgeronde rijen vinden
    const ids=await getSheetIds();
    // 1) Bepaal welke Afgerond-rijen weg moeten (nieuwste per code), hoog→laag _row.
    const teVerwijderen=_bulkUndoAfDoelRijen(items, D.af);
    // 2) Verwijder ze in één batch in aflopende _row-volgorde, zodat de delete-indexen
    //    elkaar niet verschuiven (i.t.t. de oude code die de oudste rij koos).
    if(teVerwijderen.length){
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:teVerwijderen.map(af=>({deleteDimension:{range:{sheetId:ids['Afgerond'],dimension:'ROWS',startIndex:af._row-1,endIndex:af._row}}}))})});
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-undo verwijderfout');err.status=resp.status;throw err}
    }
    // 3) Zet de taken terug in Nog Te Doen (per-sectie offset, getInsertRow verandert niet tussendoor).
    const offset={};
    for(const it of items){
      await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec)+(offset[it.sec]||0),it.ntdValues);
      offset[it.sec]=(offset[it.sec]||0)+1;
      logEvent(it.code,it.sec,'Teruggezet','status','Afgerond','Nog Te Doen (bulk-undo)');
    }
    showToast('↩ Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// ── Verwijderen ─────────────────────────────────────────────────────────
function bulkVerwijderen(rows){
  if(!confirm(`${rows.length} ${rows.length===1?'taak':'taken'} verwijderen?`)) return;
  const items=rows.map(r=>({r,sec:r._sec,origRow:r._row,ntdValues:_ntdValues(r),code:r.code}));
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  _eindBulk();
  showUndoToast(`🗑️ ${items.length} taken verwijderd`,items.map(i=>i.code).join(', '),()=>bulkUndoVerwijderen(items));
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const sheetId=ids['Nog Te Doen'];
    if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    await assertRowsMatch(items.map(it=>({row:it.origRow, code:it.code}))); // bescherming: alle rijen nog van hun VvE vóór bulk-verwijderen
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:items.map(it=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}))})});
    if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-verwijderfout');err.status=resp.status;throw err}
    items.forEach(it=>logEvent(it.code,it.sec,'Verwijderd','',it.ntdValues[2]||'','(bulk)'));
  },()=>{
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _shiftNtdRows(it.origRow,+1); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-verwijderen mislukt');
}
async function bulkUndoVerwijderen(items){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;
    // Offset per sectie: getInsertRow leest D.ntd (verandert niet tussen inserts), dus zonder
    // offset belanden alle rijen op dezelfde positie en stapelen ze in omgekeerde volgorde.
    const offset={};
    for(const it of items){
      await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec)+(offset[it.sec]||0),it.ntdValues);
      offset[it.sec]=(offset[it.sec]||0)+1;
    }
    items.forEach(it=>logEvent(it.code,it.sec,'Teruggezet','status','Verwijderd','Nog Te Doen (bulk-undo)'));
    showToast('↩ Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// ── Veld-acties: geven / wegleggen / deadline (cel-schrijfacties) ───────
function bulkVeld(rows,soort,waarde){
  const conf={
    geven:    { veld:'behandelaar', kolom:()=> BULK_BEH_KOLOM,             titel:`👤 ${rows.length} taken aan ${waarde} gegeven`,  log:'Behandelaar gewijzigd' },
    wegleggen:{ veld:'opvolgdatum', kolom:()=> OPVOLG_KOLOM,               titel:`🔕 ${rows.length} taken weggelegd tot ${waarde}`, log:'Weggelegd' },
    deadline: { veld:'deadline',    kolom:(r)=>BULK_DEADLINE_KOLOM[r._sec],titel:`📅 ${rows.length} deadlines → ${waarde}`,        log:'Deadline gewijzigd' },
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
    let gelogd=false;
    return async()=>{
      await assertRowsMatch(items.map(it=>({row:it.r._row, code:it.code}))); // bescherming: alle rijen nog van hun VvE vóór bulk-celschrijf
      const ids=await getSheetIds();
      const ntdSheetId=ids['Nog Te Doen'];
      if(ntdSheetId==null) throw new Error('Sheet niet gevonden');
      const cel=v=>({userEnteredValue:{stringValue:String(v)}});
      const requests=[];
      for(const it of items){
        const kol=conf.kolom(it.r);
        const colIdx=kol.charCodeAt(0)-65;                  // 'A'→0; alle veldkolommen zijn enkele letters
        const val=welkeWaarde==='oud'?it.oud:waarde;
        requests.push({updateCells:{range:{sheetId:ntdSheetId,startRowIndex:it.r._row-1,endRowIndex:it.r._row,startColumnIndex:colIdx,endColumnIndex:colIdx+1},rows:[{values:[cel(val)]}],fields:'userEnteredValue'}});
        if(oppDl && it.sec==='OPPAKKEN'){
          const prio=welkeWaarde==='oud'?it.oudPrio:berekenPrioriteit(waarde,'OPPAKKEN').prioriteit;
          requests.push({updateCells:{range:{sheetId:ntdSheetId,startRowIndex:it.r._row-1,endRowIndex:it.r._row,startColumnIndex:5,endColumnIndex:6},rows:[{values:[cel(prio)]}],fields:'userEnteredValue'}}); // F=prio (index 5)
        }
      }
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests})});
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-actie fout');err.status=resp.status;throw err}
      if(!gelogd){ items.forEach(it=>logEvent(it.code,it.sec,conf.log,conf.veld,welkeWaarde==='oud'?waarde:it.oud,welkeWaarde==='oud'?it.oud:waarde)); gelogd=true; }
    };
  };
  showUndoToast(conf.titel,items.map(i=>i.code).join(', '),async()=>{
    await state._writeChain;
    items.forEach(it=>{ it.r[conf.veld]=it.oud; if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=it.oudPrio; });
    renderAll();
    backgroundWrite(schrijf('oud'),()=>{},'Undo mislukt');
  });
  backgroundWrite(schrijf('nieuw'),
    ()=>{ items.forEach(it=>{ it.r[conf.veld]=it.oud; if(oppDl && it.sec==='OPPAKKEN') it.r.prioriteit=it.oudPrio; }); },
    'Bulk-actie mislukt');
}

export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis,
         renderBulkUi, toggleBulkMenu, _sluitMenus, bulkDoe, BULK_DEADLINE_KOLOM, _bulkUndoAfDoelRijen };
