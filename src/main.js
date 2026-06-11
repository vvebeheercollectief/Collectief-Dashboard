// ══════════════════════════════════════
//  MAIN — boot/orchestrator
// ══════════════════════════════════════
import { IS_STAGING, ALLOWED_EMAILS, SKEYS } from './config.js';
import { D, pgs, state } from './state.js';
import { ensureToken } from './auth.js';
import { goTo, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch } from './ui.js';
import { renderNtd, renderAf, renderAlvo, renderAlfa, renderNtdStats } from './render-lijsten.js';
import {
  renderOntw, renderLogboek, openOntwModal, closeOntwModal,
  submitOntwItem, deleteOntwItem, histNoteKey,
} from './render-overig.js';
import { openAiHelp, closeAiHelp, buildAiPrompt, parseAiAnswer } from './ai.js';
import {
  openNotifModal, closeNotifModal, onWhoChange, saveNotifPrefs,
  subscribeNotifs, unsubscribeNotifs, sendTestNotif, getCurrentWho, startNotifPoll,
} from './notifications.js';
import {
  openModal, closeModal, submitTask, doCompleteTask, closeCompleteModal,
} from './crud.js';
import { loadAll } from './data.js';
import { initActions } from './actions.js';
import { initVveZoekveld } from './vve-zoekveld.js';
import { closeSnoozeModal, snoozeOpslaan, snoozeWis } from './snooze.js';
import { renderHerhaal, openHerhaalModal, closeHerhaalModal, syncHerhaalVelden, submitHerhaal } from './render-herhaal.js';
import { renderVve } from './render-vve.js';
import { initPalette } from './palette.js';

// ══════════════════════════════════════
//  BOOT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  // Centraal klik-systeem: één delegatie-listener voor alle data-action-elementen
  initActions();
  initPalette();

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
  const aiVveInput=document.getElementById('ai-vve-input');
  const aiVveWis=document.getElementById('ai-vve-wis');
  const zetAiVve=(code,naam)=>{
    state._aiVveCode=code||'';
    aiVveInput.value=code?`${code} — ${naam||''}`:'';
    aiVveWis.style.display=code?'':'none';
    buildAiPrompt(); parseAiAnswer();
  };
  initVveZoekveld({ input: aiVveInput, lijstEl: document.getElementById('ai-vve-sug'),
    minTekens: 0, onSelect: ({code,naam}) => zetAiVve(code,naam) });
  aiVveInput.addEventListener('input',()=>{   // overtypen = koppeling los
    if(state._aiVveCode){ state._aiVveCode=''; aiVveWis.style.display='none'; buildAiPrompt(); parseAiAnswer(); }
  });
  aiVveWis.onclick=()=>zetAiVve('','');
  document.getElementById('ai-answer').addEventListener('input',parseAiAnswer);
  document.getElementById('hamburger').onclick=()=>{document.getElementById('sb').classList.toggle('open');document.getElementById('overlay').classList.toggle('on')};
  document.getElementById('overlay').onclick=closeSb;

  document.getElementById('btn-add').onclick=()=>openModal(false);
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

  // Herhaalregel-modal (Fase 4)
  document.getElementById('btn-add-herhaal').onclick=()=>openHerhaalModal(null);
  document.getElementById('hh-close').onclick=closeHerhaalModal;
  document.getElementById('hh-cancel').onclick=closeHerhaalModal;
  document.getElementById('hh-submit').onclick=submitHerhaal;
  document.getElementById('hh-type').onchange=syncHerhaalVelden;
  let _hhMouseDown=null;
  document.getElementById('hh-bg').addEventListener('mousedown',e=>{_hhMouseDown=e.target});
  document.getElementById('hh-bg').addEventListener('click',e=>{if(e.target.id==='hh-bg'&&_hhMouseDown?.id==='hh-bg')closeHerhaalModal()});
  initVveZoekveld({
    input: document.getElementById('hh-code'),
    lijstEl: document.getElementById('hh-vve-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      document.getElementById('hh-code').value = code;
      document.getElementById('hh-naam').value = naam;
    },
  });

  // Wegleggen-modal (Fase 4)
  document.getElementById('snooze-close').onclick=closeSnoozeModal;
  document.getElementById('snooze-cancel').onclick=closeSnoozeModal;
  document.getElementById('snooze-opslaan').onclick=snoozeOpslaan;
  document.getElementById('snooze-wis').onclick=snoozeWis;
  let _snoozeMouseDown=null;
  document.getElementById('snooze-bg').addEventListener('mousedown',e=>{_snoozeMouseDown=e.target});
  document.getElementById('snooze-bg').addEventListener('click',e=>{if(e.target.id==='snooze-bg'&&_snoozeMouseDown?.id==='snooze-bg')closeSnoozeModal()});

  // Afgerond modal
  document.getElementById('complete-close').onclick=closeCompleteModal;
  document.getElementById('complete-cancel').onclick=closeCompleteModal;
  document.getElementById('complete-confirm').onclick=doCompleteTask;
  let _compMouseDown=null;
  document.getElementById('complete-bg').addEventListener('mousedown',e=>{_compMouseDown=e.target});
  document.getElementById('complete-bg').addEventListener('click',e=>{if(e.target.id==='complete-bg'&&_compMouseDown?.id==='complete-bg')closeCompleteModal()});

  // VvE autocomplete (gedeeld component; gedrag identiek: ≥2 tekens, max 8)
  initVveZoekveld({
    input: document.getElementById('m-code'),
    lijstEl: document.getElementById('vve-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      document.getElementById('m-code').value = code;
      document.getElementById('m-naam').value = naam;
    },
  });

  // Logboek-notitieveld (was inline onkeydown/onchange — Fase 2B)
  document.getElementById('hist-note').addEventListener('keydown', histNoteKey);
  document.getElementById('notif-deadline-hours').addEventListener('change', saveNotifPrefs);

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
    if(document.getElementById('snooze-bg').classList.contains('open')) return;
    if(document.getElementById('hh-bg').classList.contains('open')) return;
    if(document.getElementById('pal-bg').classList.contains('open')) return;
    if(document.getElementById('dot').classList.contains('loading')) return;
    if(state.pendingWrites>0) return;
    if(state.bulkMode) return;
    if(state._animBusy) return;
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
//  RENDER ALL
// ══════════════════════════════════════
// renderAll woont bewust in main.js (orchestrator); data.js/crud.js importeren
// hem als live binding (kringverwijzing is ok — aanroep gebeurt op runtime).
export function renderAll(){
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
  renderHerhaal();
  renderVve();
}

// ══════════════════════════════════════
//  TESTS (alleen actief met ?test=1)
// ══════════════════════════════════════
// ── Zelftest (alleen met ?test=1) — lazy-geladen, niet in productie ──
if (location.search.includes('test=1')) import('./tests.js');

