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

// Wired een input + suggestielijst op D.alvo.
//   minTekens : pas tonen vanaf N tekens (0 = volledige lijst al bij focus)
//   maxItems  : afkappen op N (null = alles; lijst scrolt via .vve-suggestions)
//   onSelect  : ({code,naam}) => …
function initVveZoekveld({input, lijstEl, minTekens=0, maxItems=null, onSelect}){
  const toon=()=>{
    const q=input.value.trim();
    if(q.length<minTekens){ lijstEl.style.display='none'; return; }
    let m=filterVves(q, D.alvo).slice()
      .sort((a,b)=>String(a.code).localeCompare(String(b.code)));
    if(maxItems) m=m.slice(0,maxItems);
    if(!m.length){ lijstEl.style.display='none'; return; }
    lijstEl.innerHTML=sugItemsHtml(m);
    lijstEl.style.display='block';
    lijstEl.querySelectorAll('.vve-sug-item').forEach(el=>{
      el.onclick=()=>{ lijstEl.style.display='none'; onSelect({code:el.dataset.code, naam:el.dataset.naam}); };
    });
  };
  input.addEventListener('input', toon);
  input.addEventListener('focus', toon);
  input.addEventListener('keydown', e=>{ if(e.key==='Escape') lijstEl.style.display='none'; });
  input.addEventListener('blur', ()=>setTimeout(()=>{ lijstEl.style.display='none'; }, 200));
}

export { filterVves, sugItemsHtml, initVveZoekveld };
