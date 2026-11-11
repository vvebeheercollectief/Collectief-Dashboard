// ══════════════════════════════════════
//  VVE — aanvullen op code of naam (bron: de VvE's in het ALV-overzicht)
// ══════════════════════════════════════
import { D } from './state.js';
import { esc } from './util.js';

export const vveLijst = () => (D.alvo||[]).map(r=>({ code:r.code, naam:r.naam })).filter(r=>r.code);

export function zoekVves(q, lijst=vveLijst(), max=8){
  const z=(q||'').trim().toLowerCase();
  if(!z) return [];
  return lijst.filter(r=>r.code.toLowerCase().includes(z) || (r.naam||'').toLowerCase().includes(z)).slice(0,max);
}

// Wat er in het veld staat → { code, naam }. Een gekozen suggestie wint; anders een exacte code of
// naam uit de lijst; anders vrije tekst als naam, zonder code.
export function leesVve(input){
  const tekst=(input.value||'').trim();
  if(!tekst) return { code:'', naam:'' };
  if(input.dataset.code && input.dataset.label===tekst) return { code:input.dataset.code, naam:input.dataset.naam||'' };
  const z=tekst.toLowerCase();
  const exact=vveLijst().find(r=>r.code.toLowerCase()===z || (r.naam||'').toLowerCase()===z
                                  || `${r.code} ${r.naam}`.toLowerCase()===z);
  return exact ? { code:exact.code, naam:exact.naam } : { code:'', naam:tekst };
}
export function zetVve(input, code, naam){
  const label=[code, naam].filter(Boolean).join(' ');
  input.value=label;
  input.dataset.code=code||''; input.dataset.naam=naam||''; input.dataset.label=label;
}

// Koppelt een suggestielijst aan een tekstveld. Pijltjes, Enter en Escape werken; een klik ook.
export function koppelVveVeld(input){
  const lijst=document.createElement('div');
  lijst.className='sug'; lijst.hidden=true;
  lijst.id='sug-'+Math.random().toString(36).slice(2,8);
  lijst.setAttribute('role','listbox');
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls', lijst.id);
  input.setAttribute('aria-expanded','false');
  input.parentElement.classList.add('sug-houder');
  input.parentElement.appendChild(lijst);
  let items=[], actief=-1;

  const sluit=()=>{ lijst.hidden=true; actief=-1; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); };
  const kies=i=>{ const r=items[i]; if(!r) return; zetVve(input, r.code, r.naam); sluit(); input.dispatchEvent(new Event('vve-gekozen')); };
  const teken=()=>{
    items=zoekVves(input.value);
    if(!items.length){ sluit(); return; }
    lijst.innerHTML=items.map((r,i)=>`<div class="sug-item${i===actief?' actief':''}" role="option" id="${lijst.id}-${i}" data-i="${i}" aria-selected="${i===actief}"><span class="code">${esc(r.code)}</span><span>${esc(r.naam)}</span></div>`).join('');
    lijst.hidden=false; input.setAttribute('aria-expanded','true');
    if(actief>=0) input.setAttribute('aria-activedescendant', `${lijst.id}-${actief}`); else input.removeAttribute('aria-activedescendant');
  };
  input.addEventListener('input', ()=>{ delete input.dataset.code; actief=-1; teken(); });
  input.addEventListener('keydown', e=>{
    if(lijst.hidden) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); actief=Math.min(items.length-1, actief+1); teken(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); actief=Math.max(0, actief-1); teken(); }
    else if(e.key==='Enter' && actief>=0){ e.preventDefault(); e.stopPropagation(); kies(actief); }
    else if(e.key==='Escape'){ e.stopPropagation(); sluit(); }
  });
  input.addEventListener('blur', ()=>setTimeout(sluit, 150));
  lijst.addEventListener('mousedown', e=>{ const it=e.target.closest('.sug-item'); if(it){ e.preventDefault(); kies(+it.dataset.i); } });
}
