// ══════════════════════════════════════
//  COMMANDOCENTRUM — Ctrl+K: zoek door alles + acties (Fase 5)
// ══════════════════════════════════════
// `taakTitel` en niet een eigen veldenketen: een offerte-traject heeft geen van die
// velden (zijn omschrijving staat in `opmerkingen`), dus zulke treffers kwamen met een
// LEGE vetgedrukte regel in de lijst — terwijl zoekAlles ze wél vindt.
import { esc, displayName, berekenPrioriteit, teLaatVoorTelling, offerteAangevraagd, parseDt, taakTitel } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { goTo } from "./ui.js";
import { openModal, zetOmschrijving } from "./crud.js";
import { openVvePagina, vveOverzicht } from "./render-vve.js";
import { logZin } from "./render-overig.js";
import { toggleBulkMode } from "./bulk.js";
import { ico } from "./icons.js";

const PAL_MAX = { vves:3, taken:5, afgerond:3, logboek:3 };

// Pure zoekfunctie (testbaar): doorzoekt VvE's, open taken, afgerond en logboek.
function zoekAlles(q, data, max){
  max = max || PAL_MAX;
  const z=(q||'').trim().toLowerCase();
  const res={vves:[],taken:[],afgerond:[],logboek:[]};
  if(!z) return res;
  const hit=(...velden)=>velden.some(v=>String(v||'').toLowerCase().includes(z));
  res.vves=(data.alvo||[]).filter(r=>hit(r.code,r.naam)).slice(0,max.vves);
  // Eerst alle taak-treffers over álle secties verzamelen, dán cappen op relevantie. Anders vult
  // de cap zich met OPPAKKEN/VERGADER (eerste secties) en komen sterk-matchende LOD/offerte-taken
  // er nooit bij. Relevantie: exacte code-match eerst, daarna op urgentie (te laat = meest negatief).
  const alleTaken=[];
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.subsidie,r.opmerkingen)) alleTaken.push(r);
  }));
  const _dt=r=>{const p=berekenPrioriteit(r.deadline,r._sec).dagenTot; return p==null?Infinity:p;};
  alleTaken.sort((a,b)=>{
    const ax=(a.code||'').toLowerCase()===z?0:1, bx=(b.code||'').toLowerCase()===z?0:1;
    if(ax!==bx) return ax-bx;
    return _dt(a)-_dt(b);
  });
  res.taken=alleTaken.slice(0,max.taken);
  // Zelfde behandeling als de open taken hierboven, en om dezelfde reden: eerst álles verzamelen,
  // dán cappen. Hier stond de cap nog IN de lus, dus hij vulde zich met OPPAKKEN (de eerste sectie)
  // en een sterk matchende afgeronde LOD- of offerte-taak kwam er nooit bij.
  // Ook het veldenlijstje liep uit de pas met dat van de open taken: 'status' ontbrak en
  // 'opmerkingen' (kolom G) stond er niet bij — alleen 'opmerking' (kolom J, de toelichting bij het
  // afronden). Dezelfde zoekterm gaf zo een treffer bij een open taak en geen bij dezelfde taak
  // nadat hij was afgerond. Beide velden tellen nu mee.
  const alleAf=[];
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{
    if(hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.subsidie,r.opmerkingen,r.opmerking)) alleAf.push(r);
  }));
  alleAf.sort((a,b)=>{
    const ax=(a.code||'').toLowerCase()===z?0:1, bx=(b.code||'').toLowerCase()===z?0:1;
    if(ax!==bx) return ax-bx;
    return (parseDt(b.datum)||0)-(parseDt(a.datum)||0);   // daarna: laatst afgerond bovenaan
  });
  res.afgerond=alleAf.slice(0,max.afgerond);
  res.logboek=(data.logboek||[])
    // Alleen regels MÉT VvE-code: klikken op een treffer opent het dossier van die code, en een
    // logregel zonder code (de ALV-reset schrijft er zo een) leidde naar een leeg dossier.
    .filter(e=>String(e.code||'').trim())
    .filter(e=>hit(e.code,e.actie,e.veld,e.oudeWaarde,e.nieuweWaarde,displayName(e.gebruiker)))
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
    .slice(0,max.logboek);
  return res;
}

// ── UI-laag ──────────────────────────────────────────────────────────
let _palItems=[];   // platte lijst aanklikbare items (over groepsgrenzen heen)
let _palSel=0;      // geselecteerde index (pijltjes)

function openPalette(){
  document.getElementById('pal-bg').classList.add('open');
  const inp=document.getElementById('pal-input');
  inp.value='';
  _palSel=0;
  renderPal('');
  setTimeout(()=>inp.focus(),30);
}
function closePalette(){ document.getElementById('pal-bg').classList.remove('open'); }
function palOpen(){ return document.getElementById('pal-bg').classList.contains('open'); }

function _item(html,doe){ const idx=_palItems.length; _palItems.push({doe});
  return `<div class="pal-res${idx===_palSel?' actief':''}" role="option" id="pal-opt-${idx}" aria-selected="${idx===_palSel}" data-action="pal-kies" data-idx="${idx}">${html}</div>`; }
function _groep(kop,inhoud){ return inhoud?`<div class="pal-groep"><div class="pal-groep-kop">${kop}</div>${inhoud}</div>`:''; }

function renderPal(q){
  _palItems=[]; if(_palSel<0)_palSel=0;
  const bd=document.getElementById('pal-bd');
  let html='';
  if(!q.trim()){
    // lege staat: laatst bezochte VvE's + snelkoppelingen
    let recent=[];
    try{ recent=JSON.parse(localStorage.getItem('recentVves')||'[]'); }catch(e){}
    const rHtml=recent.map(code=>{
      const v=(D.alvo||[]).find(r=>r.code===code);
      return _item(`<span class="pal-ico pal-ico-vve">${esc(code)}</span><div class="pal-tekst"><b>${esc(v?.naam||code)}</b><span>laatst bezocht</span></div>`,
        ()=>{ closePalette(); openVvePagina(code); });
    }).join('');
    html+=_groep("Laatst bezochte VvE's",rHtml);
    const acties=[
      [ico('plus'),'Nieuwe taak aanmaken',()=>{ closePalette(); goTo('ntd'); openModal(false); }],
      [ico('grafiek'),'Ga naar statistieken',()=>{ closePalette(); goTo('analytics'); }],
      [ico('herhaal'),'Ga naar herhaalregels',()=>{ closePalette(); goTo('herhaal'); }],
      [ico('notitieboek'),'Ga naar logboek',()=>{ closePalette(); goTo('logboek'); }],
    ];
    html+=_groep('Acties',acties.map(([icoSvg,lbl,doe])=>
      _item(`<span class="pal-ico pal-ico-act">${icoSvg}</span><div class="pal-tekst"><b>${esc(lbl)}</b></div>`,doe)).join(''));
  }else{
    const res=zoekAlles(q,D);
    html+=_groep("VvE's",res.vves.map(v=>{
      const ov=vveOverzicht(v.code,D);
      return _item(`<span class="pal-ico pal-ico-vve">${esc(v.code)}</span><div class="pal-tekst"><b>${esc(v.naam||v.code)}</b><span>${ov.cijfers.open} open · ${ov.cijfers.teLaat} te laat${ov.cijfers.laatsteDagen!=null?` · laatste activiteit ${ov.cijfers.laatsteDagen} d`:''}</span></div><span class="pal-hint">Enter → dossier</span>`,
        ()=>{ closePalette(); openVvePagina(v.code); });
    }).join(''));
    html+=_groep('Open taken',res.taken.map(r=>{
      const p=berekenPrioriteit(r.deadline,r._sec);
      const laat=teLaatVoorTelling(r,r._sec);
      const opv=r._sec==='OFFERTE-TRAJECTEN' && offerteAangevraagd(r) && p.teLaat;
      const pill=laat?`<span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`
               : opv ?`<span class="pill-opvolg">Opvolgen (${Math.abs(p.dagenTot)}d)</span>`
               : esc(r.deadline||'');
      return _item(`<span class="pal-ico pal-ico-taak">${ico('cirkelOpen')}</span><div class="pal-tekst"><b>${esc(taakTitel(r, r._sec))}</b><span>${esc(r.code)} ${esc(r.naam||'')} · ${esc(SECS[r._sec].label)} · ${esc(r.behandelaar||'—')}</span></div><span class="pal-hint">${pill}</span>`,
        ()=>{ closePalette(); openModal(true,r); });
    }).join(''));
    html+=_groep('Afgerond',res.afgerond.map(r=>
      _item(`<span class="pal-ico pal-ico-af">${ico('vink')}</span><div class="pal-tekst"><b>${esc(taakTitel(r, r._sec))}</b><span>${esc(r.code)} · afgerond ${esc(r.datum||'')}</span></div>`,
        ()=>{ closePalette(); openVvePagina(r.code); })).join(''));
    html+=_groep('Logboek',res.logboek.map(e=>
      _item(`<span class="pal-ico pal-ico-log">${ico('potlood')}</span><div class="pal-tekst"><b class="pal-logzin">${logZin(e)}</b></div>`,
        ()=>{ closePalette(); openVvePagina(e.code); })).join(''));
    html+=_groep('Acties',
      _item(`<span class="pal-ico pal-ico-act">${ico('plus')}</span><div class="pal-tekst"><b>Nieuwe taak aanmaken met "${esc(q)}"</b></div><span class="pal-hint">opent invulscherm</span>`,
        ()=>{ closePalette(); goTo('ntd'); openModal(false);
              // Naar het veld van de sectie waar de gebruiker staat, niet vast naar 'm-actie'.
              // Dat laatste is het veld van Oppakken; op elk ander tabblad is het verborgen en
              // gooide submitTask de zojuist getypte tekst weg (die leest alleen state.editSec).
              zetOmschrijving(state.editSec || state.activeNtd, q); }));
  }
  bd.innerHTML=html||'<div class="pal-leeg">Geen resultaten</div>';
  if(_palSel>=_palItems.length) _palSel=Math.max(0,_palItems.length-1);
  // aria-activedescendant meteen synchroniseren (niet pas bij de eerste pijltoets), en wissen bij
  // een lege lijst — anders kondigt de schermlezer niets aan of wijst hij naar een verdwenen optie.
  const inp=document.getElementById('pal-input');
  if(inp){ if(_palItems.length) inp.setAttribute('aria-activedescendant','pal-opt-'+_palSel); else inp.removeAttribute('aria-activedescendant'); }
}

function palKies(idx){ const it=_palItems[idx]; if(it) it.doe(); }

function palToets(e){
  if(e.key==='ArrowDown'){ e.preventDefault(); _palSel=Math.min(_palSel+1,_palItems.length-1); _palMarkeer(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); _palSel=Math.max(_palSel-1,0); _palMarkeer(); }
  else if(e.key==='Enter'){ e.preventDefault(); palKies(_palSel); }
}
function _palMarkeer(){
  document.querySelectorAll('#pal-bd .pal-res').forEach((el,i)=>{
    el.classList.toggle('actief',i===_palSel);
    el.setAttribute('aria-selected',i===_palSel);
    if(i===_palSel){ el.scrollIntoView({block:'nearest'}); document.getElementById('pal-input')?.setAttribute('aria-activedescendant','pal-opt-'+i); }
  });
}
function initPalette(){
  const inp=document.getElementById('pal-input');
  inp.addEventListener('input',()=>{ _palSel=0; renderPal(inp.value); });
  inp.addEventListener('keydown',palToets);
  document.getElementById('pal-bg').addEventListener('mousedown',e=>{ if(e.target.id==='pal-bg') closePalette(); });
  document.getElementById('zoek-btn').onclick=openPalette;
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); palOpen()?closePalette():openPalette(); }
    // Een merkje op het event als seintje aan de Escape-handler in main.js: 'deze toets is hier al
    // afgehandeld'. Beide luisteraars hangen aan document en het palet is óók een .modal-bg,
    // maar het staat in de HTML ná het bewerkscherm — zonder seintje sloot main.js daarnaast
    // ook nog het scherm eronder. Samen met de palOpen()-controle daar klopt het in beide
    // volgordes, zodat het niet afhangt van wie zich het eerst heeft aangemeld. Bewust een eigen
    // merkje en niet preventDefault(): dat werkt alleen op een cancelable event, en daarmee zou
    // het seintje afhangen van hoe de toets is opgewekt.
    else if(e.key==='Escape'&&palOpen()){ closePalette(); e._paletSlootZichzelf=true; }
    else if(e.key==='Escape'&&state.bulkMode){
      // F3: geen bulk-toggle als er een modal open staat (snooze, edit, etc.)
      if(document.querySelector('.modal-bg.open')) return;
      toggleBulkMode();
    }
  });
}

export { zoekAlles, PAL_MAX, openPalette, closePalette, palKies, initPalette, palOpen };
