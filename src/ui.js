// ══════════════════════════════════════
//  UI — meldingen, ongedaan maken, ja/nee-vraag, status en navigatie
// ══════════════════════════════════════
import { state } from './state.js';
import { esc } from './util.js';

// ── Meldingen (rechtsboven) ─────────────────────────────────────────────
// Een fout blijft staan tot hij weggeklikt wordt: wie even wegkeek, moet nog kunnen zien dat een
// wijziging niet opgeslagen is. Andere meldingen verdwijnen na vijf seconden.
const TOAST_MS = 5000;
const _getoond = new Map();   // dezelfde melding niet twee keer tegelijk
export function toast(titel, tekst='', soort='info', opts={}){
  const sleutel=titel+'|'+tekst;
  if(_getoond.has(sleutel) && !opts.geenDedup) return;
  const host=document.getElementById('toasts'); if(!host) return;
  const el=document.createElement('div');
  el.className='toast toast-'+soort;
  el.setAttribute('role', soort==='fout' ? 'alert' : 'status');
  el.innerHTML=`<div class="toast-tekst"><strong>${esc(titel)}</strong>${tekst?`<span>${esc(tekst)}</span>`:''}</div>`
    +`<button type="button" class="toast-x" aria-label="Melding sluiten">×</button>`;
  const weg=()=>{ el.remove(); _getoond.delete(sleutel); };
  el.querySelector('.toast-x').onclick=weg;
  host.appendChild(el);
  _getoond.set(sleutel, el);
  if(!(opts.blijft || soort==='fout')) setTimeout(weg, TOAST_MS);
}
export const meldFout = (tekst, titel='Niet gelukt') => toast(titel, tekst, 'fout');

// ── Ongedaan maken (donkere balk rechtsonder) ───────────────────────────
// Eén tegelijk: een nieuwe afvinkactie vervangt de vorige balk (die actie blijft gewoon staan).
const UNDO_MS = 8000;
let _undo = null;
export function ongedaanBalk(tekst, opUndo){
  sluitOngedaan();
  const el=document.getElementById('snack'); if(!el) return;
  el.querySelector('.snack-tekst').textContent=tekst;
  const knop=el.querySelector('.snack-knop');
  knop.disabled=false; knop.textContent='Ongedaan maken';
  el.hidden=false;
  let rest=UNDO_MS, start=Date.now(), tid=null;
  const loop=()=>{ start=Date.now(); tid=setTimeout(sluitOngedaan, rest); };
  const pauze=()=>{ if(tid){ clearTimeout(tid); tid=null; rest=Math.max(1000, rest-(Date.now()-start)); } };
  el.onmouseenter=pauze; el.onfocusin=pauze;
  el.onmouseleave=()=>{ if(!tid) loop(); };
  knop.onclick=async()=>{
    knop.disabled=true; knop.textContent='Bezig…';
    pauze();
    try{ await opUndo(); } finally { sluitOngedaan(); }
  };
  _undo={ el, stop:()=>{ if(tid) clearTimeout(tid); } };
  loop();
}
export function sluitOngedaan(){
  if(_undo){ _undo.stop(); _undo=null; }
  const el=document.getElementById('snack'); if(el) el.hidden=true;
}

// ── Effecten bij afhandelen ─────────────────────────────────────────────
// Alleen beeld: de gegevens zijn al gewijzigd en het opslaan loopt al. De afgehandelde rij blijft
// als 'geest' nog even staan (groen, daarna dichtklappen) en raakt niets meer: geen data-attributen,
// inert, en zetRijen() tekent de lijst om hem heen zodat een tussentijdse hertekening hem niet
// afkapt. Wie 'minder beweging' heeft ingesteld, ziet alleen de groene kleur (styles.css).
const GROEN_MS = 380, DICHT_MS = 300;
export function laatVertrekken(rij){
  if(!rij || rij.classList.contains('rij-weg')) return;
  const vak=rij.querySelector('.vink input'); if(vak) vak.checked=true;
  [rij, ...rij.querySelectorAll('*')].forEach(el=>{ for(const k of Object.keys(el.dataset)) delete el.dataset[k]; });
  rij.setAttribute('aria-hidden','true');
  rij.inert=true;
  rij.classList.add('rij-weg');
  setTimeout(()=>{
    if(!rij.isConnected) return;
    rij.style.height=rij.offsetHeight+'px';
    void rij.offsetHeight;                 // beginhoogte vastleggen vóór het dichtklappen
    rij.classList.add('rij-dicht');
    rij.style.height='0px';
    setTimeout(()=>rij.remove(), DICHT_MS);
  }, GROEN_MS);
}
// Vervangt de rijen in een lijst, maar laat vertrekkende rijen op hun plek staan.
export function zetRijen(host, html){
  const geesten=[...host.children].filter(el=>el.classList.contains('rij-weg'));
  if(!geesten.length){ host.innerHTML=html; return; }
  const ervoor=geesten.map(g=>{ let n=0; for(let el=g.previousElementSibling; el; el=el.previousElementSibling) if(!el.classList.contains('rij-weg')) n++; return n; });
  [...host.childNodes].forEach(n=>{ if(!geesten.includes(n)) n.remove(); });
  const mal=document.createElement('template'); mal.innerHTML=html;
  const nieuw=[...mal.content.children];
  let i=0;
  geesten.forEach((g,k)=>{ while(i<nieuw.length && i<ervoor[k]) host.insertBefore(nieuw[i++], g); });
  while(i<nieuw.length) host.appendChild(nieuw[i++]);
}
// Een klasse die een korte animatie start, opnieuw afspelen (ook als hij er al op stond).
export function speel(el, klas){
  if(!el) return;
  el.classList.remove(klas); void el.offsetWidth; el.classList.add(klas);
}
export const LEEG_KLAAR = tekst => `<p class="leeg leeg-klaar"><span class="klaar-vink" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12L10 17L19 8"/></svg></span>${esc(tekst)}</p>`;

// ── Ja/nee-vraag ────────────────────────────────────────────────────────
// Promise-gebaseerd. Escape, het kruisje en de achtergrond betekenen 'nee'. Een tweede vraag terwijl
// er één openstaat krijgt meteen 'nee' (dubbelklik-rem).
let _openVraag=null;
export function vraagBevestiging({ titel, tekst, bevestigTekst='Doorgaan', gevaarlijk=false }){
  if(_openVraag) return Promise.resolve(false);
  const bg=document.getElementById('bevestig-bg');
  document.getElementById('bevestig-titel').textContent=titel;
  document.getElementById('bevestig-tekst').textContent=tekst;
  const ja=document.getElementById('bevestig-ja');
  ja.textContent=bevestigTekst;
  ja.classList.toggle('knop-gevaar', !!gevaarlijk);
  bg.classList.add('open');
  const terug=document.activeElement;
  setTimeout(()=>document.getElementById('bevestig-nee').focus(), 0);
  return new Promise(res=>{ _openVraag={ res, terug }; });
}
export function beantwoordBevestiging(ja){
  const v=_openVraag; if(!v) return;
  _openVraag=null;
  document.getElementById('bevestig-bg')?.classList.remove('open');
  try{ v.terug?.focus?.(); }catch(_){}
  v.res(!!ja);
}

// ── Status (zijbalk onderaan) ───────────────────────────────────────────
const STATUS = {
  laden:   ['', 'Laden…'],
  opslaan: ['', 'Opslaan…'],
  fout:    ['fout', 'Niet bijgewerkt'],
  offline: ['fout', 'Offline'],
  pauze:   ['pauze', 'Gepauzeerd'],
};
export function zetStatus(soort){
  const stip=document.getElementById('sync-stip'), lbl=document.getElementById('sync-lbl');
  if(!stip || !lbl) return;
  if(soort==='ok'){
    state._laatsteSyncMs=Date.now();
    stip.className='zb-stip';
    lbl.textContent='Bijgewerkt '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
    lbl.title='';
    return;
  }
  const [klas, tekst]=STATUS[soort]||STATUS.fout;
  stip.className='zb-stip '+(soort==='laden'||soort==='opslaan' ? 'bezig' : klas);
  lbl.textContent=tekst;
  lbl.title = soort==='pauze' ? 'Bijwerken staat stil tot je weer in het dashboard klikt (je Google-sessie wordt dan vernieuwd).' : '';
}

// Eén balk bovenin voor 'laden mislukt' en 'offline', met een knop om het opnieuw te proberen.
export function toonBanner(tekst, knopTekst, opKlik){
  let b=document.getElementById('banner');
  if(!b){ b=document.createElement('div'); b.id='banner'; b.className='banner'; b.setAttribute('role','alert'); document.body.appendChild(b); }
  b.innerHTML=`<span>${esc(tekst)}</span>${knopTekst?`<button type="button" class="knop">${esc(knopTekst)}</button>`:''}`;
  if(knopTekst) b.querySelector('button').onclick=()=>{ verbergBanner(); opKlik&&opKlik(); };
}
export function verbergBanner(){ document.getElementById('banner')?.remove(); }

// ── Navigatie ───────────────────────────────────────────────────────────
export const PAGINAS = ['taken','lod','subsidie','alvo','alfa'];
const _bijOpenen = [];
export const bijOpenen = fn => _bijOpenen.push(fn);
export function goTo(pagina){
  if(!PAGINAS.includes(pagina)) pagina='taken';
  state.pagina=pagina;
  document.querySelectorAll('.nav-knop[data-pagina]').forEach(a=>{
    const aan=a.dataset.pagina===pagina;
    a.classList.toggle('actief', aan);
    if(aan) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.pagina').forEach(p=>{ p.hidden = p.id!=='pagina-'+pagina; });
  try{ history.replaceState(null,'','#'+pagina); }catch(_){}
  _bijOpenen.forEach(fn=>fn(pagina));
}
