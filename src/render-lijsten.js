// ══════════════════════════════════════
//  RENDER-LIJSTEN — NTD-orchestratie (stats, Nog-te-doen, filter, Afgerond)
//  + re-export van render-offerte / render-alv / render-tabel (publieke interface stabiel).
//  Batch D / punt 11: offerte/ALV/tabel-render zijn naar eigen modules verplaatst.
// ══════════════════════════════════════
import { esc, filt, berekenPrioriteit, parseDt, opvolgStatus, _vandaagAmsterdam, toISODate, isoWeek, vveCodeSpan } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkWis, renderBulkUi } from "./bulk.js";
import { renderThead, renderTbody, renderPag, bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf } from "./render-tabel.js";
import { _verrijkOfferteRij, offerteAannemerPaneel, offerteAannSamenvatting } from "./render-offerte.js";
import { renderAlvo, renderAlfa, toggleAlvoFlag, ALVO_ICONS, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, statusIco } from "./render-alv.js";
import { bouwBundelIndex, wordtGeabsorbeerd } from "./bundel.js";

// ══════════════════════════════════════
//  NTD STATS
// ══════════════════════════════════════
// Open/dicht-stand van het uitklappaneel. Bewust in localStorage: de gebruiker die
// hem één keer openzet wil hem morgen ook open.
const KOP_KEY = 'ntd_kop_open';
function kopOpen(){ return localStorage.getItem(KOP_KEY) === '1'; }

const CHEV_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

function renderNtdStats(){
  let open=0, telaat=0, weg=0;
  SKEYS.forEach(s=>{
    (D.ntd[s]||[]).forEach(r=>{
      open++;
      if(berekenPrioriteit(r.deadline,s).teLaat) telaat++;
      if(opvolgStatus(r).weggelegd) weg++;
    });
  });
  const tv=_vandaagAmsterdam();
  const todayISO=`${tv.getFullYear()}-${String(tv.getMonth()+1).padStart(2,'0')}-${String(tv.getDate()).padStart(2,'0')}`;
  let afVandaag=0;
  SKEYS.forEach(s=>{(D.af?.[s]||[]).forEach(r=>{ if(toISODate(r.datum||'')===todayISO) afVandaag++; })});

  const host=document.getElementById('ntd-kop-pillen');
  if(!host) return;

  // Plat = alleen aflezen. 'Open' filtert niet (filteren op alles is geen filter) en
  // 'af' komt uit D.af, dat de lijst eronder niet kan tonen.
  const plat=(val,cap,cls='')=>
    `<span class="kop-pil ${cls}"><b>${val}</b> ${cap}</span>`;
  const knop=(val,cap,cls,status)=>{
    const aan=state.ntdStatus===status;
    return `<button type="button" class="kop-pil kop-pil-klik ${cls}${aan?' aan':''}" data-action="ntd-stat" data-status="${status}" aria-pressed="${aan}" title="${aan?'Filter uitzetten':'Toon alleen '+cap}"><b>${val}</b> ${cap}${aan?' <span aria-hidden="true">✕</span>':''}</button>`;
  };
  const paneelOpen=kopOpen();
  const chev=`<button type="button" class="kop-chev" data-action="ntd-kop-toggle" aria-expanded="${paneelOpen}" aria-controls="ntd-top-row" aria-label="${paneelOpen?'Details verbergen':'Week en vergaderingen tonen'}" title="${paneelOpen?'Details verbergen':'Week en vergaderingen tonen'}">${CHEV_SVG}</button>`;

  host.innerHTML=
    plat(open,'open')+
    knop(telaat,'te laat','pil-rd','telaat')+
    knop(weg,'weggelegd','pil-am','weggelegd')+
    plat(afVandaag,'af','pil-dof')+
    chev;

  renderNtdWeek();
  renderNtdDonut();
}

// Weekblok, nu in het uitklappaneel in plaats van in de statstrook.
function renderNtdWeek(){
  const host=document.getElementById('ntd-week'); if(!host) return;
  const tv=_vandaagAmsterdam();
  const MND=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const wk=isoWeek(tv);
  const ma=new Date(tv); ma.setDate(tv.getDate()-((tv.getDay()+6)%7));
  const zo=new Date(ma); zo.setDate(ma.getDate()+6);
  const range=`${ma.getDate()} ${MND[ma.getMonth()]} – ${zo.getDate()} ${MND[zo.getMonth()]} ${zo.getFullYear()}`;
  host.innerHTML=`<span class="stat-week-cap">Week</span><span class="stat-week-val">${wk}</span>`;
  host.title=`ISO-week ${wk} · ${range}`;
}

// NTD: voortgangsbalk uitgeschreven vergaderingen (alvo: uitnodiging=TRUE → uitnodiging verzonden)
function renderNtdDonut(){
  const track=document.getElementById('ntd-progress-track');
  if(!track) return;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const total=(D.alvo||[]).length;
  const pct=total?Math.round(done/total*100):0;
  // Voorbereid = klaargezet óf al verstuurd; de balk toont dat als lichter voorloopstuk.
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
  const txt=`${done} / ${total}`;
  document.getElementById('ntd-progress-val-base').textContent=txt;
  document.getElementById('ntd-progress-val-rev').textContent=txt;
  document.getElementById('ntd-progress-sub').textContent = voorbereid>done
    ? `${pct}% verstuurd, ${pctVoor}% klaargezet`
    : `${pct}% van de vergaderingen uitgeschreven`;
  // Alleen vullen als het paneel zichtbaar is. Staat het op hidden, dan zou de animatie
  // ongezien afgelopen zijn en de balk bij het openklappen in één keer vol staan.
  if(kopOpen()) vulProgressBalk();
}

// Vollopend effect + reveal: witte cijfers worden onthuld over het gevulde deel,
// donkere cijfers blijven leesbaar over het lichte deel (beide identiek gecentreerd).
function vulProgressBalk(){
  const fill=document.getElementById('ntd-progress-fill'); if(!fill) return;
  const total=(D.alvo||[]).length;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pct=total?Math.round(done/total*100):0;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
  requestAnimationFrame(()=>{
    const voor=document.getElementById('ntd-progress-voor');
    if(voor) voor.style.width=pctVoor+'%';
    fill.style.width=pct+'%';
    const rev=document.getElementById('ntd-progress-val-rev');
    if(rev) rev.style.clipPath=`inset(0 ${100-pct}% 0 0)`;
  });
}

// Tegenhanger van vulProgressBalk: bij het dichtklappen alles terug op nul. Zonder deze
// reset blijft de inline breedte staan en loopt de balk alléén de eerste keer vol — daarna
// staat hij bij het openklappen meteen op zijn eindwaarde.
function leegProgressBalk(){
  const fill=document.getElementById('ntd-progress-fill'); if(!fill) return;
  fill.style.width='0';
  const voor=document.getElementById('ntd-progress-voor');
  if(voor) voor.style.width='0';
  const rev=document.getElementById('ntd-progress-val-rev');
  if(rev) rev.style.clipPath='inset(0 100% 0 0)';
}

// Paneel openen/sluiten. Schrijft de keuze weg en houdt de chevron in sync.
function zetKopOpen(aan){
  localStorage.setItem(KOP_KEY, aan?'1':'0');
  const paneel=document.getElementById('ntd-top-row');
  if(paneel) paneel.hidden=!aan;
  const chev=document.querySelector('[data-action="ntd-kop-toggle"]');
  if(chev){
    chev.setAttribute('aria-expanded', aan?'true':'false');
    const lbl = aan?'Details verbergen':'Week en vergaderingen tonen';
    chev.setAttribute('aria-label', lbl);
    chev.setAttribute('title', lbl);
  }
  if(aan) vulProgressBalk(); else leegProgressBalk();
}

// ══════════════════════════════════════
//  NOG TE DOEN
// ══════════════════════════════════════
// De gestapelde weergave verschijnt alleen in de ONGEFILTERDE standaardlijst. Zodra er wordt
// gezocht, gefilterd, op een kolomkop gesorteerd of bulk-geselecteerd, tonen we plat.
// Reden: een treffer mag niet verstopt zitten in een dichtgeklapte bundel, een vaste groepering
// is in strijd met een gekozen sortering, en in bulk-modus moet élke taak aanvinkbaar zijn.
// Puur, dus los testbaar.
function isPlatteWeergave({ q, fCode, beh, prio, status, sortKey, bulk }){
  return !!(q || fCode || beh || prio || status || sortKey || bulk);
}

// Haal subtaken uit de vlakke lijst weg wanneer hun zichtbare kop in HETZELFDE tabblad staat —
// die worden dan in het bundelpaneel onder die kop getekend. Staat de kop in een ander tabblad,
// dan blijft de rij gewoon staan — daar komt straks het ⛓-merkje op (§3.2b). Zo wordt elke taak
// per tabblad precies één keer getoond en blijven de tellers kloppen.
// Het predikaat zelf staat in bundel.js, gedeeld met het ⛓-merkje: precies de rijen die hier
// blijven staan krijgen daar een merkje, en omgekeerd (zie `wordtGeabsorbeerd`).
function absorbeer(rows, sec, index){
  if (!index || !index.size) return rows;
  return rows.filter(r => !wordtGeabsorbeerd(r, index, sec));
}

function renderNtd(){
  const q=document.getElementById('s-ntd').value.toLowerCase();
  const fCode=document.getElementById('f-code-ntd').value.toLowerCase();
  const fBeh=document.getElementById('f-beh-ntd').value;
  const fPrio=document.getElementById('f-prio-ntd').value;

  // Eén bundelindex per render. Plat = een lege Map i.p.v. een vlag: dan valt de stapelweergave
  // vanzelf weg, want zowel de absorptie hieronder als de rij-opmaak vindt er geen enkele bundel
  // in. Zo staat de plat-of-niet-beslissing op precies één plek.
  const plat=isPlatteWeergave({ q, fCode, beh:fBeh, prio:fPrio, status:state.ntdStatus,
                                sortKey:state.ntdSort.key, bulk:state.bulkMode });
  const bundelIx=plat?new Map():bouwBundelIndex(D.ntd,D.af);
  // Op `state` en niet als parameter: de rij-opmaak zit in render-tabel.js en heeft geen ingang
  // voor deze index. Die leest hem daar straks uit — bewust dezelfde momentopname als de
  // absorptie hieronder, anders verdwijnt een rij hier terwijl hij daar geen stapel krijgt.
  state._bundelIx=bundelIx;

  // Snoei de uitklap-Set tot rij-id's die nog bestaan: na verwijderen/afronden schuiven de
  // _row-nummers mee, dus verdwenen id's mogen niet blijven hangen (anders staat een verkeerde
  // rij uitgeklapt tot de gebruiker er zelf op klikt).
  if(state.expandedRows.size){
    state.expandedRows=new Set([...state.expandedRows].filter(id=>SKEYS.some(s=>(D.ntd[s]||[]).some(r=>''+r._row===id))));
  }

  // Tabs
  document.getElementById('ntd-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filterNtd(D.ntd[s]||[],q,fCode,fBeh,fPrio,s,state.ntdStatus);
    return`<button type="button" class="tab ${s===state.activeNtd?'on':''}" role="tab" aria-selected="${s===state.activeNtd}" style="${s===state.activeNtd?SECS[s].css:''}" data-action="ntd-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></button>`;
  }).join('');

  document.getElementById('ntd-title').textContent=SECS[state.activeNtd].label;
  // Apply card theme
  const card=document.getElementById('ntd-card');
  SECS[state.activeNtd].css.split(';').forEach(p=>{const[k,v]=p.split(':');if(k&&v)card.style.setProperty(k.trim(),v.trim())});

  // Absorptie als laatste stap, ná filteren en sorteren: alleen de lijst die getekend wordt
  // krimpt. De tab-tellers hierboven blijven bewust op de ONgeabsorbeerde lijst staan — een
  // geabsorbeerde subtaak is niet verdwenen, alleen anders getekend, en moet dus meetellen.
  const zichtbaar=absorbeer(sorteerNtd(filterNtd(D.ntd[state.activeNtd]||[],q,fCode,fBeh,fPrio,state.activeNtd,state.ntdStatus),state.ntdSort),state.activeNtd,bundelIx);
  renderThead('ntd-thead',[...(state.bulkMode?['']:[]),...SECS[state.activeNtd].cols,''],SECS[state.activeNtd].css,
    {active:state.ntdSort, keyFor:ntdSorteerKey});
  renderTbody('ntd-tbody',zichtbaar,state.activeNtd,pgs.ntd,false,!!(q||fCode||fBeh||fPrio||state.ntdStatus));
  renderPag('ntd-pag',zichtbaar.length,pgs.ntd,'ntd');
  renderNtdCrossList(state.activeNtd);
}
// Cross-list (bug #2): taken die fysiek in een ándere sectie staan maar via hun
// Subcategorie-veld óók bij dit scherm horen. We tonen ze als apart lijstje onderaan
// ("Ook hier"), met een herkomst-tag en een bewerk-knop die de eigen-sectie-modal opent.
// De taak blijft gewoon in z'n eigen scherm staan (geen verplaatsing).
function renderNtdCrossList(sec){
  const host=document.getElementById('ntd-crosslist'); if(!host) return;
  const label=((SECS[sec]?.label)||'').trim().toLowerCase();
  const q=(document.getElementById('s-ntd')?.value||'').toLowerCase();
  const fCode=(document.getElementById('f-code-ntd')?.value||'').toLowerCase();
  const fBeh=(document.getElementById('f-beh-ntd')?.value||'').toLowerCase();
  const fPrio=(document.getElementById('f-prio-ntd')?.value||''); // exacte waarde (niet lowercasen), net als filterNtd
  const treffers=[];
  if(label){
    SKEYS.forEach(s=>{ if(s===sec) return;
      (D.ntd[s]||[]).forEach(r=>{
        if(((r.subcategorie||'')+'').trim().toLowerCase()!==label) return;
        // Zelfde filterdefinitie als de hoofdtabel (filterNtd): zoek over de sectie-keys van de
        // herkomst-sectie en pas óók het prioriteitsfilter toe — anders toont 'Ook hier' items
        // van álle prioriteiten terwijl de hoofdtabel netjes filtert.
        if(q && !SECS[s].keys.some(k=>(r[k]||'').toLowerCase().includes(q))) return;
        if(fCode && !((r.code||'').toLowerCase().includes(fCode))) return;
        if(fBeh && !((r.behandelaar||'').toLowerCase().includes(fBeh))) return;
        if(fPrio && berekenPrioriteit(r.deadline,s).prioriteit!==fPrio) return;
        if(state.ntdStatus==='telaat'    && !berekenPrioriteit(r.deadline,s).teLaat) return;
        if(state.ntdStatus==='weggelegd' && !opvolgStatus(r).weggelegd) return;
        treffers.push(r);
      });
    });
  }
  if(!treffers.length){ host.innerHTML=''; return; }
  const rij=r=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const herkomst=esc((SECS[r._sec]?.label)||r._sec||'');
    const dl=r.deadline?` · ${esc(r.deadline)}`:'';
    const opm=esc(((r.opmerkingen||'').split('\n')[0]||'').slice(0,60));
    // De code via de gedeelde bouwsteen, zodat élke VvE-code in de app hetzelfde doet:
    // deze was als enige niet klikbaar. De sectie-css zet --sec, zodat de kleur blijft kloppen.
    return `<div class="xl-rij">
      ${vveCodeSpan(r.code, SECS[r._sec]?.css||'')}
      <div class="xl-mid"><div class="xl-naam">${esc(r.naam||'')}</div>
        <div class="xl-ctx"><span class="xl-herk">${herkomst}</span>${dl}${opm?` · ${opm}`:''}</div></div>
      <button class="xl-edit" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    </div>`;
  };
  host.innerHTML=`<div class="xl-blok">
    <div class="xl-kop">Ook hier <span class="xl-sub">· via subcategorie · ${treffers.length}</span></div>
    ${treffers.map(rij).join('')}
  </div>`;
}
function setNtd(s){
  state.activeNtd=s;pgs.ntd=1;bulkWis();
  renderNtd();renderBulkUi();
}

function filterNtd(rows,q,fCode,beh,prio,sec,status){
  const out=rows.filter(r=>{
    if(q&&!SECS[sec].keys.some(k=>(r[k]||'').toLowerCase().includes(q))) return false;
    if(fCode&&!(r.code||'').toLowerCase().includes(fCode)) return false;
    if(beh&&!(r.behandelaar||'').toLowerCase().includes(beh.toLowerCase())) return false;
    if(prio){
      const berekend = berekenPrioriteit(r.deadline, sec).prioriteit;
      if (berekend !== prio) return false;
    }
    // Statusfilter uit de kop-pillen. Onbekende waarden filteren niets weg, zodat een
    // oude/rare state nooit een lege lijst oplevert.
    if(status==='telaat'    && !berekenPrioriteit(r.deadline, sec).teLaat) return false;
    if(status==='weggelegd' && !opvolgStatus(r).weggelegd) return false;
    return true;
  });
  // Aannemerslijst (kolom P) op de rij zetten + de X/N-teller bijstellen. Moet vóór de
  // render gebeuren, anders blijft het uitklap-paneel leeg en toont de teller de rauwe
  // kolom D. Sortering loopt daarna via hetzelfde generieke pad als de andere secties.
  if(sec==='OFFERTE-TRAJECTEN') out.forEach(r=>_verrijkOfferteRij(r));
  return out.sort((a,b)=>{
    // Groepen (Fase 4): 0 = actief, 1 = in behandeling, 2 = weggelegd (opvolgdatum in toekomst)
    const grp = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
    const gA = grp(a), gB = grp(b);
    if (gA !== gB) return gA - gB;
    if (gA === 2){ // binnen Weggelegd: vroegste opvolgdatum eerst
      const oA = parseDt(a.opvolgdatum), oB = parseDt(b.opvolgdatum);
      if (oA !== oB) return oA - oB;
    }
    const pa = berekenPrioriteit(a.deadline, sec);
    const pb = berekenPrioriteit(b.deadline, sec);
    // 1. Te laat altijd bovenaan
    if (pa.teLaat !== pb.teLaat) return pa.teLaat ? -1 : 1;
    // 2. Opvolgen-vandaag direct daarna (Fase 4)
    const ovA = opvolgStatus(a).vandaag ? 0 : 1, ovB = opvolgStatus(b).vandaag ? 0 : 1;
    if (ovA !== ovB) return ovA - ovB;
    // 3. Prioriteit-rang
    const rang = { 'Hoog':0, 'Midden':1, 'Laag':2, '':3 };
    if (rang[pa.prioriteit] !== rang[pb.prioriteit]) return rang[pa.prioriteit] - rang[pb.prioriteit];
    // 4. Deadline oplopend (vroegste eerst)
    const dA = parseDt(a.deadline), dB = parseDt(b.deadline);
    if (dA && dB && dA !== dB) return dA - dB;
    if (dA && !dB) return -1;
    if (dB && !dA) return 1;
    // 5. VvE-code alfabetisch
    return (a.code || '').localeCompare(b.code || '');
  });
}

// Welke kolomkoppen zijn sorteerbaar? 'VvE Code' → code; elke 'Deadline…'-kop → deadline.
function ntdSorteerKey(lbl){
  return lbl==='VvE Code' ? 'code' : (String(lbl).startsWith('Deadline') ? 'deadline' : null);
}

// Kolomkop-sortering (klikcyclus ▲/▼/uit). key:null = standaardvolgorde uit filterNtd.
// De groepsindeling (actief → in behandeling → weggelegd) blijft altijd leidend zodat de
// blokken in de tabel intact blijven; er wordt bínnen de blokken gesorteerd. Stabiele sort:
// gelijke waarden houden de slimme standaardvolgorde.
function sorteerNtd(rows,sort){
  if(!sort||!sort.key) return rows;
  const dir=sort.asc?1:-1;
  const grp=r=>opvolgStatus(r).weggelegd?2:(r.inBehandeling==='TRUE'?1:0);
  return rows.slice().sort((a,b)=>{
    const g=grp(a)-grp(b);
    if(g) return g;
    if(sort.key==='code')
      return dir*String(a.code||'').localeCompare(String(b.code||''),undefined,{numeric:true,sensitivity:'base'});
    const dA=parseDt(a.deadline),dB=parseDt(b.deadline);
    if(!dA&&!dB) return 0;
    if(!dA) return 1;              // zonder deadline altijd onderaan, in beide richtingen
    if(!dB) return -1;
    return dir*(dA-dB);
  });
}

// ══════════════════════════════════════
//  AFGEROND
// ══════════════════════════════════════
function renderAf(){
  const q=document.getElementById('s-af').value.toLowerCase();
  document.getElementById('af-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filt(D.af[s]||[],q);
    return`<button type="button" class="tab ${s===state.activeAf?'on':''}" role="tab" aria-selected="${s===state.activeAf}" style="${s===state.activeAf?SECS[s].css:''}" data-action="af-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></button>`;
  }).join('');
  const cols=['VvE Code','VvE','Taak','Subcategorie','Afgerond op','Opmerking'];  // 'Categorie' stond boven de taakomschrijving
  renderThead('af-thead',cols,SECS[state.activeAf].css);
  const rows=filt(D.af[state.activeAf]||[],q);
  renderTbody('af-tbody',rows,state.activeAf,pgs.af,true,!!q);
  renderPag('af-pag',rows.length,pgs.af,'af');
}
function setAf(s){state.activeAf=s;pgs.af=1;renderAf()}

export {
  renderNtdStats, renderNtdDonut, renderNtd, setNtd, filterNtd, sorteerNtd, ntdSorteerKey, renderAf, setAf,
  kopOpen, zetKopOpen, absorbeer, isPlatteWeergave,
  offerteAannemerPaneel, offerteAannSamenvatting,
  ALVO_ICONS, renderAlvo, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, toggleAlvoFlag, statusIco, renderAlfa,
  renderThead, renderTbody, bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf, renderPag,
};
