// ══════════════════════════════════════
//  RENDER-TABEL — generieke tabel/paginering (thead, tbody, rij-render, paginatie)
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, vveCodeSpan, persBadges, subBadge, taakActieKnoppen, offProg, emptyRow, berekenPrioriteit, opvolgStatus, taakTitel, kortDatum, _verschilInKalenderdagen, _vandaagAmsterdam, STIL_DREMPEL_DAGEN, aannSleutel } from "./util.js";
import { SECS, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkGeselecteerd } from "./bulk.js";
import { offerteAannSamenvatting, offerteAannemerPaneel } from "./render-offerte.js";
import { ico } from "./icons.js";
import { faseRijHtml } from "./subsidie-fase.js";
import { zichtbareKop, bundelVan, zelfdeTaak } from "./bundel.js";
import { bundelKopExtra, bundelPaneelHtml, bundelMerkje, STAPEL_GREEP } from "./render-bundel.js";

// Zie de toelichting bij het gebruik in rowNtd().
const GEEN_STIL_PILL = ['OFFERTE-TRAJECTEN', 'SUBSIDIE-TRAJECTEN'];

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
  // Eén opzoeklijst voor de hele render i.p.v. een logboekscan per rij (zie bouwStilIndex).
  _zetStilIndex(bouwStilIndex(D.logboek, sec));
  try{
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
    html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('chevronRechts',12)} In behandeling (${ibAll})</td></tr>`;
    html+=ib.map(r=>rowNtd(r,sec)).join('');
  }
  if(wg.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('pauze',12)} Weggelegd (${wgAll}) — komt terug op de opvolgdatum</td></tr>`;
    html+=wg.map(r=>rowNtd(r,sec)).join('');
  }
  el.innerHTML=html;
  } finally { _zetStilIndex(null); }   // index nooit laten overleven: hij mag niet verouderen
}

// Eén pass over het logboek: VvE-code → de logregels van DEZE sectie. Voorheen scande
// bepaalStil het hele logboek (±1.300 regels) opnieuw voor élke getoonde taakrij; op een pagina
// van 25 rijen dus 25 keer. De index wordt per render één keer gebouwd en daarna weggegooid,
// zodat hij nooit kan verouderen ten opzichte van D.logboek.
// Bewust ZONDER de timestamps vooraf te parsen: alle ~1.300 Date-objecten vooraf maken is bij de
// werkelijke verhouding (een handvol in-behandeling-rijen per pagina) juist trager dan de scan
// die het vervangt. Het aantal Date-objecten blijft zo exact gelijk; alleen het herhaalde
// doorlopen verdwijnt. Puur, dus los testbaar.
function bouwStilIndex(logboek, sec){
  const m = new Map();
  (logboek || []).forEach(e => {
    if (sec && e.sectie !== sec) return;
    const v = m.get(e.code);
    if (v) v.push(e); else m.set(e.code, [e]);
  });
  return m;
}

// Index van de lopende render. null = geen index → bepaalStil valt terug op de oude scan, zodat
// losse aanroepers (en de tests) ongemoeid blijven werken.
let _stilIndex = null;
const _zetStilIndex = ix => { _stilIndex = ix || null; };

function bepaalStil(r, sec){
  if (opvolgStatus(r).weggelegd) return null; // weggelegd = bewust geparkeerd, niet stil (Fase 4)
  if (r.inBehandeling !== 'TRUE') return null;
  const entries = _stilIndex
    ? (_stilIndex.get(r.code) || [])
    : (D.logboek || []).filter(e => e.code === r.code && (!sec || e.sectie === sec));
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
  const editBtn=`<div class="acts">${taakActieKnoppen(rid)}</div>`;
  let cells='';
  const _stilDagen = bepaalStil(r, sec);
  // De offerte-tab is bewust kaal (v6.2): daar geen berekend stil-label. De andere secties
  // houden 'm wél — daar is het hun signaal dat een taak stil blijft liggen.
  // De pillen staan in de tekstkolom en aten daar breedte op die het actiepunt beter kan
  // gebruiken (v8.10). Daarom kort: het icoon draagt de betekenis, de volledige uitleg
  // staat in de title. "Stil 5d" → "5d", "Opvolgen vandaag" → "Vandaag", en de
  // wegleg-datum kort ("28 jul") i.p.v. voluit.
  // Secties waar stilliggen geen signaal is maar de normale toestand: bij offertes
  // wacht je op een aannemer, bij subsidie op de gemeente. Een klokje bij elke rij
  // leert de gebruiker alleen maar om het klokje te negeren.
  const stilPill = (_stilDagen !== null && !GEEN_STIL_PILL.includes(sec))
    ? `<span class="pill-stil" data-action="taak-bewerken" data-rid="${rid}" title="Stil: geen activiteit in ${_stilDagen} dagen">${ico('belUit',11)}${_stilDagen}d</span>`
    : '';
  const ov = opvolgStatus(r);
  const opvolgPill = ov.vandaag
    ? `<span class="pill-opvolg" data-action="taak-wegleggen" data-rid="${rid}" title="Opvolgen vandaag — opvolgdatum ${esc(r.opvolgdatum)}">${ico('bel',11)}Vandaag</span>`
    : ov.weggelegd
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}" title="Weggelegd tot ${esc(r.opvolgdatum)}">${ico('pauze',11)}${esc(kortDatum(r.opvolgdatum))}</span>`
      : '';
  const extraPills = stilPill + opvolgPill;
  // ── Takenbundel ──
  // state._bundelWeergave wordt door renderNtd voor déze render klaargezet (zie `bundelWeergave`):
  // de index plus `stapel`/`merk`. Via state en niet via een parameter: renderTbody geeft alleen
  // rij + sectie door.
  const _bw    = state._bundelWeergave || null;
  const _ix    = _bw ? _bw.ix : null;
  const _leden = _ix ? bundelVan(_ix, r) : null;
  const _kop   = _leden ? zichtbareKop(_leden) : null;
  // Een kop-rij bestáát alleen in gestapelde weergave; plat tekent élk lid als gewone rij. Deze ene
  // vlag houdt chevron, telpill, stapelrandjes en paneel bij elkaar: ze hangen alle vier aan _isKop.
  //
  // 'Ben ik zelf de kop' via `zelfdeTaak`, net als `wordtGeabsorbeerd` en `bundelMerkje`. Drie
  // plekken beantwoorden dezelfde vraag en moeten hem dus op dezelfde manier beantwoorden; op
  // objectidentiteit zou déze plek als enige afwijken, en het gevolg daarvan is stil. Komt de kop
  // uit een ándere momentopname dan de rij (een ander object met hetzelfde taaknummer), dan bleef
  // de kop-rij wel staan maar zónder chevron, telpill en paneel, terwijl `absorbeer` — die wél op
  // taaknummer vergelijkt — zijn leden uit de lijst haalt: de subtaken verdwijnen dan uit beeld.
  // De prijs is een randgeval de andere kant op: dragen twee verschillende rijen hetzelfde
  // taaknummer (een dubbele rij in de Sheet, precies wat `checkNummers` aan de gebruiker meldt),
  // dan tekenen ze allebei een paneel. Dubbel getoond is zichtbare ruis; weggeabsorbeerd zonder
  // paneel is verdwenen werk.
  const _isKop = !!(_bw && _bw.stapel && _kop && zelfdeTaak(_kop.r, r));
  const _extra = _isKop ? bundelKopExtra(_leden, _kop) : { chevron:'', pill:'', open:false };
  const bdlChev = _extra.chevron;
  // Op de kop de telpill; verder het bundel-merkje — wie dat krijgt beslist bundelMerkje zelf.
  const bdlNaam = _isKop ? _extra.pill : bundelMerkje(r, _bw, sec);
  // Het sleep-handvat om deze rij onder een andere te hangen. Het hangt aan dezelfde `stapel`-vlag
  // als de rest van de gestapelde weergave: bij een zoekterm, filter, kolomsortering of
  // bulk-selectie staat die uit en kan er niet gestapeld worden (§4.2), dus dan hoort er ook geen
  // handvat te staan dat het tegendeel belooft.
  // Bewust dezelfde `_bw.stapel` die `initStapelSlepen` via zijn `magSlepen` leest (main.js), en
  // geen eigen afleiding ernaast: zo kunnen het zichtbare handvat en het toegestane gebaar niet uit
  // elkaar lopen.
  const bdlGreep = (_bw && _bw.stapel) ? STAPEL_GREEP : '';
  switch(sec){
    case'OPPAKKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt)}">${esc(r.actiepunt)}</span>${extraPills}</td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar)}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    case'VERGADERVERZOEKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td><span class="badge" style="background:var(--am-l);color:var(--am)">${esc(r.periode||r.agendapunten||'')}</span></td>
        <td class="cell-txt"><span class="ct" title="${esc(r.agendapunten||r.actiepunt||'')}">${esc(r.agendapunten||r.actiepunt||'')}</span>${extraPills}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    case'OFFERTE-TRAJECTEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-sm">${esc(r.datumAangevraagd||'')}</td>
        <td>${offProg(r.offertes)}<div class="of-aann-tbl-tog">${offerteAannSamenvatting(r)}</div></td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'OFFERTE-TRAJECTEN')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</td>
        <td>${editBtn}</td>`;
      break;
    case'LOD':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt||'')}">${esc(r.actiepunt||'')}</span>${extraPills}</td>
        <td class="cell-txt" style="font-style:italic"><span class="ct" title="${esc(r.status||'')}">${esc(r.status||'')}</span></td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'LOD')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    // Zes kolommen, niet zeven: Opmerkingen bestaat wel als veld (kolom G) maar staat
    // bewust niet in de tabel — de fase-bolletjes hebben die ruimte nodig en de rij
    // moet rustig blijven. Houd dit gelijk aan SECS['SUBSIDIE-TRAJECTEN'].cols.
    case'SUBSIDIE-TRAJECTEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.subsidie||'')}">${esc(r.subsidie||'')}</span>${extraPills}</td>
        <td>${faseRijHtml(r.subsidieFase, rid)}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'SUBSIDIE-TRAJECTEN')}
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
  const aannRow = (sec==='OFFERTE-TRAJECTEN' && state.offerteAannOpen.has(aannSleutel(r)))
    ? `<tr class="of-aann-tr"><td colspan="${(state.bulkMode?1:0)+SECS[sec].cols.length+1}">${offerteAannemerPaneel(r)}</td></tr>`
    : '';
  // Dicht: twee 'papierrandjes' onder de rij. Open: het bundelpaneel.
  // `_extra.open` komt van bundelKopExtra, dat er de chevron mee zet — één antwoord voor de knop
  // en voor wat eronder komt, zodat die twee niet uit elkaar kunnen lopen.
  let bdlNa = '';
  if (_isKop){
    const kolommen = SECS[sec].cols.length + 1 + (state.bulkMode?1:0);
    bdlNa = _extra.open
      ? `<tr class="bdl-tr"><td colspan="${kolommen}">${bundelPaneelHtml(_leden, _kop)}</td></tr>`
      // `aria-hidden` op de twee stapelrandjes: het zijn zuiver decoratieve rijen met een lege cel,
      // dus zonder dat meldt een schermlezer na élke dichtgeklapte bundel twee lege rijen en klopt
      // het rijaantal dat hij noemt niet meer met het aantal taken. Visueel verandert er niets.
      // De paneelrij hierboven krijgt hem juist NIET — daar staat echte, bedienbare inhoud in.
      : `<tr class="bdl-peek" aria-hidden="true"><td colspan="${kolommen}"><span class="l"></span></td></tr>`
      + `<tr class="bdl-peek d2" aria-hidden="true"><td colspan="${kolommen}"><span class="l"></span></td></tr>`;
  }
  // `data-rid` op de <tr>: het slepen (Taak 15) moet van de gesleepte rij naar het taak-object
  // komen. `rid` is een directe index in state._rowCache — precies het mechanisme waarmee elke
  // andere rij-actie (bewerken, wegleggen, afronden, bulk) hier al werkt. Op `_row` zoeken zou
  // een scan door alle vijf de secties van D.ntd worden voor iets wat hier al bij de hand is.
  return `<tr class="${rowCls}" data-row="${r._row}" data-rid="${rid}"${prioAttr}>${bulkCel}${cells}</tr>${aannRow}${bdlNa}`;
}

function rowAf(r,sec){
  const css=SECS[sec].css;
  return`<tr>
    <td>${vveCodeSpan(r.code, css)}</td>
    <td class="cell-name">${esc(r.naam)}</td>
    <td class="cell-txt">${esc(taakTitel(r,r._sec))}</td>
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

export { renderThead, renderTbody, bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf, renderPag };
