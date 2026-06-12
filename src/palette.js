// ══════════════════════════════════════
//  COMMANDOCENTRUM — Ctrl+K: zoek door alles + acties (Fase 5)
// ══════════════════════════════════════
import { esc, displayName, berekenPrioriteit } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { goTo } from "./ui.js";
import { openModal } from "./crud.js";
import { openVvePagina, vveOverzicht } from "./render-vve.js";
import { logZin } from "./render-overig.js";
import { toggleBulkMode } from "./bulk.js";

const PAL_MAX = { vves:3, taken:5, afgerond:3, logboek:3 };

// Pure zoekfunctie (testbaar): doorzoekt VvE's, open taken, afgerond en logboek.
function zoekAlles(q, data, max){
  max = max || PAL_MAX;
  const z=(q||'').trim().toLowerCase();
  const res={vves:[],taken:[],afgerond:[],logboek:[]};
  if(!z) return res;
  const hit=(...velden)=>velden.some(v=>String(v||'').toLowerCase().includes(z));
  res.vves=(data.alvo||[]).filter(r=>hit(r.code,r.naam)).slice(0,max.vves);
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(res.taken.length<max.taken && hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.opmerkingen)) res.taken.push(r);
  }));
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{
    if(res.afgerond.length<max.afgerond && hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.opmerking)) res.afgerond.push(r);
  }));
  res.logboek=(data.logboek||[])
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
  return `<div class="pal-res${idx===_palSel?' actief':''}" data-action="pal-kies" data-idx="${idx}">${html}</div>`; }
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
      ['＋','Nieuwe taak aanmaken',()=>{ closePalette(); goTo('ntd'); openModal(false); }],
      ['📊','Ga naar statistieken',()=>{ closePalette(); goTo('analytics'); }],
      ['🔁','Ga naar herhaalregels',()=>{ closePalette(); goTo('herhaal'); }],
      ['📒','Ga naar logboek',()=>{ closePalette(); goTo('logboek'); }],
    ];
    html+=_groep('Acties',acties.map(([ico,lbl,doe])=>
      _item(`<span class="pal-ico pal-ico-act">${ico}</span><div class="pal-tekst"><b>${esc(lbl)}</b></div>`,doe)).join(''));
  }else{
    const res=zoekAlles(q,D);
    html+=_groep("VvE's",res.vves.map(v=>{
      const ov=vveOverzicht(v.code,D);
      return _item(`<span class="pal-ico pal-ico-vve">${esc(v.code)}</span><div class="pal-tekst"><b>${esc(v.naam||v.code)}</b><span>${ov.cijfers.open} open · ${ov.cijfers.teLaat} te laat${ov.cijfers.laatsteDagen!=null?` · laatste activiteit ${ov.cijfers.laatsteDagen} d`:''}</span></div><span class="pal-hint">Enter → dossier</span>`,
        ()=>{ closePalette(); openVvePagina(v.code); });
    }).join(''));
    html+=_groep('Open taken',res.taken.map(r=>{
      const p=berekenPrioriteit(r.deadline,r._sec);
      const pill=p.teLaat?`<span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:esc(r.deadline||'');
      return _item(`<span class="pal-ico pal-ico-taak">○</span><div class="pal-tekst"><b>${esc(r.actiepunt||r.periode||r.agendapunten||r.status||'')}</b><span>${esc(r.code)} ${esc(r.naam||'')} · ${esc(SECS[r._sec].label)} · ${esc(r.behandelaar||'—')}</span></div><span class="pal-hint">${pill}</span>`,
        ()=>{ closePalette(); openModal(true,r); });
    }).join(''));
    html+=_groep('Afgerond',res.afgerond.map(r=>
      _item(`<span class="pal-ico pal-ico-af">✓</span><div class="pal-tekst"><b>${esc(r.actiepunt||r.periode||r.agendapunten||'')}</b><span>${esc(r.code)} · afgerond ${esc(r.datum||'')}</span></div>`,
        ()=>{ closePalette(); openVvePagina(r.code); })).join(''));
    html+=_groep('Logboek',res.logboek.map(e=>
      _item(`<span class="pal-ico pal-ico-log">✎</span><div class="pal-tekst"><b class="pal-logzin">${logZin(e)}</b></div>`,
        ()=>{ closePalette(); openVvePagina(e.code); })).join(''));
    html+=_groep('Acties',
      _item(`<span class="pal-ico pal-ico-act">＋</span><div class="pal-tekst"><b>Nieuwe taak aanmaken met "${esc(q)}"</b></div><span class="pal-hint">opent invulscherm</span>`,
        ()=>{ closePalette(); goTo('ntd'); openModal(false);
              const f=document.getElementById('m-actie'); if(f) f.value=q; }));
  }
  bd.innerHTML=html||'<div class="pal-leeg">Geen resultaten</div>';
  if(_palSel>=_palItems.length) _palSel=Math.max(0,_palItems.length-1);
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
    if(i===_palSel) el.scrollIntoView({block:'nearest'});
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
    else if(e.key==='Escape'&&palOpen()){ closePalette(); }
    else if(e.key==='Escape'&&state.bulkMode){
      // F3: geen bulk-toggle als er een modal open staat (off-actie, snooze, edit, etc.)
      if(document.querySelector('.modal-bg.open')) return;
      toggleBulkMode();
    }
  });
}

export { zoekAlles, PAL_MAX, openPalette, closePalette, palKies, initPalette, palOpen };
