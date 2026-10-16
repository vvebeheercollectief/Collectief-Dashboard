// ══════════════════════════════════════
//  COMMANDOCENTRUM — Ctrl+K: zoek door alles + acties (Fase 5)
// ══════════════════════════════════════
// `taakTitel` en niet een eigen veldenketen: een offerte-traject heeft geen van die
// velden (zijn omschrijving staat in `opmerkingen`), dus zulke treffers kwamen met een
// LEGE vetgedrukte regel in de lijst — terwijl zoekAlles ze wél vindt.
import { esc, displayName, berekenPrioriteit, teLaatVoorTelling, offerteAangevraagd, parseDt, taakTitel } from "./util.js";
import { SECS, SKEYS, PAGE_META } from "./config.js";
import { bouwBundelIndex, isAutoOfferteStap, bundelVerwijzing } from "./bundel.js";
import { state, D } from "./state.js";
import { goTo, applyTheme, cycleDensity } from "./ui.js";
import { openModal, zetOmschrijving } from "./crud.js";
import { openVvePagina, vveOverzicht } from "./render-vve.js";
import { logZin } from "./render-overig.js";
import { toggleBulkMode } from "./bulk.js";
import { ico } from "./icons.js";
// U3: acties, /-opdrachten en een snelle notitie vanuit het palet. Kringverwijzingen (sneltoetsen
// ⇄ palette, main ⇄ palette) worden alleen op runtime aangeroepen — zelfde patroon als ui ⇄ bulk.
import { loadAll, backgroundWrite, blokkeerOffline } from "./data.js";
import { appendRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { showToast, getCurrentWho } from "./notifications.js";
import { renderAll } from "./main.js";
import { rijFocusTaak, rijFocusTr, RIJ_ACTIES, toggleSneltoetsOverzicht } from "./sneltoetsen.js";

// `stappen` staat los van `taken` en niet erin: de automatische offerte-stap staat sinds v12.6
// niet meer in de takenlijst, dus het palet is voor hém de snelle weg terug — en in de gedeelde
// cap van vijf verloor hij het altijd. Hij heeft namelijk per definitie geen deadline, en de
// sortering hieronder zet 'geen deadline' achteraan. Een eigen groep met een eigen cap kan niet
// leeggedrukt worden door gewone taken, en andersom kosten 23 stappen geen enkele takenplek.
const PAL_MAX = { vves:3, taken:5, stappen:5, afgerond:3, logboek:3 };

// Pure zoekfunctie (testbaar): doorzoekt VvE's, open taken, afgerond en logboek.
function zoekAlles(q, data, max){
  max = max || PAL_MAX;
  const z=(q||'').trim().toLowerCase();
  const res={vves:[],taken:[],stappen:[],afgerond:[],logboek:[]};
  if(!z) return res;
  const hit=(...velden)=>velden.some(v=>String(v||'').toLowerCase().includes(z));
  res.vves=(data.alvo||[]).filter(r=>hit(r.code,r.naam)).slice(0,max.vves);
  // Eerst alle taak-treffers over álle secties verzamelen, dán cappen op relevantie. Anders vult
  // de cap zich met OPPAKKEN/VERGADER (eerste secties) en komen sterk-matchende LOD/offerte-taken
  // er nooit bij. Relevantie: exacte code-match eerst, daarna op urgentie (te laat = meest negatief).
  const alleTaken=[], alleStappen=[];
  // De index één keer, niet per rij: `bouwBundelIndex` loopt over vijf secties van twee bladen.
  const _ix=bouwBundelIndex(data.ntd||{}, data.af||{});
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(!hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.subsidie,r.onderwerp,r.afzender,r.opmerkingen)) return;
    (isAutoOfferteStap(r,_ix) ? alleStappen : alleTaken).push(r);
  }));
  const _dt=r=>{const p=berekenPrioriteit(r.deadline,r._sec).dagenTot; return p==null?Infinity:p;};
  alleTaken.sort((a,b)=>{
    const ax=(a.code||'').toLowerCase()===z?0:1, bx=(b.code||'').toLowerCase()===z?0:1;
    if(ax!==bx) return ax-bx;
    return _dt(a)-_dt(b);
  });
  res.taken=alleTaken.slice(0,max.taken);
  // Stappen op VvE-code, met een exacte code-treffer vooraan — op urgentie sorteren heeft hier
  // geen betekenis, want ze dragen geen van alle een deadline.
  alleStappen.sort((a,b)=>{
    const ax=(a.code||'').toLowerCase()===z?0:1, bx=(b.code||'').toLowerCase()===z?0:1;
    if(ax!==bx) return ax-bx;
    return (a.code||'').localeCompare(b.code||'');
  });
  res.stappen=alleStappen.slice(0,max.stappen);
  // Zelfde behandeling als de open taken hierboven, en om dezelfde reden: eerst álles verzamelen,
  // dán cappen. Hier stond de cap nog IN de lus, dus hij vulde zich met OPPAKKEN (de eerste sectie)
  // en een sterk matchende afgeronde LOD- of offerte-taak kwam er nooit bij.
  // Ook het veldenlijstje liep uit de pas met dat van de open taken: 'status' ontbrak en
  // 'opmerkingen' (kolom G) stond er niet bij — alleen 'opmerking' (kolom J, de toelichting bij het
  // afronden). Dezelfde zoekterm gaf zo een treffer bij een open taak en geen bij dezelfde taak
  // nadat hij was afgerond. Beide velden tellen nu mee.
  const alleAf=[];
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{
    if(hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.subsidie,r.onderwerp,r.afzender,r.opmerkingen,r.opmerking)) alleAf.push(r);
  }));
  alleAf.sort((a,b)=>{
    const ax=(a.code||'').toLowerCase()===z?0:1, bx=(b.code||'').toLowerCase()===z?0:1;
    if(ax!==bx) return ax-bx;
    return (parseDt(b.datum)||0)-(parseDt(a.datum)||0);   // daarna: laatst afgerond bovenaan
  });
  res.afgerond=alleAf.slice(0,max.afgerond);
  // Het logboek staat al NIEUWSTE-EERST: parseLogboek draait de Sheet-volgorde om (een append komt
  // onderaan, dus de laatste rij is de nieuwste) en de nog-niet-bevestigde eigen regels staan
  // vooraan (_verwerkLogboek in data.js). Dus niet alles filteren en dan sorteren — met twee
  // `new Date` per vergelijking, over duizenden regels, bij élke toetsaanslag — maar van voren af
  // lopen en stoppen zodra er genoeg treffers zijn.
  // Alleen regels MÉT VvE-code: klikken op een treffer opent het dossier van die code, en een
  // logregel zonder code (de ALV-reset schrijft er zo een) leidde naar een leeg dossier.
  const log=data.logboek||[];
  for(let i=0; i<log.length && res.logboek.length<max.logboek; i++){
    const e=log[i];
    if(!String(e.code||'').trim()) continue;
    if(hit(e.code,e.actie,e.veld,e.oudeWaarde,e.nieuweWaarde,displayName(e.gebruiker))) res.logboek.push(e);
  }
  return res;
}

// ── UI-laag ──────────────────────────────────────────────────────────
let _palItems=[];   // platte lijst aanklikbare items (over groepsgrenzen heen)
const PAL_DEBOUNCE_MS=80;
let _palTimer=null; // een nog niet getekende zoekronde (zie initPalette)
// Een wachtende ronde meteen tekenen. Voor de toetsen die op de lijst werken (pijltjes, Enter):
// die mogen nooit een lijst van een eerdere zoekterm bedienen.
function palBij(){
  if(_palTimer==null) return;
  clearTimeout(_palTimer); _palTimer=null; _palSel=0;
  renderPal(document.getElementById('pal-input')?.value||'');
}
let _palSel=0;      // geselecteerde index (pijltjes)

function openPalette(){
  document.getElementById('pal-bg').classList.add('open');
  const inp=document.getElementById('pal-input');
  inp.value='';
  clearTimeout(_palTimer); _palTimer=null;   // geen ronde van een vorige opening meer laten landen
  _palSel=0;
  renderPal('');
  setTimeout(()=>inp.focus(),30);
}
function closePalette(){ document.getElementById('pal-bg').classList.remove('open'); }
function palOpen(){ return document.getElementById('pal-bg').classList.contains('open'); }

function _item(html,doe){ const idx=_palItems.length; _palItems.push({doe});
  return `<div class="pal-res${idx===_palSel?' actief':''}" role="option" id="pal-opt-${idx}" aria-selected="${idx===_palSel}" data-action="pal-kies" data-idx="${idx}">${html}</div>`; }
function _groep(kop,inhoud){ return inhoud?`<div class="pal-groep"><div class="pal-groep-kop">${kop}</div>${inhoud}</div>`:''; }

// ── Acties (U3) ──
// Eén lijst voor de lege staat én voor zoeken op een actiewoord ('afronden', 'thema', 'logboek').
// `basis` = ook tonen zonder zoekterm. De rij-acties komen van sneltoetsen.js (dezelfde als de
// toetsen e/a/w/i) en gelden voor de focusrij in de takenlijst.
const PAG_ICO={ ntd:'checkbox', af:'vinkCirkel', alvo:'gebouw', alfa:'feest', ontw:'kolf', logboek:'notitieboek', herhaal:'herhaal', analytics:'grafiek', dash:'grafiek' };
function _recent(){ try{ return JSON.parse(localStorage.getItem('recentVves')||'[]'); }catch(e){ return []; } }
function palActies(){
  const a=[];
  a.push({ basis:true, ico:'plus', lbl:'Nieuwe taak aanmaken', zoek:'nieuw taak toevoegen', doe:()=>{ closePalette(); goTo('ntd'); openModal(false); } });
  const taak=rijFocusTaak(), tr=rijFocusTr();
  if(taak && tr){
    const rid=tr.dataset.rid;
    RIJ_ACTIES.forEach(ra=>a.push({ basis:true, ico:ra.ico, lbl:`${ra.lbl}: ${taakTitel(taak, taak._sec)||taak.code}`, sub:`${taak.code} ${taak.naam||''}`.trim(),
      zoek:ra.lbl.toLowerCase()+' taak rij', hint:`toets ${ra.toets}`, doe:()=>{ closePalette(); ra.doe(rid); } }));
  }
  if(state.vveCode && document.getElementById('page-vve')?.classList.contains('active')){
    a.push({ basis:true, ico:'plus', lbl:`Nieuwe taak voor ${state.vveCode}`, zoek:'nieuw taak dossier vve', doe:()=>{ closePalette(); openModal(false,null,{ sec:'OPPAKKEN', code:state.vveCode }); } });
  }
  Object.entries(PAGE_META).forEach(([id,[titel]])=>{
    if(id==='vve') return;
    a.push({ basis:['analytics','herhaal','logboek'].includes(id), ico:PAG_ICO[id]||'chevronRechts', lbl:'Ga naar '+titel, zoek:'ga naar pagina open '+titel.toLowerCase(), doe:()=>{ closePalette(); goTo(id); } });
  });
  a.push({ ico:'oog', lbl:'Thema wisselen (licht/donker)', zoek:'thema donker licht modus', doe:()=>{ closePalette(); applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'); } });
  a.push({ ico:'label', lbl:'Weergave: dichtheid wisselen', zoek:'dichtheid compact ruim standaard', doe:()=>{ closePalette(); cycleDensity(); } });
  a.push({ ico:'checkbox', lbl: state.bulkMode ? 'Selecteren uitzetten' : 'Meerdere taken selecteren', zoek:'selecteren bulk meerdere', doe:()=>{ closePalette(); goTo('ntd'); toggleBulkMode(); } });
  a.push({ ico:'herhaal', lbl:'Nu vernieuwen', zoek:'vernieuwen verversen herladen', doe:()=>{ closePalette(); loadAll(); } });
  a.push({ basis:true, ico:'klembord', lbl:'Sneltoetsen tonen', zoek:'sneltoetsen toetsen hulp', hint:'toets ?', doe:()=>{ closePalette(); toggleSneltoetsOverzicht(true); } });
  return a;
}
// Puur (zelftest): alle woorden van de zoekterm moeten in label of zoekwoorden voorkomen.
function zoekActies(q, acties){
  const woorden=String(q||'').toLowerCase().split(/\s+/).filter(Boolean);
  if(!woorden.length) return [];
  return (acties||[]).filter(a=>{ const t=(a.lbl+' '+(a.zoek||'')).toLowerCase(); return woorden.every(w=>t.includes(w)); });
}
function _actieItem(a){
  return _item(`<span class="pal-ico pal-ico-act">${ico(a.ico||'chevronRechts')}</span><div class="pal-tekst"><b>${esc(a.lbl)}</b>${a.sub?`<span>${esc(a.sub)}</span>`:''}</div>${a.hint?`<span class="pal-hint">${esc(a.hint)}</span>`:''}`, a.doe);
}
// Laatst bezochte VvE's vooraan in de treffers (puur).
function metRecentVooraan(vves, recent, max){
  const idx=c=>{ const i=(recent||[]).indexOf(c); return i<0 ? 99 : i; };
  return (vves||[]).slice().sort((a,b)=>idx(a.code)-idx(b.code)).slice(0, max);
}

// ── /-opdrachten (U3) ──
const COMMANDOS=[
  ['/vve',  'code of naam',  'Open een dossier'],
  ['/log',  'tekst',         'Notitie in het open dossier — of: /log 311212 tekst'],
  ['/taak', 'omschrijving',  'Nieuwe taak met deze omschrijving'],
  ['/ga',   'pagina',        'Ga naar een pagina'],
];
// Puur (zelftest): wat betekent deze /log-invoer? → {code, tekst} of null.
function ontleedLog(rest, openCode, codes){
  const r=String(rest||'').trim();
  const m=r.match(/^(\S+)\s+([\s\S]+)$/);
  if(m && (codes||[]).includes(m[1])) return { code:m[1], tekst:m[2].trim() };
  if(openCode && r) return { code:openCode, tekst:r };
  return null;
}
// Een notitie in het logboek van een VvE, zonder dossier te openen. Zelfde regel als addTaskNote
// (render-overig.js): actie 'Opmerking', optimistisch in D.logboek, en de bevestiging pas na de append.
async function snelleNotitie(code, tekst){
  if(blokkeerOffline()) return;
  if(!await ensureToken()){ showToast('Inloggen mislukt','Probeer het opnieuw.','var(--rd)','waarschuwing',{geenDedup:true,geenSysteemmelding:true}); return; }
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const entry={ _row:0, timestamp:ts, code, sectie:'', actie:'Opmerking', veld:'', oudeWaarde:'', nieuweWaarde:tekst, gebruiker:who };
  D.logboek.unshift(entry);
  renderAll();
  backgroundWrite(
    async ()=>{
      await appendRange("'Logboek'!A:H", [ts, code, '', 'Opmerking', '', '', tekst, who]);
      showToast('Notitie vastgelegd', `${code} — ${tekst.length>60 ? tekst.slice(0,57)+'…' : tekst}`, null, 'potlood', {geenDedup:true,geenSysteemmelding:true});
    },
    ()=>{ const i=D.logboek.indexOf(entry); if(i>-1) D.logboek.splice(i,1); },   // vorm-ok: eigen optimistische regel
    'Notitie vastleggen'
  );
}
function _vveItem(v){
  const ov=vveOverzicht(v.code,D);
  return _item(`<span class="pal-ico pal-ico-vve">${esc(v.code)}</span><div class="pal-tekst"><b>${esc(v.naam||v.code)}</b><span>${ov.cijfers.open} open · ${ov.cijfers.teLaat} te laat${ov.cijfers.laatsteDagen!=null?` · laatste activiteit ${ov.cijfers.laatsteDagen} d`:''}</span></div><span class="pal-hint">Enter → dossier</span>`,
    ()=>{ closePalette(); openVvePagina(v.code); });
}
function _hintItem(tekst){ return `<div class="pal-leeg">${esc(tekst)}</div>`; }
function renderCommando(q){
  const m=q.match(/^\/(\S*)\s*([\s\S]*)$/);
  const cmd='/'+(m[1]||'').toLowerCase(), rest=(m[2]||'').trim();
  if(cmd==='/vve'){
    if(!rest) return _groep("VvE's", _hintItem('Typ een code of naam, bijvoorbeeld /vve 311212'));
    const res=zoekAlles(rest, D, { vves:8, taken:0, stappen:0, afgerond:0, logboek:0 });
    return res.vves.length ? _groep("VvE's", res.vves.map(_vveItem).join('')) : _groep("VvE's", _hintItem('Geen VvE gevonden'));
  }
  if(cmd==='/log'){
    const open=document.getElementById('page-vve')?.classList.contains('active') ? state.vveCode : null;
    const o=ontleedLog(rest, open, (D.alvo||[]).map(v=>v.code));
    if(o) return _groep('Notitie', _actieItem({ ico:'potlood', lbl:`Notitie bij ${o.code}: "${o.tekst}"`, hint:'Enter → vastleggen', doe:()=>{ closePalette(); snelleNotitie(o.code, o.tekst); } }));
    return _groep('Notitie', _hintItem(open ? `Typ de notitie voor ${open}` : 'Gebruik: /log 311212 tekst — of open eerst een dossier'));
  }
  if(cmd==='/taak'){
    if(!rest) return _groep('Nieuwe taak', _hintItem('Typ de omschrijving, bijvoorbeeld /taak dakgoot nakijken'));
    return _groep('Nieuwe taak', _actieItem({ ico:'plus', lbl:`Nieuwe taak: "${rest}"`, hint:'opent invulscherm', doe:()=>{ closePalette(); goTo('ntd'); openModal(false); zetOmschrijving(state.editSec||state.activeNtd, rest); } }));
  }
  if(cmd==='/ga'){
    const paginas=palActies().filter(a=>a.lbl.startsWith('Ga naar '));
    const lijst=rest ? zoekActies(rest, paginas) : paginas;
    return _groep("Pagina's", lijst.map(_actieItem).join('')) || _groep("Pagina's", _hintItem('Geen pagina gevonden'));
  }
  const kandidaten=COMMANDOS.filter(([c])=>c.startsWith(cmd));
  return _groep('Opdrachten', kandidaten.map(([c,arg,uitleg])=>_item(
    `<span class="pal-ico pal-ico-act">${ico('chevronRechts')}</span><div class="pal-tekst"><b>${esc(c)} <i>${esc(arg)}</i></b><span>${esc(uitleg)}</span></div>`,
    ()=>{ const inp=document.getElementById('pal-input'); if(!inp) return; inp.value=c+' '; inp.focus(); _palSel=0; renderPal(inp.value); })).join(''))
    || _groep('Opdrachten', _hintItem('Onbekende opdracht. Beschikbaar: /vve, /log, /taak, /ga'));
}

function renderPal(q){
  _palItems=[]; if(_palSel<0)_palSel=0;
  const bd=document.getElementById('pal-bd');
  let html='';
  const z=q.trim();
  if(!z){
    // lege staat: laatst bezochte VvE's + acties
    const recent=_recent();
    const rHtml=recent.map(code=>{
      const v=(D.alvo||[]).find(r=>r.code===code);
      return _item(`<span class="pal-ico pal-ico-vve">${esc(code)}</span><div class="pal-tekst"><b>${esc(v?.naam||code)}</b><span>laatst bezocht</span></div>`,
        ()=>{ closePalette(); openVvePagina(code); });
    }).join('');
    html+=_groep("Laatst bezochte VvE's",rHtml);
    html+=_groep('Acties', palActies().filter(a=>a.basis).map(_actieItem).join(''));
    html+=`<div class="pal-tip">Typ <b>/</b> voor opdrachten (/vve, /log, /taak, /ga) · typ een actie zoals <b>thema</b> of <b>afronden</b> · <b>?</b> toont de sneltoetsen</div>`;
  }else if(z.startsWith('/')){
    html+=renderCommando(z);
  }else{
    // Acties eerst als de zoekterm er een raakt: wie 'thema' typt zoekt geen VvE.
    html+=_groep('Acties', zoekActies(z, palActies()).slice(0,4).map(_actieItem).join(''));
    const res=zoekAlles(q,D,{ ...PAL_MAX, vves:12 });
    html+=_groep("VvE's", metRecentVooraan(res.vves, _recent(), PAL_MAX.vves).map(_vveItem).join(''));
    html+=_groep('Open taken',res.taken.map(r=>{
      const p=berekenPrioriteit(r.deadline,r._sec);
      const laat=teLaatVoorTelling(r,r._sec);
      const opv=r._sec==='OFFERTE-TRAJECTEN' && offerteAangevraagd(r) && p.teLaat;
      const pill=laat?`<span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`
               : opv ?`<span class="pill-opvolgen">Opvolgen (${Math.abs(p.dagenTot)}d)</span>`
               : esc(r.deadline||'');
      return _item(`<span class="pal-ico pal-ico-taak">${ico('cirkelOpen')}</span><div class="pal-tekst"><b>${esc(taakTitel(r, r._sec))}</b><span>${esc(r.code)} ${esc(r.naam||'')} · ${esc(SECS[r._sec].label)} · ${esc(r.behandelaar||'—')}</span></div><span class="pal-hint">${pill}</span>`,
        ()=>{ closePalette(); openModal(true,r); });
    }).join(''));
    // Eigen groep, met de taak waar de stap bij hoort in de onderregel: los van zijn traject zegt
    // 'Offertes voorleggen aan eigenaren' bij elke VvE hetzelfde, en dan is de lijst niet te lezen.
    // De index één keer buiten de lus: hij loopt over vijf secties van twee bladen.
    const _palIx=res.stappen.length ? bouwBundelIndex(D.ntd||{}, D.af||{}) : null;
    html+=_groep('Stap in een traject',res.stappen.map(r=>{
      const vw=bundelVerwijzing(r, _palIx);
      const kop=vw && vw.rol==='sub' ? vw.kopRij : null;
      const bij=kop ? `stap in: ${taakTitel(kop, kop._sec)||SECS[kop._sec].label}` : SECS[r._sec].label;
      return _item(`<span class="pal-ico pal-ico-taak">${ico('cirkelOpen')}</span><div class="pal-tekst"><b>${esc(taakTitel(r, r._sec))}</b><span>${esc(r.code)} ${esc(r.naam||'')} · ${esc(bij)}</span></div><span class="pal-hint">Enter → bewerken</span>`,
        ()=>{ closePalette(); openModal(true,r); });
    }).join(''));
    html+=_groep('Afgerond',res.afgerond.map(r=>
      _item(`<span class="pal-ico pal-ico-af">${ico('vink')}</span><div class="pal-tekst"><b>${esc(taakTitel(r, r._sec))}</b><span>${esc(r.code)} · afgerond ${esc(r.datum||'')}</span></div>`,
        ()=>{ closePalette(); openVvePagina(r.code); })).join(''));
    html+=_groep('Logboek',res.logboek.map(e=>
      _item(`<span class="pal-ico pal-ico-log">${ico('potlood')}</span><div class="pal-tekst"><b class="pal-logzin">${logZin(e)}</b></div>`,
        ()=>{ closePalette(); openVvePagina(e.code); })).join(''));
    html+=_groep('Nieuwe taak',
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
  if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Enter') palBij();
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
  // Na een korte pauze in het typen, niet bij élke toets: elke ronde doorzoekt alle open en
  // afgeronde taken, het VvE-register en het logboek. Wie 'dakgoot' typt kreeg zeven volledige
  // rondes waarvan alleen de laatste te zien was. Enter kiest altijd op de lijst van NU: palToets
  // tekent eerst bij als er nog een ronde klaarstaat (palBij).
  inp.addEventListener('input',()=>{
    clearTimeout(_palTimer);
    _palTimer=setTimeout(()=>{ _palTimer=null; _palSel=0; renderPal(inp.value); }, PAL_DEBOUNCE_MS);
  });
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

export { zoekAlles, PAL_MAX, openPalette, closePalette, palKies, initPalette, palOpen, zoekActies, metRecentVooraan, ontleedLog, palActies, COMMANDOS };
