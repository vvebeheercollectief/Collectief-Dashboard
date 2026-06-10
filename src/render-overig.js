// ══════════════════════════════════════
//  RENDER-OVERIG — Ontwikkeling + Logboek
// ══════════════════════════════════════
import { esc, displayName, persBadges, emptyRow, _vandaagAmsterdam } from "./util.js";
import { PG, SID } from "./config.js";
import { state, D, pgs } from "./state.js";
import { ensureToken } from "./auth.js";
import { writeRange, appendRange } from "./api.js";
import { renderThead, renderPag } from "./render-lijsten.js";
import { getSheetIds, setv, gv } from "./crud.js";
import { loadAll } from "./data.js";
import { getCurrentWho } from "./notifications.js";

// ══════════════════════════════════════
//  ONTWIKKELING
// ══════════════════════════════════════
const ONTW_CATS=['Opmerkingen','Verbeteringen','Vragen aan Cihan','Ideeën'];
const ONTW_CAT_COLORS={'Opmerkingen':'var(--ac)','Verbeteringen':'var(--gn)','Vragen aan Cihan':'var(--am)','Ideeën':'var(--pu)'};

function parseOntw(rows){
  if(!rows||rows.length<2) return [];
  return rows.slice(1).map((r,i)=>{
    const titel=(r[0]||'').trim();
    if(!titel) return null;
    return{titel,categorie:(r[1]||'').trim(),inhoud:(r[2]||'').trim(),door:(r[3]||'').trim(),datum:(r[4]||'').trim(),status:(r[5]||'').trim()||'Open',_row:i+2};
  }).filter(Boolean);
}

function renderOntw(){
  const q=(document.getElementById('s-ontw')?.value||'').toLowerCase();
  const cats=['Alles',...ONTW_CATS,'Afgerond'];
  const openItems=D.ontw.filter(r=>r.status!=='Afgerond');
  const doneItems=D.ontw.filter(r=>r.status==='Afgerond');
  document.getElementById('ontw-tabs').innerHTML=cats.map(c=>{
    let cnt;
    if(c==='Alles') cnt=openItems.length;
    else if(c==='Afgerond') cnt=doneItems.length;
    else cnt=openItems.filter(r=>r.categorie===c).length;
    const activeStyle = c===state.activeOntw
      ? (c==='Afgerond' ? '--sec:var(--gn);--sec-l:var(--gn-l);--sec-b:var(--gn-b)' : '--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)')
      : '';
    return`<div class="tab ${c===state.activeOntw?'on':''}" style="${activeStyle}" data-action="ontw-cat" data-cat="${esc(c)}">${c}<span class="cnt">${cnt}</span></div>`;
  }).join('');

  let rows;
  if(state.activeOntw==='Afgerond') rows=doneItems;
  else if(state.activeOntw==='Alles') rows=openItems;
  else rows=openItems.filter(r=>r.categorie===state.activeOntw);
  if(q) rows=rows.filter(r=>`${r.titel} ${r.inhoud} ${r.categorie} ${r.door}`.toLowerCase().includes(q));

  renderThead('ontw-thead',['Titel','Categorie','Inhoud','Door','Datum','Status',''],'--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)');
  const sl=rows.slice((pgs.ontw-1)*PG,pgs.ontw*PG);
  const el=document.getElementById('ontw-tbody');
  if(!sl.length){el.innerHTML=`<tr><td colspan="7">${emptyRow(7,true)}</td></tr>`;return}
  el.innerHTML=sl.map(r=>{
    const rid=state._rowCache.length;state._rowCache.push(Object.assign({},r,{_sec:'ONTW'}));
    const clr=ONTW_CAT_COLORS[r.categorie]||'var(--mut)';
    return`<tr data-row="${r._row}">
      <td class="cell-name">${esc(r.titel)}</td>
      <td><span class="badge" style="background:color-mix(in srgb,${clr} 15%,transparent);color:${clr}">${esc(r.categorie)}</span></td>
      <td class="cell-txt">${r.inhoud?`<span style="font-size:12px">${esc(r.inhoud.substring(0,80))}${r.inhoud.length>80?'…':''}</span>`:''}</td>
      <td>${persBadges(r.door)}</td>
      <td class="cell-sm">${esc(r.datum)}</td>
      <td><span class="badge status-${esc((r.status||'').toLowerCase())}">${r.status==='Afgerond'?'✅':'⏳'} ${esc(r.status)}</span></td>
      <td><button class="btn-edit" data-action="ontw-bewerken" data-rid="${rid}" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
  renderPag('ontw-pag',rows.length,pgs.ontw,'ontw');
}
function setOntw(c){state.activeOntw=c;pgs.ontw=1;renderOntw()}

function openOntwModal(isEdit, rowData){
  state.ontwEditMode=!!isEdit;
  state.ontwEditRow=rowData||null;
  document.getElementById('ontw-m-title').textContent=isEdit?'Item bewerken':'Nieuw item';
  document.getElementById('ontw-m-submit-lbl').textContent=isEdit?'Opslaan':'Toevoegen';
  document.getElementById('ontw-m-del').style.display=isEdit?'inline-flex':'none';
  if(isEdit&&rowData){
    setv('ontw-m-titel',rowData.titel);
    setv('ontw-m-cat',rowData.categorie);
    setv('ontw-m-inhoud',rowData.inhoud);
    setv('ontw-m-status',rowData.status||'Open');
  } else {
    setv('ontw-m-titel','');setv('ontw-m-cat','');setv('ontw-m-inhoud','');setv('ontw-m-status','Open');
  }
  document.getElementById('ontw-modal-bg').classList.add('open');
}
function closeOntwModal(){document.getElementById('ontw-modal-bg').classList.remove('open')}

function editOntwItem(idx){
  const r=state._rowCache[idx];
  if(r) openOntwModal(true,r);
}

async function submitOntwItem(){
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const titel=gv('ontw-m-titel');
  const cat=gv('ontw-m-cat');
  if(!titel){alert('Titel is verplicht.');return}
  if(!cat){alert('Categorie is verplicht.');return}
  const inhoud=gv('ontw-m-inhoud');
  const status=gv('ontw-m-status')||'Open';
  const who=getCurrentWho()||'?';
  const d=new Date();
  const today=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const values=[titel,cat,inhoud,who,today,status];
  try{
    if(state.ontwEditMode&&state.ontwEditRow?._row){
      await writeRange(`'Ontwikkeling'!A${state.ontwEditRow._row}:F${state.ontwEditRow._row}`,values);
    } else {
      await appendRange("'Ontwikkeling'!A:F",values);
    }
    closeOntwModal();
    await loadAll();
  }catch(e){alert('Fout: '+e.message)}
}

async function deleteOntwItem(){
  if(!state.ontwEditRow) return;
  if(!confirm('Dit item verwijderen?')) return;
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  try{
    const ids=await getSheetIds();
    const sheetId=ids['Ontwikkeling'];
    if(sheetId==null) throw new Error('Sheet "Ontwikkeling" niet gevonden');
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:state.ontwEditRow._row-1,endIndex:state.ontwEditRow._row}}}]})
    });
    closeOntwModal();
    await loadAll();
  }catch(e){alert('Fout bij verwijderen: '+e.message)}
}

// ══════════════════════════════════════
//  LOGBOEK — parse, render & schrijf
// ══════════════════════════════════════
function parseLogboek(rows){
  if(!rows||rows.length<2) return [];
  return rows.slice(1).filter(r=>r&&r.length&&(r[0]||'').trim()).map((r,i)=>({
    _row:i+2,
    timestamp:(r[0]||'').trim(),
    code:(r[1]||'').trim(),
    sectie:(r[2]||'').trim(),
    actie:(r[3]||'').trim(),
    veld:(r[4]||'').trim(),
    oudeWaarde:(r[5]||'').trim(),
    nieuweWaarde:(r[6]||'').trim(),
    gebruiker:(r[7]||'').trim()
  })).reverse();
}

function fmtLogTs(iso){
  try{
    const d=new Date(iso);
    if(isNaN(d)) return iso;
    return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  }catch(e){return iso}
}

function actieBadge(actie){
  const map={
    'Afgerond':['--sec:var(--gn);--sec-l:var(--gn-l)','✓'],
    'Verwijderd':['--sec:var(--rd);--sec-l:var(--rd-l)','✕'],
    'Bewerkt':['--sec:var(--ac);--sec-l:var(--ac-l)','✎'],
    'Aangemaakt':['--sec:var(--pu);--sec-l:var(--pu-l)','+'],
    'Teruggezet':['--sec:var(--am);--sec-l:var(--am-l)','↩'],
    'Behandelaar gewijzigd':['--sec:var(--ac);--sec-l:var(--ac-l)','👤'],
    'Aangemaakt (sheet)':['--sec:var(--pu);--sec-l:var(--pu-l)','+'],
    'Opmerking':['--sec:var(--am);--sec-l:var(--am-l)','💬'],
  };
  const[css,ico]=map[actie]||['',''];
  return css?`<span class="badge" style="background:var(--sec-l);color:var(--sec);${css}">${ico} ${esc(actie)}</span>`:`<span class="badge">${esc(actie)}</span>`;
}

// Filterstatus voor de tijdlijn (leeg = alles)

const _LOG_AVKLEUR={Jer:'var(--ac)',Cihad:'var(--pu)',Gabos:'var(--pk)',Cihan:'var(--am)'};
function avatarKleur(naam){ return _LOG_AVKLEUR[naam] || 'var(--nv)'; }

function logDayLabel(iso){
  const d=new Date(iso);
  if(isNaN(d)) return 'Eerder';
  const dag=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const vandaag=_vandaagAmsterdam();
  const verschil=Math.round((vandaag-dag)/86400000);
  if(verschil===0) return 'Vandaag';
  if(verschil===1) return 'Gisteren';
  const s=d.toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}

// Natuurlijke zin per logboek-actie
function logZin(r){
  const naam=esc(displayName(r.gebruiker)||'Iemand');
  const chip=`<span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l)">${esc(r.code||'—')}</span>`;
  const A=(verb,kleur)=>`<b>${naam}</b> <span class="log-act" style="color:${kleur}">${verb}</span> `;
  switch(r.actie){
    case'Afgerond':            return A('rondde','var(--gn)')+chip+' af';
    case'Verwijderd':          return A('verwijderde','var(--rd)')+'een taak bij '+chip;
    case'Teruggezet':          return A('zette','var(--am)')+chip+' terug';
    case'Opmerking':           return A('noteerde','var(--am)')+'bij '+chip;
    case'Behandelaar gewijzigd':return A('wees','var(--ac)')+chip+' toe';
    case'Aangemaakt':
    case'Aangemaakt (sheet)':  return A('maakte','var(--pu)')+'een nieuwe taak bij '+chip+(r.nieuweWaarde?` <span style="color:var(--mut)">→ ${esc(r.nieuweWaarde)}</span>`:'');
    case'Bewerkt':             return A('bewerkte','var(--ac)')+chip+(r.veld?` <span style="color:var(--mut)">— ${esc(r.veld)}</span>`:'');
    default:                   return `<b>${naam}</b> — ${esc(r.actie||'')} `+chip;
  }
}

function logTijd(iso){
  const d=new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
}

function renderLogboek(){
  const q=(document.getElementById('s-logboek')?.value||'').toLowerCase();
  const rows=D.logboek.filter(r=>{
    if(state.logWho && displayName(r.gebruiker)!==state.logWho) return false;
    if(state.logAct){
      const m = r.actie===state.logAct || (state.logAct==='Aangemaakt' && (r.actie||'').indexOf('Aangemaakt')===0);
      if(!m) return false;
    }
    if(q&&!`${r.timestamp} ${r.code} ${r.sectie} ${r.actie} ${r.veld} ${r.oudeWaarde} ${r.nieuweWaarde} ${r.gebruiker} ${displayName(r.gebruiker)}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const countEl=document.getElementById('logboek-count');
  if(countEl) countEl.textContent=`${rows.length} ${rows.length===1?'gebeurtenis':'gebeurtenissen'}`;

  const sl=rows.slice((pgs.logboek-1)*PG,pgs.logboek*PG);
  const el=document.getElementById('logboek-feed');
  if(!el) return;

  if(!sl.length){
    el.innerHTML=`<div class="log-empty">Niets gevonden met deze filters.</div>`;
  } else {
    let html='', lastDay='';
    sl.forEach(r=>{
      const dag=logDayLabel(r.timestamp);
      if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
      let extra='';
      if((r.actie==='Behandelaar gewijzigd'||r.actie==='Bewerkt') && r.veld && (r.oudeWaarde||r.nieuweWaarde)){
        extra=`<div class="log-change"><span class="old">${esc(r.oudeWaarde||'—')}</span><span class="arr">→</span><span class="new">${esc(r.nieuweWaarde||'—')}</span></div>`;
      }
      if(r.actie==='Opmerking' && r.nieuweWaarde){
        extra=`<div class="log-note">"${esc(r.nieuweWaarde)}"</div>`;
      }
      const init=(displayName(r.gebruiker)||'?').charAt(0).toUpperCase();
      html+=`<div class="log-item">
        <span class="log-av" style="background:${avatarKleur(displayName(r.gebruiker))}">${esc(init)}</span>
        <div class="log-body"><div class="log-line">${logZin(r)}</div>${extra}</div>
        <span class="log-time">${esc(logTijd(r.timestamp))}</span>
      </div>`;
    });
    el.innerHTML=html;
  }
  renderPag('logboek-pag',rows.length,pgs.logboek,'logboek');
}

// Ctrl/Cmd+Enter in het logboek-veld voegt de notitie toe; gewone Enter = witregel
function histNoteKey(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addTaskNote();}
}

function renderTaskHistory(code,sec){
  const container=document.getElementById('fg-history');
  const body=document.getElementById('hist-body');
  const countEl=document.getElementById('hist-count');
  const noteInput=document.getElementById('hist-note');
  if(noteInput)noteInput.value='';
  if(!code){container.style.display='none';return}
  container.style.display='';
  container.dataset.code=code;
  container.dataset.sec=sec||'';
  const entries=(D.logboek||[]).filter(r=>r.code===code&&(!sec||r.sectie===sec));
  countEl.textContent=entries.length||'';
  countEl.style.display=entries.length?'':'none';
  if(!entries.length){
    body.innerHTML='<div style="color:var(--mut);font-size:12px;padding:4px 0 8px">Nog geen notities — wees de eerste die iets vastlegt.</div>';
  } else {
    body.innerHTML=entries.slice(0,50).map(r=>`<div class="hist-entry">
      <div class="hist-ts">${esc(fmtLogTs(r.timestamp))}</div>
      <div class="hist-detail">
        ${actieBadge(r.actie)}
        <span style="margin-left:6px;color:var(--mut)">${esc(displayName(r.gebruiker))}</span>
        ${r.veld?`<div class="hist-change">${esc(r.veld)}: ${esc(r.oudeWaarde)} → ${esc(r.nieuweWaarde)}</div>`:''}
        ${r.actie==='Opmerking'&&r.nieuweWaarde?`<div class="hist-change">${esc(r.nieuweWaarde)}</div>`:''}
      </div>
    </div>`).join('');
  }
}

async function addTaskNote(){
  const note=(document.getElementById('hist-note').value||'').trim();
  if(!note){alert('Typ eerst een opmerking.');return}
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const container=document.getElementById('fg-history');
  const code=container.dataset.code;
  const sec=container.dataset.sec;
  if(!code)return;
  await logEvent(code,sec,'Opmerking','','',note);
  document.getElementById('hist-note').value='';
  D.logboek.unshift({_row:0,timestamp:new Date().toISOString(),code,sectie:sec,actie:'Opmerking',veld:'',oudeWaarde:'',nieuweWaarde:note,gebruiker:getCurrentWho()||'?'});
  renderTaskHistory(code,sec);
}

async function logEvent(code, sec, actie, veld, oudeWaarde, nieuweWaarde) {
  try {
    if (!state.oauthToken) return;
    const who = getCurrentWho() || '?';
    const ts = new Date().toISOString();
    await appendRange("'Logboek'!A:H", [ts, code||'', sec||'', actie||'', veld||'', oudeWaarde||'', nieuweWaarde||'', who]);
  } catch(e) { console.warn('Logboek schrijffout:', e); }
}


export {
  ONTW_CATS, ONTW_CAT_COLORS, parseOntw, renderOntw, setOntw, openOntwModal, closeOntwModal,
  submitOntwItem, deleteOntwItem, editOntwItem, parseLogboek, fmtLogTs, actieBadge, _LOG_AVKLEUR, avatarKleur,
  logDayLabel, logZin, logTijd, renderLogboek, histNoteKey, renderTaskHistory, addTaskNote, logEvent,
};
