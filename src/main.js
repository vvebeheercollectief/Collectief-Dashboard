// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
import {
  PROD_HOSTS, _isStagingHost, IS_STAGING, SID, SID_PROD, SID_TEST, PG,
  ONESIGNAL_APP_ID, ONESIGNAL_APP_ID_PROD, ONESIGNAL_APP_ID_TEST,
  ALLOWED_EMAILS, EMAIL_NAMES, SECS, SKEYS, PAGE_META, clientId,
} from './config.js';
import { D, pgs, _shownToasts, _undoStack, state } from './state.js';
import {
  displayName, filt, PRIO_REGELS, STIL_DREMPEL_DAGEN, _vandaagAmsterdam,
  _verschilInKalenderdagen, berekenPrioriteit, prioBadge, persBadges, ibBadge,
  adjOff, offProg, _MAANDEN, _parseAnyDate, parseDt, toISODate, toDutchDate,
  emptyRow, esc, subBadge,
} from './util.js';
import { fetchSheet, writeRange, appendRange, _shiftNtdRows, _isTransient, _withRetry } from './api.js';
import { doOAuth, fetchUserEmail, doLogin, ensureToken } from './auth.js';
import { goTo, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch } from './ui.js';
import { buildAnalytics, buildDash } from './render-analytics.js';
import {
  renderNtd, renderAf, renderAlvo, renderAlfa, renderNtdStats, renderNtdDonut,
  setNtd, setAf, toggleAlvoFlag, renderThead, renderPag,
} from './render-lijsten.js';
import {
  renderOntw, renderLogboek, parseOntw, parseLogboek, setOntw, openOntwModal, closeOntwModal,
  submitOntwItem, deleteOntwItem, addTaskNote, histNoteKey, renderTaskHistory, logEvent, logZin,
} from './render-overig.js';

// ── TIJDELIJKE re-exports (Fase 2A) — functies die nog in main.js wonen maar
// door reeds-afgesplitste modules gebruikt worden. Krimpt naarmate we verder
// opsplitsen; aan het eind van mijlpaal A weg.
export { loadAll, showToast, getSheetIds };



// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════

// ══════════════════════════════════════
//  BOOT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  // Zichtbare waarschuwingsbalk in de testomgeving
  if (IS_STAGING) {
    document.title = '[TEST] ' + document.title;
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="position:fixed;top:0;left:0;right:0;z-index:100000;background:#B45309;color:#fff;'
      + 'text-align:center;font:600 13px/2.4 system-ui,sans-serif;letter-spacing:.3px">'
      + '⚠ TESTOMGEVING — dit is niet het echte dashboard</div>'
      + '<div style="height:34px"></div>');
  }

  // Service worker registreren (PWA-ondersteuning)
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      const _swBase=location.pathname.replace(/\/[^/]*$/,'')||'';
      navigator.serviceWorker.register(_swBase+'/sw.js',{scope:_swBase+'/'}).catch(e=>console.warn('SW registratie mislukt:',e));
    });
  }

  if(localStorage.getItem('theme')==='dark') applyTheme('dark');
  applyDensity(localStorage.getItem('density')||'standaard');

  document.querySelectorAll('.ni[data-page]').forEach(el=>
    el.addEventListener('click',()=>goTo(el.dataset.page)));

  setupSearch('s-ntd',()=>{pgs.ntd=1;renderNtd()});
  setupSearch('s-af', ()=>{pgs.af=1; renderAf()});
  setupSearch('s-alvo',()=>{pgs.alvo=1;renderAlvo()});
  setupSearch('s-alfa',()=>{pgs.alfa=1;renderAlfa()});
  setupSearch('f-code-ntd',()=>{pgs.ntd=1;renderNtd()});
  document.getElementById('f-beh-ntd').onchange=()=>{pgs.ntd=1;renderNtd()};
  document.getElementById('f-prio-ntd').onchange=()=>{pgs.ntd=1;renderNtd()};
  document.getElementById('f-status-alvo').onchange=()=>{pgs.alvo=1;renderAlvo()};
  setupSearch('s-logboek',()=>{pgs.logboek=1;renderLogboek()});
  document.getElementById('logboek-who').addEventListener('click',e=>{
    const b=e.target.closest('.lchip'); if(!b)return;
    document.querySelectorAll('#logboek-who .lchip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); state.logWho=b.dataset.who; pgs.logboek=1; renderLogboek();
  });
  document.getElementById('logboek-act').addEventListener('click',e=>{
    const b=e.target.closest('.lchip'); if(!b)return;
    document.querySelectorAll('#logboek-act .lchip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); state.logAct=b.dataset.act; pgs.logboek=1; renderLogboek();
  });

  document.getElementById('refresh-btn').onclick=loadAll;
  document.getElementById('theme-btn').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  document.getElementById('density-btn').onclick=cycleDensity;
  document.getElementById('ai-btn').onclick=openAiHelp;
  document.getElementById('ai-close').onclick=closeAiHelp;
  let _aiMouseDown=null;
  document.getElementById('ai-bg').addEventListener('mousedown',e=>{_aiMouseDown=e.target});
  document.getElementById('ai-bg').addEventListener('click',e=>{if(e.target.id==='ai-bg'&&_aiMouseDown?.id==='ai-bg')closeAiHelp()});
  document.getElementById('ai-chips').addEventListener('click',e=>{const b=e.target.closest('.ai-chip');if(!b)return;b.classList.toggle('on');buildAiPrompt();parseAiAnswer();});
  document.getElementById('ai-mail').addEventListener('input',buildAiPrompt);
  document.getElementById('ai-vve').addEventListener('change',()=>{buildAiPrompt();parseAiAnswer();});
  document.getElementById('ai-answer').addEventListener('input',parseAiAnswer);
  document.getElementById('hamburger').onclick=()=>{document.getElementById('sb').classList.toggle('open');document.getElementById('overlay').classList.toggle('on')};
  document.getElementById('overlay').onclick=closeSb;

  document.getElementById('btn-add').onclick=()=>openModal(false);
  window.editRow=idx=>openModal(true,state._rowCache[idx]);
  document.getElementById('m-close').onclick=closeModal;
  document.getElementById('m-cancel').onclick=closeModal;
  let _modalMouseDownTarget=null;
  document.getElementById('modal-bg').addEventListener('mousedown',e=>{_modalMouseDownTarget=e.target});
  document.getElementById('modal-bg').addEventListener('click',e=>{if(e.target.id==='modal-bg'&&_modalMouseDownTarget?.id==='modal-bg')closeModal()});
  document.getElementById('m-submit').onclick=submitTask;

  // Ontwikkeling modal + search
  document.getElementById('btn-add-ontw').onclick=()=>openOntwModal(false);
  document.getElementById('ontw-m-close').onclick=closeOntwModal;
  document.getElementById('ontw-m-cancel').onclick=closeOntwModal;
  document.getElementById('ontw-m-submit').onclick=submitOntwItem;
  document.getElementById('ontw-m-del').onclick=deleteOntwItem;
  let _ontwMouseDown=null;
  document.getElementById('ontw-modal-bg').addEventListener('mousedown',e=>{_ontwMouseDown=e.target});
  document.getElementById('ontw-modal-bg').addEventListener('click',e=>{if(e.target.id==='ontw-modal-bg'&&_ontwMouseDown?.id==='ontw-modal-bg')closeOntwModal()});
  setupSearch('s-ontw',()=>{pgs.ontw=1;renderOntw()});

  // Afgerond modal
  document.getElementById('complete-close').onclick=closeCompleteModal;
  document.getElementById('complete-cancel').onclick=closeCompleteModal;
  document.getElementById('complete-confirm').onclick=doCompleteTask;
  let _compMouseDown=null;
  document.getElementById('complete-bg').addEventListener('mousedown',e=>{_compMouseDown=e.target});
  document.getElementById('complete-bg').addEventListener('click',e=>{if(e.target.id==='complete-bg'&&_compMouseDown?.id==='complete-bg')closeCompleteModal()});

  // VvE autocomplete
  const codeInput = document.getElementById('m-code');
  codeInput.addEventListener('input',onCodeInput);
  codeInput.addEventListener('blur',()=>setTimeout(()=>{document.getElementById('vve-sug').style.display='none'},200));

  // Notificatie-modal handlers
  document.getElementById('notif-btn').onclick = openNotifModal;
  document.getElementById('notif-close').onclick = closeNotifModal;
  document.getElementById('notif-bg').onclick = e => { if (e.target.id === 'notif-bg') closeNotifModal(); };
  document.getElementById('notif-who').onchange = () => { onWhoChange(); saveNotifPrefs(); };
  document.getElementById('notif-who-other').oninput = () => saveNotifPrefs();
  document.getElementById('notif-subscribe-btn').onclick = subscribeNotifs;
  document.getElementById('notif-unsubscribe-btn').onclick = unsubscribeNotifs;
  document.getElementById('notif-test-btn').onclick = () => sendTestNotif(getCurrentWho(), '🔔 Test melding', 'Notificaties werken correct op dit apparaat!');
  startNotifPoll();

  // Live updates — auto-refresh elke 8 seconden (smart diff voorkomt onnodige re-renders)
  setInterval(async ()=>{
    if(document.hidden) return;
    if(document.getElementById('modal-bg').classList.contains('open')) return;
    if(document.getElementById('complete-bg').classList.contains('open')) return;
    if(document.getElementById('ontw-modal-bg').classList.contains('open')) return;
    if(document.getElementById('dot').classList.contains('loading')) return;
    if(state.pendingWrites>0) return;
    if(!await ensureToken()) return;
    loadAll(true);
  },8000);

  // Token-refresh heartbeat — elke 4 min proactief vernieuwen vóór expiry
  setInterval(()=>{
    if(!state.oauthToken) return;
    if(state.oauthExpiry - Date.now() > 5*60*1000) return;
    try{ state._gsiTokenClient && state._gsiTokenClient.requestAccessToken({prompt:''}); }catch(e){}
  },4*60*1000);

  // Sessie herstellen uit sessionStorage
  const _st=sessionStorage.getItem('oauthToken');
  const _se=parseInt(sessionStorage.getItem('oauthExpiry')||'0');
  const _sm=sessionStorage.getItem('currentUserEmail');
  if(_st&&Date.now()<_se&&_sm&&ALLOWED_EMAILS.includes(_sm.toLowerCase())){
    state.oauthToken=_st;state.oauthExpiry=_se;state.currentUserEmail=_sm;
    document.getElementById('login-gate').style.display='none';
    loadAll();
  }

  goTo('ntd');
});


// ══════════════════════════════════════
//  API
// ══════════════════════════════════════

// Voert een Sheets-schrijfactie op de achtergrond uit (serieel). De UI is al
// optimistisch bijgewerkt door de aanroeper. Bij fout draait `rollback` de lokale
// wijziging terug en verschijnt een foutmelding.
function backgroundWrite(writeFn, rollback, foutTitel){
  state.pendingWrites++;
  state._writeChain=state._writeChain.then(async()=>{
    try{
      await _withRetry(writeFn);
    }catch(e){
      try{ rollback(); renderAll(); }catch(_){}
      const msg=(e.message||'').toLowerCase();
      if(msg.includes('authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
        state.oauthToken=null;state.oauthExpiry=0;
        showToast(foutTitel,'Sessie verlopen — wijziging teruggezet. Probeer opnieuw.','#dc2626');
      }else{
        showToast(foutTitel,'Niet opgeslagen — wijziging teruggezet.','#dc2626');
      }
      console.error(foutTitel,e);
    }finally{
      state.pendingWrites--;
      if(state.pendingWrites===0){ loadAll(true); } // stille resync van rij-indexen
    }
  });
  return state._writeChain;
}

function setSyncing(){dot('loading');document.getElementById('sync-lbl').textContent='Laden…'}
function setSynced(){dot('');document.getElementById('sync-lbl').textContent='Live · '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
function setSyncErr(){dot('err');document.getElementById('sync-lbl').textContent='Fout'}
function dot(cls){const d=document.getElementById('dot');d.className='dot'+(cls?' '+cls:'')}

// Herhaal-slot: voorkomt dat twee loadAll-aanroepen tegelijk lopen en elkaars data
// overschrijven (8s-poll, schrijf-resync, refresh-knop, handmatige awaits).
async function loadAll(silent){
  if(state._loadInFlight){ state._loadAgain=true; return; }
  state._loadInFlight=true;
  try{
    if(!state.oauthToken){
      if(!await ensureToken()){setSyncErr();return}
    }
    if(!silent) setSyncing();
    const[ntdR,afR,alvoR,alfaR,ontwR,logR]=await Promise.all([
      fetchSheet("Nog Te Doen"),fetchSheet("Afgerond"),
      fetchSheet("ALV's overzicht"),fetchSheet("ALV's afgerond"),
      fetchSheet("Ontwikkeling").catch(()=>[]),
      fetchSheet("Logboek").catch(()=>[]),
    ]);
    // Kwam er tijdens het lezen een schrijfactie tussen? Dan is de lokale (optimistische)
    // staat leidend; de eigen resync van die schrijfactie haalt zo de verse data op.
    if(state.pendingWrites>0){ if(!silent) setSynced(); return; }
    const ntdP=parseSections(ntdR); D.ntd=ntdP.data; D.ntdSecInfo=ntdP.secInfo;
    const afP=parseSections(afR); D.af=afP.data; D.afSecInfo=afP.secInfo;
    SKEYS.forEach(s=>{if(D.af[s])D.af[s].sort((a,b)=>parseDt(b.datum)-parseDt(a.datum))});
    D.alvo=parseAlvo(alvoR);
    D.alfa=parseAlfa(alfaR);
    D.ontw=parseOntw(ontwR);
    D.logboek=parseLogboek(logR);
    setSynced();
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek]);
    if(hash!==state._lastDHash){
      state._lastDHash=hash;
      renderAll();
      // Re-render actieve detailpagina's met nieuwe data
      if(document.getElementById('page-analytics')?.classList.contains('active')) buildAnalytics();
      if(document.getElementById('page-dash')?.classList.contains('active')) buildDash();
      if(document.getElementById('page-ntd')?.classList.contains('active')) renderNtdDonut();
    }
  }catch(e){setSyncErr();console.error(e)}
  finally{
    state._loadInFlight=false;
    if(state._loadAgain){ state._loadAgain=false; loadAll(true); } // een onderdrukte aanroep alsnog uitvoeren
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
    entry.subcategorie=(row[afOff+2]||'').trim();
    if(entry.code) out[cur].push(entry);
  }
  return {data:out,secInfo};
}

function parseAlvo(rows){
  return rows.slice(2).map((r,i)=>{
    const code=(r[0]||'').trim();
    if(!code||code.length>20) return null;
    // Skip stat rows
    if(['Totaal','Uitnodigingen','Notulen','Nog'].some(p=>code.startsWith(p))) return null;
    const uitn=(r[2]||'').trim()==='TRUE';
    const notu=(r[3]||'').trim()==='TRUE';
    const begr=(r[4]||'').trim()==='TRUE';
    const status=notu?'Afgerond':uitn?'Gepland':'Open';
    return{code,naam:(r[1]||'').trim(),uitnodiging:uitn,notulen:notu,begroting:begr,opmerkingen:(r[5]||'').trim(),status,_row:i+3};
  }).filter(Boolean);
}

function parseAlfa(rows){
  return rows.slice(1).map(r=>({
    code:(r[0]||'').trim(),naam:(r[1]||'').trim(),datum:(r[2]||'').trim()
  })).filter(r=>r.code);
}

// ══════════════════════════════════════
//  RENDER ALL
// ══════════════════════════════════════
function renderAll(){
  state._rowCache=[];
  const ntdTotal=SKEYS.reduce((s,k)=>s+(D.ntd[k]?.length||0),0);
  document.getElementById('b-ntd').textContent=ntdTotal;
  renderNtdStats();
  renderNtd();
  renderAf();
  renderAlvo();
  renderAlfa();
  renderOntw();
  renderLogboek();
}

// ══════════════════════════════════════
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
function setv(id,v){const el=document.getElementById(id);if(el)el.value=v||''}

function clearModal(){
  document.querySelectorAll('.modal-body input,.modal-body select,.modal-body textarea').forEach(el=>{if(!el.readOnly)el.value=''});
  ['m-off-recv','m-off-total'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0'});
  ['tog-ib','tog-ib-v','tog-ib-l'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on')});
}

// ══════════════════════════════════════
//  VvE CODE AUTOCOMPLETE
// ══════════════════════════════════════
function onCodeInput(){
  const q=document.getElementById('m-code').value.trim().toLowerCase();
  const sug=document.getElementById('vve-sug');
  if(q.length<2){sug.style.display='none';return}
  const matches=D.alvo.filter(r=>r.code.toLowerCase().includes(q)||r.naam.toLowerCase().includes(q)).slice(0,8);
  if(!matches.length){sug.style.display='none';return}
  sug.style.display='block';
  sug.innerHTML=matches.map(r=>`
    <div class="vve-sug-item" data-code="${esc(r.code)}" data-naam="${esc(r.naam)}">
      <div class="vve-sug-code">${esc(r.code)}</div>
      <div class="vve-sug-naam">${esc(r.naam)}</div>
    </div>`).join('');
  sug.querySelectorAll('.vve-sug-item').forEach(el=>{
    el.onclick=()=>selectVvE(el.dataset.code,el.dataset.naam);
  });
}

function selectVvE(code,naam){
  document.getElementById('m-code').value=code;
  document.getElementById('m-naam').value=naam;
  document.getElementById('vve-sug').style.display='none';
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
  await writeRange(`'${sheetName}'!A${afterRow+1}:${endCol}${afterRow+1}`,values);
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
  if(!confirm(`Weet je zeker dat je deze taak wilt verwijderen?\n\n"${omschrijving}"`)) return;
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  try{
    const ids=await getSheetIds();
    const sheetId=ids['Nog Te Doen'];
    if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}]})
    });
    if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}throw new Error(e.error?.message||'Verwijderfout')}
    logEvent(r.code, r._sec, 'Verwijderd', '', r.actiepunt||r.periode||'', '');
    await loadAll();
  }catch(e){alert('Fout bij verwijderen: '+e.message)}
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
    const ntdValues=ntdKeys.map(k=>r[k]||''); ntdValues.push(r.subcategorie||'');
    const undoData={sec,code:r.code,ntdValues,ntdRow:r._row};
    // 1) optimistisch: meteen uit de lokale lijst halen + indexen meeschuiven + opnieuw tekenen
    const arr=D.ntd[sec]||[];
    const pos=arr.indexOf(r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(r._row,-1);
    renderAll();
    closeCompleteModal();
    showUndoToast('✅ Taak afgerond',`${r.code} — ${r.actiepunt||r.naam||''}`,()=>undoComplete(undoData));
    // 2) op de achtergrond wegschrijven; bij fout de taak terugzetten
    backgroundWrite(
      async ()=>{
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify(batchBody)});
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Fout bij afhandelen taak');err.status=resp.status;throw err}
        logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]); if(a.indexOf(r)===-1){ _shiftNtdRows(r._row,+1); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
      'Afronden mislukt'
    );
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
    switch(sec){
      case'OPPAKKEN':{
        const _berekend = berekenPrioriteit(toDutchDate(gv('m-dl')), 'OPPAKKEN').prioriteit;
        values=[code,naam,gv('m-actie'),toDutchDate(gv('m-dl')),gv('m-beh'),_berekend,gv('m-opm'),
          document.getElementById('tog-ib').classList.contains('on'),'',sub];break;}
      case'VERGADERVERZOEKEN':
        values=[code,naam,gv('m-per'),gv('m-agenda'),gv('m-beh-v'),toDutchDate(gv('m-dl-v')),gv('m-opm-v'),
          document.getElementById('tog-ib-v').classList.contains('on'),'',sub];break;
      case'OFFERTE-TRAJECTEN':{
        const recv=parseInt(gv('m-off-recv'))||0;
        const total=parseInt(gv('m-off-total'))||0;
        const offStr=total>0?`${recv}/${total}`:'';
        values=[code,naam,toDutchDate(gv('m-daang')),offStr,gv('m-beh-o'),toDutchDate(gv('m-dl-o')),gv('m-opm-o'),'','',sub];break;}
      case'LOD':
        values=[code,naam,gv('m-actie-l'),gv('m-stat-l'),gv('m-beh-l'),toDutchDate(gv('m-dl-l')),gv('m-opm-l'),
          document.getElementById('tog-ib-l').classList.contains('on'),'',sub];break;
    }

    const endCol=String.fromCharCode(64+Math.max(values.length,9));
    const keys=SECS[sec].keys;
    const norm=v=>v===true?'TRUE':v===false?'FALSE':v; // boolean → Sheets-stringvorm
    const newBeh=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):gv('m-beh-l'));
    if(state.editMode&&state.editRowData?._row){
      // ── Bewerken: lokale rij meteen bijwerken, dan op de achtergrond opslaan ──
      const doelRow=state.editRowData, oudeWaarden={...editRowData};
      keys.forEach((k,i)=>{ doelRow[k]=norm(values[i]); });
      doelRow.subcategorie=values[values.length-1];
      renderAll();
      closeModal();clearModal();
      showToast('💾 Opgeslagen',`${code} — ${naam||''}`,null);
      backgroundWrite(
        async ()=>{
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
//  AI-HULP — plak mailtekst (slim kopieer-plak)
// ══════════════════════════════════════

function openAiHelp(){
  const sel=document.getElementById('ai-vve');
  const huidige=sel.value;
  const opts=['<option value="">— Geen VvE koppelen —</option>'];
  (D.alvo||[]).slice().sort((a,b)=>String(a.code||'').localeCompare(String(b.code||''))).forEach(r=>{
    if(!r.code) return;
    opts.push(`<option value="${esc(r.code)}">${esc(r.code)} — ${esc(r.naam||'')}</option>`);
  });
  sel.innerHTML=opts.join('');
  if(huidige) sel.value=huidige;
  document.getElementById('ai-answer').value='';
  const res=document.getElementById('ai-result'); res.style.display='none'; res.innerHTML='';
  document.querySelectorAll('#ai-chips .ai-chip').forEach(c=>c.classList.add('on'));
  buildAiPrompt();
  document.getElementById('ai-bg').classList.add('open');
}
function closeAiHelp(){ document.getElementById('ai-bg').classList.remove('open'); }

function aiSelectedWants(){
  return [...document.querySelectorAll('#ai-chips .ai-chip.on')].map(c=>c.dataset.k);
}

// Live context voor een VvE-code uit de huidige dashboard-data
function aiVveContext(code){
  if(!code) return null;
  const c=String(code).toLowerCase();
  let naam='', behs=new Set(), open=[];
  SKEYS.forEach(s=>{
    (D.ntd[s]||[]).forEach(r=>{
      if(String(r.code||'').toLowerCase()!==c) return;
      if(r.naam && !naam) naam=r.naam;
      if(r.behandelaar) String(r.behandelaar).split(/[,\/]/).forEach(b=>{const t=b.trim();if(t)behs.add(t);});
      const titel=r.actiepunt||r.agendapunten||r.status||SECS[s].label;
      open.push(`${SECS[s].label}: ${titel}`.trim());
    });
  });
  if(!naam){ const a=(D.alvo||[]).find(x=>String(x.code||'').toLowerCase()===c); if(a)naam=a.naam||''; }
  const laatste=(D.logboek||[]).filter(r=>String(r.code||'').toLowerCase()===c).slice(0,3)
    .map(r=>`${fmtLogTs(r.timestamp)} — ${displayName(r.gebruiker)}: ${r.actie}${r.nieuweWaarde?' ('+r.nieuweWaarde+')':''}`);
  if(!naam && !behs.size && !open.length && !laatste.length) return null;
  return {code, naam, beh:[...behs].join(', '), open, laatste};
}

const AI_WANT_TEKST={
  samenvatting:'Een korte samenvatting in 2-3 zinnen.',
  categorie:'In welke categorie dit valt (Oppakken / Vergaderverzoeken / Offerte-trajecten / LOD) en om welke VvE het gaat, met een prioriteit-inschatting (Hoog/Midden/Laag).',
  acties:'De concrete actiepunten als bulletlijst (begin elke regel met "- ").',
  antwoord:'Een vriendelijk, professioneel concept-antwoord namens VvE Beheer Collectief.'
};
const AI_KOPPEN={samenvatting:'Samenvatting:',categorie:'Categorie:',acties:'Actiepunten:',antwoord:'Concept-antwoord:'};

function buildAiPrompt(){
  const mail=(document.getElementById('ai-mail').value||'').trim();
  const wants=aiSelectedWants();
  const code=document.getElementById('ai-vve').value;
  const ctxBox=document.getElementById('ai-ctx');
  const ctx=code?aiVveContext(code):null;

  if(ctx){
    ctxBox.classList.add('show');
    ctxBox.innerHTML=`<b>Live context — VvE ${esc(ctx.code)}${ctx.naam?' ('+esc(ctx.naam)+')':''}:</b><ul>`
      +(ctx.beh?`<li>Behandelaar: ${esc(ctx.beh)}</li>`:'')
      +(ctx.open.length?`<li>Open taken: ${esc(ctx.open.join('; '))}</li>`:'')
      +(ctx.laatste.length?`<li>Laatste logboek: ${esc(ctx.laatste[0])}</li>`:'')
      +`</ul>`;
  } else { ctxBox.classList.remove('show'); ctxBox.innerHTML=''; }

  const p=document.getElementById('ai-prompt');
  if(!mail && !wants.length){ p.innerHTML='<span class="empty">Plak een mail en kies wat je nodig hebt — hier verschijnt dan vanzelf de vraag.</span>'; return; }

  let out='<span class="k">Rol:</span> Je bent de assistent van VvE Beheer Collectief, een VvE-beheerkantoor. Antwoord in het Nederlands, zakelijk en bondig.\n\n';
  out+='<span class="k">De binnengekomen e-mail:</span>\n"""'+esc(mail||'(nog leeg)')+'"""\n';
  if(ctx){
    out+='\n<span class="k">Wat wij al weten over deze VvE ('+esc(ctx.code)+(ctx.naam?' — '+esc(ctx.naam):'')+'):</span>\n';
    if(ctx.beh) out+='- Behandelaar: '+esc(ctx.beh)+'\n';
    if(ctx.open.length) out+='- Open taken: '+esc(ctx.open.join('; '))+'\n';
    if(ctx.laatste.length) out+='- Laatste logboek: '+esc(ctx.laatste.join(' | '))+'\n';
  }
  out+='\n<span class="k">Geef mij — gebruik exact deze kopjes zodat ik het kan inlezen:</span>\n';
  if(wants.length){
    wants.forEach(w=>{ out+='\n'+AI_KOPPEN[w]+'\n'+AI_WANT_TEKST[w]+'\n'; });
  } else { out+='- (kies hierboven minstens één optie)\n'; }
  p.innerHTML=out;
}

function copyAiPrompt(waar){
  const txt=document.getElementById('ai-prompt').innerText;
  if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
  showToast('📎 Gekopieerd','Plak in '+waar+' met Ctrl/⌘+V','var(--ac)');
  const url=waar==='Claude'?'https://claude.ai/new':'https://gemini.google.com/app';
  try{ window.open(url,'_blank'); }catch(e){}
}

// Antwoord ontleden op de vaste kopjes
function aiParseSections(txt){
  const koppen=[['samenvatting','samenvatting'],['categorie','categorie'],['acties','actiepunten'],['antwoord','concept-antwoord']];
  const res={};
  const lines=txt.split(/\r?\n/);
  let huidig=null, buf=[];
  const flush=()=>{ if(huidig) res[huidig]=buf.join('\n').trim(); buf=[]; };
  lines.forEach(line=>{
    const m=line.match(/^\s*([^:]{2,30}?)\s*:\s*(.*)$/);
    let key=null;
    if(m){ const lab=m[1].toLowerCase().replace(/[\s*#_-]/g,''); koppen.forEach(([k,l])=>{ if(lab===l.replace(/[\s-]/g,'')) key=k; }); }
    if(key){ flush(); huidig=key; if(m[2].trim()) buf.push(m[2].trim()); }
    else if(huidig){ buf.push(line); }
  });
  flush();
  return res;
}

function parseAiAnswer(){
  const box=document.getElementById('ai-result');
  const txt=(document.getElementById('ai-answer').value||'').trim();
  if(!txt){ box.style.display='none'; box.innerHTML=''; return; }
  const wants=aiSelectedWants();
  const sec=aiParseSections(txt);
  const code=document.getElementById('ai-vve').value;
  const ctx=code?aiVveContext(code):null;
  state._aiLastCode=code||''; state._aiLastNaam=ctx?(ctx.naam||''):'';

  let html='<div class="ai-rhead">📥 Wat het dashboard eruit haalt</div>';
  if(wants.includes('samenvatting') && sec.samenvatting){
    html+=`<div class="ai-card"><div class="ai-card-hd">📝 Samenvatting<span class="sp"></span></div><div class="ai-card-bd">${esc(sec.samenvatting)}</div></div>`;
  }
  if(wants.includes('categorie') && sec.categorie){
    const catSec=aiGisCategorie(sec.categorie);
    html+=`<div class="ai-card"><div class="ai-card-hd">🏷️ Categorie &amp; VvE<span class="sp"></span><button class="ai-mini" onclick="aiOvernemen('${catSec}')">Overnemen</button></div><div class="ai-card-bd">${esc(sec.categorie)}</div></div>`;
  }
  if(wants.includes('acties') && sec.acties){
    const items=sec.acties.split(/\r?\n/).map(s=>s.replace(/^[-*•\d.]+\s*/,'').trim()).filter(Boolean);
    const li=items.map(a=>`<li><span class="ck"></span><span class="atxt">${esc(a)}</span><button class="ai-mini plus" onclick="aiActieTaak(this)">+ Taak</button></li>`).join('');
    html+=`<div class="ai-card"><div class="ai-card-hd">✅ Actiepunten<span class="sp"></span></div><div class="ai-card-bd"><ul class="ai-acts">${li||'<li><span class="atxt" style="color:var(--mut)">Geen losse punten gevonden.</span></li>'}</ul></div></div>`;
  }
  if(wants.includes('antwoord') && sec.antwoord){
    html+=`<div class="ai-card"><div class="ai-card-hd">✍️ Concept-antwoord<span class="sp"></span><button class="ai-mini" onclick="aiKopieerConcept(this)">Kopieer</button></div><div class="ai-card-bd"><div class="ai-reply">${esc(sec.antwoord)}</div></div></div>`;
  }
  const gevonden=Object.keys(sec).length;
  if(!gevonden){ html+=`<div class="ai-card"><div class="ai-card-bd" style="color:var(--mut)">Geen herkenbare kopjes gevonden. Plak het hele antwoord van de AI (met de kopjes Samenvatting:, Categorie:, Actiepunten:, Concept-antwoord:).</div></div>`; }
  box.innerHTML=html;
  box.style.display='flex';
}

function aiGisCategorie(txt){
  const t=(txt||'').toLowerCase();
  if(t.includes('vergader')) return 'VERGADERVERZOEKEN';
  if(t.includes('offerte')) return 'OFFERTE-TRAJECTEN';
  if(/\blod\b/.test(t)) return 'LOD';
  return 'OPPAKKEN';
}

function prefillNieuweTaak(sec, code, naam, actiepunt){
  if(!SECS[sec]) sec='OPPAKKEN';
  closeAiHelp();
  state.activeNtd=sec;
  goTo('ntd');
  openModal(false);
  const setIf=(id,v)=>{const el=document.getElementById(id);if(el&&v)el.value=v;};
  setIf('m-code',code); setIf('m-naam',naam);
  if(actiepunt){
    if(sec==='OPPAKKEN') setIf('m-actie',actiepunt);
    else if(sec==='VERGADERVERZOEKEN') setIf('m-agenda',actiepunt);
    else if(sec==='OFFERTE-TRAJECTEN') setIf('m-opm-o',actiepunt);
    else if(sec==='LOD') setIf('m-actie-l',actiepunt);
  }
}
function aiOvernemen(sec){ prefillNieuweTaak(sec,state._aiLastCode,state._aiLastNaam,''); }
function aiActieTaak(btn){
  const txt=btn.closest('li').querySelector('.atxt').textContent;
  prefillNieuweTaak('OPPAKKEN',state._aiLastCode,state._aiLastNaam,txt);
}
function aiKopieerConcept(btn){
  const txt=btn.closest('.ai-card').querySelector('.ai-reply').innerText;
  if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
  showToast('📋 Gekopieerd','Concept-antwoord klaar voor je mail','var(--gn)');
}




// ══════════════════════════════════════
//  NOTIF — enqueuet event in de Notif-wachtrij én toont directe in-app toast
// ══════════════════════════════════════
async function fireNotifEvent(event, payload) {
  const who   = getCurrentWho();
  const prefs = getNotifPrefs();
  const code  = (payload.code  || '').toString();
  const naam  = (payload.naam  || '').toString();
  const beh   = (payload.behandelaar || '').toString();
  const sec   = (payload.sec   || '').toString().toLowerCase();

  if (event === 'newtask' && prefs.newtask) {
    const msg = code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : '');
    showToast('📋 Nieuwe taak — ' + sec, msg, 'var(--ac)');
  } else if (event === 'assigned' && prefs.assigned && who) {
    const behs = beh.split(/[,\/]/).map(s => s.trim());
    if (behs.includes(who)) {
      showToast('➕ Toegewezen aan jou', code + (naam ? ' · ' + naam : ''), 'var(--gn)');
    }
  }

  // Schrijf een meldings-intentie als rij in de Notif-wachtrij (via het OAuth-schrijfpad).
  // Een onChange-trigger in Apps Script pikt 'm op en verstuurt de push — geen secret meer
  // nodig in de frontend.
  try {
    const data = Object.assign({}, payload, { event, actor: who });
    await appendRange("'Notif-wachtrij'!A:D", [new Date().toISOString(), event, JSON.stringify(data), '']);
  } catch (e) { console.warn('Notif-wachtrij faalde:', e); }
}

// ══════════════════════════════════════
//  IN-APP TOASTS
// ══════════════════════════════════════
const TOAST_ICONS  = {
  n_newtask:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>',
  n_assigned:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="3.4" fill="currentColor" fill-opacity="0.18"/><path d="M3.8 19c0-3.2 2.6-5.2 6.2-5.2 1.3 0 2.5.3 3.5.8" fill="currentColor" fill-opacity="0.18"/><path d="M18 14v6M15 17h6"/></svg>',
  n_deadline:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8" fill="currentColor" fill-opacity="0.18"/><path d="M12 9v4l2.5 2"/><path d="M4.5 5.5l3-2M19.5 5.5l-3-2"/></svg>',
  n_alv:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="8" height="13" rx="1" fill="currentColor" fill-opacity="0.18"/><rect x="11" y="4" width="10" height="17" rx="1" fill="currentColor" fill-opacity="0.18"/><path d="M2 21h20M6 12h2M6 15.5h2M15 8h2M15 11.5h2M15 15h2"/></svg>',
  n_daily:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5" fill="currentColor" fill-opacity="0.18"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2L17 7M7 17l-1.8 1.8"/></svg>',
  test:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" fill="currentColor" fill-opacity="0.18"/><path d="M10 19a2 2 0 004 0"/></svg>'
};
const TOAST_COLORS = { n_newtask:'var(--ac)', n_assigned:'var(--gn)', n_deadline:'var(--am)', n_alv:'var(--pu)', n_daily:'var(--am)', test:'var(--ac)' };
const TOAST_DURATION = 5000;

function showToast(title, msg, color) {
  const key = title + '|' + msg;
  if (_shownToasts.has(key)) return;
  _shownToasts.add(key);
  setTimeout(() => _shownToasts.delete(key), 30000);

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-clr', color || 'var(--ac)');
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">×</button>
    <div class="toast-bar" style="animation-duration:${TOAST_DURATION}ms"></div>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);

  // Systeemmelding wanneer pagina niet in focus (ander venster of tabblad)
  if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
    try {
      new Notification(title, { body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'cd-' + Date.now() });
    } catch(e) {
      navigator.serviceWorker?.ready.then(reg => reg.showNotification(title, {
        body: msg, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'cd-' + Date.now()
      })).catch(() => {});
    }
  }

  setTimeout(() => dismissToast(el), TOAST_DURATION);
}

function dismissToast(el) {
  if (!el || el.classList.contains('removing')) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 260);
}

function showUndoToast(title, msg, undoFn) {
  const UNDO_DURATION = 8000;
  const key = 'undo|' + title + '|' + msg;
  if (_shownToasts.has(key)) return;
  _shownToasts.add(key);
  setTimeout(() => _shownToasts.delete(key), 30000);

  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--toast-clr', 'var(--gn)');
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
      <button class="toast-undo" id="undo-btn-${Date.now()}">↩ Ongedaan maken</button>
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">×</button>
    <div class="toast-bar" style="animation-duration:${UNDO_DURATION}ms"></div>`;

  const container = document.getElementById('toast-container');
  container.appendChild(el);

  const undoBtn = el.querySelector('.toast-undo');
  undoBtn.onclick = async () => {
    undoBtn.disabled = true;
    undoBtn.textContent = '⏳ Bezig…';
    try { await undoFn(); } catch(e) { alert('Undo mislukt: ' + e.message); }
    dismissToast(el);
  };

  setTimeout(() => dismissToast(el), UNDO_DURATION);
}

async function undoComplete(undoData) {
  if (!await ensureToken()) { alert('Inloggen mislukt.'); return; }
  const { sec, ntdValues, ntdRow } = undoData;
  try {
    const ids = await getSheetIds();
    const afId = ids['Afgerond'];
    const afEntries = D.af[sec] || [];
    const lastAf = afEntries.length > 0 ? afEntries[afEntries.length - 1] : null;
    if (lastAf && lastAf.code === undoData.code) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.oauthToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: afId, dimension: 'ROWS', startIndex: lastAf._row - 1, endIndex: lastAf._row } } }] })
      });
    }
    const insertRow = getInsertRow(sec);
    await insertAndWriteRow('Nog Te Doen', insertRow, ntdValues);
    logEvent(undoData.code, sec, 'Teruggezet', 'status', 'Afgerond', 'Nog Te Doen');
    showToast('↩ Ongedaan gemaakt', `${undoData.code} terug in Nog Te Doen`, 'var(--am)');
    await loadAll();
  } catch(e) { alert('Undo fout: ' + e.message); }
}

// ══════════════════════════════════════
//  POLLING — toont toasts voor andere gebruikers
// ══════════════════════════════════════
function getNotifPrefs() {
  return {
    newtask:  localStorage.getItem('notif_newtask')  !== 'false',
    assigned: localStorage.getItem('notif_assigned') !== 'false',
    deadline: localStorage.getItem('notif_deadline') !== 'false',
    alv:      localStorage.getItem('notif_alv')      !== 'false',
    daily:    localStorage.getItem('notif_daily')    !== 'false',
  };
}

async function pollNotifsForToast() {
  try {
    const r = await fetchSheet('Meldingen');
    if (!r || r.length < 2) return;
    const h = r[0].map(c => (c||'').toString().toLowerCase().trim());
    const iTs=h.indexOf('timestamp'), iTi=h.indexOf('titel'), iIn=h.indexOf('inhoud'), iVo=h.indexOf('voor'), iTy=h.indexOf('type');
    const rows = r.slice(1).reverse()
      .map(row => ({ ts:(row[iTs]||'').toString(), type:(row[iTy]||'').toString(), title:(row[iTi]||'').toString(), body:(row[iIn]||'').toString(), voor:(row[iVo]||'').toString() }))
      .filter(n => n.ts && n.title);
    if (!rows.length) return;

    const who   = getCurrentWho();
    const prefs = getNotifPrefs();
    const typeToPrefs = { n_newtask:'newtask', n_assigned:'assigned', n_deadline:'deadline', n_alv:'alv', n_daily:'daily' };

    const newRows = rows.filter(n => n.ts > state._lastNotifTs);
    for (const n of newRows) {
      if (n.voor !== 'allen' && n.voor && who && n.voor !== who) continue;
      const prefKey = typeToPrefs[n.type];
      if (prefKey && prefs[prefKey] === false) continue;
      showToast(n.title, n.body, TOAST_COLORS[n.type] || 'var(--ac)');
    }
    if (newRows.length) state._lastNotifTs = rows[0].ts;
  } catch(e) { /* stil falen */ }
}

function startNotifPoll() {
  pollNotifsForToast();
  state._notifPollTimer = setInterval(pollNotifsForToast, 10000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { pollNotifsForToast(); loadAll(true); }
  });
}

// ══════════════════════════════════════
//  NOTIFICATIE MODAL
// ══════════════════════════════════════
function openNotifModal() {
  const who = localStorage.getItem('notif_who') || '';
  const known = ['Jer','Cihad','Gabos',''];
  if (known.includes(who)) {
    document.getElementById('notif-who').value = who;
    document.getElementById('notif-who-other').style.display = 'none';
  } else {
    document.getElementById('notif-who').value = '__other__';
    document.getElementById('notif-who-other').style.display = '';
    document.getElementById('notif-who-other').value = who;
  }
  ['newtask','assigned','deadline','alv','daily'].forEach(k => {
    const v  = localStorage.getItem('notif_' + k);
    const el = document.getElementById('tog-notif-' + k);
    if (el) el.classList.toggle('on', v === null ? true : v === 'true');
  });
  document.getElementById('notif-deadline-hours').value = localStorage.getItem('notif_deadline_hours') || '1';
  refreshNotifUI();
  document.getElementById('notif-bg').classList.add('open');
}

function closeNotifModal() {
  document.getElementById('notif-bg').classList.remove('open');
}

function refreshNotifUI() {
  document.getElementById('notif-subscribe-section').style.display = state.isSubscribed ? 'none' : 'block';
  document.getElementById('notif-settings-section').style.display  = state.isSubscribed ? 'block' : 'none';
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = state.isSubscribed ? 'none' : 'block';
}

function onWhoChange() {
  const sel = document.getElementById('notif-who');
  document.getElementById('notif-who-other').style.display = sel.value === '__other__' ? '' : 'none';
}

function getCurrentWho() {
  const sel = document.getElementById('notif-who');
  if (sel) {
    if (sel.value === '__other__') {
      const v = (document.getElementById('notif-who-other').value || '').trim();
      if (v) return v;
    } else if (sel.value) return sel.value;
  }
  const stored = localStorage.getItem('notif_who');
  if (stored) return stored;
  if (state.currentUserEmail) return displayName(state.currentUserEmail);
  return '';
}

async function saveNotifPrefs(forceInit) {
  const who = getCurrentWho();
  if (!who && !forceInit) return;
  if (who) localStorage.setItem('notif_who', who);
  const prefs = {
    newtask:  document.getElementById('tog-notif-newtask').classList.contains('on'),
    assigned: document.getElementById('tog-notif-assigned').classList.contains('on'),
    deadline: document.getElementById('tog-notif-deadline').classList.contains('on'),
    alv:      document.getElementById('tog-notif-alv').classList.contains('on'),
    daily:    document.getElementById('tog-notif-daily').classList.contains('on'),
  };
  const deadlineHours = document.getElementById('notif-deadline-hours').value || '1';
  Object.entries(prefs).forEach(([k, v]) => localStorage.setItem('notif_' + k, v));
  localStorage.setItem('notif_deadline_hours', deadlineHours);
  if (state.oneSignalReady && state.isSubscribed) {
    try {
      await OneSignal.User.addTags({
        behandelaar: who,
        n_newtask:  prefs.newtask  ? '1' : '0',
        n_assigned: prefs.assigned ? '1' : '0',
        n_deadline: prefs.deadline ? '1' : '0',
        n_alv:      prefs.alv      ? '1' : '0',
        n_daily:    prefs.daily    ? '1' : '0',
        deadline_h: deadlineHours,
      });
      if (who) await OneSignal.login(who);
    } catch(e) { console.warn('Tag sync faalde:', e); }
  }
}

async function waitForOneSignal(timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  const start = Date.now();
  while (!state.oneSignalReady && (Date.now() - start) < timeoutMs) {
    await new Promise(r => setTimeout(r, 150));
  }
  return state.oneSignalReady;
}

async function subscribeNotifs() {
  const who = getCurrentWho();
  if (!who) { alert('Selecteer of typ eerst je naam.'); return; }
  const btn = document.getElementById('notif-subscribe-btn');
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '⏳ Bezig…';
  const ready = await waitForOneSignal();
  if (!ready) {
    btn.disabled = false; btn.innerHTML = orig;
    alert('Notificatiesysteem kon niet worden geladen.\n\nMogelijke oorzaken:\n• Geen internet\n• Ad-blocker blokkeert OneSignal\n• Probeer Cmd+Shift+R');
    return;
  }
  try {
    await OneSignal.Notifications.requestPermission();
    if (!OneSignal.Notifications.permission) {
      alert('Geen toestemming gegeven. Zet notificaties aan in je browserinstellingen.');
      return;
    }
    await OneSignal.User.PushSubscription.optIn();
    await OneSignal.login(who);
    ['newtask','assigned','deadline','alv','daily'].forEach(k => {
      if (localStorage.getItem('notif_' + k) === null) localStorage.setItem('notif_' + k, 'true');
    });
    if (!localStorage.getItem('notif_deadline_hours')) localStorage.setItem('notif_deadline_hours', '1');
    localStorage.setItem('notif_who', who);
    await saveNotifPrefs(true);
    state.isSubscribed = true;
    refreshNotifUI();
    sendTestNotif(who, 'Notificaties zijn aan! 🔔', 'Je ontvangt voortaan meldingen op dit apparaat.');
  } catch(e) {
    console.error('subscribeNotifs error:', e);
    alert('Aanzetten mislukt: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.innerHTML = orig;
  }
}

async function unsubscribeNotifs() {
  if (!confirm('Push-meldingen uitzetten op dit apparaat?')) return;
  try {
    if (state.oneSignalReady) {
      await OneSignal.User.PushSubscription.optOut();
      await OneSignal.logout();
    }
    state.isSubscribed = false;
    refreshNotifUI();
  } catch(e) { alert('Uitzetten mislukt: ' + e.message); }
}

function sendTestNotif(who, title, body) {
  showToast(title || '🧪 Test melding', body || 'Notificaties werken correct!', 'var(--ac)');
  try {
    appendRange("'Notif-wachtrij'!A:D", [new Date().toISOString(), 'test', JSON.stringify({ event:'test', who, title, body }), '']).catch(() => {});
  } catch (e) { console.warn('Notif-wachtrij faalde:', e); }
}

// ══════════════════════════════════════
//  ONESIGNAL INIT
// ══════════════════════════════════════
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
  try {
    const swBase = location.pathname.replace(/\/[^/]*$/, '') || '';
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerPath: swBase + '/sw.js',
      serviceWorkerParam: { scope: swBase + '/' },
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });
    state.oneSignalReady = true;
    state.isSubscribed   = OneSignal.User.PushSubscription.optedIn === true;
    refreshNotifUI();
    OneSignal.User.PushSubscription.addEventListener('change', e => {
      state.isSubscribed = e.current.optedIn === true;
      refreshNotifUI();
    });
  } catch(e) {
    console.error('[Notif] OneSignal init faalde:', e);
  }
});

// ══════════════════════════════════════
//  TESTS (alleen actief met ?test=1)
// ══════════════════════════════════════
if (location.search.includes('test=1')) {
  console.log('%c[TESTS] Auto-prioriteit', 'background:#0D7377;color:white;padding:2px 6px;border-radius:3px');
  // ── mini-assert helper (Fase 1 testnet) ──
  let _tOk = 0, _tFail = 0;
  const eq = (label, got, exp) => {
    const g = JSON.stringify(got), e = JSON.stringify(exp);
    if (g === e) { _tOk++; }
    else { _tFail++; console.error(`FAIL: ${label} → verwacht ${e}, kreeg ${g}`); }
  };
  const truthy = (label, got) => { if (got) { _tOk++; } else { _tFail++; console.error(`FAIL: ${label} → verwacht waar, kreeg ${JSON.stringify(got)}`); } };
  const T = new Date(2026, 5, 2); // 2 juni 2026
  const fmt = d => `${d.getDate()} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]} ${d.getFullYear()}`;
  const plus = n => fmt(new Date(T.getFullYear(), T.getMonth(), T.getDate() + n));

  const cases = [
    [  7, 'OPPAKKEN',          'Hoog',   false],
    [  8, 'OPPAKKEN',          'Midden', false],
    [ 14, 'OPPAKKEN',          'Midden', false],
    [ 15, 'OPPAKKEN',          'Laag',   false],
    [ 14, 'VERGADERVERZOEKEN', 'Hoog',   false],
    [ 15, 'VERGADERVERZOEKEN', 'Midden', false],
    [ 21, 'VERGADERVERZOEKEN', 'Midden', false],
    [ 22, 'VERGADERVERZOEKEN', 'Laag',   false],
    [ 21, 'OFFERTE-TRAJECTEN', 'Hoog',   false],
    [ 42, 'OFFERTE-TRAJECTEN', 'Midden', false],
    [ 43, 'OFFERTE-TRAJECTEN', 'Laag',   false],
    [ 90, 'LOD',               'Hoog',   false],
    [240, 'LOD',               'Midden', false],
    [241, 'LOD',               'Laag',   false],
    [ -3, 'OPPAKKEN',          'Hoog',   true ],
    [  0, 'OPPAKKEN',          'Hoog',   false],
  ];
  let ok = 0, fail = 0;
  cases.forEach(([off, cat, prio, teLaat]) => {
    const got = berekenPrioriteit(plus(off), cat, T);
    const pass = got.prioriteit === prio && got.teLaat === teLaat;
    if (pass) ok++; else { fail++; console.error(`FAIL: ${cat} +${off}d → expected ${prio}/teLaat=${teLaat}, got ${got.prioriteit}/teLaat=${got.teLaat}`); }
  });
  const leeg = berekenPrioriteit('', 'OPPAKKEN', T);
  if (leeg.prioriteit === '' && leeg.teLaat === false) ok++; else { fail++; console.error('FAIL: lege deadline →', leeg); }

  // ── _parseAnyDate ──
  eq('ISO yyyy-mm-dd',  _parseAnyDate('2026-05-21'),  {y:2026,m:5,d:21});
  eq('dd-mm-yyyy',      _parseAnyDate('21-05-2026'),  {y:2026,m:5,d:21});
  eq('dd/mm/yyyy',      _parseAnyDate('21/05/2026'),  {y:2026,m:5,d:21});
  eq('NL long "21 mei 2026"', _parseAnyDate('21 mei 2026'), {y:2026,m:5,d:21});
  eq('NL afk "3 jan. 2025"',  _parseAnyDate('3 jan. 2025'),  {y:2025,m:1,d:3});
  eq('NL "1 sept 2026"',      _parseAnyDate('1 sept 2026'),  {y:2026,m:9,d:1});
  eq('2-cijfer jaar "21 mei \'26"', _parseAnyDate("21 mei '26"), {y:2026,m:5,d:21});
  eq('leeg → null',     _parseAnyDate(''),            null);
  eq('onzin → null',    _parseAnyDate('geen datum'),  null);

  // ── displayName ── (EMAIL_NAMES-lookup, anders ruwe invoer terug)
  eq('displayName leeg', displayName(''), '');
  truthy('displayName onbekend e-mail geeft input terug', displayName('xyz@example.com') === 'xyz@example.com');

  // ── logZin ── (natuurlijke zin per logboek-actie; bevat juiste werkwoord)
  truthy('logZin Afgerond bevat "rondde"',  logZin({actie:'Afgerond', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('rondde'));
  truthy('logZin Verwijderd bevat "verwijderde"', logZin({actie:'Verwijderd', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('verwijderde'));

  // ── _isStagingHost ── (fail-safe: alleen bekende productie-hosts = productie)
  truthy('prod host = geen staging',     _isStagingHost('collectief-dashboard.vercel.app') === false);
  truthy('prod team-alias = geen staging', _isStagingHost('collectief-dashboard-vve-beheer-collectief.vercel.app') === false);
  truthy('main-branch alias = geen staging', _isStagingHost('collectief-dashboard-git-main-vve-beheer-collectief.vercel.app') === false);
  truthy('staging host = staging',       _isStagingHost('collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app') === true);
  truthy('andere preview = staging (veilig)', _isStagingHost('collectief-dashboard-git-experiment-vve-beheer-collectief.vercel.app') === true);
  truthy('localhost = staging',          _isStagingHost('localhost') === true);
  truthy('github.io = echte productie (geen staging)', _isStagingHost('vvebeheercollectief.github.io') === false);

  const totOk = ok + _tOk, totFail = fail + _tFail;
  console.log(`%c[TESTS] ${totOk} OK, ${totFail} FAIL`, totFail ? 'background:#dc2626;color:white;padding:2px 6px' : 'background:#16a34a;color:white;padding:2px 6px');
}

// ── TIJDELIJKE window-shim (Fase 2A) — verwijderd in mijlpaal B ──────────────
// Houdt de 35 inline on*-handlers + de paginerings-callback werkend nu de
// functies module-scoped zijn. Opgeruimd zodra alles via data-action loopt.
Object.assign(window, {
  adjOff, histNoteKey, addTaskNote, deleteCurrentEditTask, saveNotifPrefs,
  copyAiPrompt, doLogin, setNtd, setAf, toggleAlvoFlag, editRow, completeTask,
  aiOvernemen, aiActieTaak, aiKopieerConcept, setOntw, dismissToast,
  pgs, renderNtd, renderAf, renderAlvo, renderAlfa, renderOntw, renderLogboek,
});
