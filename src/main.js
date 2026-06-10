// ══════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════
// ── Omgeving (productie vs. testomgeving) ──────────────────────────────
// Fail-safe: alleen deze exacte hosts zijn PRODUCTIE; al het andere
// (staging-branch, andere previews, localhost) draait op de TEST-data.
const PROD_HOSTS = [
  'vvebeheercollectief.github.io',                            // ECHTE productie (GitHub Pages, source=main)
  'collectief-dashboard.vercel.app',                          // Vercel-spiegel van main (parallel/handmatig)
  'collectief-dashboard-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-git-main-vve-beheer-collectief.vercel.app',
];
function _isStagingHost(hostname){ return !PROD_HOSTS.includes(hostname); }
const IS_STAGING = _isStagingHost(location.hostname);

const SID_PROD = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw';
const SID_TEST = '1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4';   // test-Sheet "Collectief Dashboard - Kopie" (Taak 3)
const SID = IS_STAGING ? SID_TEST : SID_PROD;
const PG   = 25;
// Meldingen lopen via de 'Notif-wachtrij'-tab (OAuth-append vanuit de ingelogde
// gebruiker) — een Apps Script-trigger verstuurt de push. Geen webhook-URL of
// secret meer nodig in deze (publieke) frontend.
const ONESIGNAL_APP_ID_PROD = 'c0e1301b-2cee-4646-8fab-99698e10e78c';
const ONESIGNAL_APP_ID_TEST = '11b00aea-496b-44d5-8b9f-5012fcb48fd4';   // test-OneSignal app "Collectief Dashboard TEST" (Taak 4)
const ONESIGNAL_APP_ID      = IS_STAGING ? ONESIGNAL_APP_ID_TEST : ONESIGNAL_APP_ID_PROD;

const ALLOWED_EMAILS = [
  'info@vvebeheercollectief.nl',
  'djiowchico@gmail.com',
  'gabrielateterycz1616@gmail.com',
  'giocan175@gmail.com',
];
const EMAIL_NAMES = {
  'info@vvebeheercollectief.nl':'Jer',
  'djiowchico@gmail.com':'Cihad',
  'gabrielateterycz1616@gmail.com':'Gabos',
  'giocan175@gmail.com':'Cihan',
};
function displayName(s){
  if(!s) return '';
  const key = String(s).toLowerCase().trim();
  return EMAIL_NAMES[key] || s;
}

let oneSignalReady  = false;
let isSubscribed    = false;
let _lastNotifTs    = new Date().toISOString();
let _notifPollTimer = null;
let _shownToasts    = new Set();

const SECS = {
  OPPAKKEN:{label:'Oppakken',css:'--sec:var(--ac);--sec-l:var(--ac-l);--sec-b:var(--ac-b)',color:'#0D7377',
    cols:['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Prioriteit','Opmerkingen','In beh.'],
    keys:['code','naam','actiepunt','deadline','behandelaar','prioriteit','opmerkingen','inBehandeling']},
  VERGADERVERZOEKEN:{label:'Vergaderverzoeken',css:'--sec:var(--am);--sec-l:var(--am-l);--sec-b:var(--am-b)',color:'#B45309',
    cols:['VvE Code','VvE','Periode','Agendapunten','Behandelaar','Deadline uitschr.','Prioriteit','Opmerkingen','In beh.'],
    keys:['code','naam','periode','agendapunten','behandelaar','deadline','opmerkingen','inBehandeling']},
  'OFFERTE-TRAJECTEN':{label:'Offerte-trajecten',css:'--sec:var(--pu);--sec-l:var(--pu-l);--sec-b:var(--pu-b)',color:'#6D5BD0',
    cols:['VvE Code','VvE','Datum aangevr.','Ontvangen/Aangevr.','Behandelaar','Deadline','Prioriteit','Opmerkingen'],
    keys:['code','naam','datumAangevraagd','offertes','behandelaar','deadline','opmerkingen']},
  LOD:{label:'LOD',css:'--sec:var(--rd);--sec-l:var(--rd-l);--sec-b:var(--rd-b)',color:'#B91C1C',
    cols:['VvE Code','VvE','Actiepunt','Status','Behandelaar','Deadline LOD','Prioriteit','Opmerkingen','In beh.'],
    keys:['code','naam','actiepunt','status','behandelaar','deadline','opmerkingen','inBehandeling']},
};
const SKEYS = Object.keys(SECS);

const PAGE_META = {
  ntd:['Nog Te Doen','Openstaande taken en actiepunten'],
  af:['Afgerond','Afgeronde taken per categorie'],
  alvo:["ALV's Overzicht","Voortgang vergaderingen per VvE"],
  alfa:["ALV's Afgerond","Afgeronde jaarvergaderingen"],
  ontw:['Ontwikkeling','Interne notities, verbeteringen en ideeën'],
  logboek:['Logboek','Wijzigingshistorie van alle taken'],
  analytics:['Analytics','Statistieken en grafieken'],
  dash:['Dashboard','Totaaloverzicht'],
};

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let D = {ntd:{},af:{},alvo:[],alfa:[],ontw:[],logboek:[],ntdSecInfo:{},afSecInfo:{}};
let pgs = {ntd:1,af:1,alvo:1,alfa:1,ontw:1,logboek:1};
let activeOntw='Alles';
let activeNtd='OPPAKKEN', activeAf='OPPAKKEN';
let charts = {};
let oauthToken=null, oauthExpiry=0, currentUserEmail=null, _gsiTokenClient=null, clientId='560046984985-1371r4bbt28umi6uslims6mlkucn1278.apps.googleusercontent.com';
let editMode=false, editRowData=null, editSec=null;
let anaPeriod='maand';        // 'dag' | 'week' | 'maand' | 'kwartaal'
let anaMetric='vergader';     // 'vergader' | 'taken'  (voor hoofdgrafiek)
let _rowCache = [];
let _undoStack = [];

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
    b.classList.add('on'); logWho=b.dataset.who; pgs.logboek=1; renderLogboek();
  });
  document.getElementById('logboek-act').addEventListener('click',e=>{
    const b=e.target.closest('.lchip'); if(!b)return;
    document.querySelectorAll('#logboek-act .lchip').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); logAct=b.dataset.act; pgs.logboek=1; renderLogboek();
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
  window.editRow=idx=>openModal(true,_rowCache[idx]);
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

  // Period buttons
  buildPeriodBtns('pb-vergader','vergader');
  buildPeriodBtns('pb-notulen','notulen');

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
    if(pendingWrites>0) return;
    if(!await ensureToken()) return;
    loadAll(true);
  },8000);

  // Token-refresh heartbeat — elke 4 min proactief vernieuwen vóór expiry
  setInterval(()=>{
    if(!oauthToken) return;
    if(oauthExpiry - Date.now() > 5*60*1000) return;
    try{ _gsiTokenClient && _gsiTokenClient.requestAccessToken({prompt:''}); }catch(e){}
  },4*60*1000);

  // Sessie herstellen uit sessionStorage
  const _st=sessionStorage.getItem('oauthToken');
  const _se=parseInt(sessionStorage.getItem('oauthExpiry')||'0');
  const _sm=sessionStorage.getItem('currentUserEmail');
  if(_st&&Date.now()<_se&&_sm&&ALLOWED_EMAILS.includes(_sm.toLowerCase())){
    oauthToken=_st;oauthExpiry=_se;currentUserEmail=_sm;
    document.getElementById('login-gate').style.display='none';
    loadAll();
  }

  goTo('ntd');
});

// ══════════════════════════════════════
//  NAV
// ══════════════════════════════════════
function goTo(page){
  document.querySelectorAll('.ni[data-page]').forEach(el=>el.classList.toggle('on',el.dataset.page===page));
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
  const[t,s]=PAGE_META[page]||['',''];
  document.getElementById('page-title').textContent=t;
  document.getElementById('page-sub').textContent=s;
  document.getElementById('btn-add').style.display=page==='ntd'?'inline-flex':'none';
  if(page==='ontw') renderOntw();
  if(page==='logboek') renderLogboek();
  closeSb();
  if(page==='analytics') buildAnalytics();
  if(page==='dash') buildDash();
}
function closeSb(){document.getElementById('sb').classList.remove('open');document.getElementById('overlay').classList.remove('on')}

// ══════════════════════════════════════
//  THEME
// ══════════════════════════════════════
function applyTheme(t){
  document.documentElement.dataset.theme=t;
  localStorage.setItem('theme',t);
  document.getElementById('ico-sun').style.display=t==='dark'?'none':'';
  document.getElementById('ico-moon').style.display=t==='dark'?'':'none';
  Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}});
  charts={};
  if(document.getElementById('page-analytics').classList.contains('active')) buildAnalytics();
  if(document.getElementById('page-dash').classList.contains('active')) buildDash();
}

// ══════════════════════════════════════
//  DICHTHEID (per collega, onthouden in localStorage)
// ══════════════════════════════════════
const DENSITIES=['standaard','compact','ruim'];
function applyDensity(d){
  if(!DENSITIES.includes(d)) d='standaard';
  document.documentElement.dataset.density=d;
  localStorage.setItem('density',d);
}
function cycleDensity(){
  const cur=document.documentElement.dataset.density||'standaard';
  const next=DENSITIES[(DENSITIES.indexOf(cur)+1)%DENSITIES.length];
  applyDensity(next);
  showToast('Weergave: '+next.charAt(0).toUpperCase()+next.slice(1),'',null);
}

// ══════════════════════════════════════
//  API
// ══════════════════════════════════════
async function fetchSheet(name){
  if(!oauthToken) throw new Error('Niet ingelogd');
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(name)}`,{
    cache:'no-store',
    headers:{Authorization:`Bearer ${oauthToken}`}
  });
  if(!r.ok){const e=await r.json();if(r.status===401){oauthToken=null;oauthExpiry=0}throw new Error(e.error?.message||'API fout')}
  return (await r.json()).values||[];
}
async function writeRange(range,values,method='PUT'){
  if(!oauthToken) throw new Error('Niet ingelogd');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const opts={method,headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:[values]})};
  const r=await fetch(url,opts);
  if(!r.ok){const e=await r.json();if(r.status===401){oauthToken=null;oauthExpiry=0}const err=new Error(e.error?.message||'Schrijffout');err.status=r.status;throw err}
  return r.json();
}
async function appendRange(range,values){
  if(!oauthToken) throw new Error('Niet ingelogd');
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:[values]})});
  if(!r.ok){const e=await r.json();if(r.status===401){oauthToken=null;oauthExpiry=0}throw new Error(e.error?.message||'Schrijffout')}
  return r.json();
}

// Aantal lopende/wachtende achtergrond-schrijfacties. Zolang >0 slaat de 8s-poll
// over, zodat een optimistische wijziging niet kort teruggedraaid wordt.
let pendingWrites=0;
// Seriële wachtrij: schrijfacties lopen één voor één, zodat rij-indexen in de Sheet
// niet door elkaar lopen bij snel opeenvolgende acties.
let _writeChain=Promise.resolve();

// Verschuift lokale _row-nummers mee bij invoegen/verwijderen van een Sheet-rij,
// zodat een volgende optimistische actie de juiste rij raakt. "Nog Te Doen" is één
// sheet met meerdere secties; alle rijen onder `fromRow` schuiven `delta` op.
function _shiftNtdRows(fromRow, delta){
  SKEYS.forEach(s=>{ (D.ntd[s]||[]).forEach(row=>{ if(row._row>fromRow) row._row+=delta; }); });
}

// Herkent tijdelijke API-fouten (rate-limit 429 / serverfout 5xx) die een herkansing
// rechtvaardigen — i.t.t. een echte fout (verkeerde data, geen rechten) die direct faalt.
function _isTransient(e){
  if(!e) return false;
  if(e.status===429 || (e.status>=500 && e.status<600)) return true;
  return /quota|rate.?limit|resource_exhausted|backend error|internal error|unavailable|try again/i.test(e.message||'');
}
// Voert een schrijfactie uit met max. 2 herkansingen (exponentiële backoff) bij transient fouten.
async function _withRetry(fn){
  for(let attempt=0;;attempt++){
    try{ return await fn(); }
    catch(e){
      if(attempt<2 && _isTransient(e)){ await new Promise(r=>setTimeout(r,600*Math.pow(2,attempt))); continue; }
      throw e;
    }
  }
}

// Voert een Sheets-schrijfactie op de achtergrond uit (serieel). De UI is al
// optimistisch bijgewerkt door de aanroeper. Bij fout draait `rollback` de lokale
// wijziging terug en verschijnt een foutmelding.
function backgroundWrite(writeFn, rollback, foutTitel){
  pendingWrites++;
  _writeChain=_writeChain.then(async()=>{
    try{
      await _withRetry(writeFn);
    }catch(e){
      try{ rollback(); renderAll(); }catch(_){}
      const msg=(e.message||'').toLowerCase();
      if(msg.includes('authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
        oauthToken=null;oauthExpiry=0;
        showToast(foutTitel,'Sessie verlopen — wijziging teruggezet. Probeer opnieuw.','#dc2626');
      }else{
        showToast(foutTitel,'Niet opgeslagen — wijziging teruggezet.','#dc2626');
      }
      console.error(foutTitel,e);
    }finally{
      pendingWrites--;
      if(pendingWrites===0){ loadAll(true); } // stille resync van rij-indexen
    }
  });
  return _writeChain;
}

function setSyncing(){dot('loading');document.getElementById('sync-lbl').textContent='Laden…'}
function setSynced(){dot('');document.getElementById('sync-lbl').textContent='Live · '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
function setSyncErr(){dot('err');document.getElementById('sync-lbl').textContent='Fout'}
function dot(cls){const d=document.getElementById('dot');d.className='dot'+(cls?' '+cls:'')}

let _lastDHash=null;
// Herhaal-slot: voorkomt dat twee loadAll-aanroepen tegelijk lopen en elkaars data
// overschrijven (8s-poll, schrijf-resync, refresh-knop, handmatige awaits).
let _loadInFlight=false, _loadAgain=false;
async function loadAll(silent){
  if(_loadInFlight){ _loadAgain=true; return; }
  _loadInFlight=true;
  try{
    if(!oauthToken){
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
    if(pendingWrites>0){ if(!silent) setSynced(); return; }
    const ntdP=parseSections(ntdR); D.ntd=ntdP.data; D.ntdSecInfo=ntdP.secInfo;
    const afP=parseSections(afR); D.af=afP.data; D.afSecInfo=afP.secInfo;
    SKEYS.forEach(s=>{if(D.af[s])D.af[s].sort((a,b)=>parseDt(b.datum)-parseDt(a.datum))});
    D.alvo=parseAlvo(alvoR);
    D.alfa=parseAlfa(alfaR);
    D.ontw=parseOntw(ontwR);
    D.logboek=parseLogboek(logR);
    setSynced();
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek]);
    if(hash!==_lastDHash){
      _lastDHash=hash;
      renderAll();
      // Re-render actieve detailpagina's met nieuwe data
      if(document.getElementById('page-analytics')?.classList.contains('active')) buildAnalytics();
      if(document.getElementById('page-dash')?.classList.contains('active')) buildDash();
      if(document.getElementById('page-ntd')?.classList.contains('active')) renderNtdDonut();
    }
  }catch(e){setSyncErr();console.error(e)}
  finally{
    _loadInFlight=false;
    if(_loadAgain){ _loadAgain=false; loadAll(true); } // een onderdrukte aanroep alsnog uitvoeren
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
  _rowCache=[];
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
//  NTD STATS
// ══════════════════════════════════════
const SEC_ICONS={
  // Klembord met vinkje — taken oppakken
  OPPAKKEN:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 13l2 2 4-4.2"/></svg>`,
  // Groep van drie mensen — vergaderen
  VERGADERVERZOEKEN:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3" fill="currentColor" fill-opacity="0.25"/><circle cx="5.5" cy="10" r="2.2" fill="currentColor" fill-opacity="0.18"/><circle cx="18.5" cy="10" r="2.2" fill="currentColor" fill-opacity="0.18"/><path d="M6.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M2 19c.3-2 1.7-3.3 3.5-3.6"/><path d="M22 19c-.3-2-1.7-3.3-3.5-3.6"/></svg>`,
  // Document met eurosymbool — offerte
  'OFFERTE-TRAJECTEN':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V4.5A1.5 1.5 0 017.5 3z" fill="currentColor" fill-opacity="0.18"/><path d="M14 3v4h4"/><path d="M15 12c-.7-.9-1.8-1.4-3-1.4-2.2 0-4 1.9-4 4.2s1.8 4.2 4 4.2c1.2 0 2.3-.5 3-1.4"/><path d="M8.5 14h4.2M8.5 16.2h4.2"/></svg>`,
  // Map met klok/uitroep — openstaande dossiers (LOD)
  LOD:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="currentColor" fill-opacity="0.18"/><circle cx="15.5" cy="14" r="3.2" fill="currentColor" fill-opacity="0.3"/><path d="M15.5 12.2v2l1.3.8" stroke-width="1.6"/></svg>`
};
const SEC_THEMES={
  OPPAKKEN:'--sec:var(--ac);--sec-l:var(--ac-l)',
  VERGADERVERZOEKEN:'--sec:var(--am);--sec-l:var(--am-l)',
  'OFFERTE-TRAJECTEN':'--sec:var(--pu);--sec-l:var(--pu-l)',
  LOD:'--sec:var(--rd);--sec-l:var(--rd-l)',
};
function renderNtdStats(){
  document.getElementById('ntd-stats').innerHTML=SKEYS.map(s=>`
    <div class="stat" style="${SEC_THEMES[s]}">
      <div class="stat-top"><div class="stat-lbl">${SECS[s].label}</div><div class="stat-ico">${SEC_ICONS[s]}</div></div>
      <div class="stat-num">${D.ntd[s]?.length||0}</div>
      <div class="stat-sub">open ${s==='OFFERTE-TRAJECTEN'?'trajecten':s==='LOD'?'dossiers':'taken'}</div>
    </div>`).join('');
  renderNtdDonut();
}

// NTD: voortgangsbalk uitgeschreven vergaderingen (alvo: uitnodiging=TRUE → uitnodiging verzonden)
function renderNtdDonut(){
  const track=document.getElementById('ntd-progress-track');
  if(!track) return;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const total=(D.alvo||[]).length;
  const pct=total?Math.round(done/total*100):0;
  const txt=`${done} / ${total}`;
  document.getElementById('ntd-progress-val-base').textContent=txt;
  document.getElementById('ntd-progress-val-rev').textContent=txt;
  document.getElementById('ntd-progress-sub').textContent=`${pct}% van de vergaderingen uitgeschreven`;
  // vollopend effect + reveal: witte cijfers worden onthuld over het gevulde deel,
  // donkere cijfers blijven leesbaar over het lichte deel (beide identiek gecentreerd)
  requestAnimationFrame(()=>{
    document.getElementById('ntd-progress-fill').style.width=pct+'%';
    document.getElementById('ntd-progress-val-rev').style.clipPath=`inset(0 ${100-pct}% 0 0)`;
  });
}

// Helper: ligt date d in (current period - offset) gerekend vanaf ref?
function _inPeriod(d,ref,period,offset){
  if(period==='week'){
    // ISO-week-index
    const w1=_weekIndex(d), w2=_weekIndex(ref);
    return (w2-w1)===offset;
  }
  if(period==='maand'){
    const idx=(ref.getFullYear()*12+ref.getMonth())-(d.getFullYear()*12+d.getMonth());
    return idx===offset;
  }
  if(period==='kwartaal'){
    const qR=Math.floor(ref.getMonth()/3), qD=Math.floor(d.getMonth()/3);
    const idx=(ref.getFullYear()*4+qR)-(d.getFullYear()*4+qD);
    return idx===offset;
  }
  if(period==='jaar'){
    return (ref.getFullYear()-d.getFullYear())===offset;
  }
  return false;
}
function _weekIndex(d){
  // dagen-sinds-epoch / 7 als grove index
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7;
  t.setUTCDate(t.getUTCDate()+4-day);
  return Math.floor(t.getTime()/(7*86400000));
}

// ══════════════════════════════════════
//  NOG TE DOEN
// ══════════════════════════════════════
function renderNtd(){
  const q=document.getElementById('s-ntd').value.toLowerCase();
  const fCode=document.getElementById('f-code-ntd').value.toLowerCase();
  const fBeh=document.getElementById('f-beh-ntd').value;
  const fPrio=document.getElementById('f-prio-ntd').value;

  // Tabs
  document.getElementById('ntd-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filterNtd(D.ntd[s]||[],q,fCode,fBeh,fPrio,s);
    return`<div class="tab ${s===activeNtd?'on':''}" style="${s===activeNtd?SECS[s].css:''}" onclick="setNtd('${s}')">${SECS[s].label}<span class="cnt">${rows.length}</span></div>`;
  }).join('');

  document.getElementById('ntd-title').textContent=SECS[activeNtd].label;
  // Apply card theme
  const card=document.getElementById('ntd-card');
  SECS[activeNtd].css.split(';').forEach(p=>{const[k,v]=p.split(':');if(k&&v)card.style.setProperty(k.trim(),v.trim())});

  const rows=filterNtd(D.ntd[activeNtd]||[],q,fCode,fBeh,fPrio,activeNtd);
  renderThead('ntd-thead',[...SECS[activeNtd].cols,''],SECS[activeNtd].css);
  renderTbody('ntd-tbody',rows,activeNtd,pgs.ntd,false);
  renderPag('ntd-pag',rows.length,pgs.ntd,p=>{pgs.ntd=p;renderNtd()});
}
function setNtd(s){activeNtd=s;pgs.ntd=1;renderNtd()}
function filterNtd(rows,q,fCode,beh,prio,sec){
  return rows.filter(r=>{
    if(q&&!SECS[sec].keys.some(k=>(r[k]||'').toLowerCase().includes(q))) return false;
    if(fCode&&!(r.code||'').toLowerCase().includes(fCode)) return false;
    if(beh&&!(r.behandelaar||'').toLowerCase().includes(beh.toLowerCase())) return false;
    if(prio){
      const berekend = berekenPrioriteit(r.deadline, sec).prioriteit;
      if (berekend !== prio) return false;
    }
    return true;
  }).sort((a,b)=>{
    const ibA = a.inBehandeling==='TRUE'?1:0, ibB = b.inBehandeling==='TRUE'?1:0;
    if (ibA !== ibB) return ibA - ibB;
    const pa = berekenPrioriteit(a.deadline, sec);
    const pb = berekenPrioriteit(b.deadline, sec);
    // 1. Te laat altijd bovenaan
    if (pa.teLaat !== pb.teLaat) return pa.teLaat ? -1 : 1;
    // 2. Prioriteit-rang
    const rang = { 'Hoog':0, 'Midden':1, 'Laag':2, '':3 };
    if (rang[pa.prioriteit] !== rang[pb.prioriteit]) return rang[pa.prioriteit] - rang[pb.prioriteit];
    // 3. Deadline oplopend (vroegste eerst)
    const dA = parseDt(a.deadline), dB = parseDt(b.deadline);
    if (dA && dB && dA !== dB) return dA - dB;
    if (dA && !dB) return -1;
    if (dB && !dA) return 1;
    // 4. VvE-code alfabetisch
    return (a.code || '').localeCompare(b.code || '');
  });
}

// ══════════════════════════════════════
//  AFGEROND
// ══════════════════════════════════════
function renderAf(){
  const q=document.getElementById('s-af').value.toLowerCase();
  document.getElementById('af-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filt(D.af[s]||[],q);
    return`<div class="tab ${s===activeAf?'on':''}" style="${s===activeAf?SECS[s].css:''}" onclick="setAf('${s}')">${SECS[s].label}<span class="cnt">${rows.length}</span></div>`;
  }).join('');
  const cols=['VvE Code','VvE','Categorie','Subcategorie','Afgerond op','Opmerking'];
  renderThead('af-thead',cols,SECS[activeAf].css);
  const rows=filt(D.af[activeAf]||[],q);
  renderTbody('af-tbody',rows,activeAf,pgs.af,true);
  renderPag('af-pag',rows.length,pgs.af,p=>{pgs.af=p;renderAf()});
}
function setAf(s){activeAf=s;pgs.af=1;renderAf()}

// ══════════════════════════════════════
//  ALV OVERZICHT
// ══════════════════════════════════════
// Duotone-stijl inline SVG-iconen voor de stat-tegels (zelfde stijl als DASH_ICONS,
// kleur volgt --sec via currentColor). Inline i.p.v. Phosphor-font voor betrouwbare weergave.
const ALVO_ICONS={
  totaal:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="8" height="13" rx="1" fill="currentColor" fill-opacity="0.18"/><rect x="11" y="4" width="10" height="17" rx="1" fill="currentColor" fill-opacity="0.18"/><path d="M2 21h20M6 12h2M6 15.5h2M15 8h2M15 11.5h2M15 15h2"/></svg>`,
  afgerond:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>`,
  gepland:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2"/></svg>`,
  open:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" fill="currentColor" fill-opacity="0.18"/><path d="M6 3h12M6 21h12"/></svg>`
};
function renderAlvo(){
  // Stats
  const tot=D.alvo.length;
  const afd=D.alvo.filter(r=>r.status==='Afgerond').length;
  const gep=D.alvo.filter(r=>r.status==='Gepland').length;
  const opn=D.alvo.filter(r=>r.status==='Open').length;
  document.getElementById('alvo-stats').innerHTML=`
    <div class="stat" style="--sec:var(--ac);--sec-l:var(--ac-l)"><div class="stat-top"><div class="stat-lbl">Totaal VvE's</div><div class="stat-ico">${ALVO_ICONS.totaal}</div></div><div class="stat-num">${tot}</div><div class="stat-sub">in beheer</div></div>
    <div class="stat" style="--sec:var(--gn);--sec-l:var(--gn-l)"><div class="stat-top"><div class="stat-lbl">Afgerond</div><div class="stat-ico">${ALVO_ICONS.afgerond}</div></div><div class="stat-num">${afd}</div><div class="stat-sub">notulen verstuurd</div></div>
    <div class="stat" style="--sec:var(--am);--sec-l:var(--am-l)"><div class="stat-top"><div class="stat-lbl">Gepland</div><div class="stat-ico">${ALVO_ICONS.gepland}</div></div><div class="stat-num">${gep}</div><div class="stat-sub">uitnodiging verstuurd</div></div>
    <div class="stat" style="--sec:var(--rd);--sec-l:var(--rd-l)"><div class="stat-top"><div class="stat-lbl">Open</div><div class="stat-ico">${ALVO_ICONS.open}</div></div><div class="stat-num">${opn}</div><div class="stat-sub">nog te plannen</div></div>`;

  const q=document.getElementById('s-alvo').value.toLowerCase();
  const fs=document.getElementById('f-status-alvo').value;
  const rows=D.alvo.filter(r=>{
    if(q&&!`${r.code} ${r.naam}`.toLowerCase().includes(q)) return false;
    if(fs&&r.status!==fs) return false;
    return true;
  });
  const sl=rows.slice((pgs.alvo-1)*PG,pgs.alvo*PG);
  document.getElementById('alvo-tbody').innerHTML=sl.length
    ?sl.map(r=>{
      const idx=D.alvo.indexOf(r);
      return`<tr>
        <td><span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l)">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}</td>
        <td>${flagPill(idx,'uitnodiging',r.uitnodiging)}</td>
        <td>${flagPill(idx,'notulen',r.notulen)}</td>
        <td>${flagPill(idx,'begroting',r.begroting)}</td>
        <td><span class="badge status-${r.status.toLowerCase()}">${statusIco(r.status)} ${r.status}</span></td>
      </tr>`;
    }).join('')
    :emptyRow(6);
  renderPag('alvo-pag',rows.length,pgs.alvo,p=>{pgs.alvo=p;renderAlvo()});
}

const ALVO_COLS={uitnodiging:2,notulen:3,begroting:4};
const ALVO_LABELS={uitnodiging:'Uitnodiging',notulen:'Notulen',begroting:'Begroting'};

function flagPill(idx,field,val){
  const cls=val?'on':'off';
  const lbl=val?'✓ Ja':'–';
  const aria=val?'true':'false';
  const title=`Klik om ${ALVO_LABELS[field]} ${val?'uit':'aan'} te zetten`;
  return`<button type="button" class="flag-toggle ${cls}" data-idx="${idx}" data-field="${field}" aria-pressed="${aria}" title="${title}" onclick="toggleAlvoFlag(${idx},'${field}')">${lbl}</button>`;
}

function _recomputeAlvoStatus(r){
  r.status=r.notulen?'Afgerond':r.uitnodiging?'Gepland':'Open';
}

async function toggleAlvoFlag(idx,field){
  const r=D.alvo[idx];
  if(!r){console.warn('toggleAlvoFlag: rij niet gevonden',idx);return}
  if(!await ensureToken()){showToast('Niet ingelogd','Kan wijziging niet opslaan','var(--rd)');return}

  // Lock UI op de specifieke pill
  const btn=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
  if(btn) btn.classList.add('toggling');

  const oldVal=!!r[field];
  const newVal=!oldVal;
  const oldStatus=r.status;

  // Optimistische update
  r[field]=newVal;
  _recomputeAlvoStatus(r);
  renderAlvo();
  renderNtdDonut(); // voortgangsbalk meteen mee laten lopen

  try{
    const ids=await getSheetIds();
    const sheetId=ids["ALV's overzicht"]??ids["ALV's Overzicht"]??ids["ALV's overzicht "];
    if(sheetId==null) throw new Error("Sheet 'ALV's overzicht' niet gevonden");
    const col=ALVO_COLS[field];
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{
        updateCells:{
          range:{sheetId,startRowIndex:r._row-1,endRowIndex:r._row,startColumnIndex:col,endColumnIndex:col+1},
          rows:[{values:[{userEnteredValue:{boolValue:newVal}}]}],
          fields:'userEnteredValue'
        }
      }]})
    });
    if(!resp.ok){const t=await resp.text();throw new Error(`HTTP ${resp.status}: ${t.slice(0,120)}`)}

    logEvent(r.code,'ALVS',newVal?'Aangevinkt':'Uitgevinkt',ALVO_LABELS[field],oldVal?'TRUE':'FALSE',newVal?'TRUE':'FALSE');
    showToast(`${newVal?'✓':'○'} ${ALVO_LABELS[field]} ${newVal?'aan':'uit'}`,`${r.code} – ${r.naam}`,newVal?'var(--gn)':'var(--mut)');
  }catch(e){
    // Revert
    r[field]=oldVal;
    r.status=oldStatus;
    renderAlvo();
    renderNtdDonut();
    showToast('Opslaan mislukt',e.message||'Onbekende fout','var(--rd)');
    console.error('toggleAlvoFlag fout:',e);
  }finally{
    const btn2=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
    if(btn2) btn2.classList.remove('toggling');
  }
}
function statusIco(s){return{Open:'⏳',Gepland:'📅',Afgerond:'✅'}[s]||''}

// ══════════════════════════════════════
//  ALV AFGEROND
// ══════════════════════════════════════
function renderAlfa(){
  const q=document.getElementById('s-alfa').value.toLowerCase();
  const rows=D.alfa.filter(r=>`${r.code} ${r.naam} ${r.datum}`.toLowerCase().includes(q));
  const sl=rows.slice((pgs.alfa-1)*PG,pgs.alfa*PG);
  document.getElementById('alfa-tbody').innerHTML=sl.length
    ?sl.map(r=>`<tr>
        <td><span class="code" style="--sec:var(--gn);--sec-l:var(--gn-l)">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}</td>
        <td class="cell-sm">${esc(r.datum)}</td>
      </tr>`).join('')
    :emptyRow(3);
  renderPag('alfa-pag',rows.length,pgs.alfa,p=>{pgs.alfa=p;renderAlfa()});
}

// ══════════════════════════════════════
//  ANALYTICS — Productiviteits-tracker
// ══════════════════════════════════════
const PERIODS=['dag','week','maand','kwartaal'];
const MAAND_KORT=['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
const PERIODE_LABEL_NU={dag:'vandaag',week:'deze week',maand:'deze maand',kwartaal:'dit kwartaal'};
const PERIODE_LABEL_PREV={dag:'gisteren',week:'vorige week',maand:'vorige maand',kwartaal:'vorig kwartaal'};
const HERO_BUCKETS={dag:14,week:12,maand:12,kwartaal:8};
const SPARK_BUCKETS=8;

// Bucket helpers — datum (Date, string, of {y,m,d}) → sleutel
function _toDateObj(v){
  if(!v) return null;
  if(v instanceof Date) return isNaN(v)?null:v;
  if(typeof v==='object'&&v.y) return new Date(v.y,v.m-1,v.d);
  if(typeof v!=='string') return null;
  const p=_parseAnyDate(v);
  return p?new Date(p.y,p.m-1,p.d):null;
}
function bucketKey(date,period){
  const d=_toDateObj(date); if(!d) return null;
  if(period==='dag'){
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if(period==='week'){
    // ISO-week jaar: pak donderdag van die week
    const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
    const day=t.getUTCDay()||7;
    t.setUTCDate(t.getUTCDate()+4-day);
    const wk=getWeekNum(d);
    return`${t.getUTCFullYear()}-W${String(wk).padStart(2,'0')}`;
  }
  if(period==='maand'){
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  if(period==='kwartaal'){
    return`${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;
  }
  return null;
}
function bucketLabel(key,period){
  if(!key) return '';
  if(period==='dag'){
    const [y,m,d]=key.split('-').map(Number);
    return`${d} ${MAAND_KORT[m-1].toLowerCase()}`;
  }
  if(period==='week'){
    const [y,w]=key.split('-W');
    return`W${+w} '${y.slice(2)}`;
  }
  if(period==='maand'){
    const [y,m]=key.split('-').map(Number);
    return`${MAAND_KORT[m-1]} '${String(y).slice(2)}`;
  }
  if(period==='kwartaal'){
    const [y,q]=key.split('-Q');
    return`Q${q} '${y.slice(2)}`;
  }
  return key;
}
// Genereer laatste n bucket-sleutels eindigend op vandaag
function lastBucketKeys(period,n){
  const today=new Date();
  const out=[];
  for(let i=n-1;i>=0;i--){
    let d=new Date(today.getFullYear(),today.getMonth(),today.getDate());
    if(period==='dag') d.setDate(d.getDate()-i);
    else if(period==='week') d.setDate(d.getDate()-i*7);
    else if(period==='maand') d=new Date(today.getFullYear(),today.getMonth()-i,1);
    else if(period==='kwartaal'){
      const curQ=Math.floor(today.getMonth()/3);
      d=new Date(today.getFullYear(),(curQ-i)*3,1);
    }
    out.push(bucketKey(d,period));
  }
  return out;
}
// rows = array met datum-string; geef array {key,label,count} voor laatste n buckets
function seriesByPeriod(rows,dateField,period,n){
  const keys=lastBucketKeys(period,n);
  const counts={}; keys.forEach(k=>counts[k]=0);
  rows.forEach(r=>{
    const k=bucketKey(r[dateField],period);
    if(k!=null&&counts[k]!==undefined) counts[k]++;
  });
  return keys.map(k=>({key:k,label:bucketLabel(k,period),count:counts[k]}));
}
// behandelaar-veld kan "Jer" of "Cihad, Jer" zijn → split op komma
function _splitBeh(v){
  return String(v||'').split(/[,;/]/).map(s=>displayName(s.trim())).filter(Boolean);
}
// rows + behandelaar-veld → dict {persoon: [{key,label,count}]}
function seriesPerPersonByPeriod(rows,dateField,persField,period,n){
  const keys=lastBucketKeys(period,n);
  const out={};
  rows.forEach(r=>{
    const names=_splitBeh(r[persField]);
    if(!names.length) return;
    const k=bucketKey(r[dateField],period);
    if(k==null) return;
    names.forEach(name=>{
      if(!out[name]){out[name]={}; keys.forEach(kk=>out[name][kk]=0)}
      if(out[name][k]!==undefined) out[name][k]++;
    });
  });
  const res={};
  Object.keys(out).forEach(name=>{
    res[name]=keys.map(k=>({key:k,label:bucketLabel(k,period),count:out[name][k]}));
  });
  return res;
}
function computeTrend(series){
  const n=series.length;
  const huidig=n?series[n-1].count:0;
  const vorig=n>1?series[n-2].count:0;
  let dir='flat',label='0%',deltaPct=0;
  if(vorig===0&&huidig===0){dir='flat';label='0%'}
  else if(vorig===0&&huidig>0){dir='up';label='nieuw'}
  else{
    deltaPct=Math.round((huidig-vorig)/vorig*100);
    if(deltaPct>0){dir='up';label='+'+deltaPct+'%'}
    else if(deltaPct<0){dir='down';label=deltaPct+'%'}
    else{dir='flat';label='0%'}
  }
  return{huidig,vorig,deltaPct,dir,label};
}

// Sparkline — kleine lijngrafiek zonder assen
function renderSparkline(canvasId,values,color){
  if(charts[canvasId]) charts[canvasId].destroy();
  const el=document.getElementById(canvasId); if(!el) return;
  charts[canvasId]=new Chart(el,{
    type:'line',
    data:{labels:values.map((_,i)=>i),datasets:[{
      data:values,
      borderColor:color,
      backgroundColor:color+'22',
      borderWidth:2,
      fill:true,
      tension:.35,
      pointRadius:0,
      pointHoverRadius:3,
      pointHoverBackgroundColor:color
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{x:{display:false},y:{display:false,beginAtZero:true}},
      elements:{line:{borderJoinStyle:'round'}}}
  });
}

// KPI-tegel updaten (titel/getal/sub blijven HTML; trend wordt ingevoegd)
function renderKpiTile(id,opts){
  // opts: {num, sub, trend:{dir,label}, sparkId?, sparkValues?, sparkColor?}
  const numEl=document.getElementById(id+'-num');
  const subEl=document.getElementById(id+'-sub');
  if(numEl) numEl.textContent=opts.num;
  if(subEl){
    const arrow=opts.trend?(opts.trend.dir==='up'?'▲':opts.trend.dir==='down'?'▼':'■'):'';
    const trendHtml=opts.trend?`<span class="kpi-trend ${opts.trend.dir}"><span class="kpi-trend-arrow">${arrow}</span>${opts.trend.label}</span>`:'';
    const subText=opts.sub||'';
    subEl.innerHTML=`${trendHtml}${subText?'&nbsp;&nbsp;'+subText:''}`;
  }
  if(opts.sparkId&&opts.sparkValues){
    renderSparkline(opts.sparkId,opts.sparkValues,opts.sparkColor||'#0D7377');
  }
}

// KPI 4: per persoon — mini-balkjes
function renderKpiPersonTile(period){
  const rowsEl=document.getElementById('kpi-pers-rows'); if(!rowsEl) return;
  // Verzamel alle taken in laatste bucket (huidige periode)
  const keys=lastBucketKeys(period,1);
  const curKey=keys[0];
  const allTaken=SKEYS.flatMap(s=>D.af[s]||[]);
  const tally={};
  ['Jer','Cihad','Gabos','Cihan'].forEach(n=>tally[n]=0);
  allTaken.forEach(r=>{
    const k=bucketKey(r.datum,period);
    if(k!==curKey) return;
    _splitBeh(r.behandelaar).forEach(name=>{
      if(tally[name]!==undefined) tally[name]++;
    });
  });
  const max=Math.max(1,...Object.values(tally));
  rowsEl.innerHTML=['Jer','Cihad','Gabos','Cihan'].map(name=>{
    const v=tally[name];
    const pct=Math.round(v/max*100);
    return`<div class="kpi-person-row"><div class="kpi-person-name">${name}</div><div class="kpi-person-bar"><div class="kpi-person-fill" style="width:${pct}%"></div></div><div class="kpi-person-num">${v}</div></div>`;
  }).join('');
}

// Hoofdgrafiek: combo bar + lijn (vorige cyclus van gelijke lengte, verschoven)
function renderHeroChart(metric,period){
  const dark=document.documentElement.dataset.theme==='dark';
  const tc=dark?'#94a3b8':'#64748b';
  const gc=dark?'#1e293b':'#f1f5f9';
  const n=HERO_BUCKETS[period]||12;
  // Bouw 2n buckets om huidige + vorige cyclus te dekken
  const fullN=n*2;
  let rows,dateField,color,title;
  if(metric==='vergader'){
    rows=D.alfa; dateField='datum'; color='#0D7377'; title='Vergaderingen uitgeschreven';
  }else{
    rows=SKEYS.flatMap(s=>D.af[s]||[]); dateField='datum'; color='#047857'; title='Taken afgerond';
  }
  const full=seriesByPeriod(rows,dateField,period,fullN);
  const curr=full.slice(n);             // laatste n
  const prev=full.slice(0,n).map(b=>b.count); // de n daarvoor
  document.getElementById('hero-chart-title').textContent=title;
  const periodeNoun={dag:'dagen',week:'weken',maand:'maanden',kwartaal:'kwartalen'}[period]||period;
  document.getElementById('hero-chart-sub').textContent=` — laatste ${n} ${periodeNoun}`;
  if(charts['chart-hero']) charts['chart-hero'].destroy();
  charts['chart-hero']=new Chart(document.getElementById('chart-hero'),{
    type:'bar',
    data:{
      labels:curr.map(b=>b.label),
      datasets:[
        {type:'bar',label:'Deze cyclus',data:curr.map(b=>b.count),backgroundColor:color,borderRadius:6,borderSkipped:false,order:2},
        {type:'line',label:'Vorige cyclus (referentie)',data:prev,borderColor:dark?'#cbd5e1':'#94a3b8',backgroundColor:'transparent',borderWidth:2,borderDash:[5,4],pointRadius:0,pointHoverRadius:4,tension:.3,order:1}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{position:'top',align:'end',labels:{color:tc,padding:12,font:{size:11},usePointStyle:true,pointStyle:'circle',boxWidth:8}},
        tooltip:{mode:'index',intersect:false,backgroundColor:dark?'#0f172a':'#fff',titleColor:tc,bodyColor:dark?'#e2e8f0':'#1e293b',borderColor:gc,borderWidth:1,padding:10,cornerRadius:8,displayColors:true,usePointStyle:true}
      },
      scales:{
        x:{grid:{display:false},ticks:{color:tc,font:{size:11}}},
        y:{grid:{color:gc},ticks:{color:tc,precision:0},beginAtZero:true}
      }}
  });
}

// Leaderboard — taken per behandelaar deze vs vorige periode
function renderLeaderboard(period){
  const rows=SKEYS.flatMap(s=>D.af[s]||[]);
  const series=seriesPerPersonByPeriod(rows,'datum','behandelaar',period,2);
  const team=['Jer','Cihad','Gabos','Cihan'];
  const data=team.map(name=>{
    const s=series[name]||[{count:0},{count:0}];
    const huidig=s[s.length-1].count;
    const vorig=s.length>1?s[s.length-2].count:0;
    const trend=computeTrend(s);
    return{name,huidig,vorig,trend};
  }).sort((a,b)=>b.huidig-a.huidig);

  document.getElementById('lb-title').textContent=`Leaderboard — Taken afgerond ${PERIODE_LABEL_NU[period]}`;
  document.getElementById('lb-now-hdr').textContent=PERIODE_LABEL_NU[period].charAt(0).toUpperCase()+PERIODE_LABEL_NU[period].slice(1);
  document.getElementById('lb-prev-hdr').textContent=PERIODE_LABEL_PREV[period].charAt(0).toUpperCase()+PERIODE_LABEL_PREV[period].slice(1);

  const tbody=document.getElementById('lb-tbody');
  const medalCls=['gold','silver','bronze',''];
  tbody.innerHTML=data.map((r,i)=>{
    const arrow=r.trend.dir==='up'?'▲':r.trend.dir==='down'?'▼':'■';
    return`<tr>
      <td class="lb-rank ${medalCls[i]||''}">${i+1}</td>
      <td class="lb-name">${esc(r.name)}</td>
      <td class="lb-now">${r.huidig}</td>
      <td class="lb-prev">${r.vorig}</td>
      <td class="lb-trend"><span class="kpi-trend ${r.trend.dir}"><span class="kpi-trend-arrow">${arrow}</span>${r.trend.label}</span></td>
    </tr>`;
  }).join('');
}

// Globale periode-balk
function renderPeriodBar(){
  const el=document.getElementById('ana-period-bar'); if(!el) return;
  el.innerHTML=PERIODS.map(p=>{
    const lbl=p.charAt(0).toUpperCase()+p.slice(1);
    return`<button class="period-btn${anaPeriod===p?' on':''}" data-p="${p}">${lbl}</button>`;
  }).join('');
  el.querySelectorAll('.period-btn').forEach(b=>{
    b.onclick=()=>{
      anaPeriod=b.dataset.p;
      el.querySelectorAll('.period-btn').forEach(x=>x.classList.toggle('on',x.dataset.p===anaPeriod));
      buildAnalytics();
    };
  });
}
// Metric-toggle in hoofdgrafiek
function renderMetricToggle(){
  const el=document.getElementById('hero-metric-toggle'); if(!el) return;
  const metrics=[{k:'vergader',l:'Vergaderingen'},{k:'taken',l:'Taken'}];
  el.innerHTML=metrics.map(m=>`<button class="metric-btn${anaMetric===m.k?' on':''}" data-m="${m.k}">${m.l}</button>`).join('');
  el.querySelectorAll('.metric-btn').forEach(b=>{
    b.onclick=()=>{
      anaMetric=b.dataset.m;
      el.querySelectorAll('.metric-btn').forEach(x=>x.classList.toggle('on',x.dataset.m===anaMetric));
      renderHeroChart(anaMetric,anaPeriod);
    };
  });
}

function _try(label,fn){try{fn()}catch(e){console.error('[Analytics]',label,e)}}

function buildAnalytics(){
  _try('periode-bar',()=>renderPeriodBar());
  _try('metric-toggle',()=>renderMetricToggle());

  // ── KPI 1: Vergaderingen uitgeschreven (D.alfa, per periode)
  _try('kpi-vergader',()=>{
    const vSeries=seriesByPeriod(D.alfa||[],'datum',anaPeriod,SPARK_BUCKETS);
    const vTrend=computeTrend(vSeries);
    renderKpiTile('kpi-vergader',{
      num:vTrend.huidig,
      sub:`vs ${vTrend.vorig} ${PERIODE_LABEL_PREV[anaPeriod]}`,
      trend:vTrend,
      sparkId:'spark-vergader',
      sparkValues:vSeries.map(b=>b.count),
      sparkColor:'#0D7377'
    });
  });

  // ── KPI 2: Open ALV's (cumulatief, stand-meting)
  _try('kpi-openalv',()=>{
    const totAlv=(D.alvo||[]).length;
    const openAlv=(D.alvo||[]).filter(r=>!r.notulen).length;
    const openPct=totAlv?Math.round(openAlv/totAlv*100):0;
    const numEl=document.getElementById('kpi-openalv-num');
    const subEl=document.getElementById('kpi-openalv-sub');
    if(numEl) numEl.textContent=openAlv;
    if(subEl) subEl.textContent=totAlv?`van ${totAlv} ALV's · ${openPct}% nog uit te schrijven`:'geen data';
    const barEl=document.getElementById('kpi-openalv-bar');
    if(barEl) barEl.style.width=openPct+'%';
  });

  // ── KPI 3: Taken afgerond (D.af alle SKEYS, per periode)
  _try('kpi-taken',()=>{
    const tRows=SKEYS.flatMap(s=>(D.af||{})[s]||[]);
    const tSeries=seriesByPeriod(tRows,'datum',anaPeriod,SPARK_BUCKETS);
    const tTrend=computeTrend(tSeries);
    renderKpiTile('kpi-taken',{
      num:tTrend.huidig,
      sub:`vs ${tTrend.vorig} ${PERIODE_LABEL_PREV[anaPeriod]}`,
      trend:tTrend,
      sparkId:'spark-taken',
      sparkValues:tSeries.map(b=>b.count),
      sparkColor:'#047857'
    });
  });

  // ── KPI 4: Per persoon
  _try('kpi-pers',()=>renderKpiPersonTile(anaPeriod));

  // ── Hoofdgrafiek
  _try('hero-chart',()=>renderHeroChart(anaMetric,anaPeriod));

  // ── Leaderboard
  _try('leaderboard',()=>renderLeaderboard(anaPeriod));
}

function getWeekNum(d){
  const d2=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=d2.getUTCDay()||7;
  d2.setUTCDate(d2.getUTCDate()+4-dayNum);
  const yearStart=new Date(Date.UTC(d2.getUTCFullYear(),0,1));
  return Math.ceil((((d2-yearStart)/86400000)+1)/7);
}

function buildBarChart(id,labels,data,color,tc,gc){
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(document.getElementById(id),{
    type:'bar',
    data:{labels,datasets:[{label:'Aantal',data,backgroundColor:color,borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{color:tc,font:{size:11}}},
              y:{grid:{color:gc},ticks:{color:tc,precision:0},beginAtZero:true}}}
  });
}

function buildDonut(id,labels,data,colors,tc,centerVal,centerLbl){
  if(charts[id]) charts[id].destroy();
  const el=document.getElementById(id); if(!el) return;
  // Maak verticale gradient van basiskleur naar lichtere variant
  const ctxG=el.getContext('2d');
  const gradients=colors.map(c=>{
    const g=ctxG.createLinearGradient(0,0,0,el.height||220);
    g.addColorStop(0,c);
    g.addColorStop(1,_lightenHex(c,18));
    return g;
  });
  const centerPlugin={
    id:'center',
    afterDraw(chart){
      if(!centerVal) return;
      const {ctx,chartArea}=chart;
      const cx=(chartArea.left+chartArea.right)/2;
      const cy=(chartArea.top+chartArea.bottom)/2;
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const isFrac=centerVal&&String(centerVal).includes('/');
      const fSize=isFrac?'22px':'30px';
      // Subtiele schaduw onder het cijfer
      ctx.shadowColor='rgba(0,0,0,.08)';
      ctx.shadowBlur=4;
      ctx.shadowOffsetY=1;
      ctx.font=`800 ${fSize} 'DM Sans',sans-serif`;
      ctx.fillStyle=colors[0];
      ctx.fillText(centerVal,cx,cy-8);
      ctx.shadowColor='transparent';
      ctx.font="600 11px 'DM Sans',sans-serif";
      ctx.fillStyle=tc;
      const lbl=(centerLbl||'').toUpperCase();
      // Letter-spacing simuleren door letters één voor één te tekenen
      const letters=lbl.split('');
      const trackEm=0.08;
      ctx.font="600 10px 'DM Sans',sans-serif";
      let totalW=0;
      letters.forEach(c=>{totalW+=ctx.measureText(c).width+10*trackEm});
      let x=cx-totalW/2;
      letters.forEach(c=>{
        ctx.textAlign='left';
        ctx.fillText(c,x,cy+18);
        x+=ctx.measureText(c).width+10*trackEm;
      });
      ctx.restore();
    }
  };
  charts[id]=new Chart(el,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:gradients,borderWidth:0,hoverOffset:10,hoverBorderWidth:3,hoverBorderColor:'var(--sur)',spacing:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',
      animation:{animateRotate:true,animateScale:false,duration:900,easing:'easeOutCubic'},
      plugins:{
        legend:{position:'right',align:'center',labels:{color:tc,padding:14,font:{size:12,weight:'500'},
          usePointStyle:true,pointStyle:'circle',boxWidth:9,boxHeight:9}},
        tooltip:{backgroundColor:'rgba(15,23,42,.94)',titleColor:'#fff',bodyColor:'#e2e8f0',
          padding:11,cornerRadius:8,displayColors:true,usePointStyle:true,boxPadding:4,
          titleFont:{size:12,weight:'600'},bodyFont:{size:12}}
      }},
    plugins:[centerPlugin]
  });
}

// Lichten/donker maken van hex-kleur (perc -100..+100)
function _lightenHex(hex,perc){
  let h=hex.replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  const f=(v)=>Math.max(0,Math.min(255,Math.round(v+(perc/100)*(perc>0?255-v:v))));
  return`#${[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}

// ══════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════
const DASH_ICONS={
  // Klembord met lijntjes — open taken
  open:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>`,
  // Cirkel met dikke vink — taken afgerond
  done:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>`,
  // Envelop met vinkje en pijl — ALV uitgeschreven
  alv:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2v-11z" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 7l8.5 6 8.5-6"/><path d="M9 16.5l1.6 1.6L14 14.7"/></svg>`,
  // Document met pen — notulen verstuurd
  notes:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V4.5A1.5 1.5 0 017.5 3z" fill="currentColor" fill-opacity="0.18"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15h6M9 18h3"/><path d="M17.6 13.4l1.4-1.4a1.1 1.1 0 011.6 1.6l-1.4 1.4-1.6-1.6z" fill="currentColor" fill-opacity="0.35"/></svg>`,
  // Tab-iconen (kleine 14px versies)
  tabAlv:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2v-11z"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>`,
  tabNotes:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V4.5A1.5 1.5 0 017.5 3z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16h4"/></svg>`,
  tabBudget:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.6-.7-1.5-1.1-2.5-1.1-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5c-1 0-1.9-.4-2.5-1.1"/><path d="M12 7v10"/></svg>`,
  tabTasks:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="M9 11h6M9 14.5h6M9 18h4"/></svg>`,
};

const HERO_VIEWS=[
  {
    key:'alv', label:'ALV Voortgang', icon:'tabAlv',
    color:'#0D7377',
    title:'ALV Voortgang — Uitnodigingen',
    sub:'Hoeveel uitnodigingen zijn de deur uit',
    build:()=>{
      const u=D.alvo.filter(r=>r.uitnodiging).length;
      const t=D.alvo.length;
      return{labels:['Uitgeschreven','Nog uitschrijven'],data:[u,t-u],colors:['#0D7377','#E5E7EB'],centerVal:`${u}/${t}`,centerLbl:'Uitgeschreven'};
    }
  },
  {
    key:'notulen', label:'Notulen', icon:'tabNotes',
    color:'#15803D',
    title:'Notulen verstuurd',
    sub:'Van uitgeschreven vergaderingen',
    build:()=>{
      const u=D.alvo.filter(r=>r.uitnodiging).length;
      const n=D.alvo.filter(r=>r.notulen).length;
      return{labels:['Notulen verstuurd','Nog te versturen'],data:[n,Math.max(0,u-n)],colors:['#15803D','#E5E7EB'],centerVal:`${n}/${u}`,centerLbl:'Verstuurd'};
    }
  },
  {
    key:'begroting', label:'Begroting', icon:'tabBudget',
    color:'#6D5BD0',
    title:'Begroting doorgezet',
    sub:'Vergaderingen waar de begroting is doorgezet',
    build:()=>{
      const b=D.alvo.filter(r=>r.begroting).length;
      const t=D.alvo.length;
      return{labels:['Doorgezet','Niet doorgezet'],data:[b,t-b],colors:['#6D5BD0','#E5E7EB'],centerVal:`${b}/${t}`,centerLbl:'Doorgezet'};
    }
  },
  {
    key:'taken', label:'Open Taken', icon:'tabTasks',
    color:'#B45309',
    title:'Open taken per categorie',
    sub:'Verdeling van openstaande werkzaamheden',
    build:()=>{
      const data=SKEYS.map(s=>D.ntd[s]?.length||0);
      const tot=data.reduce((a,b)=>a+b,0);
      return{labels:SKEYS.map(s=>SECS[s].label),data,colors:['#0D7377','#B45309','#6D5BD0','#B91C1C'],centerVal:`${tot}`,centerLbl:'Open Taken'};
    }
  },
];
let activeHeroView='alv';

function renderHeroDonut(){
  const dark=document.documentElement.dataset.theme==='dark';
  const tc=dark?'#94a3b8':'#64748b';
  const view=HERO_VIEWS.find(v=>v.key===activeHeroView)||HERO_VIEWS[0];
  const card=document.querySelector('.hero-donut-card');
  if(card) card.style.setProperty('--hero-color',view.color);
  document.getElementById('hero-donut-title').textContent=view.title;
  document.getElementById('hero-donut-sub').textContent=view.sub;
  document.getElementById('hero-donut-tabs').innerHTML=HERO_VIEWS.map(v=>
    `<button class="hdt-tab ${v.key===activeHeroView?'on':''}" data-key="${v.key}" style="${v.key===activeHeroView?`--hero-color:${v.color}`:''}">${DASH_ICONS[v.icon]||''}<span>${v.label}</span></button>`
  ).join('');
  document.querySelectorAll('#hero-donut-tabs .hdt-tab').forEach(btn=>{
    btn.onclick=()=>{activeHeroView=btn.dataset.key;renderHeroDonut();};
  });
  const cfg=view.build();
  buildDonut('chart-hero-donut',cfg.labels,cfg.data,cfg.colors,tc,cfg.centerVal,cfg.centerLbl);
}

function buildDash(){
  const uitnD=D.alvo.filter(r=>r.uitnodiging).length;
  const notulenD=D.alvo.filter(r=>r.notulen).length;
  const ntdTotal=SKEYS.reduce((s,k)=>s+(D.ntd[k]?.length||0),0);
  const afTotal=SKEYS.reduce((s,k)=>s+(D.af[k]?.length||0),0);

  document.getElementById('dash-stats').innerHTML=`
    <div class="stat" style="--sec:var(--ac);--sec-l:var(--ac-l)"><div class="stat-top"><div class="stat-lbl">Open taken</div><div class="stat-ico">${DASH_ICONS.open}</div></div><div class="stat-num">${ntdTotal}</div><div class="stat-sub">nog op te pakken</div></div>
    <div class="stat" style="--sec:var(--gn);--sec-l:var(--gn-l)"><div class="stat-top"><div class="stat-lbl">Taken afgerond</div><div class="stat-ico">${DASH_ICONS.done}</div></div><div class="stat-num">${afTotal}</div><div class="stat-sub">afgeronde taken</div></div>
    <div class="stat" style="--sec:var(--am);--sec-l:var(--am-l)"><div class="stat-top"><div class="stat-lbl">ALV's uitgeschreven</div><div class="stat-ico">${DASH_ICONS.alv}</div></div><div class="stat-num">${uitnD}</div><div class="stat-sub">uitnodiging verstuurd</div></div>
    <div class="stat" style="--sec:var(--gn);--sec-l:var(--gn-l)"><div class="stat-top"><div class="stat-lbl">Notulen verstuurd</div><div class="stat-ico">${DASH_ICONS.notes}</div></div><div class="stat-num">${notulenD}</div><div class="stat-sub">van ${uitnD} uitgeschreven</div></div>`;

  renderHeroDonut();

  // Recent afgerond
  const secPill={
    OPPAKKEN:`<span style="background:var(--bl-l);color:var(--bl)" class="badge">Oppakken</span>`,
    VERGADERVERZOEKEN:`<span style="background:var(--am-l);color:var(--am)" class="badge">Vergadering</span>`,
    'OFFERTE-TRAJECTEN':`<span style="background:var(--pu-l);color:var(--pu)" class="badge">Offerte</span>`,
    LOD:`<span style="background:var(--rd-l);color:var(--rd)" class="badge">LOD</span>`,
  };
  const all=SKEYS.flatMap(s=>(D.af[s]||[]).map(r=>({...r,_sec:s})));
  all.sort((a,b)=>parseDt(b.datum)-parseDt(a.datum));
  document.getElementById('recent-tbody').innerHTML=all.slice(0,10).map(r=>`<tr>
    <td>${secPill[r._sec]||''}</td>
    <td><span class="code" style="${SECS[r._sec].css}">${esc(r.code)}</span></td>
    <td class="cell-name">${esc(r.naam)}</td>
    <td class="cell-txt">${esc(r.actiepunt||r.periode||'')}</td>
    <td>${persBadges(r.behandelaar)}</td>
    <td class="cell-sm">${esc(r.datum||'')}</td>
  </tr>`).join('')||`<tr><td colspan="6">${emptyRow(6,true)}</td></tr>`;
}

// ══════════════════════════════════════
//  TABLE HELPERS
// ══════════════════════════════════════
function renderThead(id,cols,css){
  document.getElementById(id).innerHTML=`<tr>${cols.map(c=>`<th style="${css}">${c}</th>`).join('')}</tr>`;
}

function renderTbody(tbodyId,rows,sec,page,isAf){
  const sl=rows.slice((page-1)*PG,page*PG);
  const el=document.getElementById(tbodyId);
  if(!sl.length){el.innerHTML=`<tr><td colspan="10">${emptyRow(10,true)}</td></tr>`;return}
  if(isAf){el.innerHTML=sl.map(r=>rowAf(r,sec)).join('');return}
  const main=sl.filter(r=>r.inBehandeling!=='TRUE');
  const ib=sl.filter(r=>r.inBehandeling==='TRUE');
  let html=main.map(r=>rowNtd(r,sec)).join('');
  if(ib.length){
    const cols=SECS[sec].cols.length+1;
    html+=`<tr><td colspan="${cols}" style="background:var(--ac-l);padding:8px 13px;font-size:11px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.05em;border:none">⟳ In behandeling (${ib.length})</td></tr>`;
    html+=ib.map(r=>rowNtd(r,sec)).join('');
  }
  el.innerHTML=html;
}

function bepaalStil(r, sec){
  if (r.inBehandeling !== 'TRUE') return null;
  const entries = (D.logboek || []).filter(e => e.code === r.code && (!sec || e.sectie === sec));
  if (!entries.length) return null; // geen activiteit-data → niet markeren
  let laatst = null;
  entries.forEach(e => {
    const t = e.timestamp ? new Date(e.timestamp) : null;
    if (t && !isNaN(t) && (!laatst || t > laatst)) laatst = t;
  });
  if (!laatst) return null;
  const dagen = _verschilInKalenderdagen(_vandaagAmsterdam(), laatst);
  return dagen >= STIL_DREMPEL_DAGEN ? dagen : null;
}

function deadlineCel(r, sec){
  if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen deadline</span></td>`;
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  const pill = teLaat ? ` <span class="pill-telaat">Te laat (${Math.abs(dagenTot)}d)</span>` : '';
  return `<td class="cell-sm">${esc(r.deadline)}${pill}</td>`;
}

function rowNtd(r,sec){
  const css=SECS[sec].css;
  const rid=_rowCache.length; _rowCache.push(r);
  const editBtn=`<button class="btn-edit" onclick="editRow(${rid})" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-done" onclick="completeTask(${rid})" title="Afgehandeld"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg></button>`;
  let cells='';
  const _stilDagen = bepaalStil(r, sec);
  const stilPill = _stilDagen !== null
    ? `<span class="pill-stil" onclick="event.stopPropagation(); editRow(${rid})" title="Geen activiteit in ${_stilDagen} dagen">Stil ${_stilDagen}d</span>`
    : '';
  switch(sec){
    case'OPPAKKEN':
      cells=`<td><span class="code" style="${css}">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td class="cell-txt">${esc(r.actiepunt)}${stilPill}</td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar)}</td>
        <td>${prioBadge(r, 'OPPAKKEN')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}</td>
        <td>${ibBadge(r.inBehandeling)}</td>
        <td>${editBtn}</td>`;
      break;
    case'VERGADERVERZOEKEN':
      cells=`<td><span class="code" style="${css}">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td><span class="badge" style="background:var(--am-l);color:var(--am)">${esc(r.periode||r.agendapunten||'')}</span></td>
        <td class="cell-txt">${esc(r.agendapunten||r.actiepunt||'')}${stilPill}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td>${prioBadge(r, 'VERGADERVERZOEKEN')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}</td>
        <td>${ibBadge(r.inBehandeling)}</td>
        <td>${editBtn}</td>`;
      break;
    case'OFFERTE-TRAJECTEN':
      cells=`<td><span class="code" style="${css}">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td class="cell-sm">${esc(r.datumAangevraagd||'')}</td>
        <td>${offProg(r.offertes)}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'OFFERTE-TRAJECTEN')}
        <td>${prioBadge(r, 'OFFERTE-TRAJECTEN')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}${stilPill}</td>
        <td>${editBtn}</td>`;
      break;
    case'LOD':
      cells=`<td><span class="code" style="${css}">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td class="cell-txt">${esc(r.actiepunt||'')}${stilPill}</td>
        <td class="cell-txt" style="font-style:italic;font-size:12px">${esc(r.status||'')}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'LOD')}
        <td>${prioBadge(r, 'LOD')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}</td>
        <td>${ibBadge(r.inBehandeling)}</td>
        <td>${editBtn}</td>`;
      break;
  }
  const { teLaat: rowTeLaat } = berekenPrioriteit(r.deadline, sec);
  const rowCls = [
    r.inBehandeling === 'TRUE' ? 'ib-row' : '',
    rowTeLaat ? 'row-telaat' : ''
  ].filter(Boolean).join(' ');
  return `<tr class="${rowCls}">${cells}</tr>`;
}

function rowAf(r,sec){
  const css=SECS[sec].css;
  return`<tr>
    <td><span class="code" style="${css}">${esc(r.code)}</span></td>
    <td class="cell-name">${esc(r.naam)}</td>
    <td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||'')}</td>
    <td class="cell-sm">${esc(r.subcategorie||'')}</td>
    <td class="cell-sm">${esc(r.datum||'')}</td>
    <td class="cell-txt">${r.opmerking?`<span style="font-size:12px">${esc(r.opmerking)}</span>`:''}</td>
  </tr>`;
}

// ══════════════════════════════════════
//  PAGINATION
// ══════════════════════════════════════
function renderPag(id,total,cur,cb){
  const el=document.getElementById(id);if(!el)return;
  const tp=Math.ceil(total/PG);
  if(tp<=1){el.innerHTML='';return}
  const s=(cur-1)*PG+1,e=Math.min(cur*PG,total);
  const rng=tp<=7?[...Array(tp).keys()].map(i=>i+1)
    :cur<=4?[1,2,3,4,5,'…',tp]
    :cur>=tp-3?[1,'…',tp-4,tp-3,tp-2,tp-1,tp]
    :[1,'…',cur-1,cur,cur+1,'…',tp];
  el.innerHTML=`<div class="pag-info">Toont ${s}–${e} van ${total}</div>
    <div class="pag-btns">
      <button class="pb" onclick="(${cb})(${cur-1})" ${cur<=1?'disabled':''}>‹</button>
      ${rng.map(p=>p==='…'?`<span class="pb" style="border:none;cursor:default">…</span>`
        :`<button class="pb ${p===cur?'on':''}" onclick="(${cb})(${p})">${p}</button>`).join('')}
      <button class="pb" onclick="(${cb})(${cur+1})" ${cur>=tp?'disabled':''}>›</button>
    </div>`;
}

// ══════════════════════════════════════
//  MODAL — Open / Close
// ══════════════════════════════════════
function openModal(isEdit,rowData){
  editMode=!!isEdit;
  const sec=isEdit?rowData._sec:activeNtd;
  editSec=sec; editRowData=rowData||null;

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

  if(isEdit&&editRowData){
    document.getElementById('m-code').value=editRowData.code||'';
    document.getElementById('m-naam').value=editRowData.naam||'';
    fillModalFields(sec,editRowData);
    renderTaskHistory(editRowData.code,sec);
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
let _sheetIds=null;
async function getSheetIds(){
  if(_sheetIds) return _sheetIds;
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}`,{headers:{Authorization:`Bearer ${oauthToken}`}});
  if(!r.ok){ if(r.status===401){oauthToken=null;oauthExpiry=0} throw new Error('getSheetIds '+r.status); }
  const d=await r.json();
  _sheetIds={};
  (d.sheets||[]).forEach(s=>{_sheetIds[s.properties.title]=s.properties.sheetId});
  return _sheetIds;
}

function getInsertRow(sec){
  const entries=D.ntd[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.ntdSecInfo[sec];
  return info?.colHeaderRow||2;
}

async function insertAndWriteRow(sheetName,afterRow,values){
  if(!oauthToken) throw new Error('Niet ingelogd');
  const ids=await getSheetIds();
  const sheetId=ids[sheetName];
  if(sheetId==null) throw new Error('Sheet niet gevonden: '+sheetName);
  const insResp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
    method:'POST',
    headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({requests:[{insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+1},inheritFromBefore:true}}]})
  });
  if(!insResp.ok){const e=await insResp.json();if(insResp.status===401){oauthToken=null;oauthExpiry=0}const err=new Error(e.error?.message||'Invoegfout');err.status=insResp.status;throw err}
  const endCol=String.fromCharCode(64+Math.max(values.length,9));
  await writeRange(`'${sheetName}'!A${afterRow+1}:${endCol}${afterRow+1}`,values);
}

async function deleteTask(idx){
  const r=_rowCache[idx];
  if(!r) return;
  await deleteTaskRow(r);
}

async function deleteCurrentEditTask(){
  if(!editRowData) return;
  const r=editRowData;
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
      headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}]})
    });
    if(!resp.ok){const e=await resp.json();if(resp.status===401){oauthToken=null;oauthExpiry=0}throw new Error(e.error?.message||'Verwijderfout')}
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

let _completeIdx=null;
async function completeTask(idx){
  const r=_rowCache[idx];
  if(!r){alert('Taak niet gevonden. Vernieuw de pagina en probeer opnieuw.');return}
  _completeIdx=idx;
  const d=new Date();
  document.getElementById('complete-date').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('complete-comment').value='';
  document.getElementById('complete-title').textContent=`Taak afhandelen — ${r.actiepunt||r.periode||r.code||''}`;
  document.getElementById('complete-bg').classList.add('open');
}

async function doCompleteTask(){
  const idx=_completeIdx;
  const r=_rowCache[idx];
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
          method:'POST',headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify(batchBody)});
        if(!resp.ok){const e=await resp.json();if(resp.status===401){oauthToken=null;oauthExpiry=0}const err=new Error(e.error?.message||'Fout bij afhandelen taak');err.status=resp.status;throw err}
        logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]); if(a.indexOf(r)===-1){ _shiftNtdRows(r._row,+1); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
      'Afronden mislukt'
    );
  }catch(e){alert('Fout bij afhandelen: '+e.message)}
}

function closeCompleteModal(){document.getElementById('complete-bg').classList.remove('open');_completeIdx=null}

// ══════════════════════════════════════
//  SUBMIT TASK (Add + Edit)
// ══════════════════════════════════════
async function submitTask(){
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const code=document.getElementById('m-code').value.trim();
  const naam=document.getElementById('m-naam').value.trim();
  if(!code){alert('VvE Code is verplicht.');return}

  const sec=editSec||activeNtd;
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
    if(editMode&&editRowData?._row){
      // ── Bewerken: lokale rij meteen bijwerken, dan op de achtergrond opslaan ──
      const doelRow=editRowData, oudeWaarden={...editRowData};
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
      oauthToken=null;oauthExpiry=0;
      alert('Je sessie is verlopen. Klik nogmaals op Opslaan om opnieuw in te loggen.');
    }else{alert('Fout: '+e.message)}
  }
}
function gv(id){const el=document.getElementById(id);return el?el.value.trim():''}

// ══════════════════════════════════════
//  AI-HULP — plak mailtekst (slim kopieer-plak)
// ══════════════════════════════════════
let _aiLastCode='', _aiLastNaam='';

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
  _aiLastCode=code||''; _aiLastNaam=ctx?(ctx.naam||''):'';

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
  activeNtd=sec;
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
function aiOvernemen(sec){ prefillNieuweTaak(sec,_aiLastCode,_aiLastNaam,''); }
function aiActieTaak(btn){
  const txt=btn.closest('li').querySelector('.atxt').textContent;
  prefillNieuweTaak('OPPAKKEN',_aiLastCode,_aiLastNaam,txt);
}
function aiKopieerConcept(btn){
  const txt=btn.closest('.ai-card').querySelector('.ai-reply').innerText;
  if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
  showToast('📋 Gekopieerd','Concept-antwoord klaar voor je mail','var(--gn)');
}

// ══════════════════════════════════════
//  OAUTH
// ══════════════════════════════════════
function doOAuth(forcePrompt){
  return new Promise(resolve=>{
    if(!clientId){resolve(null);return}
    try{
      if(!_gsiTokenClient){
        _gsiTokenClient=google.accounts.oauth2.initTokenClient({
          client_id:clientId,
          scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
          callback:resp=>{
            if(resp.error){console.warn('OAuth fout:',resp.error);oauthToken=null;oauthExpiry=0;resolve(null);return}
            oauthToken=resp.access_token;
            oauthExpiry=Date.now()+((resp.expires_in||3600)-120)*1000;
            sessionStorage.setItem('oauthToken',oauthToken);
            sessionStorage.setItem('oauthExpiry',String(oauthExpiry));
            resolve(oauthToken);
          }
        });
      }
      _gsiTokenClient.requestAccessToken(forcePrompt?{}:{prompt:''});
    }catch(e){console.error('OAuth:',e);resolve(null)}
  });
}

async function fetchUserEmail(){
  if(!oauthToken) return null;
  try{
    const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${oauthToken}`}});
    if(!r.ok) return null;
    const d=await r.json();
    return d.email||null;
  }catch(e){return null}
}

async function doLogin(){
  const errEl=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  errEl.style.display='none';
  btn.textContent='Even geduld…';btn.disabled=true;
  await doOAuth(true);
  if(!oauthToken){errEl.textContent='Inloggen geannuleerd of mislukt.';errEl.style.display='block';btn.textContent='Inloggen met Google';btn.disabled=false;return}
  const email=await fetchUserEmail();
  if(!email){errEl.textContent='Kon e-mailadres niet ophalen.';errEl.style.display='block';btn.textContent='Inloggen met Google';btn.disabled=false;return}
  if(!ALLOWED_EMAILS.includes(email.toLowerCase())){
    oauthToken=null;oauthExpiry=0;
    errEl.textContent='Geen toegang. Gebruik je VvE Beheer Collectief account.';errEl.style.display='block';btn.textContent='Inloggen met Google';btn.disabled=false;return;
  }
  currentUserEmail=email;
  sessionStorage.setItem('currentUserEmail',email);
  document.getElementById('login-gate').style.display='none';
  loadAll();
}

async function ensureToken(){
  if(oauthToken && Date.now()<oauthExpiry) return true;
  oauthToken=null; oauthExpiry=0;
  await doOAuth(false);
  if(!oauthToken){
    await doOAuth(true);
    if(!oauthToken) return false;
  }
  if(currentUserEmail) return true;
  const email=await fetchUserEmail();
  if(!email||!ALLOWED_EMAILS.includes(email.toLowerCase())){oauthToken=null;oauthExpiry=0;return false}
  currentUserEmail=email;
  sessionStorage.setItem('currentUserEmail',email);
  return true;
}

// ══════════════════════════════════════
//  SHARED HELPERS
// ══════════════════════════════════════
function filt(rows,q){
  if(!q)return rows;
  return rows.filter(r=>Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)));
}

// ══════════════════════════════════════
//  AUTO-PRIORITEIT (zie docs/superpowers/specs/2026-06-02-auto-prioriteit-design.md)
// ══════════════════════════════════════
const PRIO_REGELS = {
  'OPPAKKEN':          { hoog:  7, midden:  14 },
  'VERGADERVERZOEKEN': { hoog: 14, midden:  21 },
  'OFFERTE-TRAJECTEN': { hoog: 21, midden:  42 },
  'LOD':               { hoog: 90, midden: 240 },
};
const STIL_DREMPEL_DAGEN = 4;

function _vandaagAmsterdam(){
  // Lokale datum (Europe/Amsterdam = browser-locale van de gebruiker), tijd op 00:00
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function _verschilInKalenderdagen(deadline, vandaag){
  if (!(deadline instanceof Date) || isNaN(deadline)) return null;
  const d = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const v = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate());
  return Math.round((d - v) / 86400000);
}

function berekenPrioriteit(deadlineStr, categorie, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  if (!deadlineStr) return { prioriteit: '', dagenTot: null, teLaat: false };
  const parsed = _parseAnyDate(deadlineStr);
  if (!parsed) return { prioriteit: '', dagenTot: null, teLaat: false };
  const deadline = new Date(parsed.y, parsed.m - 1, parsed.d);
  const dagenTot = _verschilInKalenderdagen(deadline, vandaag);
  const teLaat = dagenTot < 0;
  const regels = PRIO_REGELS[categorie];
  if (!regels) return { prioriteit: '', dagenTot, teLaat };
  let prioriteit;
  if (dagenTot <= regels.hoog) prioriteit = 'Hoog';
  else if (dagenTot <= regels.midden) prioriteit = 'Midden';
  else prioriteit = 'Laag';
  return { prioriteit, dagenTot, teLaat };
}

function prioBadge(r, sec){
  const { prioriteit } = berekenPrioriteit(r.deadline, sec);
  if(!prioriteit)return'';
  const cls={Hoog:'prio-hoog',Midden:'prio-mid',Laag:'prio-laag'}[prioriteit]||'prio-mid';
  const ico={Hoog:'↑',Midden:'→',Laag:'↓'}[prioriteit]||'';
  return`<span class="badge ${cls}">${ico} ${esc(prioriteit)}</span>`;
}

function persBadges(v){
  if(!v)return'<span style="color:var(--fnt);font-size:12px">–</span>';
  const colors={'jer':'pers-jer','cihad':'pers-cihad','gabos':'pers-gabos'};
  return v.split(/[,\/]/).map(n=>n.trim()).filter(Boolean).map(n=>{
    const cls=colors[n.toLowerCase()]||'pers-default';
    return`<span class="pers ${cls}">${esc(n)}</span>`;
  }).join('');
}

function ibBadge(v){
  return(v==='TRUE'||v===true)?'<span class="ib-yes">⟳ Loopt</span>':'<span class="ib-no">–</span>';
}

function adjOff(id,delta){
  const el=document.getElementById(id);
  if(!el)return;
  el.value=Math.max(0,(parseInt(el.value)||0)+delta);
}

function offProg(v){
  if(!v)return'';
  const[recv,req]=(v+'').split('/').map(s=>parseInt(s)||0);
  const pct=req>0?Math.min(100,Math.round(recv/req*100)):0;
  return`<div class="prog-wrap"><span style="font-size:12px;font-weight:700;color:var(--pu)">${esc(v)}</span>
    <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:var(--pu)"></div></div></div>`;
}

const _MAANDEN={jan:1,feb:2,mrt:3,maa:3,apr:4,mei:5,jun:6,jul:7,aug:8,sep:9,sept:9,okt:10,nov:11,dec:12,
  januari:1,februari:2,maart:3,april:4,juni:6,juli:7,augustus:8,september:9,oktober:10,november:11,december:12};

function _parseAnyDate(s){
  if(!s)return null;
  s=s.trim();
  // yyyy-mm-dd (ISO)
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)return{y:+m[1],m:+m[2],d:+m[3]};
  // dd-mm-yyyy
  m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if(m)return{y:+m[3],m:+m[2],d:+m[1]};
  // dd/mm/yyyy
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return{y:+m[3],m:+m[2],d:+m[1]};
  // "21 mei 2026" / "3 jan. 2025" / "21 mei '26"
  m=s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?\s+'?(\d{2,4})$/);
  if(m){const mn=_MAANDEN[m[2].toLowerCase()];if(mn){let y=+m[3];if(y<100)y+=2000;return{y,m:mn,d:+m[1]}}}
  return null;
}

function parseDt(s){
  const d=_parseAnyDate(s);
  return d?new Date(d.y,d.m-1,d.d).getTime():0;
}
function toISODate(s){
  const d=_parseAnyDate(s);
  return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:'';
}
function toDutchDate(s){
  const d=_parseAnyDate(s);
  return d?`${String(d.d).padStart(2,'0')}-${String(d.m).padStart(2,'0')}-${d.y}`:'';
}

function emptyRow(cols,inline){
  if(inline)return`<div class="empty"><div class="empty-ico">📭</div>Geen resultaten</div>`;
  return`<tr><td colspan="${cols}"><div class="empty"><div class="empty-ico">📭</div>Geen resultaten</div></td></tr>`;
}

function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function subBadge(v){return v?`<span class="badge" style="background:var(--sur2);color:var(--mut);font-size:10px;margin-left:4px">${esc(v)}</span>`:''}

function setupSearch(id,cb){
  const el=document.getElementById(id);if(!el)return;
  let t;el.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(cb,200)});
}

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
    const activeStyle = c===activeOntw
      ? (c==='Afgerond' ? '--sec:var(--gn);--sec-l:var(--gn-l);--sec-b:var(--gn-b)' : '--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)')
      : '';
    return`<div class="tab ${c===activeOntw?'on':''}" style="${activeStyle}" onclick="setOntw('${c.replace(/'/g,"\\'")}')">${c}<span class="cnt">${cnt}</span></div>`;
  }).join('');

  let rows;
  if(activeOntw==='Afgerond') rows=doneItems;
  else if(activeOntw==='Alles') rows=openItems;
  else rows=openItems.filter(r=>r.categorie===activeOntw);
  if(q) rows=rows.filter(r=>`${r.titel} ${r.inhoud} ${r.categorie} ${r.door}`.toLowerCase().includes(q));

  renderThead('ontw-thead',['Titel','Categorie','Inhoud','Door','Datum','Status',''],'--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)');
  const sl=rows.slice((pgs.ontw-1)*PG,pgs.ontw*PG);
  const el=document.getElementById('ontw-tbody');
  if(!sl.length){el.innerHTML=`<tr><td colspan="7">${emptyRow(7,true)}</td></tr>`;return}
  el.innerHTML=sl.map(r=>{
    const rid=_rowCache.length;_rowCache.push(Object.assign({},r,{_sec:'ONTW'}));
    const clr=ONTW_CAT_COLORS[r.categorie]||'var(--mut)';
    return`<tr>
      <td class="cell-name">${esc(r.titel)}</td>
      <td><span class="badge" style="background:color-mix(in srgb,${clr} 15%,transparent);color:${clr}">${esc(r.categorie)}</span></td>
      <td class="cell-txt">${r.inhoud?`<span style="font-size:12px">${esc(r.inhoud.substring(0,80))}${r.inhoud.length>80?'…':''}</span>`:''}</td>
      <td>${persBadges(r.door)}</td>
      <td class="cell-sm">${esc(r.datum)}</td>
      <td><span class="badge status-${esc((r.status||'').toLowerCase())}">${r.status==='Afgerond'?'✅':'⏳'} ${esc(r.status)}</span></td>
      <td><button class="btn-edit" onclick="editOntwItem(${rid})" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
  renderPag('ontw-pag',rows.length,pgs.ontw,p=>{pgs.ontw=p;renderOntw()});
}
function setOntw(c){activeOntw=c;pgs.ontw=1;renderOntw()}

let ontwEditMode=false, ontwEditRow=null;
function openOntwModal(isEdit, rowData){
  ontwEditMode=!!isEdit;
  ontwEditRow=rowData||null;
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

window.editOntwItem=function(idx){
  const r=_rowCache[idx];
  if(r) openOntwModal(true,r);
};

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
    if(ontwEditMode&&ontwEditRow?._row){
      await writeRange(`'Ontwikkeling'!A${ontwEditRow._row}:F${ontwEditRow._row}`,values);
    } else {
      await appendRange("'Ontwikkeling'!A:F",values);
    }
    closeOntwModal();
    await loadAll();
  }catch(e){alert('Fout: '+e.message)}
}

async function deleteOntwItem(){
  if(!ontwEditRow) return;
  if(!confirm('Dit item verwijderen?')) return;
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  try{
    const ids=await getSheetIds();
    const sheetId=ids['Ontwikkeling'];
    if(sheetId==null) throw new Error('Sheet "Ontwikkeling" niet gevonden');
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:ontwEditRow._row-1,endIndex:ontwEditRow._row}}}]})
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
let logWho='', logAct='';

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
    if(logWho && displayName(r.gebruiker)!==logWho) return false;
    if(logAct){
      const m = r.actie===logAct || (logAct==='Aangemaakt' && (r.actie||'').indexOf('Aangemaakt')===0);
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
  renderPag('logboek-pag',rows.length,pgs.logboek,p=>{pgs.logboek=p;renderLogboek()});
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
    if (!oauthToken) return;
    const who = getCurrentWho() || '?';
    const ts = new Date().toISOString();
    await appendRange("'Logboek'!A:H", [ts, code||'', sec||'', actie||'', veld||'', oudeWaarde||'', nieuweWaarde||'', who]);
  } catch(e) { console.warn('Logboek schrijffout:', e); }
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
        headers: { Authorization: `Bearer ${oauthToken}`, 'Content-Type': 'application/json' },
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

    const newRows = rows.filter(n => n.ts > _lastNotifTs);
    for (const n of newRows) {
      if (n.voor !== 'allen' && n.voor && who && n.voor !== who) continue;
      const prefKey = typeToPrefs[n.type];
      if (prefKey && prefs[prefKey] === false) continue;
      showToast(n.title, n.body, TOAST_COLORS[n.type] || 'var(--ac)');
    }
    if (newRows.length) _lastNotifTs = rows[0].ts;
  } catch(e) { /* stil falen */ }
}

function startNotifPoll() {
  pollNotifsForToast();
  _notifPollTimer = setInterval(pollNotifsForToast, 10000);
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
  document.getElementById('notif-subscribe-section').style.display = isSubscribed ? 'none' : 'block';
  document.getElementById('notif-settings-section').style.display  = isSubscribed ? 'block' : 'none';
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = isSubscribed ? 'none' : 'block';
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
  if (currentUserEmail) return displayName(currentUserEmail);
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
  if (oneSignalReady && isSubscribed) {
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
  while (!oneSignalReady && (Date.now() - start) < timeoutMs) {
    await new Promise(r => setTimeout(r, 150));
  }
  return oneSignalReady;
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
    isSubscribed = true;
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
    if (oneSignalReady) {
      await OneSignal.User.PushSubscription.optOut();
      await OneSignal.logout();
    }
    isSubscribed = false;
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
    oneSignalReady = true;
    isSubscribed   = OneSignal.User.PushSubscription.optedIn === true;
    refreshNotifUI();
    OneSignal.User.PushSubscription.addEventListener('change', e => {
      isSubscribed = e.current.optedIn === true;
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
  aiOvernemen, aiActieTaak, aiKopieerConcept, setOntw, editOntwItem, dismissToast,
  pgs, renderNtd, renderAf, renderAlvo, renderAlfa, renderOntw, renderLogboek,
});
