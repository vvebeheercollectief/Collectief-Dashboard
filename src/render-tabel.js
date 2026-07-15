// ══════════════════════════════════════
//  RENDER-TABEL — generieke tabel/paginering (thead, tbody, rij-render, paginatie)
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, prioBadge, persBadges, subBadge, offProg, emptyRow, berekenPrioriteit, opvolgStatus, _verschilInKalenderdagen, _vandaagAmsterdam, STIL_DREMPEL_DAGEN } from "./util.js";
import { SECS, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkGeselecteerd } from "./bulk.js";
import { offerteAannSamenvatting, offerteAannemerPaneel } from "./render-offerte.js";

// ══════════════════════════════════════
//  TABLE HELPERS
// ══════════════════════════════════════
// Optionele 4e parameter maakt kolomkoppen sorteerbaar: {active:{key,asc}, keyFor:(label)=>key|null}.
// Sorteerbare koppen worden een echte knop (toetsenbord-bedienbaar) met pijl + aria-sort op de th.
function renderThead(id,cols,css,sort){
  const kf=sort&&sort.keyFor;
  document.getElementById(id).innerHTML=`<tr>${cols.map(c=>{
    const key=kf?kf(c):null;
    if(!key) return `<th style="${css}">${c}</th>`;
    const aan=!!(sort.active&&sort.active.key===key);
    const richting=aan?(sort.active.asc?'ascending':'descending'):'none';
    const uitleg=aan?(sort.active.asc?'nu oplopend — klik voor aflopend':'nu aflopend — klik voor standaardvolgorde'):'klik om te sorteren';
    return `<th style="${css}" aria-sort="${richting}"><button type="button" class="th-sort${aan?' aan':''}" data-action="ntd-sorteer" data-key="${key}" title="Sorteren op ${c} (${uitleg})">${c}<span class="th-pijl" aria-hidden="true">${aan?(sort.active.asc?'▲':'▼'):''}</span></button></th>`;
  }).join('')}</tr>`;
}

function renderTbody(tbodyId,rows,sec,page,isAf,filtered){
  // Clamp de pagina: krimpt de dataset (bv. collega haalt rijen weg) tot onder het
  // huidige paginanummer, dan toonden we anders een lege lijst terwijl er wél data is.
  const p=Math.min(Math.max(1,page),Math.max(1,Math.ceil(rows.length/PG)));
  const sl=rows.slice((p-1)*PG,p*PG);
  const el=document.getElementById(tbodyId);
  // Lege-rij colspan dynamisch: af-tabel heeft 6 kolommen, NTD = cols+1 (+1 in bulk).
  const leegCols=isAf?6:(SECS[sec].cols.length+1+(state.bulkMode?1:0));
  if(!sl.length){el.innerHTML=`<tr><td colspan="${leegCols}">${emptyRow(leegCols,true,filtered)}</td></tr>`;return}
  if(isAf){el.innerHTML=sl.map(r=>rowAf(r,sec)).join('');return}
  // Drie groepen (Fase 4): actief / in behandeling / weggelegd
  const grpOf = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
  const main=sl.filter(r=>grpOf(r)===0);
  const ib=sl.filter(r=>grpOf(r)===1);
  const wg=sl.filter(r=>grpOf(r)===2);
  // Groeptellingen over álle pagina's i.p.v. alleen de huidige slice.
  const ibAll=rows.filter(r=>grpOf(r)===1).length, wgAll=rows.filter(r=>grpOf(r)===2).length;
  const cols=SECS[sec].cols.length+1+(state.bulkMode?1:0);
  let html=main.map(r=>rowNtd(r,sec)).join('');
  if(ib.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">▸ In behandeling (${ibAll})</td></tr>`;
    html+=ib.map(r=>rowNtd(r,sec)).join('');
  }
  if(wg.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">⏸ Weggelegd (${wgAll}) — komt terug op de opvolgdatum</td></tr>`;
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
    ?`<td class="bulk-cel"><button type="button" class="cb${bulkGeselecteerd(r)?' aan':''}" data-action="bulk-vink" data-rid="${rid}" role="checkbox" aria-checked="${bulkGeselecteerd(r)}" aria-label="Selecteer rij"></button></td>`
    :'';
  const editBtn=`<div class="acts"><button class="act-bw act-ico" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="act-bw act-ico" data-action="taak-wegleggen" data-rid="${rid}" title="Wegleggen / opvolgdatum" aria-label="Wegleggen of opvolgdatum"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/></svg></button><button class="act-af act-ico" data-action="taak-afronden" data-rid="${rid}" title="Afronden" aria-label="Afronden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></button></div>`;
  let cells='';
  const _stilDagen = bepaalStil(r, sec);
  // De offerte-tab is bewust kaal (v6.2): daar geen berekend stil-label. De andere secties
  // houden 'm wél — daar is het hun signaal dat een taak stil blijft liggen.
  const stilPill = (_stilDagen !== null && sec !== 'OFFERTE-TRAJECTEN')
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
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt)}">${esc(r.actiepunt)}</span>${extraPills}</td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar)}</td>
        <td>${prioBadge(r, 'OPPAKKEN')}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    case'VERGADERVERZOEKEN':
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}</td>
        <td><span class="badge" style="background:var(--am-l);color:var(--am)">${esc(r.periode||r.agendapunten||'')}</span></td>
        <td class="cell-txt"><span class="ct" title="${esc(r.agendapunten||r.actiepunt||'')}">${esc(r.agendapunten||r.actiepunt||'')}</span>${extraPills}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td>${prioBadge(r, 'VERGADERVERZOEKEN')}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    case'OFFERTE-TRAJECTEN':
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}</td>
        <td class="cell-sm">${esc(r.datumAangevraagd||'')}</td>
        <td>${offProg(r.offertes)}<div class="of-aann-tbl-tog">${offerteAannSamenvatting(r)}</div></td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'OFFERTE-TRAJECTEN')}
        <td>${prioBadge(r, 'OFFERTE-TRAJECTEN')}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</td>
        <td>${editBtn}</td>`;
      break;
    case'LOD':
      cells=`<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt||'')}">${esc(r.actiepunt||'')}</span>${extraPills}</td>
        <td class="cell-txt" style="font-style:italic"><span class="ct" title="${esc(r.status||'')}">${esc(r.status||'')}</span></td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'LOD')}
        <td>${prioBadge(r, 'LOD')}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
  }
  const { teLaat: rowTeLaat, prioriteit: rowPrio } = berekenPrioriteit(r.deadline, sec);
  const prioAttr = ` data-prio="${(rowPrio||'geen').toLowerCase()}"`;
  const rowCls = [
    r.inBehandeling === 'TRUE' ? 'ib-row' : '',
    rowTeLaat ? 'row-telaat' : '',
    ov.weggelegd ? 'snooze-row' : '',
    state.expandedRows.has(''+r._row) ? 'expanded' : ''
  ].filter(Boolean).join(' ');
  const aannRow = (sec==='OFFERTE-TRAJECTEN' && state.offerteAannOpen.has(r.code))
    ? `<tr class="of-aann-tr"><td colspan="${(state.bulkMode?1:0)+SECS[sec].cols.length+1}">${offerteAannemerPaneel(r)}</td></tr>`
    : '';
  return `<tr class="${rowCls}" data-row="${r._row}"${prioAttr}>${bulkCel}${cells}</tr>${aannRow}`;
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
  if(tp<=1){pgs[doel]=1;el.innerHTML='';return}
  // Clamp + persisteer: na het krimpen van de dataset blijft een te hoog paginanummer
  // anders hangen (lege lijst). Zo corrigeert het zich vanzelf.
  cur=Math.min(Math.max(1,cur),tp); pgs[doel]=cur;
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

export { renderThead, renderTbody, bepaalStil, deadlineCel, rowNtd, rowAf, renderPag };
