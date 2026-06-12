// ══════════════════════════════════════
//  ANIM — zichtbare rij-overgangen (kleurpuls + fade bij acties)
// ══════════════════════════════════════
import { state } from './state.js';

const motionOk = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

// Pulst een <tr> in actie-kleur (~0,75s), vervaagt hem (~0,4s) en roept dán `klaar()`
// (meestal renderAll). Zonder tr of bij 'verminder beweging': direct klaar().
function animateRowOut(tr, pulsClass, klaar){
  if(!tr || !motionOk()){ klaar(); return; }
  state._animBusy = true;
  tr.classList.add(pulsClass);
  setTimeout(()=>{
    tr.classList.add('rij-fade-weg');
    setTimeout(()=>{ state._animBusy = false; klaar(); }, 420);
  }, 750);
}

// Korte flits op een rij ná een re-render (bewerkt/toegevoegd/teruggezet).
// Stil bij niet-gevonden (bv. andere sectie actief).
function flashRow(tbodyId, row, cls = 'rij-flits'){
  if(!motionOk()) return;
  const tr = document.querySelector(`#${tbodyId} tr[data-row="${row}"]`);
  if(!tr) return;
  tr.classList.add(cls);
  const opruimen = () => tr.classList.remove(cls);
  tr.addEventListener('animationend', opruimen, { once: true });
  setTimeout(opruimen, 1500);   // vangnet: animationend vuurt niet altijd (throttled tab)
}

// FLIP: laat offerte-rijen zichtbaar naar hun nieuwe plek zweven na her-render.
function flipOfferteRijen(container, doRender){
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const before={};
  if(!reduce) container.querySelectorAll('tr[data-flip]').forEach(el=>before[el.getAttribute('data-flip')]=el.getBoundingClientRect().top);
  doRender();
  if(reduce) return;
  container.querySelectorAll('tr[data-flip]').forEach(el=>{
    const oud=before[el.getAttribute('data-flip')];
    if(oud==null) return;
    const dy=oud-el.getBoundingClientRect().top;
    if(!dy) return;
    el.style.transform=`translateY(${dy}px)`;el.style.transition='none';
    el.getBoundingClientRect();
    el.style.transition='transform .35s ease';el.style.transform='';
  });
}

export { animateRowOut, flashRow, flipOfferteRijen };
