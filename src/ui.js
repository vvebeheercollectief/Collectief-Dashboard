// ══════════════════════════════════════
//  UI — navigatie, thema, dichtheid, zoeken
// ══════════════════════════════════════
import { PAGE_META } from "./config.js";
import { state } from "./state.js";
import { buildAnalytics, buildDash } from "./render-analytics.js";
import { renderOntw, renderLogboek } from "./render-overig.js";
import { renderHerhaal } from "./render-herhaal.js";
import { renderVve } from "./render-vve.js";
import { showToast } from "./notifications.js";
// Kringverwijzing ui ⇄ bulk: alleen op runtime aangeroepen (in goTo), dus live bindings — veilig,
// net als de andere kringen in dit project.
import { bulkSelectie, toggleBulkMode } from "./bulk.js";

let _pagina = 'ntd';   // laatst geopende pagina, zodat renderAll de kop kan bijwerken

// Wat goTo moet bijtekenen bij het openen van een pagina die renderAll terwijl hij verborgen was
// heeft overgeslagen (zie renderAll in main.js). Via een haak en niet met een import van de
// render-functies: main.js houdt bij wélke pagina's vies zijn, en ui.js hoeft dat niet te weten.
let _bijOpenen = null;
function zetBijOpenen(fn){ _bijOpenen = fn; }

// Scrollpositie van #content per pagina. Alle pagina's delen die ene scroller, dus wie in de
// takenlijst op rij 60 een VvE-code aanklikte en via het terug-pijltje uit het dossier kwam,
// landde bovenaan de lijst en moest zijn plek opnieuw zoeken. goTo onthoudt de stand van de pagina
// die hij verlaat; terugVanDossier (render-vve.js) zet hem terug met herstelScroll.
const _scrollPerPagina = {};

// De kop-pillen vervangen de ondertitel op Nog Te Doen — maar pas zodra ze gevuld zijn.
// Tot de eerste databeurt binnen is blijft de ondertitel staan, anders toont de kop
// tijdens het laden alleen de titel en verder niets.
function syncKop(){
  const [,s] = PAGE_META[_pagina] || ['',''];
  const sub = document.getElementById('page-sub');
  const pillen = document.getElementById('ntd-kop-pillen');
  const opNtd = _pagina === 'ntd';
  const gevuld = !!(pillen && pillen.children.length);
  sub.textContent = opNtd && gevuld ? '' : s;
  sub.hidden = opNtd && gevuld;
  if (pillen) pillen.hidden = !opNtd;
}

function goTo(page){
  // Een open logregel-bewerking hoort bij het scherm waar die begon; bij een ÉCHTE
  // paginawissel sluiten we 'm, anders kan een verouderd formulier later opslaan.
  // Nogmaals klikken op de huidige pagina telt niet — dat mag geen getypte tekst wissen.
  const _huidige=document.querySelector('.page.active')?.id;
  const _content=document.getElementById('content');
  if(_huidige && _content) _scrollPerPagina[_huidige]=_content.scrollTop;
  if(_huidige!=='page-'+page && state.logEdit!=null){ state.logEdit=null; state.logEditTs=null; state.logEditSoort=null; }
  // Een VERGETEN lege selecteerstand legt het hele dashboard stil: de 8s-ronde slaat over zolang
  // `bulkMode` aanstaat, en de meldingen liften op diezelfde ronde mee. Buiten de takenlijst is er
  // niet eens een teller meer die eraan herinnert (die staat in page-ntd). Weg van 'ntd' en niets
  // geselecteerd → stand uit.
  // Een GEVULDE selectie laten we staan: die heeft de gebruiker bewust gemaakt, en hij mag een
  // VvE-dossier openen om iets op te zoeken zonder zijn werk kwijt te raken. De balk zegt dan
  // eerlijk dat het verversen stilstaat (syncSelecteerStand).
  if(_huidige!=='page-'+page && page!=='ntd' && state.bulkMode && bulkSelectie().length===0){
    toggleBulkMode();
  }
  document.querySelectorAll('.ni[data-page]').forEach(el=>{
    const actief=el.dataset.page===page;
    el.classList.toggle('on',actief);
    el.setAttribute('aria-current',actief?'page':'false');
  });
  document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+page));
  const[t]=PAGE_META[page]||['',''];   // ondertitel haalt syncKop zelf op
  document.getElementById('page-title').textContent=t;
  _pagina = page;
  syncKop();
  document.getElementById('btn-add').style.display=page==='ntd'?'inline-flex':'none';
  if(_bijOpenen) _bijOpenen(page);   // af / alvo / alfa: bijtekenen als renderAll ze oversloeg
  if(page==='ontw') renderOntw();
  if(page==='logboek') renderLogboek();
  if(page==='herhaal') renderHerhaal();
  if(page==='vve') renderVve();
  closeSb();
  if(page==='analytics') buildAnalytics();
  if(page==='dash') buildDash();
}
function herstelScroll(page){
  const c=document.getElementById('content');
  if(c) c.scrollTop=_scrollPerPagina['page-'+page]||0;
}

// Na het bladeren de tabelkaart in beeld halen als zijn bovenkant boven het zichtbare deel van
// #content is verdwenen. De bladerknoppen staan ONDER de tabel: klikte je op pagina 3 terwijl je
// helemaal onderaan stond, dan bleef je daar staan en zag je van de nieuwe pagina alleen de staart.
// Staat de kaart al (deels) in beeld met zijn kop, dan blijft alles waar het is.
function kaartInBeeld(el){
  const kaart=el && el.closest('.card');
  const c=document.getElementById('content');
  if(!kaart || !c) return;
  const boven=kaart.getBoundingClientRect().top - c.getBoundingClientRect().top;
  if(boven<0) c.scrollTop=Math.max(0, c.scrollTop+boven-8);
}

function closeSb(){document.getElementById('sb').classList.remove('open');document.getElementById('overlay').classList.remove('on');document.getElementById('hamburger')?.setAttribute('aria-expanded','false')}

// ══════════════════════════════════════
//  THEME
// ══════════════════════════════════════
function applyTheme(t){
  document.documentElement.dataset.theme=t;
  localStorage.setItem('theme',t);
  document.getElementById('ico-sun').style.display=t==='dark'?'none':'';
  document.getElementById('ico-moon').style.display=t==='dark'?'':'none';
  document.getElementById('theme-btn')?.setAttribute('aria-pressed',t==='dark');
  Object.values(state.charts).forEach(c=>{try{c.destroy()}catch(e){}});
  state.charts={};
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

function setupSearch(id,cb){
  const el=document.getElementById(id);if(!el)return;
  let t;el.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(cb,200)});
  // Escape in een zoekveld maakt het leeg — de gewoonte uit elk ander zoekvak. Alleen als er iets
  // in staat: een leeg veld laat de toets door naar de centrale Escape (main.js), die dan bijv. de
  // zijbalk sluit. Meteen opnieuw tekenen, zonder de 200 ms wachttijd van het typen.
  el.addEventListener('keydown',e=>{
    if(e.key!=='Escape' || !el.value) return;
    e.stopPropagation();
    el.value=''; clearTimeout(t); cb();
  });
}

export { goTo, syncKop, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch, herstelScroll, kaartInBeeld, zetBijOpenen };
