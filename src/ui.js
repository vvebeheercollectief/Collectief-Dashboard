// ══════════════════════════════════════
//  UI — navigatie, thema, dichtheid, zoeken
// ══════════════════════════════════════
import { PAGE_META } from "./config.js";
import { state } from "./state.js";
import { showToast } from "./main.js";
import { buildAnalytics, buildDash } from "./render-analytics.js";
import { renderOntw, renderLogboek } from "./render-overig.js";

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
}

export { goTo, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch };
