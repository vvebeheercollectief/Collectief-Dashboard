// ══════════════════════════════════════
//  VVE-ZOEKVELD — herbruikbare zoek/kies-component (taakmodal + AI-hulp)
// ══════════════════════════════════════
import { D } from './state.js';
import { esc } from './util.js';

// Pure filter: zoekt case-insensitief op code én naam. Lege query → hele lijst.
function filterVves(q, lijst){
  const z=(q||'').trim().toLowerCase();
  const vves=(lijst||[]).filter(r=>r&&r.code);
  if(!z) return vves;
  return vves.filter(r=>String(r.code).toLowerCase().includes(z)||String(r.naam||'').toLowerCase().includes(z));
}

function sugItemsHtml(matches){
  return matches.map(r=>`
    <div class="vve-sug-item" data-code="${esc(r.code)}" data-naam="${esc(r.naam||'')}">
      <div class="vve-sug-code">${esc(r.code)}</div>
      <div class="vve-sug-naam">${esc(r.naam||'')}</div>
    </div>`).join('');
}

// Wired een input + suggestielijst. Standaard op D.alvo (VvE's); met een eigen `bron`, `filter`,
// `itemHtml` en `sorteer` kies je er iets anders mee — 'Hoort bij' (Takenbundel) kiest er een
// TAAK mee. De standaardwaarden houden de bestaande VvE-aanroepers precies zoals ze waren.
//   minTekens : pas tonen vanaf N tekens (0 = volledige lijst al bij focus)
//   maxItems  : afkappen op N (null = alles; lijst scrolt via .vve-suggestions)
//   onSelect  : (item) => …
// `item` is het RAUWE object uit `bron`, niet een kopie van een paar velden. Dat is wat de
// taakkiezer nodig heeft: een koppeling wijst één bepáálde rij aan, en twee taken van dezelfde VvE
// zijn op code en titel niet uit elkaar te houden. De VvE-aanroepers destructureren `{code,naam}`
// en krijgen daarmee dezelfde waarden als voorheen — parseAlvo (data.js) levert beide altijd als
// getrimde tekst, dus ook een VvE zonder naam geeft nog steeds '' en niet undefined.
// Voorwaarde aan een eigen `itemHtml`: precies één .vve-sug-item per treffer, in dezelfde
// volgorde. De klik zoekt zijn object namelijk op positie op.
function initVveZoekveld({input, lijstEl, minTekens=0, maxItems=null, onSelect,
                          bron=null, filter=null, itemHtml=null, sorteer=null}){
  const _bron    = bron     || (() => D.alvo);
  const _filter  = filter   || filterVves;
  const _itemHtml= itemHtml || sugItemsHtml;
  const _sorteer = sorteer  || ((a,b)=>String(a.code).localeCompare(String(b.code)));
  const toon=()=>{
    const q=input.value.trim();
    if(q.length<minTekens){ lijstEl.style.display='none'; return; }
    let m=_filter(q, _bron()).slice().sort(_sorteer);
    if(maxItems) m=m.slice(0,maxItems);
    if(!m.length){ lijstEl.style.display='none'; return; }
    lijstEl.innerHTML=_itemHtml(m);
    lijstEl.style.display='block';
    lijstEl.querySelectorAll('.vve-sug-item').forEach((el,i)=>{
      el.onclick=()=>{ lijstEl.style.display='none'; onSelect(m[i]); };
    });
  };
  input.addEventListener('input', toon);
  input.addEventListener('focus', toon);
  input.addEventListener('keydown', e=>{ if(e.key==='Escape') lijstEl.style.display='none'; });
  input.addEventListener('blur', ()=>setTimeout(()=>{ lijstEl.style.display='none'; }, 200));
}

export { filterVves, sugItemsHtml, initVveZoekveld };
