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
import {
  openAiHelp, closeAiHelp, buildAiPrompt, parseAiAnswer, copyAiPrompt,
  aiOvernemen, aiActieTaak, aiKopieerConcept,
} from './ai.js';
import {
  showToast, dismissToast, showUndoToast, fireNotifEvent, openNotifModal, closeNotifModal,
  onWhoChange, saveNotifPrefs, subscribeNotifs, unsubscribeNotifs, sendTestNotif, getCurrentWho,
  startNotifPoll, undoComplete,
} from './notifications.js';
import {
  openModal, editRow, closeModal, submitTask, doCompleteTask, closeCompleteModal,
  completeTask, deleteCurrentEditTask, onCodeInput,
} from './crud.js';

// ── TIJDELIJKE re-exports (Fase 2A) — functies die nog in main.js wonen maar
// door reeds-afgesplitste modules gebruikt worden. Krimpt naarmate we verder
// opsplitsen; aan het eind van mijlpaal A weg.
export { loadAll, backgroundWrite, renderAll };



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
