// ══════════════════════════════════════
//  MAIN — opstarten en alle klikken
// ══════════════════════════════════════
import { state } from './state.js';
import { APP_VERSION, IS_STAGING, emailToegestaan, VERHUISD_NAAR, _verhuisDoel } from './config.js';
import { doLogin, uitloggen } from './auth.js';
import { startSplash } from './login-splash.js';
import { loadAll, laadUitCache, startVerversen } from './data.js';
import { startVersieBewaking } from './versie.js';
import { initSwUpdate } from './sw-update.js';
import { goTo, PAGINAS, beantwoordBevestiging, sluitOngedaan } from './ui.js';
import { initTaken, vinkAf, startBewerken, stopBewerken, kiesLijst } from './taken.js';
import { initDossiers, openDossier, sluitDossier, rondAf, zetFase, kiesFaseInVenster, rondAfUitVenster, verwijderUitVenster, tekenDossiers } from './dossiers.js';
import { initAlv, wisselVlag, nieuweRonde, tekenAlvo } from './alv.js';
import { icoon } from './iconen.js';

// Verhuisd naar het eigen domein? Dan meteen door, vóór er iets opstart. Zie VERHUISD_NAAR.
const _verhuis = _verhuisDoel(VERHUISD_NAAR, location.hostname, location.search, location.hash);
if(_verhuis) location.replace(_verhuis);

// Nooit in een iframe (clickjacking). Op Vercel doen de headers dit ook; op GitHub Pages niet.
if(window.top !== window.self){
  try{ window.top.location = window.self.location; }
  catch(_){ document.documentElement.style.display='none'; }
}

window.addEventListener('unhandledrejection', e=>console.error('[onafgevangen]', e && e.reason));

// ── Alle klikken via data-actie ─────────────────────────────────────────
const ACTIES = {
  'login':           ()=>doLogin(),
  'uitloggen':       ()=>uitloggen(),
  'vernieuwen':      ()=>loadAll(),
  'lijst-van':       el=>kiesLijst(el.dataset.wie),
  'taak-bewerk':     el=>startBewerken(el.dataset.id),
  'taak-bewerk-stop':()=>stopBewerken(),
  'eigen-lijst':     ()=>kiesLijst(null),
  'dossier-wie':     el=>{ state.filters[el.dataset.pagina].wie=el.dataset.wie; tekenDossiers(); },
  'dossier-open':    el=>openDossier(el.dataset.sec, el.dataset.sleutel),
  'dossier-nieuw':   el=>openDossier(el.dataset.sec, null),
  'dossier-fase':    el=>zetFase(el.dataset.sleutel, +el.dataset.stap),
  'dos-kies-fase':   el=>kiesFaseInVenster(+el.dataset.stap),
  'dos-sluit':       ()=>sluitDossier(),
  'dos-af':          ()=>rondAfUitVenster(),
  'dos-weg':         ()=>verwijderUitVenster(),
  'alvo-filter':     el=>{ state.filters.alvo.status = state.filters.alvo.status===el.dataset.status ? '' : el.dataset.status; tekenAlvo(); },
  'alvo-vlag':       el=>wisselVlag(el.dataset.code, el.dataset.veld),
  'alvo-ronde':      ()=>nieuweRonde(),
  'bevestig-ja':     ()=>beantwoordBevestiging(true),
  'bevestig-nee':    ()=>beantwoordBevestiging(false),
  'snack-sluit':     ()=>sluitOngedaan(),
};
// Selectievakjes (afvinken/afronden) reageren op 'change', niet op 'click'.
const VINKEN = {
  'taak-af':    el=>vinkAf(el.dataset.id),
  'dossier-af': el=>rondAf(el.dataset.sec, el.dataset.sleutel),
};
// Voor de zelftest: elke data-actie in de pagina moet hier een handler hebben. (v16.0 begon met een
// inlogknop die nog het oude attribuut data-action droeg — de klik kwam nergens aan.)
export const ACTIE_NAMEN = [...Object.keys(ACTIES), ...Object.keys(VINKEN)];

function vangFout(p, wat){
  Promise.resolve(p).catch(e=>console.error('[actie]', wat, e));
}

document.addEventListener('click', e=>{
  const el=e.target.closest('[data-actie]');
  if(!el || el.disabled || el.tagName==='INPUT') return;
  const fn=ACTIES[el.dataset.actie];
  if(!fn) return;
  if(el.tagName==='A') e.preventDefault();
  vangFout(fn(el), el.dataset.actie);
});
document.addEventListener('change', e=>{
  const el=e.target.closest('input[type=checkbox][data-actie]');
  if(!el || !el.checked) return;
  const fn=VINKEN[el.dataset.actie];
  if(fn) vangFout(fn(el), el.dataset.actie);
});
// Klik op de achtergrond van een venster = sluiten.
document.addEventListener('mousedown', e=>{
  if(e.target.id==='dossier-bg') sluitDossier();
  if(e.target.id==='bevestig-bg') beantwoordBevestiging(false);
});
// Tab blijft binnen een open venster (het staat buiten #app; zonder dit verdween de focus erachter).
document.addEventListener('keydown', e=>{
  if(e.key!=='Tab') return;
  const bg=[...document.querySelectorAll('.modal-bg.open')].pop(); if(!bg) return;
  const f=[...bg.querySelectorAll('button,input,select,textarea,[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled && x.offsetParent!==null);
  if(!f.length) return;
  const eerste=f[0], laatste=f[f.length-1];
  if(!bg.contains(document.activeElement)){ e.preventDefault(); eerste.focus(); }
  else if(e.shiftKey && document.activeElement===eerste){ e.preventDefault(); laatste.focus(); }
  else if(!e.shiftKey && document.activeElement===laatste){ e.preventDefault(); eerste.focus(); }
});
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  if(document.getElementById('bevestig-bg')?.classList.contains('open')){ beantwoordBevestiging(false); return; }
  if(document.getElementById('dossier-bg')?.classList.contains('open')){ sluitDossier(); return; }
});
// Menu: gewone links naar #pagina, zodat ook 'openen in nieuw tabblad' en terug-knop werken.
window.addEventListener('hashchange', ()=>{
  const p=location.hash.slice(1);
  if(PAGINAS.includes(p) && p!==state.pagina) goTo(p);
});
document.addEventListener('click', e=>{
  const a=e.target.closest('a.nav-knop[data-pagina]');
  if(!a) return;
  e.preventDefault();
  goTo(a.dataset.pagina);
});

// De letter van de huisstijl (Albert Sans). Niet als <link> in de kop: die laat het starten wachten
// op Google Fonts. Tot hij binnen is, staat de systeemletter (zie --letter in styles.css).
export const LETTER_URL='https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700&display=swap';
function laadLetter(){
  if(document.getElementById('app-letter')) return;
  const l=document.createElement('link');
  l.id='app-letter'; l.rel='stylesheet'; l.href=LETTER_URL;
  document.head.appendChild(l);
}

// ── Opstarten ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  if(_verhuis) return;
  ['app-version','app-version-login','app-version-splash'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=APP_VERSION; });
  laadLetter();
  document.querySelectorAll('[data-icoon]').forEach(el=>{ el.insertAdjacentHTML('afterbegin', icoon(el.dataset.icoon, +(el.dataset.grootte||20))); });
  if(IS_STAGING){
    document.title='[TEST] '+document.title;
    document.body.classList.add('test');
    document.body.insertAdjacentHTML('afterbegin','<div class="testbalk" role="note">Testomgeving: dit werkt met de test-Sheet, niet met de echte gegevens.</div>');
  }
  initSwUpdate();
  initTaken();
  initDossiers();
  initAlv();
  startVerversen();

  const begin=location.hash.slice(1);
  goTo(PAGINAS.includes(begin) ? begin : 'taken');

  if(location.search.includes('test=1')){ import('./tests.js'); return; }

  // Nog ingelogd in dit tabblad? Dan zonder inlogscherm verder.
  const t=sessionStorage.getItem('oauthToken');
  const exp=parseInt(sessionStorage.getItem('oauthExpiry')||'0');
  const mail=sessionStorage.getItem('currentUserEmail');
  if(t && Date.now()<exp && mail && emailToegestaan(mail)){
    state.oauthToken=t; state.oauthExpiry=exp; state.currentUserEmail=mail;
    document.getElementById('login-gate').style.display='none';
    document.getElementById('app')?.removeAttribute('inert');
    laadUitCache();
    loadAll();
    startVersieBewaking();
  } else {
    document.getElementById('app')?.setAttribute('inert','');
    startSplash();
  }
});

