// ══════════════════════════════════════
//  CRUD — taak-modals, sheet-helpers, toevoegen/afronden/verwijderen
// ══════════════════════════════════════
import { esc, berekenPrioriteit, toISODate, toDutchDate } from "./util.js";
import { state, D } from "./state.js";
import { SECS, SKEYS, SID } from "./config.js";
import { writeRange, _shiftNtdRows, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { showToast, showUndoToast, fireNotifEvent, undoComplete, undoDelete } from "./notifications.js";
import { animateRowOut, flashRow } from "./anim.js";
import { logEvent, renderTaskHistory } from "./render-overig.js";
import { backgroundWrite, loadAll } from "./data.js";
import { renderAll } from "./main.js";

//  MODAL — Open / Close
// ══════════════════════════════════════
function openModal(isEdit,rowData){
  state.editMode=!!isEdit;
  const sec=isEdit?rowData._sec:state.activeNtd;
  state.editSec=sec; state.editRowData=rowData||null;

  document.getElementById('m-title').textContent=(isEdit?'Taak bewerken — ':'Taak toevoegen — ')+SECS[sec].label;
  document.getElementById('m-submit-lbl').textContent=isEdit?'Opslaan':'Toevoegen';
  document.getElementById('m-del').style.display=isEdit?'inline-flex':'none';

  // Section colour for focus rings
  document.documentElement.style.setProperty('--modal-sec',SECS[sec].color);

  // Show correct field group
  document.getElementById('fg-opp').style.display='none';
  document.getElementById('fg-verg').style.display='none';
  document.getElementById('fg-off').style.display='none';
  document.getElementById('fg-lod').style.display='none';
  const fg={OPPAKKEN:'fg-opp',VERGADERVERZOEKEN:'fg-verg','OFFERTE-TRAJECTEN':'fg-off',LOD:'fg-lod'}[sec];
  if(fg) document.getElementById(fg).style.display='';

  if(isEdit&&state.editRowData){
    document.getElementById('m-code').value=state.editRowData.code||'';
    document.getElementById('m-naam').value=state.editRowData.naam||'';
    fillModalFields(sec,state.editRowData);
    renderTaskHistory(state.editRowData.code,sec);
  } else {
    clearModal();
    document.getElementById('fg-history').style.display='none';
  }

  document.getElementById('modal-bg').classList.add('open');
}

function editRow(r){ openModal(true,r); }

function closeModal(){document.getElementById('modal-bg').classList.remove('open')}

function fillModalFields(sec,r){
  switch(sec){
    case'OPPAKKEN':
      setv('m-actie',r.actiepunt);setv('m-dl',toISODate(r.deadline));setv('m-beh',r.behandelaar);
      setv('m-opm',r.opmerkingen);setv('m-sub-opp',r.subcategorie);
      document.getElementById('tog-ib').classList.toggle('on',r.inBehandeling==='TRUE');break;
    case'VERGADERVERZOEKEN':
      setv('m-per',r.periode);setv('m-beh-v',r.behandelaar);setv('m-agenda',r.agendapunten||r.actiepunt);
      setv('m-dl-v',toISODate(r.deadline));setv('m-opm-v',r.opmerkingen);setv('m-sub-verg',r.subcategorie);
      document.getElementById('tog-ib-v').classList.toggle('on',r.inBehandeling==='TRUE');break;
    case'OFFERTE-TRAJECTEN':
      setv('m-daang',toISODate(r.datumAangevraagd));setv('m-beh-o',r.behandelaar);
      {const[ор,от]=(r.offertes||'').split('/').map(s=>parseInt(s)||0);
      setv('m-off-recv',ор||0);setv('m-off-total',от||0);}
      setv('m-dl-o',toISODate(r.deadline));setv('m-opm-o',r.opmerkingen);setv('m-sub-off',r.subcategorie);break;
    case'LOD':
      setv('m-actie-l',r.actiepunt);setv('m-stat-l',r.status);setv('m-beh-l',r.behandelaar);
      setv('m-dl-l',toISODate(r.deadline));setv('m-opm-l',r.opmerkingen);setv('m-sub-lod',r.subcategorie);
      document.getElementById('tog-ib-l').classList.toggle('on',r.inBehandeling==='TRUE');break;
  }
}
function setv(id,v){const el=document.getElementById(id);if(el)el.value=(v===undefined||v===null)?'':v} // 0 blijft '0' (geen falsy-coercie)

function clearModal(){
  document.querySelectorAll('.modal-body input,.modal-body select,.modal-body textarea').forEach(el=>{if(!el.readOnly)el.value=''});
  ['m-off-recv','m-off-total'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0'});
  ['tog-ib','tog-ib-v','tog-ib-l'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on')});
}

// ══════════════════════════════════════
//  SHEET HELPERS (insert / delete rows)
// ══════════════════════════════════════
async function getSheetIds(){
  if(state._sheetIds) return state._sheetIds;
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}`,{headers:{Authorization:`Bearer ${state.oauthToken}`}});
  if(!r.ok){ if(r.status===401){state.oauthToken=null;state.oauthExpiry=0} throw new Error('getSheetIds '+r.status); }
  const d=await r.json();
  state._sheetIds={};
  (d.sheets||[]).forEach(s=>{state._sheetIds[s.properties.title]=s.properties.sheetId});
  return state._sheetIds;
}

function getInsertRow(sec){
  const entries=D.ntd[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.ntdSecInfo[sec];
  return info?.colHeaderRow||2;
}

async function insertAndWriteRow(sheetName,afterRow,values){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const ids=await getSheetIds();
  const sheetId=ids[sheetName];
  if(sheetId==null) throw new Error('Sheet niet gevonden: '+sheetName);
  const insResp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
    method:'POST',
    headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({requests:[{insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+1},inheritFromBefore:true}}]})
  });
  if(!insResp.ok){const e=await insResp.json();if(insResp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Invoegfout');err.status=insResp.status;throw err}
  const endCol=String.fromCharCode(64+Math.max(values.length,9));
  try{
    await writeRange(`'${sheetName}'!A${afterRow+1}:${endCol}${afterRow+1}`,values);
  }catch(e){
    // De rij is wél ingevoegd maar niet gevuld → ruim de lege rij weer op zodat de Sheet niet
    // vervuilt met een ghost-rij. Schrijfacties zijn geserialiseerd, dus deze delete is veilig.
    try{
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+1}}}]})
      });
    }catch(_){ /* opruimen mislukte; de stille resync (loadAll) negeert de lege rij toch */ }
    throw e;
  }
}

async function deleteTask(idx){
  const r=state._rowCache[idx];
  if(!r) return;
  await deleteTaskRow(r);
}

async function deleteCurrentEditTask(){
  if(!state.editRowData) return;
  const r=state.editRowData;
  closeModal();
  await deleteTaskRow(r);
}

async function deleteTaskRow(r){
  const omschrijving=r.actiepunt||r.periode||r.code||'deze taak';
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const sec=r._sec;
  // undo-data vastleggen vóór de mutatie (zelfde serialisatie als afronden)
  const ntdKeys=SECS[sec].keys;
  const ntdValues=ntdKeys.map(k=>r[k]||'');
  while(ntdValues.length<8) ntdValues.push('');                  // OFFERTE heeft 7 velden
  ntdValues.push('', '', r.subcategorie||'', r.opvolgdatum||'', r.herhaalId||''); // I, J, K=sub, L, M (Fase 4)
  const undoData={sec,code:r.code,ntdValues};
  const oudeRow=r._row;
  const tr=document.querySelector(`#ntd-tbody tr[data-row="${oudeRow}"]`);
  // optimistisch: meteen lokaal weg + indexen meeschuiven
  const arr=D.ntd[sec]||[];
  const pos=arr.indexOf(r);
  if(pos>-1) arr.splice(pos,1);
  _shiftNtdRows(oudeRow,-1);
  showUndoToast('🗑️ Taak verwijderd',`${r.code} — ${omschrijving}`,()=>undoDelete(undoData));
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Nog Te Doen'];
      if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
      await assertRowMatch(oudeRow, r.code); // bescherming: rij nog van deze VvE vóór verwijderen
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
      });
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
      logEvent(r.code, sec, 'Verwijderd', '', r.actiepunt||r.periode||'', '');
    },
    ()=>{ if(arr.indexOf(r)===-1){ _shiftNtdRows(oudeRow,+1); arr.splice(Math.min(pos<0?arr.length:pos,arr.length),0,r); } },
    'Verwijderen mislukt'
  );
  // rode puls + fade op de oude rij; daarná pas hertekenen
  animateRowOut(tr,'rij-puls-rood',renderAll);
}

function getAfInsertRow(sec){
  const entries=D.af[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.afSecInfo[sec];
  if(info?.colHeaderRow) return info.colHeaderRow;
  const idx=SKEYS.indexOf(sec);
  for(let i=idx-1;i>=0;i--){
    const prev=D.af[SKEYS[i]]||[];
    if(prev.length>0) return prev[prev.length-1]._row;
    if(D.afSecInfo[SKEYS[i]]?.colHeaderRow) return D.afSecInfo[SKEYS[i]].colHeaderRow;
  }
  return 2;
}

async function completeTask(idx){
  const r=state._rowCache[idx];
  if(!r){alert('Taak niet gevonden. Vernieuw de pagina en probeer opnieuw.');return}
  state._completeIdx=idx;
  const d=new Date();
  document.getElementById('complete-date').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('complete-comment').value='';
  document.getElementById('complete-title').textContent=`Taak afhandelen — ${r.actiepunt||r.periode||r.code||''}`;
  document.getElementById('complete-bg').classList.add('open');
}

async function doCompleteTask(){
  const idx=state._completeIdx;
  const r=state._rowCache[idx];
  if(!r){alert('Taak niet gevonden.');closeCompleteModal();return}
  const dateVal=document.getElementById('complete-date').value;
  const comment=document.getElementById('complete-comment').value.trim();
  if(!dateVal){alert('Datum is verplicht.');return}
  const dp=dateVal.split('-');
  const today=`${dp[2]}-${dp[1]}-${dp[0]}`;
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  try{
    const sec=r._sec;
    let values;
    switch(sec){
      case'OPPAKKEN':
        values=[r.code,r.naam,r.actiepunt||'',r.deadline||'',r.behandelaar||'',r.prioriteit||'',r.opmerkingen||'',r.inBehandeling||'',today,comment,r.subcategorie||''];break;
      case'VERGADERVERZOEKEN':
        values=[r.code,r.naam,r.periode||'',r.agendapunten||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',today,comment,r.subcategorie||''];break;
      case'OFFERTE-TRAJECTEN':
        values=[r.code,r.naam,r.datumAangevraagd||'',r.offertes||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'','',today,comment,r.subcategorie||''];break;
      case'LOD':
        values=[r.code,r.naam,r.actiepunt||'',r.status||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',today,comment,r.subcategorie||''];break;
      default: throw new Error('Onbekende sectie: '+sec);
    }
    values.push(r.herhaalId||''); // L in 'Afgerond': Herhaal-ID — de motor herkent afgeronde terugkerende taken (Fase 4)
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'];
    const ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null) throw new Error('Sheet "Afgerond" niet gevonden');
    if(ntdSheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    const afAfterRow=getAfInsertRow(sec);
    const batchBody={requests:[
      {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
      {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:values.length},
        rows:[{values:values.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
      {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}
    ]};
    // undo-data vastleggen vóór de mutatie
    const ntdKeys=SECS[sec].keys;
    const ntdValues=ntdKeys.map(k=>r[k]||'');
    while(ntdValues.length<8) ntdValues.push('');                  // OFFERTE heeft 7 velden
    ntdValues.push('', '', r.subcategorie||'', r.opvolgdatum||'', r.herhaalId||''); // I, J, K=sub, L, M (Fase 4)
    const undoData={sec,code:r.code,ntdValues,ntdRow:r._row};
    // 1) optimistisch: meteen uit de lokale lijst + indexen meeschuiven;
    //    de oude DOM-rij pulst groen en pas daarná hertekenen we (anim.js)
    const tr=document.querySelector(`#ntd-tbody tr[data-row="${r._row}"]`);
    const arr=D.ntd[sec]||[];
    const pos=arr.indexOf(r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(r._row,-1);
    closeCompleteModal();
    showUndoToast('✅ Taak afgerond',`${r.code} — ${r.actiepunt||r.naam||''}`,()=>undoComplete(undoData));
    // 2) op de achtergrond wegschrijven; bij fout de taak terugzetten
    backgroundWrite(
      async ()=>{
        await assertRowMatch(r._row, r.code); // bescherming: rij nog van deze VvE vóór afronden
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify(batchBody)});
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Fout bij afhandelen taak');err.status=resp.status;throw err}
        logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]); if(a.indexOf(r)===-1){ _shiftNtdRows(r._row,+1); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
      'Afronden mislukt'
    );
    // 3) groene puls + fade op de oude rij; daarná pas hertekenen
    animateRowOut(tr,'rij-puls-groen',renderAll);
  }catch(e){alert('Fout bij afhandelen: '+e.message)}
}

function closeCompleteModal(){document.getElementById('complete-bg').classList.remove('open');state._completeIdx=null}

// ══════════════════════════════════════
//  SUBMIT TASK (Add + Edit)
// ══════════════════════════════════════
async function submitTask(){
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const code=document.getElementById('m-code').value.trim();
  const naam=document.getElementById('m-naam').value.trim();
  if(!code){alert('VvE Code is verplicht.');return}

  const sec=state.editSec||state.activeNtd;
  let values;

  try{
    const subId={OPPAKKEN:'m-sub-opp',VERGADERVERZOEKEN:'m-sub-verg','OFFERTE-TRAJECTEN':'m-sub-off',LOD:'m-sub-lod'}[sec];
    const sub=gv(subId);
    // Kolomvolgorde 'Nog Te Doen': … H=InBeh, I=Afgerond, J=(leeg), K=Subcategorie, L=Opvolg, …
    // De subcategorie moet dus op kolom K (index 10) staan — gelijk aan parseSections en de
    // Apps Script-backend. Daarom twee lege kolommen (I + J) vóór `sub`.
    switch(sec){
      case'OPPAKKEN':{
        const _berekend = berekenPrioriteit(toDutchDate(gv('m-dl')), 'OPPAKKEN').prioriteit;
        values=[code,naam,gv('m-actie'),toDutchDate(gv('m-dl')),gv('m-beh'),_berekend,gv('m-opm'),
          document.getElementById('tog-ib').classList.contains('on'),'','',sub];break;}
      case'VERGADERVERZOEKEN':
        values=[code,naam,gv('m-per'),gv('m-agenda'),gv('m-beh-v'),toDutchDate(gv('m-dl-v')),gv('m-opm-v'),
          document.getElementById('tog-ib-v').classList.contains('on'),'','',sub];break;
      case'OFFERTE-TRAJECTEN':{
        const recv=parseInt(gv('m-off-recv'))||0;
        const total=parseInt(gv('m-off-total'))||0;
        const offStr=total>0?`${recv}/${total}`:'';
        values=[code,naam,toDutchDate(gv('m-daang')),offStr,gv('m-beh-o'),toDutchDate(gv('m-dl-o')),gv('m-opm-o'),'','','',sub];break;}
      case'LOD':
        values=[code,naam,gv('m-actie-l'),gv('m-stat-l'),gv('m-beh-l'),toDutchDate(gv('m-dl-l')),gv('m-opm-l'),
          document.getElementById('tog-ib-l').classList.contains('on'),'','',sub];break;
    }

    const endCol=String.fromCharCode(64+Math.max(values.length,9));
    const keys=SECS[sec].keys;
    const norm=v=>v===true?'TRUE':v===false?'FALSE':v; // boolean → Sheets-stringvorm
    const newBeh=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):gv('m-beh-l'));
    if(state.editMode&&state.editRowData?._row){
      // ── Bewerken: lokale rij meteen bijwerken, dan op de achtergrond opslaan ──
      const doelRow=state.editRowData, oudeWaarden={...state.editRowData};
      keys.forEach((k,i)=>{ doelRow[k]=norm(values[i]); });
      doelRow.subcategorie=values[values.length-1];
      renderAll();
      flashRow('ntd-tbody', doelRow._row);
      closeModal();clearModal();
      showToast('💾 Opgeslagen',`${code} — ${naam||''}`,null);
      backgroundWrite(
        async ()=>{
          await assertRowMatch(doelRow._row, oudeWaarden.code); // bescherming: rij nog dezelfde VvE vóór overschrijven
          await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
          if(newBeh && newBeh!==(oudeWaarden.behandelaar||'')){
            fireNotifEvent('assigned',{sec,code,naam,behandelaar:newBeh});
            logEvent(code,sec,'Behandelaar gewijzigd','behandelaar',oudeWaarden.behandelaar,newBeh);
          }
          logEvent(code,sec,'Bewerkt','','','');
        },
        ()=>{ keys.forEach(k=>{ doelRow[k]=oudeWaarden[k]; }); doelRow.subcategorie=oudeWaarden.subcategorie; },
        'Opslaan mislukt'
      );
    } else {
      // ── Toevoegen: rij meteen lokaal tonen, dan op de achtergrond opslaan ──
      const afterRow=getInsertRow(sec);
      const nieuw={_sec:sec,_row:afterRow+1};
      keys.forEach((k,i)=>{ nieuw[k]=norm(values[i]); });
      nieuw.subcategorie=values[values.length-1];
      _shiftNtdRows(afterRow,+1); // bestaande rijen eronder schuiven mee
      (D.ntd[sec]=D.ntd[sec]||[]).push(nieuw);
      renderAll();
      flashRow('ntd-tbody', nieuw._row, 'rij-flits-groen');
      closeModal();clearModal();
      showToast('➕ Taak toegevoegd',`${code} — ${naam||''}`,null);
      backgroundWrite(
        async ()=>{
          await insertAndWriteRow('Nog Te Doen',afterRow,values);
          fireNotifEvent('newtask',{sec,code,naam,behandelaar:newBeh});
          logEvent(code,sec,'Aangemaakt','','',newBeh||'');
        },
        ()=>{ const a=D.ntd[sec]||[]; const p=a.indexOf(nieuw); if(p>-1){ a.splice(p,1); _shiftNtdRows(afterRow,-1); } },
        'Toevoegen mislukt'
      );
    }
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('invalid authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
      state.oauthToken=null;state.oauthExpiry=0;
      alert('Je sessie is verlopen. Klik nogmaals op Opslaan om opnieuw in te loggen.');
    }else{alert('Fout: '+e.message)}
  }
}
function gv(id){const el=document.getElementById(id);return el?el.value.trim():''}

// ══════════════════════════════════════

export {
  openModal, editRow, closeModal, fillModalFields, setv, clearModal,
  getSheetIds, getInsertRow, insertAndWriteRow, deleteTask, deleteCurrentEditTask, deleteTaskRow,
  getAfInsertRow, completeTask, doCompleteTask, closeCompleteModal, submitTask, gv,
};
