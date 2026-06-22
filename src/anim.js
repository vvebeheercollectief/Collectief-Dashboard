// ══════════════════════════════════════
//  ANIM — zichtbare rij-overgangen (kleurpuls + fade bij acties)
// ══════════════════════════════════════
import { state } from './state.js';

const motionOk = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

// Pulst een <tr> in actie-kleur (~0,75s), vervaagt hem (~0,4s) en roept dán `klaar()`
// (meestal renderAll). Zonder tr of bij 'verminder beweging': direct klaar().
function animateRowOut(tr, pulsClass, klaar){
  if(!tr || !motionOk()){ klaar(); return; }
  state._animBusy = (state._animBusy||0) + 1; // teller i.p.v. boolean: overlappende animaties tellen apart
  tr.classList.add(pulsClass);
  setTimeout(()=>{
    tr.classList.add('rij-fade-weg');
    setTimeout(()=>{ state._animBusy = Math.max(0,(state._animBusy||0)-1); klaar(); }, 420);
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
  const animeren=motionOk();
  const before=new Map();
  if(animeren) container.querySelectorAll('tr[data-flip]').forEach(el=>before.set(el.getAttribute('data-flip'),el.getBoundingClientRect().top));
  doRender();
  if(!animeren) return;
  // Lees en schrijf in gescheiden passes zodat er constant ÉÉN gedwongen reflow is i.p.v. één per rij.
  // 1) MEET: alle nieuwe posities in één leespas (geen writes ertussen).
  const beweeg=[];
  container.querySelectorAll('tr[data-flip]').forEach(el=>{
    const oud=before.get(el.getAttribute('data-flip'));
    if(oud==null) return;
    const dy=oud-el.getBoundingClientRect().top;
    if(dy) beweeg.push({el,dy});
  });
  if(!beweeg.length) return;
  // 2) SCHRIJF-START: zet alle rijen op hun oude positie (puur writes, geen reads).
  beweeg.forEach(({el,dy})=>{ el.style.transform=`translateY(${dy}px)`; el.style.transition='none'; });
  // 3) FORCEER ÉÉN reflow voor alle rijen tegelijk (niet per rij).
  container.getBoundingClientRect();
  // 4) SCHRIJF-EIND: animeer terug naar de natuurlijke positie.
  beweeg.forEach(({el})=>{
    el.style.transition='transform .35s ease'; el.style.transform='';
    // niet {once:true}: een gebubbelde kind-transitie zou de listener te vroeg verbruiken
    const opruimen=()=>{el.style.transition='';el.removeEventListener('transitionend',h);};
    const h=e=>{if(e.target===el)opruimen();};
    el.addEventListener('transitionend',h);
    setTimeout(opruimen,500); // vangnet (throttled tab)
  });
  // Pauzeer de 8s-poll zolang de zweef-animatie loopt, anders knipt een re-render hem af.
  state._animBusy=(state._animBusy||0)+1;
  setTimeout(()=>{ state._animBusy=Math.max(0,(state._animBusy||0)-1); }, 500);
}

export { animateRowOut, flashRow, flipOfferteRijen };
