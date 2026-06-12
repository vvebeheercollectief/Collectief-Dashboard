// ══════════════════════════════════════
//  RENDER-LIJSTEN — Nog-te-doen, Afgerond, ALV's + tabel/paginering
// ══════════════════════════════════════
import { esc, filt, prioBadge, persBadges, ibBadge, subBadge, offProg, emptyRow, berekenPrioriteit, parseDt, STIL_DREMPEL_DAGEN, _vandaagAmsterdam, _verschilInKalenderdagen, opvolgStatus, toISODate, offerteFase, offerteNuOpvolgen, offerteSorteerScore, offerteBriefingFeiten } from "./util.js";
import { SID, SECS, SKEYS, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { ensureToken } from "./auth.js";
import { getSheetIds } from "./crud.js";
import { logEvent } from "./render-overig.js";
import { showToast } from "./notifications.js";
import { bulkGeselecteerd, bulkWis, renderBulkUi } from "./bulk.js";
import { flipOfferteRijen } from "./anim.js";

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
  document.getElementById('ntd-stats').innerHTML=
    item(open,'','Open taken','')+
    item(telaat,telaat?'red':'muted','Te laat','')+
    item(weg,weg?'amber':'muted','Weggelegd','')+
    item(afVandaag,'muted','Afgerond vandaag','');
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

// Helper: ligt date d in (current period - offset) gerekend vanaf ref?
function _inPeriod(d,ref,period,offset){
  if(period==='week'){
    // ISO-week-index
    const w1=_weekIndex(d), w2=_weekIndex(ref);
    return (w2-w1)===offset;
  }
  if(period==='maand'){
    const idx=(ref.getFullYear()*12+ref.getMonth())-(d.getFullYear()*12+d.getMonth());
    return idx===offset;
  }
  if(period==='kwartaal'){
    const qR=Math.floor(ref.getMonth()/3), qD=Math.floor(d.getMonth()/3);
    const idx=(ref.getFullYear()*4+qR)-(d.getFullYear()*4+qD);
    return idx===offset;
  }
  if(period==='jaar'){
    return (ref.getFullYear()-d.getFullYear())===offset;
  }
  return false;
}
function _weekIndex(d){
  // dagen-sinds-epoch / 7 als grove index
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7;
  t.setUTCDate(t.getUTCDate()+4-day);
  return Math.floor(t.getTime()/(7*86400000));
}

// ══════════════════════════════════════
//  NOG TE DOEN
// ══════════════════════════════════════
function renderNtd(){
  const q=document.getElementById('s-ntd').value.toLowerCase();
  const fCode=document.getElementById('f-code-ntd').value.toLowerCase();
  const fBeh=document.getElementById('f-beh-ntd').value;
  const fPrio=document.getElementById('f-prio-ntd').value;

  // Tabs
  document.getElementById('ntd-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filterNtd(D.ntd[s]||[],q,fCode,fBeh,fPrio,s);
    return`<div class="tab ${s===state.activeNtd?'on':''}" style="${s===state.activeNtd?SECS[s].css:''}" data-action="ntd-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></div>`;
  }).join('');

  document.getElementById('ntd-title').textContent=SECS[state.activeNtd].label;
  // Apply card theme
  const card=document.getElementById('ntd-card');
  SECS[state.activeNtd].css.split(';').forEach(p=>{const[k,v]=p.split(':');if(k&&v)card.style.setProperty(k.trim(),v.trim())});

  const rows=filterNtd(D.ntd[state.activeNtd]||[],q,fCode,fBeh,fPrio,state.activeNtd);
  renderThead('ntd-thead',[...(state.bulkMode?['']:[]),...SECS[state.activeNtd].cols,''],SECS[state.activeNtd].css);
  renderTbody('ntd-tbody',rows,state.activeNtd,pgs.ntd,false);
  renderPag('ntd-pag',rows.length,pgs.ntd,'ntd');
  renderOfferteBriefing();
}
function setNtd(s){
  state.activeNtd=s;pgs.ntd=1;bulkWis();
  // Briefing (Fase 4): bij het eerste offerte-tab-bezoek van de dag automatisch openen
  if(s==='OFFERTE-TRAJECTEN'){
    const sleutel='offerteBriefing_'+toISODate(_vandaagAmsterdam());
    if(localStorage.getItem(sleutel)!=='1'){ state.offerteBriefingOpen=true; try{localStorage.setItem(sleutel,'1');}catch(_){ } }
  }
  renderNtd();renderBulkUi();
}

// ══════════════════════════════════════
//  OFFERTE-BRIEFING (Fase 4) — dagelijkse samenvatting bovenaan de offerte-tab
// ══════════════════════════════════════
// Offerte-briefing: feiten → natuurlijke NL-zinnen (regel-gebaseerd, geen AI nodig).
function offerteBriefingTekst(f){
  if(!f.nuOpvolgen){
    let t='Niets dat nu opvolging vraagt — alle lopende trajecten zitten binnen hun termijn.';
    if(f.klaarTeGunnen) t+=` Wel wachten ${f.klaarTeGunnen===1?'er één traject':f.klaarTeGunnen+' trajecten'} op akkoord van de VvE.`;
    return t;
  }
  let t=`Vandaag ${f.nuOpvolgen===1?'heeft 1 traject':'hebben '+f.nuOpvolgen+' trajecten'} aandacht nodig`;
  if(f.langStil) t+=`, waarvan ${f.langStil===1?'één al opvallend lang stil ligt':f.langStil+' al opvallend lang stil liggen'}`;
  t+='. ';
  if(f.urgentste){
    const bal={aannemer:'de bal ligt bij de aannemer',ons:'de bal ligt bij ons',vve:'de bal ligt bij de eigenaren'}[f.urgentste.balBij]||'';
    t+=`Het urgentst: ${f.urgentste.naam||f.urgentste.code}${f.urgentste.dagen!=null?` (${f.urgentste.dagen} dagen stil${bal?', '+bal:''})`:''}. `;
  }
  if(f.balBijOns) t+=`${f.balBijOns===1?'Eén offerte wacht':f.balBijOns+' offertes wachten'} op doorsturen naar de eigenaren. `;
  if(f.klaarTeGunnen) t+=`${f.klaarTeGunnen===1?'Eén traject ligt':f.klaarTeGunnen+' trajecten liggen'} bij de VvE voor akkoord.`;
  return t.trim();
}
// Vult de briefing-slot: banner (open) of klein knopje (dicht); leeg op andere tabs.
function renderOfferteBriefing(){
  const slot=document.getElementById('off-briefing-slot');
  if(!slot) return;
  if(state.activeNtd!=='OFFERTE-TRAJECTEN'){ slot.innerHTML=''; return; }
  // Feiten over ÁLLE offerte-rijen (bewust niet zoek-gefilterd: de briefing gaat over het hele speelveld)
  const rijen=D.ntd['OFFERTE-TRAJECTEN']||[];
  const actMap=_offerteActiviteitMap(D.logboek);
  rijen.forEach(r=>_verrijkOfferteRij(r,actMap));
  const f=offerteBriefingFeiten(rijen);
  const datumLabel=new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  slot.innerHTML = state.offerteBriefingOpen ? `
    <div class="off-briefing">
      <div class="off-briefing-kop">
        <span>✦ Briefing · ${datumLabel}</span>
        <button class="off-briefing-x" data-action="offerte-briefing-sluiten" title="Sluiten">✕</button>
      </div>
      <p>${esc(offerteBriefingTekst(f))}</p>
      <div class="off-briefing-chips">
        ${f.langStil?`<span class="chip-stil">${f.langStil} lang stil</span>`:''}
        ${f.balBijOns?`<span class="chip-ons">${f.balBijOns} wacht op jou</span>`:''}
        ${f.klaarTeGunnen?`<span class="chip-gun">${f.klaarTeGunnen} bij de VvE</span>`:''}
      </div>
    </div>` : `<button class="off-briefing-knop" data-action="offerte-briefing-openen">✦ Briefing</button>`;
}
// Offerte-motor: jongste logboek-activiteit per VvE-code (één pass over het logboek).
function _offerteActiviteitMap(logboek){
  const map=new Map();
  (logboek||[]).forEach(e=>{
    if(e.sectie!=='OFFERTE-TRAJECTEN'||!e.code||!e.timestamp) return;
    const t=new Date(e.timestamp); if(isNaN(t)) return;
    const cur=map.get(e.code); if(!cur||t>cur) map.set(e.code,t);
  });
  return map;
}
// Offerte-motor: zet de jongste activiteit op de rij als LOKALE datum (voedt offerteStilBasis).
function _verrijkOfferteRij(r, actMap){
  const t=actMap.get(r.code)||null;
  r.laatsteActiviteit=t?`${t.getFullYear()}-${t.getMonth()+1}-${t.getDate()}`:'';
  return r;
}

// Offerte-motor: splits rijen in {nu, lopend}; 'nu' aflopend op urgentie gesorteerd.
// Zet r._offNu als die nog niet bepaald is (zodat directe aanroepen uit tests ook werken).
function offerteGroepen(rijen, vandaag){
  const nodig=r=>{ if(r._offNu===undefined){ const st=offerteNuOpvolgen(r,vandaag); r._offStatus=st; r._offNu=st.nodig; } return r._offNu; };
  const nu=rijen.filter(nodig)
                .sort((a,b)=>offerteSorteerScore(b,vandaag)-offerteSorteerScore(a,vandaag));
  const lopend=rijen.filter(r=>!nodig(r));
  return {nu, lopend};
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
  // Offerte-motor (Fase 2): eigen groepering "Nu opvolgen" → "Lopend" i.p.v. de generieke groeps-sortering
  if(sec==='OFFERTE-TRAJECTEN'){
    const vandaag=_vandaagAmsterdam();
    const actMap=_offerteActiviteitMap(D.logboek);
    out.forEach(r=>_verrijkOfferteRij(r,actMap));
    out.forEach(r=>{ const st=offerteNuOpvolgen(r,vandaag); r._offStatus=st; r._offNu=st.nodig; });
    const g=offerteGroepen(out,vandaag);
    return [...g.nu,...g.lopend];
  }
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
    return`<div class="tab ${s===state.activeAf?'on':''}" style="${s===state.activeAf?SECS[s].css:''}" data-action="af-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></div>`;
  }).join('');
  const cols=['VvE Code','VvE','Categorie','Subcategorie','Afgerond op','Opmerking'];
  renderThead('af-thead',cols,SECS[state.activeAf].css);
  const rows=filt(D.af[state.activeAf]||[],q);
  renderTbody('af-tbody',rows,state.activeAf,pgs.af,true);
  renderPag('af-pag',rows.length,pgs.af,'af');
}
function setAf(s){state.activeAf=s;pgs.af=1;renderAf()}

// ══════════════════════════════════════
//  ALV OVERZICHT
// ══════════════════════════════════════
// Duotone-stijl inline SVG-iconen voor de stat-tegels (zelfde stijl als DASH_ICONS,
// kleur volgt --sec via currentColor). Inline i.p.v. Phosphor-font voor betrouwbare weergave.
const ALVO_ICONS={
  totaal:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="8" height="13" rx="1" fill="currentColor" fill-opacity="0.18"/><rect x="11" y="4" width="10" height="17" rx="1" fill="currentColor" fill-opacity="0.18"/><path d="M2 21h20M6 12h2M6 15.5h2M15 8h2M15 11.5h2M15 15h2"/></svg>`,
  afgerond:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>`,
  gepland:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2"/></svg>`,
  open:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" fill="currentColor" fill-opacity="0.18"/><path d="M6 3h12M6 21h12"/></svg>`
};
function renderAlvo(){
  // Stats
  const tot=D.alvo.length;
  const afd=D.alvo.filter(r=>r.status==='Afgerond').length;
  const gep=D.alvo.filter(r=>r.status==='Gepland').length;
  const opn=D.alvo.filter(r=>r.status==='Open').length;
  const aItem=(val,cls,cap)=>`<div class="stat-item"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span></div></div>`;
  document.getElementById('alvo-stats').innerHTML=
    aItem(tot,'',"Totaal VvE's")+
    aItem(afd,'green','Afgerond')+
    aItem(gep,'amber','Gepland')+
    aItem(opn,opn?'red':'muted','Open');

  const q=document.getElementById('s-alvo').value.toLowerCase();
  const fs=document.getElementById('f-status-alvo').value;
  const rows=D.alvo.filter(r=>{
    if(q&&!`${r.code} ${r.naam}`.toLowerCase().includes(q)) return false;
    if(fs&&r.status!==fs) return false;
    return true;
  });
  const sl=rows.slice((pgs.alvo-1)*PG,pgs.alvo*PG);
  document.getElementById('alvo-tbody').innerHTML=sl.length
    ?sl.map(r=>{
      const idx=D.alvo.indexOf(r);
      return`<tr>
        <td><span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l)">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}</td>
        <td>${flagPill(idx,'uitnodiging',r.uitnodiging)}</td>
        <td>${flagPill(idx,'notulen',r.notulen)}</td>
        <td>${flagPill(idx,'begroting',r.begroting)}</td>
        <td><span class="badge status-${r.status.toLowerCase()}">${statusIco(r.status)} ${r.status}</span></td>
      </tr>`;
    }).join('')
    :emptyRow(6);
  renderPag('alvo-pag',rows.length,pgs.alvo,'alvo');
}

const ALVO_COLS={uitnodiging:2,notulen:3,begroting:4};
const ALVO_LABELS={uitnodiging:'Uitnodiging',notulen:'Notulen',begroting:'Begroting'};

function flagPill(idx,field,val){
  const cls=val?'on':'off';
  const lbl=val?'✓ Ja':'–';
  const aria=val?'true':'false';
  const title=`Klik om ${ALVO_LABELS[field]} ${val?'uit':'aan'} te zetten`;
  return`<button type="button" class="flag-toggle ${cls}" data-action="alvo-flag" data-idx="${idx}" data-field="${field}" aria-pressed="${aria}" title="${title}">${lbl}</button>`;
}

function _recomputeAlvoStatus(r){
  r.status=r.notulen?'Afgerond':r.uitnodiging?'Gepland':'Open';
}

async function toggleAlvoFlag(idx,field){
  const r=D.alvo[idx];
  if(!r){console.warn('toggleAlvoFlag: rij niet gevonden',idx);return}
  if(!await ensureToken()){showToast('Niet ingelogd','Kan wijziging niet opslaan','var(--rd)');return}

  // Lock UI op de specifieke pill
  const btn=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
  if(btn) btn.classList.add('toggling');

  const oldVal=!!r[field];
  const newVal=!oldVal;
  const oldStatus=r.status;

  // Optimistische update
  r[field]=newVal;
  _recomputeAlvoStatus(r);
  renderAlvo();
  renderNtdDonut(); // voortgangsbalk meteen mee laten lopen

  try{
    const ids=await getSheetIds();
    const sheetId=ids["ALV's overzicht"]??ids["ALV's Overzicht"]??ids["ALV's overzicht "];
    if(sheetId==null) throw new Error("Sheet 'ALV's overzicht' niet gevonden");
    const col=ALVO_COLS[field];
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{
        updateCells:{
          range:{sheetId,startRowIndex:r._row-1,endRowIndex:r._row,startColumnIndex:col,endColumnIndex:col+1},
          rows:[{values:[{userEnteredValue:{boolValue:newVal}}]}],
          fields:'userEnteredValue'
        }
      }]})
    });
    if(!resp.ok){const t=await resp.text();throw new Error(`HTTP ${resp.status}: ${t.slice(0,120)}`)}

    logEvent(r.code,'ALVS',newVal?'Aangevinkt':'Uitgevinkt',ALVO_LABELS[field],oldVal?'TRUE':'FALSE',newVal?'TRUE':'FALSE');
    showToast(`${newVal?'✓':'○'} ${ALVO_LABELS[field]} ${newVal?'aan':'uit'}`,`${r.code} – ${r.naam}`,newVal?'var(--gn)':'var(--mut)');
  }catch(e){
    // Revert
    r[field]=oldVal;
    r.status=oldStatus;
    renderAlvo();
    renderNtdDonut();
    showToast('Opslaan mislukt',e.message||'Onbekende fout','var(--rd)');
    console.error('toggleAlvoFlag fout:',e);
  }finally{
    const btn2=document.querySelector(`.flag-toggle[data-idx="${idx}"][data-field="${field}"]`);
    if(btn2) btn2.classList.remove('toggling');
  }
}
function statusIco(s){return{Open:'⏳',Gepland:'📅',Afgerond:'✅'}[s]||''}

// ══════════════════════════════════════
//  ALV AFGEROND
// ══════════════════════════════════════
function renderAlfa(){
  const q=document.getElementById('s-alfa').value.toLowerCase();
  const rows=D.alfa.filter(r=>`${r.code} ${r.naam} ${r.datum}`.toLowerCase().includes(q));
  const sl=rows.slice((pgs.alfa-1)*PG,pgs.alfa*PG);
  document.getElementById('alfa-tbody').innerHTML=sl.length
    ?sl.map(r=>`<tr>
        <td><span class="code" style="--sec:var(--gn);--sec-l:var(--gn-l)">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}</td>
        <td class="cell-sm">${esc(r.datum)}</td>
      </tr>`).join('')
    :emptyRow(3);
  renderPag('alfa-pag',rows.length,pgs.alfa,'alfa');
}

// ══════════════════════════════════════
//  TABLE HELPERS
// ══════════════════════════════════════
function renderThead(id,cols,css){
  document.getElementById(id).innerHTML=`<tr>${cols.map(c=>`<th style="${css}">${c}</th>`).join('')}</tr>`;
}

function renderTbody(tbodyId,rows,sec,page,isAf){
  const sl=rows.slice((page-1)*PG,page*PG);
  const el=document.getElementById(tbodyId);
  if(!sl.length){el.innerHTML=`<tr><td colspan="10">${emptyRow(10,true)}</td></tr>`;return}
  if(isAf){el.innerHTML=sl.map(r=>rowAf(r,sec)).join('');return}
  // Offerte-motor (Fase 2): eigen groepkoppen "Nu opvolgen" / "Lopend"
  // (rijen komen al verrijkt + in nu→lopend-volgorde uit filterNtd; zelfde slice-mechaniek als Weggelegd)
  if(sec==='OFFERTE-TRAJECTEN'){
    // rijen zijn al getagd met r._offNu in filterNtd (één klok, geen nieuwe aanroepen)
    const nu=sl.filter(r=>r._offNu), lopend=sl.filter(r=>!r._offNu);
    const colsOff=SECS[sec].cols.length+1+(state.bulkMode?1:0);
    let html='';
    if(nu.length||page===1){
      html+=`<tr><td colspan="${colsOff}" class="grp-kop grp-nu">🔔 Nu opvolgen (${nu.length})</td></tr>`;
      html+=nu.length
        ?nu.map(r=>rowNtd(r,sec)).join('')
        :`<tr><td colspan="${colsOff}"><div class="empty"><div class="empty-ico">🎉</div>Niets dat nu opvolging vraagt</div></td></tr>`;
    }
    if(lopend.length){
      html+=`<tr><td colspan="${colsOff}" class="grp-kop">Lopend (${lopend.length})</td></tr>`;
      html+=lopend.map(r=>rowNtd(r,sec)).join('');
    }
    // FLIP: rijen zweven zichtbaar naar hun nieuwe plek bij her-render (Task 2.3)
    flipOfferteRijen(el,()=>{el.innerHTML=html});
    return;
  }
  // Drie groepen (Fase 4): actief / in behandeling / weggelegd
  const grpOf = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
  const main=sl.filter(r=>grpOf(r)===0);
  const ib=sl.filter(r=>grpOf(r)===1);
  const wg=sl.filter(r=>grpOf(r)===2);
  const cols=SECS[sec].cols.length+1+(state.bulkMode?1:0);
  let html=main.map(r=>rowNtd(r,sec)).join('');
  if(ib.length){
    html+=`<tr><td colspan="${cols}" style="background:var(--ac-l);padding:8px 13px;font-size:11px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.05em;border:none">⟳ In behandeling (${ib.length})</td></tr>`;
    html+=ib.map(r=>rowNtd(r,sec)).join('');
  }
  if(wg.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">⏸ Weggelegd (${wg.length}) — komt terug op de opvolgdatum</td></tr>`;
    html+=wg.map(r=>rowNtd(r,sec)).join('');
  }
  el.innerHTML=html;
}

function bepaalStil(r, sec){
  if (opvolgStatus(r).weggelegd) return null; // weggelegd = bewust geparkeerd, niet stil (Fase 4)
  if (r.inBehandeling !== 'TRUE') return null;
  const entries = (D.logboek || []).filter(e => e.code === r.code && (!sec || e.sectie === sec));
  if (!entries.length) return null; // geen activiteit-data → niet markeren
  let laatst = null;
  entries.forEach(e => {
    const t = e.timestamp ? new Date(e.timestamp) : null;
    if (t && !isNaN(t) && (!laatst || t > laatst)) laatst = t;
  });
  if (!laatst) return null;
  const dagen = _verschilInKalenderdagen(_vandaagAmsterdam(), laatst);
  return dagen >= STIL_DREMPEL_DAGEN ? dagen : null;
}

// Offerte-motor: mini fase-balk (4 mijlpalen) voor in de offerte-rij.
function faseBalk(r){
  const fases=['aangevraagd','ontvangen','bij_vve','gegund'];
  const labels={aangevraagd:'Aangevraagd',ontvangen:'Ontvangen',bij_vve:'Bij VvE',gegund:'Gegund'};
  const idx=fases.indexOf(offerteFase(r));
  return `<div class="fase-balk" title="${labels[fases[idx]]}">`+fases.map((f,i)=>
    `<span class="fase-stap ${i<idx?'done':i===idx?'nu':'todo'}"></span>`).join('')+`</div>`;
}

function deadlineCel(r, sec){
  if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen deadline</span></td>`;
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  // V3: status als gewoon vetgedrukt woord, geen pill
  if (teLaat) return `<td><span class="s-telaat">Te laat (${Math.abs(dagenTot)}d)</span></td>`;
  const soon = dagenTot !== null && dagenTot <= 7;
  return `<td><span class="${soon ? 's-soon' : 's-normal'}">${esc(r.deadline)}</span></td>`;
}

function rowNtd(r,sec){
  const css=SECS[sec].css;
  const rid=state._rowCache.length; state._rowCache.push(r);
  const bulkCel=state.bulkMode
    ?`<td class="bulk-cel"><span class="cb${bulkGeselecteerd(r)?' aan':''}" data-action="bulk-vink" data-rid="${rid}" role="checkbox" aria-checked="${bulkGeselecteerd(r)}"></span></td>`
    :'';
  // acts-cel met optionele extra knop vooraan (offerte-motor: contextuele opvolg-actie)
  const actsHtml=extra=>`<div class="acts">${extra||''}<button class="act-bw act-ico" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="act-bw act-ico" data-action="taak-wegleggen" data-rid="${rid}" title="Wegleggen / opvolgdatum"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/></svg></button><button class="act-af" data-action="taak-afronden" data-rid="${rid}" title="Afgehandeld"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 4 4 10-10"/></svg>Afronden</button></div>`;
  const editBtn=actsHtml('');
  let cells='';
  const _stilDagen = bepaalStil(r, sec);
  const stilPill = _stilDagen !== null
    ? `<span class="pill-stil" data-action="taak-bewerken" data-rid="${rid}" title="Geen activiteit in ${_stilDagen} dagen">Stil ${_stilDagen}d</span>`
    : '';
  const ov = opvolgStatus(r);
  const opvolgPill = ov.vandaag
    ? `<span class="pill-opvolg" data-action="taak-wegleggen" data-rid="${rid}" title="Opvolgdatum: ${esc(r.opvolgdatum)}">🔔 Opvolgen vandaag</span>`
    : ov.weggelegd
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}" title="Weggelegd tot ${esc(r.opvolgdatum)}">${esc(r.opvolgdatum)}</span>`
      : '';
  const extraPills = stilPill + opvolgPill;
  switch(sec){
    case'OPPAKKEN':
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td class="cell-txt">${esc(r.actiepunt)}${extraPills}</td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar)}</td>
        <td>${prioBadge(r, 'OPPAKKEN')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}</td>
        <td>${ibBadge(r.inBehandeling)}</td>
        <td>${editBtn}</td>`;
      break;
    case'VERGADERVERZOEKEN':
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td><span class="badge" style="background:var(--am-l);color:var(--am)">${esc(r.periode||r.agendapunten||'')}</span></td>
        <td class="cell-txt">${esc(r.agendapunten||r.actiepunt||'')}${extraPills}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td>${prioBadge(r, 'VERGADERVERZOEKEN')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}</td>
        <td>${ibBadge(r.inBehandeling)}</td>
        <td>${editBtn}</td>`;
      break;
    case'OFFERTE-TRAJECTEN':{
      // Offerte-motor (Fase 3): contextuele opvolg-actie alleen in "Nu opvolgen"-rijen
      const st=r._offStatus||{};
      // F5: inline SVG i.p.v. emoji (iconenbeleid: geen emoji in knoppen, zelfde lijn-stijl als buurknoppen)
      const actieBtn=r._offNu&&st.actie
        ? `<button class="act-bw off-actie" data-action="${st.actie==='Doorsturen'?'offerte-doorsturen':'offerte-nabellen'}" data-rid="${rid}" title="${st.actie==='Doorsturen'?'Offerte delen met de eigenaren + vastleggen':'Opvolging vastleggen (gebeld/gemaild)'}">${st.actie==='Doorsturen'
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>Doorsturen`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>Nabellen`
        }</button>`
        : '';
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td class="cell-sm">${esc(r.datumAangevraagd||'')}</td>
        <td>${offProg(r.offertes)}${faseBalk(r)}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'OFFERTE-TRAJECTEN')}
        <td>${prioBadge(r, 'OFFERTE-TRAJECTEN')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}${extraPills}</td>
        <td>${actsHtml(actieBtn)}</td>`;
      break;}
    case'LOD':
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name">${esc(r.naam)}${subBadge(r.subcategorie)}</td>
        <td class="cell-txt">${esc(r.actiepunt||'')}${extraPills}</td>
        <td class="cell-txt" style="font-style:italic;font-size:12px">${esc(r.status||'')}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'LOD')}
        <td>${prioBadge(r, 'LOD')}</td>
        <td class="cell-txt">${r.opmerkingen?`<span style="font-size:12px">${esc(r.opmerkingen)}</span>`:''}</td>
        <td>${ibBadge(r.inBehandeling)}</td>
        <td>${editBtn}</td>`;
      break;
  }
  const { teLaat: rowTeLaat } = berekenPrioriteit(r.deadline, sec);
  const rowCls = [
    r.inBehandeling === 'TRUE' ? 'ib-row' : '',
    rowTeLaat ? 'row-telaat' : '',
    ov.weggelegd ? 'snooze-row' : ''
  ].filter(Boolean).join(' ');
  // Stabiel FLIP-anker per offerte-traject (code + aanvraagdatum), voor de zweefanimatie
  // sleutel niet gegarandeerd uniek bij zelfde code+datum — cosmetisch risico, geaccepteerd
  const flipAttr = sec==='OFFERTE-TRAJECTEN' ? ` data-flip="${esc(r.code)}|${esc(r.datumAangevraagd||'')}"` : '';
  return `<tr class="${rowCls}" data-row="${r._row}"${flipAttr}>${bulkCel}${cells}</tr>`;
}

function rowAf(r,sec){
  const css=SECS[sec].css;
  return`<tr>
    <td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
    <td class="cell-name">${esc(r.naam)}</td>
    <td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||'')}</td>
    <td class="cell-sm">${esc(r.subcategorie||'')}</td>
    <td class="cell-sm">${esc(r.datum||'')}</td>
    <td class="cell-txt">${r.opmerking?`<span style="font-size:12px">${esc(r.opmerking)}</span>`:''}</td>
  </tr>`;
}

// ══════════════════════════════════════
//  PAGINATION
// ══════════════════════════════════════
function renderPag(id,total,cur,doel){
  const el=document.getElementById(id);if(!el)return;
  const tp=Math.ceil(total/PG);
  if(tp<=1){el.innerHTML='';return}
  const s=(cur-1)*PG+1,e=Math.min(cur*PG,total);
  const rng=tp<=7?[...Array(tp).keys()].map(i=>i+1)
    :cur<=4?[1,2,3,4,5,'…',tp]
    :cur>=tp-3?[1,'…',tp-4,tp-3,tp-2,tp-1,tp]
    :[1,'…',cur-1,cur,cur+1,'…',tp];
  el.innerHTML=`<div class="pag-info">Toont ${s}–${e} van ${total}</div>
    <div class="pag-btns">
      <button class="pb" data-action="pagineer" data-doel="${doel}" data-pg="${cur-1}" ${cur<=1?'disabled':''}>‹</button>
      ${rng.map(p=>p==='…'?`<span class="pb" style="border:none;cursor:default">…</span>`
        :`<button class="pb ${p===cur?'on':''}" data-action="pagineer" data-doel="${doel}" data-pg="${p}">${p}</button>`).join('')}
      <button class="pb" data-action="pagineer" data-doel="${doel}" data-pg="${cur+1}" ${cur>=tp?'disabled':''}>›</button>
    </div>`;
}


export {
  SEC_ICONS, SEC_THEMES, renderNtdStats, renderNtdDonut, _inPeriod, _weekIndex, renderNtd, setNtd,
  filterNtd, offerteGroepen, _offerteActiviteitMap, offerteBriefingTekst, renderAf, setAf, ALVO_ICONS, renderAlvo, ALVO_COLS, ALVO_LABELS, flagPill,
  _recomputeAlvoStatus, toggleAlvoFlag, statusIco, renderAlfa, renderThead, renderTbody, bepaalStil,
  deadlineCel, rowNtd, rowAf, renderPag,
};
