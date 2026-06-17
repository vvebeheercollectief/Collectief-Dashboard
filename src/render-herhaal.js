// ══════════════════════════════════════
//  HERHAALREGELS — beheerpagina voor terugkerende taken (Fase 4)
//  De dagelijkse Apps Script-motor zet de taken klaar; hier alleen regel-CRUD.
// ══════════════════════════════════════
import { esc, emptyRow, toISODate, toDutchDate, _parseAnyDate } from "./util.js";
import { state, D } from "./state.js";
import { SID } from "./config.js";
import { appendRange, writeRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { getSheetIds } from "./crud.js";
import { showToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";
import { backgroundWrite } from "./data.js";

const TYPE_LABELS = { week:'Elke week', maand:'Elke maand', kwartaal:'Elk kwartaal',
                      halfjaar:'Elk half jaar', jaar:'Elk jaar' };

function zichtbaarVanaf(r){
  const p=_parseAnyDate(r.volgendeDeadline); if(!p) return '';
  const d=new Date(p.y,p.m-1,p.d); d.setDate(d.getDate()-(r.dagenVooraf||14));
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

function renderHerhaal(){
  const tb=document.getElementById('herhaal-tbody');
  if(!tb) return;
  const rows=D.herhaal||[];
  const actief=rows.filter(r=>r.status==='ACTIEF').length;
  document.getElementById('herhaal-sub').textContent=`${rows.length} ${rows.length===1?'regel':'regels'} · ${actief} actief`;
  tb.innerHTML=rows.length?rows.map(r=>{
    const typeLbl=r.type==='na-afronden'?`${esc(r.interval||'?')} mnd na afronden`:(TYPE_LABELS[r.type]||esc(r.type));
    const vk=r.volgendeDeadline
      ?`${esc(r.volgendeDeadline)}<br><span style="font-size:11px;color:var(--mut)">zichtbaar ${zichtbaarVanaf(r)}</span>`
      :'<span style="font-size:12px;color:var(--mut)">wacht op afronden</span>';
    const status=r.status==='ACTIEF'
      ?'<span class="badge prio-laag">Actief</span>'
      :'<span class="badge" style="background:var(--sur2);color:var(--mut)">Gepauzeerd</span>';
    return `<tr class="${r.status!=='ACTIEF'?'snooze-row':''}">
      <td class="cell-txt">${esc(r.omschrijving)}</td>
      <td><span class="code">${esc(r.code)}</span></td>
      <td class="cell-sm">${esc(r.behandelaar)}</td>
      <td class="cell-sm">${typeLbl}</td>
      <td class="cell-sm">${vk}</td>
      <td>${status}</td>
      <td><button class="btn-edit" data-action="herhaal-bewerken" data-hid="${r._row}" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-edit" data-action="herhaal-status" data-hid="${r._row}" title="${r.status==='ACTIEF'?'Pauzeren':'Activeren'}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${r.status==='ACTIEF'?'<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>':'<polygon points="5 3 19 12 5 21 5 3"/>'}</svg></button></td>
    </tr>`;
  }).join(''):emptyRow(7);
}

function openHerhaalModal(hid){
  const r=hid!=null?(D.herhaal||[]).find(x=>x._row===hid):null;
  state.herhaalEditRow=r||null;
  document.getElementById('hh-title').textContent=r?'Herhaalregel bewerken':'Nieuwe herhaalregel';
  document.getElementById('hh-submit-lbl').textContent=r?'Opslaan':'Toevoegen';
  document.getElementById('hh-del').style.display=r?'inline-flex':'none';
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
  set('hh-omschrijving',r?.omschrijving); set('hh-code',r?.code); set('hh-naam',r?.naam);
  set('hh-sectie',r?.sectie||'OPPAKKEN'); set('hh-beh',r?.behandelaar);
  set('hh-type',r?.type||'kwartaal'); set('hh-interval',r?.interval||'6');
  set('hh-deadline',toISODate(r?.volgendeDeadline||'')); set('hh-vooraf',String(r?.dagenVooraf??14));
  syncHerhaalVelden();
  document.getElementById('hh-bg').classList.add('open');
}
function closeHerhaalModal(){document.getElementById('hh-bg').classList.remove('open');state.herhaalEditRow=null}
function syncHerhaalVelden(){
  const na=document.getElementById('hh-type').value==='na-afronden';
  document.getElementById('hh-interval-fld').style.display=na?'':'none';
  document.getElementById('hh-deadline-fld').style.display=na?'none':'';
}
function gvh(id){const el=document.getElementById(id);return el?el.value.trim():''}

async function submitHerhaal(){
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const oms=gvh('hh-omschrijving'), code=gvh('hh-code'), naam=gvh('hh-naam');
  const sectie=gvh('hh-sectie'), beh=gvh('hh-beh'), type=gvh('hh-type');
  const interval=gvh('hh-interval'), vooraf=parseInt(gvh('hh-vooraf'))||14;
  const dlIso=gvh('hh-deadline');
  if(!oms||!code){alert('Omschrijving en VvE Code zijn verplicht.');return}
  if(type==='na-afronden'&&(parseInt(interval)||0)<1){alert('Vul het aantal maanden na afronden in.');return}
  if(type!=='na-afronden'&&!dlIso){alert('Kies de eerstvolgende deadline.');return}
  if(type==='week'&&vooraf>=7){alert('Bij een wekelijkse herhaling moet "dagen vooraf" kleiner zijn dan 7, anders stapelen de taken op.');return}
  const volgende=type==='na-afronden'?'':toDutchDate(dlIso);
  const r=state.herhaalEditRow;
  const id=r?r.id:'HR-'+Date.now().toString(36).toUpperCase();
  const values=[id,oms,sectie,code,naam,beh,type,type==='na-afronden'?interval:'',String(vooraf),volgende,r?r.status:'ACTIEF',r?r.laatstKlaargezet:''];
  closeHerhaalModal();
  if(r){
    const oud={...r}; // vastleggen vóór de optimistische mutatie, voor rollback bij schrijffout
    Object.assign(r,{omschrijving:oms,sectie,code,naam,behandelaar:beh,type,
      interval:type==='na-afronden'?interval:'',dagenVooraf:vooraf,volgendeDeadline:volgende});
    renderHerhaal();
    showToast('💾 Herhaalregel opgeslagen',oms,null);
    backgroundWrite(async()=>{
      await writeRange(`'Herhaalregels'!A${r._row}:L${r._row}`,values);
      logEvent(code,sectie,'Herhaalregel bewerkt','','',oms);
    },()=>{Object.assign(r,oud);},'Opslaan mislukt');
  }else{
    showToast('➕ Herhaalregel toegevoegd',oms,null);
    backgroundWrite(async()=>{
      await appendRange("'Herhaalregels'!A:L",values);
      logEvent(code,sectie,'Herhaalregel aangemaakt','','',oms);
    },()=>{},'Toevoegen mislukt');
  }
}

function toggleHerhaalStatus(hid){
  const r=(D.herhaal||[]).find(x=>x._row===hid); if(!r) return;
  const oud=r.status, nieuw=oud==='ACTIEF'?'GEPAUZEERD':'ACTIEF';
  r.status=nieuw; renderHerhaal();
  showToast(nieuw==='ACTIEF'?'▶ Regel geactiveerd':'⏸ Regel gepauzeerd',r.omschrijving,null);
  backgroundWrite(async()=>{
    await writeRange(`'Herhaalregels'!K${r._row}:K${r._row}`,[nieuw]);
    logEvent(r.code,r.sectie,'Herhaalregel '+(nieuw==='ACTIEF'?'geactiveerd':'gepauzeerd'),'','',r.omschrijving);
  },()=>{r.status=oud;},'Status wijzigen mislukt');
}

async function deleteHerhaal(){
  const r=state.herhaalEditRow; if(!r) return;
  if(!confirm(`Herhaalregel "${r.omschrijving}" definitief verwijderen?\nTip: pauzeren kan ook.`)) return;
  closeHerhaalModal();
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const pos=(D.herhaal||[]).indexOf(r); if(pos>-1)D.herhaal.splice(pos,1);
  (D.herhaal||[]).forEach(x=>{if(x._row>r._row)x._row--;});
  renderHerhaal();
  showToast('🗑️ Herhaalregel verwijderd',r.omschrijving,null);
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const sheetId=ids['Herhaalregels'];
    if(sheetId==null) throw new Error('Sheet "Herhaalregels" niet gevonden');
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}]})});
    if(!resp.ok){const e=await resp.json();const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
    logEvent(r.code,r.sectie,'Herhaalregel verwijderd','','',r.omschrijving);
  },()=>{ // rollback: rij terugzetten + _row-indexen herstellen
    if((D.herhaal||[]).indexOf(r)===-1){ (D.herhaal||[]).forEach(x=>{if(x._row>=r._row)x._row++;}); D.herhaal.splice(Math.min(pos<0?D.herhaal.length:pos,D.herhaal.length),0,r); }
  },'Verwijderen mislukt');
}

export { renderHerhaal, openHerhaalModal, closeHerhaalModal, syncHerhaalVelden, submitHerhaal, toggleHerhaalStatus, deleteHerhaal };
