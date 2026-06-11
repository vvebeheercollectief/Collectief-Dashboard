// ══════════════════════════════════════
//  BULK-ACTIES — selecteren + groepsacties op de NTD-lijst (Fase 5)
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";
import { toDutchDate } from "./util.js";
import { SECS, SID } from "./config.js";
import { ensureToken } from "./auth.js";
import { writeRange, _shiftNtdRows } from "./api.js";
import { getSheetIds, getAfInsertRow, getInsertRow, insertAndWriteRow } from "./crud.js";
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

// Serialiseer een taakrij naar de NTD-kolomwaarden (zelfde vorm als crud.js)
function _ntdValues(r){
  const v=SECS[r._sec].keys.map(k=>r[k]||'');
  while(v.length<8) v.push('');
  v.push('', r.subcategorie||'', '', r.opvolgdatum||'', r.herhaalId||''); // I, J=sub, K, L, M
  return v;
}

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
    bulkVeld(rows,'wegleggen',toDutchDate(iso));
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
    for(const it of items){            // hoog→laag: deletes verschuiven elkaars rijen niet
      const afAfterRow=getAfInsertRow(it.sec);
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[
          {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
          {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:it.afValues.length},
            rows:[{values:it.afValues.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
          {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}
        ]})});
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-afronden fout');err.status=resp.status;throw err}
      logEvent(it.code,it.sec,'Afgerond','status','Nog Te Doen','Afgerond op '+vandaag+' (bulk)');
    }
  },()=>{ // rollback: laag→hoog terugzetten
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _shiftNtdRows(it.origRow,+1); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-afronden mislukt');
}
async function bulkUndoAfronden(items){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  try{
    await state._writeChain;
    await loadAll(true);
    const ids=await getSheetIds();
    for(const it of items){
      // verwijder de zojuist toegevoegde Afgerond-rij als die aan de staart staat
      const afEntries=D.af[it.sec]||[];
      const lastAf=afEntries.length?afEntries[afEntries.length-1]:null;
      if(lastAf&&lastAf.code===it.code){
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:ids['Afgerond'],dimension:'ROWS',startIndex:lastAf._row-1,endIndex:lastAf._row}}}]})});
        afEntries.pop();
      }
      await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec),it.ntdValues);
      logEvent(it.code,it.sec,'Teruggezet','status','Afgerond','Nog Te Doen (bulk-undo)');
    }
    showToast('↩ Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
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
  try{
    await state._writeChain;
    for(const it of items) await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec),it.ntdValues);
    items.forEach(it=>logEvent(it.code,it.sec,'Teruggezet','status','Verwijderd','Nog Te Doen (bulk-undo)'));
    showToast('↩ Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
}

// ── Veld-acties: geven / wegleggen / deadline (cel-schrijfacties) ───────
function bulkVeld(rows,soort,waarde){
  const conf={
    geven:    { veld:'behandelaar', kolom:()=> BULK_BEH_KOLOM,             titel:`👤 ${rows.length} taken aan ${waarde} gegeven`,  log:'Behandelaar gewijzigd' },
    wegleggen:{ veld:'opvolgdatum', kolom:()=> OPVOLG_KOLOM,               titel:`🔕 ${rows.length} taken weggelegd tot ${waarde}`, log:'Weggelegd' },
    deadline: { veld:'deadline',    kolom:(r)=>BULK_DEADLINE_KOLOM[r._sec],titel:`📅 ${rows.length} deadlines → ${waarde}`,        log:'Deadline gewijzigd' },
  }[soort];
  const items=rows.map(r=>({r,sec:r._sec,code:r.code,oud:r[conf.veld]||''}));
  items.forEach(it=>{ it.r[conf.veld]=waarde; });
  _eindBulk();
  const schrijf=(welkeWaarde)=>async()=>{
    for(const it of items){
      const kol=conf.kolom(it.r);
      const val=welkeWaarde==='oud'?it.oud:waarde;
      await writeRange(`'Nog Te Doen'!${kol}${it.r._row}:${kol}${it.r._row}`,[val]);
      logEvent(it.code,it.sec,conf.log,conf.veld,welkeWaarde==='oud'?waarde:it.oud,val);
    }
  };
  showUndoToast(conf.titel,items.map(i=>i.code).join(', '),async()=>{
    await state._writeChain;
    items.forEach(it=>{ it.r[conf.veld]=it.oud; });
    renderAll();
    backgroundWrite(schrijf('oud'),()=>{},'Undo mislukt');
  });
  backgroundWrite(schrijf('nieuw'),
    ()=>{ items.forEach(it=>{ it.r[conf.veld]=it.oud; }); },
    'Bulk-actie mislukt');
}

export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis,
         renderBulkUi, toggleBulkMenu, _sluitMenus, bulkDoe, BULK_DEADLINE_KOLOM };
