// ══════════════════════════════════════
//  RENDER-LIJSTEN — NTD-orchestratie (stats, Nog-te-doen, filter, Afgerond)
//  + re-export van render-offerte / render-alv / render-tabel (publieke interface stabiel).
//  Batch D / punt 11: offerte/ALV/tabel-render zijn naar eigen modules verplaatst.
// ══════════════════════════════════════
import { esc, filt, berekenPrioriteit, parseDt, opvolgStatus, _vandaagAmsterdam, toISODate, isoWeek } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkWis, renderBulkUi } from "./bulk.js";
import { renderThead, renderTbody, renderPag, bepaalStil, deadlineCel, rowNtd, rowAf } from "./render-tabel.js";
import { _verrijkOfferteRij, offerteAannemerPaneel, offerteAannSamenvatting } from "./render-offerte.js";
import { renderAlvo, renderAlfa, toggleAlvoFlag, ALVO_ICONS, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, statusIco } from "./render-alv.js";

// ══════════════════════════════════════
//  NTD STATS
// ══════════════════════════════════════
const SEC_ICONS={
  // Klembord met vinkje — taken oppakken
  OPPAKKEN:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" fill="currentColor" fill-opacity="0.18"/><rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="currentColor" fill-opacity="0.35"/><path d="M9 13l2 2 4-4.2"/></svg>`,
  // Groep van drie mensen — vergaderen
  VERGADERVERZOEKEN:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3" fill="currentColor" fill-opacity="0.25"/><circle cx="5.5" cy="10" r="2.2" fill="currentColor" fill-opacity="0.18"/><circle cx="18.5" cy="10" r="2.2" fill="currentColor" fill-opacity="0.18"/><path d="M6.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M2 19c.3-2 1.7-3.3 3.5-3.6"/><path d="M22 19c-.3-2-1.7-3.3-3.5-3.6"/></svg>`,
  // Document met eurosymbool — offerte
  'OFFERTE-TRAJECTEN':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v13a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 20V4.5A1.5 1.5 0 017.5 3z" fill="currentColor" fill-opacity="0.18"/><path d="M14 3v4h4"/><path d="M15 12c-.7-.9-1.8-1.4-3-1.4-2.2 0-4 1.9-4 4.2s1.8 4.2 4 4.2c1.2 0 2.3-.5 3-1.4"/><path d="M8.5 14h4.2M8.5 16.2h4.2"/></svg>`,
  // Map met klok/uitroep — openstaande dossiers (LOD)
  LOD:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="currentColor" fill-opacity="0.18"/><circle cx="15.5" cy="14" r="3.2" fill="currentColor" fill-opacity="0.3"/><path d="M15.5 12.2v2l1.3.8" stroke-width="1.6"/></svg>`
};
const SEC_THEMES={
  OPPAKKEN:'--sec:var(--ac);--sec-l:var(--ac-l)',
  VERGADERVERZOEKEN:'--sec:var(--am);--sec-l:var(--am-l)',
  'OFFERTE-TRAJECTEN':'--sec:var(--pu);--sec-l:var(--pu-l)',
  LOD:'--sec:var(--rd);--sec-l:var(--rd-l)',
};
function renderNtdStats(){
  // V3-stat-strip: aggregaten i.p.v. per-sectie-tegels (per-sectie staat al in de tabs)
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
  const item=(val,cls,cap,hint)=>`<div class="stat-item"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span>${hint?`<span class="stat-hint">${hint}</span>`:''}</div></div>`;
  // Huidige ISO-weeknummer, rechts in de balk (ma-start; tooltip = ma–zo datumbereik)
  const MND=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const wk=isoWeek(tv);
  const ma=new Date(tv); ma.setDate(tv.getDate()-((tv.getDay()+6)%7));
  const zo=new Date(ma); zo.setDate(ma.getDate()+6);
  const range=`${ma.getDate()} ${MND[ma.getMonth()]} – ${zo.getDate()} ${MND[zo.getMonth()]} ${zo.getFullYear()}`;
  const weekBlok=`<div class="stat-week" title="ISO-week ${wk} · ${range}"><span class="stat-week-cap">Week</span><span class="stat-week-val">${wk}</span></div>`;
  document.getElementById('ntd-stats').innerHTML=
    item(open,'','Open taken','')+
    item(telaat,telaat?'red':'muted','Te laat','')+
    item(weg,weg?'amber':'muted','Weggelegd','')+
    item(afVandaag,'muted','Afgerond vandaag','')+
    weekBlok;
  renderNtdDonut();
}

// NTD: voortgangsbalk uitgeschreven vergaderingen (alvo: uitnodiging=TRUE → uitnodiging verzonden)
function renderNtdDonut(){
  const track=document.getElementById('ntd-progress-track');
  if(!track) return;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const total=(D.alvo||[]).length;
  const pct=total?Math.round(done/total*100):0;
  const txt=`${done} / ${total}`;
  document.getElementById('ntd-progress-val-base').textContent=txt;
  document.getElementById('ntd-progress-val-rev').textContent=txt;
  document.getElementById('ntd-progress-sub').textContent=`${pct}% van de vergaderingen uitgeschreven`;
  // vollopend effect + reveal: witte cijfers worden onthuld over het gevulde deel,
  // donkere cijfers blijven leesbaar over het lichte deel (beide identiek gecentreerd)
  requestAnimationFrame(()=>{
    document.getElementById('ntd-progress-fill').style.width=pct+'%';
    document.getElementById('ntd-progress-val-rev').style.clipPath=`inset(0 ${100-pct}% 0 0)`;
  });
}

// ══════════════════════════════════════
//  NOG TE DOEN
// ══════════════════════════════════════
function renderNtd(){
  const q=document.getElementById('s-ntd').value.toLowerCase();
  const fCode=document.getElementById('f-code-ntd').value.toLowerCase();
  const fBeh=document.getElementById('f-beh-ntd').value;
  const fPrio=document.getElementById('f-prio-ntd').value;

  // Snoei de uitklap-Set tot rij-id's die nog bestaan: na verwijderen/afronden schuiven de
  // _row-nummers mee, dus verdwenen id's mogen niet blijven hangen (anders staat een verkeerde
  // rij uitgeklapt tot de gebruiker er zelf op klikt).
  if(state.expandedRows.size){
    state.expandedRows=new Set([...state.expandedRows].filter(id=>SKEYS.some(s=>(D.ntd[s]||[]).some(r=>''+r._row===id))));
  }

  // Tabs
  document.getElementById('ntd-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filterNtd(D.ntd[s]||[],q,fCode,fBeh,fPrio,s);
    return`<button type="button" class="tab ${s===state.activeNtd?'on':''}" role="tab" aria-selected="${s===state.activeNtd}" style="${s===state.activeNtd?SECS[s].css:''}" data-action="ntd-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></button>`;
  }).join('');

  document.getElementById('ntd-title').textContent=SECS[state.activeNtd].label;
  // Apply card theme
  const card=document.getElementById('ntd-card');
  SECS[state.activeNtd].css.split(';').forEach(p=>{const[k,v]=p.split(':');if(k&&v)card.style.setProperty(k.trim(),v.trim())});

  const rows=filterNtd(D.ntd[state.activeNtd]||[],q,fCode,fBeh,fPrio,state.activeNtd);
  renderThead('ntd-thead',[...(state.bulkMode?['']:[]),...SECS[state.activeNtd].cols,''],SECS[state.activeNtd].css);
  renderTbody('ntd-tbody',rows,state.activeNtd,pgs.ntd,false,!!(q||fCode||fBeh||fPrio));
  renderPag('ntd-pag',rows.length,pgs.ntd,'ntd');
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
    return `<div class="xl-rij">
      <span class="xl-code">${esc(r.code)}</span>
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

function filterNtd(rows,q,fCode,beh,prio,sec){
  const out=rows.filter(r=>{
    if(q&&!SECS[sec].keys.some(k=>(r[k]||'').toLowerCase().includes(q))) return false;
    if(fCode&&!(r.code||'').toLowerCase().includes(fCode)) return false;
    if(beh&&!(r.behandelaar||'').toLowerCase().includes(beh.toLowerCase())) return false;
    if(prio){
      const berekend = berekenPrioriteit(r.deadline, sec).prioriteit;
      if (berekend !== prio) return false;
    }
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

// ══════════════════════════════════════
//  AFGEROND
// ══════════════════════════════════════
function renderAf(){
  const q=document.getElementById('s-af').value.toLowerCase();
  document.getElementById('af-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filt(D.af[s]||[],q);
    return`<button type="button" class="tab ${s===state.activeAf?'on':''}" role="tab" aria-selected="${s===state.activeAf}" style="${s===state.activeAf?SECS[s].css:''}" data-action="af-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></button>`;
  }).join('');
  const cols=['VvE Code','VvE','Categorie','Subcategorie','Afgerond op','Opmerking'];
  renderThead('af-thead',cols,SECS[state.activeAf].css);
  const rows=filt(D.af[state.activeAf]||[],q);
  renderTbody('af-tbody',rows,state.activeAf,pgs.af,true,!!q);
  renderPag('af-pag',rows.length,pgs.af,'af');
}
function setAf(s){state.activeAf=s;pgs.af=1;renderAf()}

export {
  SEC_ICONS, SEC_THEMES, renderNtdStats, renderNtdDonut, renderNtd, setNtd, filterNtd, renderAf, setAf,
  offerteAannemerPaneel, offerteAannSamenvatting,
  ALVO_ICONS, renderAlvo, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, toggleAlvoFlag, statusIco, renderAlfa,
  renderThead, renderTbody, bepaalStil, deadlineCel, rowNtd, rowAf, renderPag,
};
