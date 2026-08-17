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
//
// ── Bediening met het toetsenbord ────────────────────────────────────────────
// De suggesties waren kale <div>'s met alleen een onclick: geen tabindex, geen rol, en behalve
// Escape geen enkele toetsafhandeling. Wie geen muis of touch gebruikt kón dus niets kiezen. Voor
// de VvE-kiezers viel dat mee (je kunt de code overtypen), maar voor 'Hoort bij' (Takenbundel) was
// het een doodlopende weg: koppelen loopt uitsluitend via `state._hbDoel`, en dat wordt alléén
// door `onSelect` gezet — dus door een muisklik. Slepen kan zonder muis al niet, en zowel §6.3 van
// het ontwerp als het comment bij STAPEL_GREEP (render-bundel.js) verdedigde dat mét de belofte dat
// dit veld wél zonder muis werkt. Die belofte bestond niet.
//
// Het standaard combobox-patroon: de focus blijft in het INVOERVELD en `aria-activedescendant`
// wijst de actieve suggestie aan. Bewust geen tabindex op de items — dan zouden ze in de tabvolgorde
// (en in de focus-trap van de modal) belanden en zou Tab door een lijst van twaalf taken lopen in
// plaats van naar het volgende veld.
function initVveZoekveld({input, lijstEl, minTekens=0, maxItems=null, onSelect,
                          bron=null, filter=null, itemHtml=null, sorteer=null}){
  const _bron    = bron     || (() => D.alvo);
  const _filter  = filter   || filterVves;
  const _itemHtml= itemHtml || sugItemsHtml;
  const _sorteer = sorteer  || ((a,b)=>String(a.code).localeCompare(String(b.code)));
  // `aria-controls` en `aria-activedescendant` verwijzen op id, dus de lijst moet er een hebben.
  // Alle vier de bestaande aanroepers geven hem er al een mee; deze terugval is er voor de vijfde.
  if(!lijstEl.id) lijstEl.id='vve-sug-'+Math.random().toString(36).slice(2,8);
  lijstEl.setAttribute('role','listbox');
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls', lijstEl.id);
  input.setAttribute('aria-expanded','false');

  let treffers=[], items=[], actief=-1;
  const sluit=()=>{
    lijstEl.style.display='none';
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
    treffers=[]; items=[]; actief=-1;
  };
  // Eén plek waar 'welke suggestie is actief' vastligt: de klasse (zichtbaar), aria-selected (voor
  // de schermlezer) en aria-activedescendant (de koppeling vanuit het veld) moeten hetzelfde
  // zeggen. Zouden ze los gezet worden, dan leest de schermlezer een andere regel voor dan de
  // gebruiker oplicht ziet — precies het soort verschil dat niemand opmerkt die zelf kan kijken.
  const zetActief=(i)=>{
    actief=i;
    items.forEach((el,k)=>{
      const aan = k===i;
      el.classList.toggle('actief', aan);
      el.setAttribute('aria-selected', aan ? 'true' : 'false');
    });
    if(i<0){ input.removeAttribute('aria-activedescendant'); return; }
    input.setAttribute('aria-activedescendant', items[i].id);
    // De lijst is 180px hoog en scrollt (.vve-suggestions), dus de twaalfde treffer staat buiten
    // beeld. `block:'nearest'` scrollt alleen als het nodig is en trekt de pagina er niet bij.
    if(items[i].scrollIntoView) items[i].scrollIntoView({ block:'nearest' });
  };
  const kies=(i)=>{ const t=treffers[i]; sluit(); if(t) onSelect(t); };
  const toon=()=>{
    const q=input.value.trim();
    if(q.length<minTekens){ sluit(); return; }
    let m=_filter(q, _bron()).slice().sort(_sorteer);
    if(maxItems) m=m.slice(0,maxItems);
    if(!m.length){ sluit(); return; }
    lijstEl.innerHTML=_itemHtml(m);
    lijstEl.style.display='block';
    input.setAttribute('aria-expanded','true');
    treffers=m;
    items=[...lijstEl.querySelectorAll('.vve-sug-item')];
    items.forEach((el,i)=>{
      el.id=`${lijstEl.id}-opt-${i}`;
      el.setAttribute('role','option');
      el.setAttribute('aria-selected','false');
      el.onclick=()=>kies(i);
    });
    // Geen voorselectie: Enter zonder pijltjes hoort niets te kiezen. Het veld staat vaak vol met
    // een half getypte term, en dan zou de eerste treffer er ongevraagd in belanden.
    zetActief(-1);
  };
  input.addEventListener('input', toon);
  input.addEventListener('focus', toon);
  input.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ sluit(); return; }
    if(e.key==='ArrowDown' || e.key==='ArrowUp'){
      // Dicht en je drukt op een pijltje: eerst openen. Zo is de lijst ook terug te halen nadat hij
      // met Escape of een blur is weggegaan, zonder opnieuw te hoeven typen.
      if(!items.length) toon();
      const n=items.length;
      if(!n) return;
      e.preventDefault();   // anders springt de cursor naar begin/eind van het invoerveld
      const stap = e.key==='ArrowDown' ? 1 : -1;
      zetActief(actief<0 ? (stap>0 ? 0 : n-1) : (actief+stap+n)%n);
      return;
    }
    if(e.key==='Enter' && actief>=0){
      // Alleen als er echt iets aangewezen is. Anders hoort Enter gewoon het formulier te
      // bedienen zoals overal in dit scherm.
      e.preventDefault();
      kies(actief);
    }
  });
  input.addEventListener('blur', ()=>setTimeout(sluit, 200));
}

export { filterVves, sugItemsHtml, initVveZoekveld };
