// ══════════════════════════════════════
//  CRUD — taak-modals, sheet-helpers, toevoegen/afronden/verwijderen
// ══════════════════════════════════════
import { esc, berekenPrioriteit, toISODate, toDutchDate } from "./util.js";
import { state, D } from "./state.js";
import { SECS, SKEYS, SID } from "./config.js";
import { writeRange, _shiftNtdRows, _herstelShift, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { showToast, showUndoToast, fireNotifEvent, undoComplete, undoDelete } from "./notifications.js";
import { animateRowOut, flashRow } from "./anim.js";
import { logEvent, renderTaskHistory } from "./render-overig.js";
import { backgroundWrite, loadAll } from "./data.js";
import { renderAll } from "./main.js";

//  MODAL — Open / Close
// ══════════════════════════════════════
function openModal(isEdit,rowData,opts){
  state.editMode=!!isEdit;
  const sec=isEdit?rowData._sec:((opts&&opts.sec)||state.activeNtd);
  state.editSec=sec; state.editRowData=rowData||null;

  document.getElementById('m-title').textContent=(isEdit?'Taak bewerken — ':'Taak toevoegen — ')+SECS[sec].label;
  document.getElementById('m-submit-lbl').textContent=isEdit?'Opslaan':'Toevoegen';
  document.getElementById('m-del').style.display=isEdit?'inline-flex':'none';
  document.getElementById('m-af').style.display=isEdit?'inline-flex':'none';

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
    // Vooraf ingevulde VvE (bv. +-knop op de dossierpagina): code + naam zetten,
    // net alsof de gebruiker 'm via het zoekveld had gekozen.
    if(opts&&opts.code){
      document.getElementById('m-code').value=opts.code;
      document.getElementById('m-naam').value=opts.naam||'';
    }
  }

  document.getElementById('modal-bg').classList.add('open');
}

function editRow(r){ openModal(true,r); }

function closeModal(){document.getElementById('modal-bg').classList.remove('open')}

function fillModalFields(sec,r){
  const tog=(id,on)=>{const e=document.getElementById(id);if(e){e.classList.toggle('on',!!on);e.setAttribute('aria-checked',!!on);}};
  switch(sec){
    case'OPPAKKEN':
      setv('m-actie',r.actiepunt);setv('m-dl',toISODate(r.deadline));setv('m-beh',r.behandelaar);
      setv('m-opm',r.opmerkingen);setv('m-sub-opp',r.subcategorie);
      tog('tog-ib',r.inBehandeling==='TRUE');break;
    case'VERGADERVERZOEKEN':
      setv('m-per',r.periode);setv('m-beh-v',r.behandelaar);setv('m-agenda',r.agendapunten||r.actiepunt);
      setv('m-dl-v',toISODate(r.deadline));setv('m-opm-v',r.opmerkingen);setv('m-sub-verg',r.subcategorie);
      tog('tog-ib-v',r.inBehandeling==='TRUE');break;
    case'OFFERTE-TRAJECTEN':
      setv('m-daang',toISODate(r.datumAangevraagd));setv('m-beh-o',r.behandelaar);
      {const[ontv,totaal]=(r.offertes||'').split('/').map(s=>parseInt(s)||0);
      setv('m-off-recv',ontv||0);setv('m-off-total',totaal||0);}
      setv('m-dl-o',toISODate(r.deadline));setv('m-opm-o',r.opmerkingen);setv('m-sub-off',r.subcategorie);break;
    case'LOD':
      setv('m-actie-l',r.actiepunt);setv('m-stat-l',r.status);setv('m-beh-l',r.behandelaar);
      setv('m-dl-l',toISODate(r.deadline));setv('m-opm-l',r.opmerkingen);setv('m-sub-lod',r.subcategorie);
      tog('tog-ib-l',r.inBehandeling==='TRUE');break;
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

// Gedeelde undo-serialisatie van een NTD-taakrij → kolomwaarden A..P.
// N (placeholder), O (offerte-fase) en P (aannemerslijst) horen erbij: zo verliest een
// undo van een afgerond/verwijderd OFFERTE-traject niet stil de opgebouwde aannemerslijst
// + de expliciete fase. Voor niet-offerte secties zijn r.fase/r.aannemers leeg (harmloos).
// Eén bron voor de drie callsites (deleteTaskRow, doCompleteTask, bulk-afronden/-verwijderen),
// zodat de kolombreedte nooit meer per plek uit elkaar loopt.
export function serializeNtdUndo(r){
  const v=SECS[r._sec].keys.map(k=>r[k]||'');
  while(v.length<8) v.push('');                  // OFFERTE heeft 7 velden → vul tot H
  v.push('', '', r.subcategorie||'', r.opvolgdatum||'', r.herhaalId||'', '', r.fase||'', r.aannemers||''); // I, J, K=sub, L, M, N, O=fase, P=aannemers
  return v;
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
  const ntdValues=serializeNtdUndo(r);
  const undoData={sec,code:r.code,ntdValues};
  const oudeRow=r._row;
  const tr=document.querySelector(`#ntd-tbody tr[data-row="${oudeRow}"]`);
  // optimistisch: meteen lokaal weg + indexen meeschuiven
  const arr=D.ntd[sec]||[];
  const pos=arr.indexOf(r);
  if(pos>-1) arr.splice(pos,1);
  _shiftNtdRows(oudeRow,-1);
  showUndoToast('Taak verwijderd',`${r.code} — ${omschrijving}`,()=>undoDelete(undoData),'prullenbak');
  // Idempotentie-vlag: een deleteDimension is positie-gebaseerd en NIET idempotent. Zonder
  // deze vlag zou een _withRetry-herkansing (na een transient 429/5xx) de rij eronder — die
  // door de eerste delete naar boven schoof — kunnen verwijderen. (patroon: offerte-aannemers.js)
  let verwijderd=false;
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Nog Te Doen'];
      if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
      if(!verwijderd){
        await assertRowMatch(oudeRow, r.code); // bescherming: rij nog van deze VvE vóór verwijderen
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',
          headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
        });
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
        verwijderd=true;
      }
      logEvent(r.code, sec, 'Verwijderd', '', r.actiepunt||r.periode||'', '');
    },
    ()=>{ if(arr.indexOf(r)===-1){ _herstelShift(_shiftNtdRows,oudeRow); arr.splice(Math.min(pos<0?arr.length:pos,arr.length),0,r); } },
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

// Afronden vanuit de bewerk-modal: zelfde flow als de ✓-knop op een rij.
// De modal kreeg de rij uit _rowCache, dus indexOf vindt dezelfde taak terug.
async function completeCurrentEditTask(){
  if(!state.editRowData) return;
  const idx=state._rowCache.indexOf(state.editRowData);
  if(idx<0){alert('Taak niet gevonden. Vernieuw de pagina en probeer opnieuw.');return}
  closeModal();
  completeTask(idx);
}

// Pure (testbaar): zoek het bewaarde rij-object vers op in de huidige _rowCache.
// Bewust op identiteit (indexOf), geen veld-vergelijking: na een verse parse zijn het
// nieuwe objecten en is -1 het veilige antwoord — niet gokken welke rij 'dezelfde' is.
function _verseRijIdx(row, cache){ return row ? (cache||[]).indexOf(row) : -1; }

// Pure (testbaar): her-anker een wees-rij op INHOUD nadat een verse parse alle
// D.ntd-objecten verving (stille resync na een andere schrijfactie). Alleen bij exact
// één inhoudelijk identieke rij in dezelfde sectie is her-ankeren veilig; bij nul of
// meerdere kandidaten liever de gebruiker opnieuw laten klikken dan gokken.
function _herankerRij(r, ntd){
  if(!r||!SECS[r._sec]) return null;
  const doel=serializeNtdUndo(r).join('\x1f');
  const kandidaten=((ntd&&ntd[r._sec])||[]).filter(x=>serializeNtdUndo(x).join('\x1f')===doel);
  return kandidaten.length===1?kandidaten[0]:null;
}

async function completeTask(idx){
  const r=state._rowCache[idx];
  if(!r){alert('Taak niet gevonden. Vernieuw de pagina en probeer opnieuw.');return}
  // Rij-OBJECT bewaren, geen index: terwijl de modal open staat kan een vertraagde
  // renderAll (animateRowOut, ~1,2s) of de stille resync _rowCache herbouwen — een
  // bewaarde index wijst dan naar een ándere taak. Zelfde patroon als completeCurrentEditTask.
  // Het geklikte rid gaat apart mee, alléén voor de groene puls op de juiste DOM-rij.
  state._completeRow=r;
  state._completeRid=idx;
  const d=new Date();
  document.getElementById('complete-date').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('complete-comment').value='';
  document.getElementById('complete-title').textContent=`Taak afhandelen — ${r.actiepunt||r.periode||r.code||''}`;
  document.getElementById('complete-bg').classList.add('open');
}

async function doCompleteTask(){
  let r=state._completeRow;
  if(r && _verseRijIdx(r, state._rowCache)<0){
    // De cache is herbouwd met verse parse-objecten (stille resync) terwijl de modal
    // open stond. Her-anker op inhoud: staat de taak er ongewijzigd in, dan mag de
    // afronding gewoon doorgaan en is de getypte toelichting niet voor niets geweest.
    r=_herankerRij(r, D.ntd);
    if(r) state._completeRow=r;
  }
  if(!r){alert('Taak niet gevonden. De lijst is intussen ververst — probeer opnieuw.');closeCompleteModal();return}
  const dateVal=document.getElementById('complete-date').value;
  const comment=document.getElementById('complete-comment').value.trim();
  if(!dateVal){alert('Datum is verplicht.');return}
  const dp=dateVal.split('-');
  const today=`${dp[2]}-${dp[1]}-${dp[0]}`;
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  // Dubbelklik-rem NÁ ensureToken: het gevaarlijke gat is tussen de token en de
  // batch-write (getSheetIds is nog een await), waar een tweede klik de taak dubbel
  // zou afronden. Bewust niet vóór ensureToken: een hangende/geblokkeerde OAuth-popup
  // zou de vlag dan eeuwig op true laten staan; een tweede klik is daar juist een
  // legitieme herkansing.
  if(state._completeBusy) return;
  state._completeBusy=true;
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
    const ntdValues=serializeNtdUndo(r);
    const undoData={sec,code:r.code,ntdValues,ntdRow:r._row};
    // 1) optimistisch: meteen uit de lokale lijst + indexen meeschuiven;
    //    de oude DOM-rij pulst groen en pas daarná hertekenen we (anim.js)
    // Rij voor de groene puls: NTD-tabel, of anders de GEKLIKTE taakrij (bewaard rid)
    // op de zichtbare pagina — niet een indexOf-treffer die op een verborgen kopie
    // (dossier-DOM van een eerder bezocht dossier) kan landen.
    // Beide clauses op de zichtbare pagina: bij afronden vanuit het dossier zou de
    // eerste clause anders de verbórgen NTD-tabelrij matchen en de puls onzichtbaar spelen.
    const tr=document.querySelector(`.page.active #ntd-tbody tr[data-row="${r._row}"]`)||document.querySelector(`.page.active .tk[data-rid="${state._completeRid}"]`);
    const arr=D.ntd[sec]||[];
    const pos=arr.indexOf(r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(r._row,-1);
    closeCompleteModal();
    showUndoToast('Taak afgerond',`${r.code} — ${r.actiepunt||r.naam||''}`,()=>undoComplete(undoData),'vinkCirkel');
    // 2) op de achtergrond wegschrijven; bij fout de taak terugzetten
    // Idempotentie-vlag: de batch (insert+update+delete) is positie-gebaseerd en NIET
    // idempotent — een retry na een transient fout zou dubbel kunnen afronden / de verkeerde
    // rij verwijderen. De vlag zorgt dat de batch maar één keer echt uitgevoerd wordt.
    let afgerond=false;
    backgroundWrite(
      async ()=>{
        if(!afgerond){
          await assertRowMatch(r._row, r.code); // bescherming: rij nog van deze VvE vóór afronden
          const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
            method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
            body:JSON.stringify(batchBody)});
          if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Fout bij afhandelen taak');err.status=resp.status;throw err}
          afgerond=true;
        }
        logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]); if(a.indexOf(r)===-1){ _herstelShift(_shiftNtdRows,r._row); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
      'Afronden mislukt'
    );
    // 3) groene puls + fade op de oude rij; daarná pas hertekenen
    animateRowOut(tr,'rij-puls-groen',renderAll);
  }catch(e){alert('Fout bij afhandelen: '+e.message)}
  finally{ state._completeBusy=false; }
}

function closeCompleteModal(){document.getElementById('complete-bg').classList.remove('open');state._completeRow=null;state._completeRid=null}

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
      // Offerte: gooi de gecachete handmatige X/N weg zodat de net-bewerkte kolom-D-waarde
      // meteen wordt herkend (anders pas zichtbaar ná de stille resync). Harmloos elders.
      delete doelRow._offertesManual;
      renderAll();
      flashRow('ntd-tbody', doelRow._row);
      closeModal();clearModal();
      showToast('Opgeslagen',`${code} — ${naam||''}`,null,'opslaan');
      backgroundWrite(
        async ()=>{
          await assertRowMatch(doelRow._row, oudeWaarden.code); // bescherming: rij nog dezelfde VvE vóór overschrijven
          await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
          if(newBeh && newBeh!==(oudeWaarden.behandelaar||'')){
            fireNotifEvent('assigned',{sec,code,naam,behandelaar:newBeh});
            logEvent(code,sec,'Behandelaar gewijzigd','behandelaar',oudeWaarden.behandelaar,newBeh);
          }
        },
        ()=>{ keys.forEach(k=>{ doelRow[k]=oudeWaarden[k]; }); doelRow.subcategorie=oudeWaarden.subcategorie; delete doelRow._offertesManual; },
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
      showToast('Taak toegevoegd',`${code} — ${naam||''}`,null,'plus');
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
  getAfInsertRow, completeTask, completeCurrentEditTask, doCompleteTask, closeCompleteModal, submitTask, gv,
  _verseRijIdx, _herankerRij,
};
