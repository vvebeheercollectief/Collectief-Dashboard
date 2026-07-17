// ══════════════════════════════════════
//  RENDER-OVERIG — Ontwikkeling + Logboek
// ══════════════════════════════════════
import { esc, displayName, persBadges, emptyRow, _vandaagAmsterdam, vveCodeSpan } from "./util.js";
import { ico } from "./icons.js";
import { PG, SID } from "./config.js";
import { state, D, pgs } from "./state.js";
import { ensureToken } from "./auth.js";
import { writeRange, appendRange, assertRowMatch } from "./api.js";
import { renderThead, renderPag } from "./render-lijsten.js";
import { getSheetIds, setv, gv, insertAndWriteRow } from "./crud.js";
import { loadAll, backgroundWrite } from "./data.js";
import { getCurrentWho, showToast, showUndoToast } from "./notifications.js";
import { animateRowOut } from "./anim.js";
import { renderVve } from "./render-vve.js";
// (kringverwijzing render-overig ⇄ render-vve: zelfde patroon als render-vve ⇄ ui/kenmerken —
//  live bindings, en renderVve is een gehoisde functiedeclaratie die pas op runtime wordt aangeroepen)

// ══════════════════════════════════════
//  ONTWIKKELING
// ══════════════════════════════════════
const ONTW_CATS=['Opmerkingen','Verbeteringen','Vragen aan Cihan','Ideeën'];
const ONTW_CAT_COLORS={'Opmerkingen':'var(--ac)','Verbeteringen':'var(--gn)','Vragen aan Cihan':'var(--am)','Ideeën':'var(--pu)'};

function parseOntw(rows){
  if(!rows||rows.length<2) return [];
  return rows.slice(1).map((r,i)=>{
    const titel=(r[0]||'').trim();
    if(!titel) return null;
    return{titel,categorie:(r[1]||'').trim(),inhoud:(r[2]||'').trim(),door:(r[3]||'').trim(),datum:(r[4]||'').trim(),status:(r[5]||'').trim()||'Open',_row:i+2};
  }).filter(Boolean);
}

function renderOntw(){
  const q=(document.getElementById('s-ontw')?.value||'').toLowerCase();
  const cats=['Alles',...ONTW_CATS,'Afgerond'];
  const openItems=D.ontw.filter(r=>r.status!=='Afgerond');
  const doneItems=D.ontw.filter(r=>r.status==='Afgerond');
  document.getElementById('ontw-tabs').innerHTML=cats.map(c=>{
    let cnt;
    if(c==='Alles') cnt=openItems.length;
    else if(c==='Afgerond') cnt=doneItems.length;
    else cnt=openItems.filter(r=>r.categorie===c).length;
    const activeStyle = c===state.activeOntw
      ? (c==='Afgerond' ? '--sec:var(--gn);--sec-l:var(--gn-l);--sec-b:var(--gn-b)' : '--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)')
      : '';
    return`<button type="button" class="tab ${c===state.activeOntw?'on':''}" role="tab" aria-selected="${c===state.activeOntw}" style="${activeStyle}" data-action="ontw-cat" data-cat="${esc(c)}">${c}<span class="cnt">${cnt}</span></button>`;
  }).join('');

  let rows;
  if(state.activeOntw==='Afgerond') rows=doneItems;
  else if(state.activeOntw==='Alles') rows=openItems;
  else rows=openItems.filter(r=>r.categorie===state.activeOntw);
  if(q) rows=rows.filter(r=>`${r.titel} ${r.inhoud} ${r.categorie} ${r.door}`.toLowerCase().includes(q));

  renderThead('ontw-thead',['Titel','Categorie','Inhoud','Door','Datum','Status',''],'--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)');
  const sl=rows.slice((pgs.ontw-1)*PG,pgs.ontw*PG);
  const el=document.getElementById('ontw-tbody');
  if(!sl.length){el.innerHTML=`<tr><td colspan="7">${emptyRow(7,true)}</td></tr>`;return}
  el.innerHTML=sl.map(r=>{
    const rid=state._rowCache.length;state._rowCache.push(Object.assign({},r,{_sec:'ONTW'}));
    const clr=ONTW_CAT_COLORS[r.categorie]||'var(--mut)';
    return`<tr data-row="${r._row}">
      <td class="cell-name">${esc(r.titel)}</td>
      <td><span class="badge" style="background:color-mix(in srgb,${clr} 15%,transparent);color:${clr}">${esc(r.categorie)}</span></td>
      <td class="cell-txt">${r.inhoud?`<span style="font-size:12px">${esc(r.inhoud.substring(0,80))}${r.inhoud.length>80?'…':''}</span>`:''}</td>
      <td>${persBadges(r.door)}</td>
      <td class="cell-sm">${esc(r.datum)}</td>
      <td><span class="badge status-${esc((r.status||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${r.status==='Afgerond'?ico('vinkCirkel'):ico('zandloper')} ${esc(r.status)}</span></td>
      <td><button class="btn-edit" data-action="ontw-bewerken" data-rid="${rid}" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
  renderPag('ontw-pag',rows.length,pgs.ontw,'ontw');
}
function setOntw(c){state.activeOntw=c;pgs.ontw=1;renderOntw()}

function openOntwModal(isEdit, rowData){
  state.ontwEditMode=!!isEdit;
  state.ontwEditRow=rowData||null;
  document.getElementById('ontw-m-title').textContent=isEdit?'Item bewerken':'Nieuw item';
  document.getElementById('ontw-m-submit-lbl').textContent=isEdit?'Opslaan':'Toevoegen';
  document.getElementById('ontw-m-del').style.display=isEdit?'inline-flex':'none';
  if(isEdit&&rowData){
    setv('ontw-m-titel',rowData.titel);
    setv('ontw-m-cat',rowData.categorie);
    setv('ontw-m-inhoud',rowData.inhoud);
    setv('ontw-m-status',rowData.status||'Open');
  } else {
    setv('ontw-m-titel','');setv('ontw-m-cat','');setv('ontw-m-inhoud','');setv('ontw-m-status','Open');
  }
  document.getElementById('ontw-modal-bg').classList.add('open');
}
function closeOntwModal(){document.getElementById('ontw-modal-bg').classList.remove('open')}

function editOntwItem(idx){
  const r=state._rowCache[idx];
  if(r) openOntwModal(true,r);
}

async function submitOntwItem(){
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const titel=gv('ontw-m-titel');
  const cat=gv('ontw-m-cat');
  if(!titel){alert('Titel is verplicht.');return}
  if(!cat){alert('Categorie is verplicht.');return}
  const inhoud=gv('ontw-m-inhoud');
  const status=gv('ontw-m-status')||'Open';
  const who=getCurrentWho()||'?';
  const d=new Date();
  const today=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const values=[titel,cat,inhoud,who,today,status];
  try{
    if(state.ontwEditMode&&state.ontwEditRow?._row){
      await assertRowMatch(state.ontwEditRow._row, state.ontwEditRow.titel, 'Ontwikkeling'); // bescherming: rij nog hetzelfde item vóór overschrijven
      await writeRange(`'Ontwikkeling'!A${state.ontwEditRow._row}:F${state.ontwEditRow._row}`,values);
    } else {
      await appendRange("'Ontwikkeling'!A:F",values);
    }
    closeOntwModal();
    await loadAll();
  }catch(e){alert('Fout: '+e.message)}
}

async function deleteOntwItem(){
  if(!state.ontwEditRow) return;
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const r=state.ontwEditRow;
  const values=[r.titel||'',r.categorie||'',r.inhoud||'',r.door||'',r.datum||'',r.status||''];
  const oudeRow=r._row;
  const tr=document.querySelector(`#ontw-tbody tr[data-row="${oudeRow}"]`);
  // optimistisch: lokaal weg + rij-indexen van latere items bijwerken
  // LET OP: ontwEditRow is een kloon uit _rowCache → het échte object op _row zoeken
  const pos=D.ontw.findIndex(x=>x._row===oudeRow);
  const echte=pos>-1?D.ontw[pos]:null;
  if(pos>-1) D.ontw.splice(pos,1);
  D.ontw.forEach(x=>{ if(x._row>oudeRow) x._row--; });
  closeOntwModal();
  showUndoToast('Item verwijderd', r.titel||'', ()=>undoOntwDelete(values, r.titel), 'prullenbak');
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Ontwikkeling'];
      if(sheetId==null) throw new Error('Sheet "Ontwikkeling" niet gevonden');
      await assertRowMatch(oudeRow, r.titel, 'Ontwikkeling'); // bescherming: rij nog hetzelfde item vóór verwijderen
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
      });
      if(!resp.ok){const e=await resp.json();const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
    },
    ()=>{ if(echte&&D.ontw.indexOf(echte)===-1){ D.ontw.forEach(x=>{ if(x._row>=oudeRow) x._row++; }); D.ontw.splice(Math.min(pos<0?D.ontw.length:pos,D.ontw.length),0,echte); } },
    'Verwijderen mislukt'
  );
  // rode puls + fade op de oude rij; daarná pas hertekenen
  animateRowOut(tr,'rij-puls-rood',renderOntw);
}

async function undoOntwDelete(values, titel){
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  try{
    await state._writeChain;
    await appendRange("'Ontwikkeling'!A:F", values);
    showToast('Ongedaan gemaakt', `"${titel||''}" teruggezet`, 'var(--am)', 'ongedaan');
    await loadAll();
  }catch(e){alert('Undo fout: '+e.message)}
}

// ══════════════════════════════════════
//  LOGBOEK — parse, render & schrijf
// ══════════════════════════════════════
// 'Bewerkt' is ruis: elke taak-opslag schreef er één (395 van de 1177 regels). Sinds v6.3
// schrijven we ze niet meer; dit filter houdt de bestaande regels — en alles wat nog via de
// webhook binnen kan komen — uit álle weergaves én uit de activiteitsberekening van
// bepaalStil/dagenStil.
const LOG_VERBORGEN = new Set(['Bewerkt']);

function parseLogboek(rows){
  if(!rows||rows.length<2) return [];
  // _row komt uit de RUWE index: het filter hieronder mag het Sheet-rijnummer niet laten
  // opschuiven, want daar hangt bewerken/verwijderen op de Logboek-pagina aan.
  return rows.slice(1).map((r,i)=>{
    const c=j=>((r&&r[j])||'').trim();
    return {
      _row:i+2,
      timestamp:c(0), code:c(1), sectie:c(2), actie:c(3),
      veld:c(4), oudeWaarde:c(5), nieuweWaarde:c(6), gebruiker:c(7)
    };
  }).filter(o=>o.timestamp&&!LOG_VERBORGEN.has(o.actie)).reverse();
}

function fmtLogTs(iso){
  try{
    const d=new Date(iso);
    if(isNaN(d)) return iso;
    return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  }catch(e){return iso}
}

function actieBadge(actie){
  const map={
    'Afgerond':['--sec:var(--gn);--sec-l:var(--gn-l)',ico('vink')],
    'Verwijderd':['--sec:var(--rd);--sec-l:var(--rd-l)',ico('kruis')],
    'Aangemaakt':['--sec:var(--pu);--sec-l:var(--pu-l)',ico('plus')],
    'Teruggezet':['--sec:var(--am);--sec-l:var(--am-l)',ico('ongedaan')],
    'Behandelaar gewijzigd':['--sec:var(--ac);--sec-l:var(--ac-l)',ico('persoon')],
    'Aangemaakt (sheet)':['--sec:var(--pu);--sec-l:var(--pu-l)',ico('plus')],
    'Opmerking':['--sec:var(--am);--sec-l:var(--am-l)',ico('chat')],
    'Contact':['--sec:var(--ac);--sec-l:var(--ac-l)',ico('telefoon')],
    'Kenmerk':['--sec:var(--pu);--sec-l:var(--pu-l)',ico('klembord')],
  };
  const[css,badgeIco]=map[actie]||['',''];
  return css?`<span class="badge" style="background:var(--sec-l);color:var(--sec);${css}">${badgeIco} ${esc(actie)}</span>`:`<span class="badge">${esc(actie)}</span>`;
}

// Filterstatus voor de tijdlijn (leeg = alles)

const _LOG_AVKLEUR={Jer:'var(--ac)',Cihad:'var(--pu)',Gabos:'var(--pk)',Cihan:'var(--am)'};
function avatarKleur(naam){ return _LOG_AVKLEUR[naam] || 'var(--nv)'; }

function logDayLabel(iso){
  const d=new Date(iso);
  if(isNaN(d)) return 'Eerder';
  const dag=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const vandaag=_vandaagAmsterdam();
  const verschil=Math.round((vandaag-dag)/86400000);
  if(verschil===0) return 'Vandaag';
  if(verschil===1) return 'Gisteren';
  const s=d.toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}

// Eén zinnengenerator voor alle logregels (gedeeld door Logboek-pagina en VvE-dossier).
// opts.zonderCode → laat de VvE-code weg; in een dossier is die redundant.
function logZin(r, opts){
  const zonderCode=!!(opts&&opts.zonderCode);
  const naam=esc(displayName(r.gebruiker)||'Iemand');
  const chip=vveCodeSpan(r.code, '--sec:var(--ac);--sec-l:var(--ac-l)');
  // "… bij 121027" → in het dossier gewoon niets; anders blijft "bij" bungelen.
  const bij=zonderCode?'':' bij '+chip;
  const staart=zonderCode?'':' '+chip;   // default-geval: chip los achter de ruwe actienaam
  const A=(verb,kleur)=>`<b>${naam}</b> <span class="log-act" style="color:${kleur}">${verb}</span> `;
  switch(r.actie){
    case'Afgerond':            return A('rondde','var(--gn)')+(zonderCode?'een taak':chip)+' af';
    case'Verwijderd':          return A('verwijderde','var(--rd)')+'een taak'+bij;
    case'Teruggezet':          return A('zette','var(--am)')+(zonderCode?'een taak':chip)+' terug';
    case'Opmerking':           return A('noteerde','var(--am)')+(zonderCode?'iets':'bij '+chip);
    case'Behandelaar gewijzigd':return A('wees','var(--ac)')+(zonderCode?'een taak':chip)+' toe';
    case'Aangemaakt':
    case'Aangemaakt (sheet)':  return A('maakte','var(--pu)')+'een nieuwe taak'+bij+(r.nieuweWaarde?` <span style="color:var(--mut)">→ ${esc(r.nieuweWaarde)}</span>`:'');
    case'Contact':             return A('sprak','var(--ac)')+`met ${esc(r.oudeWaarde||'—')}`+bij+` <span style="color:var(--mut)">· ${esc(r.veld||'')}</span>`;
    case'Aangevinkt':          return A('vinkte','var(--gn)')+`<b>${esc(r.veld||'')}</b> aan`+bij;
    case'Uitgevinkt':          return A('vinkte','var(--am)')+`<b>${esc(r.veld||'')}</b> uit`+bij;
    case'Kenmerk':             return A('wijzigde','var(--pu)')+`kenmerk <b>${esc(r.veld||'')}</b>`+bij;
    default:                   return `<b>${naam}</b> — ${esc(r.actie||'')}`+staart;
  }
}

function logTijd(iso){
  const d=new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
}

// Bepaalt of een logregel op de Logboek-pagina thuishoort, en zo ja hoe prominent.
// 'normaal' = onze eigen notities/contacten (volwaardig), 'subtiel' = automatische
// afgerond/aangemaakt (dunne regel), null = ruis (alleen in taak-geschiedenis/VvE-dossier).
function logPaginaSoort(actie){
  const a=(actie||'').trim();
  if(a==='Opmerking'||a==='Contact') return 'normaal';
  if(a==='Afgerond'||a.indexOf('Aangemaakt')===0) return 'subtiel';
  return null;
}

// Eén logregel als HTML (gedeeld door Logboek-pagina en VvE-dossier-feed).
// subtiel=true → compacte grijze regel (alleen Logboek-pagina, voor Afgerond/Aangemaakt).
function logItemHtml(r,subtiel,acties){
  if(subtiel){
    const naam=esc(displayName(r.gebruiker)||'Iemand');
    const code=`<b>${esc(r.code||'—')}</b>`;
    const isAf=r.actie==='Afgerond';
    const zin=isAf
      ? `${naam} rondde ${code} af`
      : `${naam} maakte ${code} aan${r.nieuweWaarde?` <span class="log-mini-meta">→ ${esc(r.nieuweWaarde)}</span>`:''}`;
    const acts=acties?`<span class="log-acts"><button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">${ico('prullenbak')}</button></span>`:'';
    return `<div class="log-mini">
      <span class="log-mini-dot" style="background:${isAf?'var(--gn)':'var(--pu)'}"></span>
      <span class="log-mini-txt">${zin}</span>
      <span class="log-time">${esc(logTijd(r.timestamp))}</span>
      ${acts}
    </div>`;
  }
  if(acties && state.logEdit===r._row) return logEditForm(r);
  let extra='';
  if((r.actie==='Behandelaar gewijzigd'||r.actie==='Kenmerk') && r.veld && (r.oudeWaarde||r.nieuweWaarde)){
    extra=`<div class="log-change"><span class="old">${esc(r.oudeWaarde||'—')}</span><span class="arr">→</span><span class="new">${esc(r.nieuweWaarde||'—')}</span></div>`;
  }
  if((r.actie==='Opmerking'||r.actie==='Contact') && r.nieuweWaarde){
    extra=`<div class="log-note">${esc(r.nieuweWaarde)}</div>`;
  }
  const init=(displayName(r.gebruiker)||'?').charAt(0).toUpperCase();
  const acts=acties?`<span class="log-acts">
    <button class="log-act-btn" data-action="log-bewerken" data-row="${r._row}" title="Bewerken" aria-label="Regel bewerken">${ico('potlood')}</button>
    <button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">${ico('prullenbak')}</button>
  </span>`:'';
  return `<div class="log-item">
    <span class="log-av" style="background:${avatarKleur(displayName(r.gebruiker))}">${esc(init)}</span>
    <div class="log-body"><div class="log-line">${logZin(r)}</div>${extra}</div>
    <span class="log-time">${esc(logTijd(r.timestamp))}</span>
    ${acts}
  </div>`;
}

// Pure (testbaar): verschuif _row van entries ONDER fromRow met delta.
// Gebruikt na invoegen/verwijderen van een Sheet-rij, zodat een volgende
// optimistische actie de juiste rij raakt (analoog aan _shiftNtdRows).
function _shiftRows(entries, fromRow, delta){
  (entries||[]).forEach(e=>{ if(e._row>fromRow) e._row+=delta; });
}
function _shiftLogboekRows(fromRow, delta){ _shiftRows(D.logboek, fromRow, delta); }

// Pure (testbaar): welke Sheet-cellen worden geschreven bij het bewerken van een
// logregel. Opmerking → alleen tekst (kol G). Contact → soort (E), wie (F), tekst (G).
function logEditWrite(actie, row, soort, wie, tekst){
  return actie==='Contact'
    ? { range:`'Logboek'!E${row}:G${row}`, values:[soort, wie, tekst] }
    : { range:`'Logboek'!G${row}`,        values:[tekst] };
}

// Korte omschrijving voor de verwijder-undo-toast.
function logDeleteLabel(r){
  const t=(r.nieuweWaarde||r.actie||'').toString();
  return `${r.code||'—'} · ${t.length>40?t.slice(0,40)+'…':t}`;
}

// Spiegelt de contact-composer op de VvE-pagina (lokaal gehouden om een
// circulaire import render-overig ↔ render-vve te vermijden).
const LOG_CONTACT_SOORTEN=[['Telefoon',ico('telefoon')],['E-mail',ico('envelop')],['Gesprek',ico('gesprek')],['Notitie',ico('potlood')]];
const LOG_WIE_OPTIES=['Bewoner/eigenaar','Bestuur','Leverancier','Overig'];

function logEditForm(r){
  const isContact=r.actie==='Contact';
  const sel=state.logEditSoort||r.veld||'Telefoon';
  const contactRij=isContact?`<div class="log-edit-rij">
    <div class="dos-chips">${LOG_CONTACT_SOORTEN.map(([s,sIco])=>
      `<button type="button" class="soort-chip${sel===s?' aan':''}" data-action="log-soort" data-soort="${esc(s)}">${sIco} ${esc(s)}</button>`).join('')}</div>
    <select id="log-edit-wie" class="log-edit-wie" title="Met wie?">${LOG_WIE_OPTIES.map(w=>
      `<option${(r.oudeWaarde||'Overig')===w?' selected':''}>${esc(w)}</option>`).join('')}</select>
  </div>`:'';
  return `<div class="log-item"><div class="log-edit" data-row="${r._row}">
    <textarea id="log-edit-tekst" class="log-edit-tekst" rows="2">${esc(r.nieuweWaarde||'')}</textarea>
    ${contactRij}
    <div class="log-edit-knoppen">
      <button class="btn btn-sec btn-sm" data-action="log-annuleren">Annuleren</button>
      <button class="btn btn-pri btn-sm" data-action="log-opslaan" data-row="${r._row}">Opslaan</button>
    </div>
  </div></div>`;
}

// Bewerken/verwijderen kan vanaf twee plekken: de Logboek-pagina en het dossier-logboek
// op de VvE-pagina. Ververs dus de pagina waar de gebruiker daadwerkelijk staat.
function _rerenderLog(){
  if(document.getElementById('page-vve')?.classList.contains('active')) renderVve();
  else renderLogboek();
}

function editLogboek(row){
  state.logEdit=row;
  const e=(D.logboek||[]).find(x=>x._row===row);
  state.logEditSoort=e?e.veld:null;
  _rerenderLog();
  setTimeout(()=>{ const t=document.getElementById('log-edit-tekst'); if(t){ t.focus(); t.setSelectionRange(t.value.length,t.value.length); } },0);
}

function cancelLogboek(){ state.logEdit=null; state.logEditSoort=null; _rerenderLog(); }

function setLogSoort(soort){
  state.logEditSoort=soort;
  document.querySelectorAll('.log-edit .soort-chip').forEach(c=>c.classList.toggle('aan', c.dataset.soort===soort));
}

async function saveLogboek(row){
  const entry=(D.logboek||[]).find(e=>e._row===row);
  if(!entry) return;
  const tekst=(document.getElementById('log-edit-tekst')?.value||'').trim();
  if(!tekst){ alert('De tekst mag niet leeg zijn.'); return; }
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const isContact=entry.actie==='Contact';
  const soort=isContact ? (state.logEditSoort||entry.veld||'Telefoon') : entry.veld;
  const wie=isContact ? (document.getElementById('log-edit-wie')?.value||entry.oudeWaarde||'Overig') : entry.oudeWaarde;
  const oud={veld:entry.veld, oudeWaarde:entry.oudeWaarde, nieuweWaarde:entry.nieuweWaarde};
  // optimistisch bijwerken + sluiten
  if(isContact){ entry.veld=soort; entry.oudeWaarde=wie; }
  entry.nieuweWaarde=tekst;
  state.logEdit=null; state.logEditSoort=null;
  _rerenderLog();
  const w=logEditWrite(entry.actie, row, soort, wie, tekst);
  backgroundWrite(
    async ()=>{ await assertRowMatch(row, entry.timestamp, 'Logboek'); await writeRange(w.range, w.values); },
    ()=>{ entry.veld=oud.veld; entry.oudeWaarde=oud.oudeWaarde; entry.nieuweWaarde=oud.nieuweWaarde; },
    'Bewerken mislukt'
  );
}

async function deleteLogboek(row){
  const entries=D.logboek||[];
  const idx=entries.findIndex(e=>e._row===row);
  if(idx<0) return;
  const entry=entries[idx];
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const vals=[entry.timestamp, entry.code, entry.sectie, entry.actie, entry.veld, entry.oudeWaarde, entry.nieuweWaarde, entry.gebruiker];
  const oudeRow=entry._row;
  // optimistisch: lokaal weg + rij-indexen meeschuiven + edit sluiten
  entries.splice(idx,1);
  _shiftLogboekRows(oudeRow,-1);
  if(state.logEdit===row){ state.logEdit=null; state.logEditSoort=null; }
  _rerenderLog();
  showUndoToast('Logregel verwijderd', logDeleteLabel(entry), ()=>undoDeleteLog(vals, oudeRow), 'prullenbak');
  // Idempotentie-vlag: deleteDimension is positie-gebaseerd en NIET idempotent (zie deleteTaskRow).
  let verwijderd=false;
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Logboek'];
      if(sheetId==null) throw new Error('Sheet "Logboek" niet gevonden');
      if(!verwijderd){
        await assertRowMatch(oudeRow, entry.timestamp, 'Logboek'); // rij nog de juiste vóór verwijderen
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',
          headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
        });
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
        verwijderd=true;
      }
    },
    ()=>{ if(entries.indexOf(entry)===-1){ _shiftLogboekRows(oudeRow,+1); entries.splice(Math.min(idx,entries.length),0,entry); } },
    'Verwijderen mislukt'
  );
}

// Undo: rij terugzetten op de oude positie en lokaal vers herladen (zoals taak-undo).
async function undoDeleteLog(vals, oudeRow){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;                         // delete gegarandeerd vóór de re-insert
    await insertAndWriteRow('Logboek', oudeRow-1, vals);
    showToast('Ongedaan gemaakt','Logregel teruggezet','var(--am)','ongedaan');
    await loadAll();                                 // _row-indexen vers uit de Sheet
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

function renderLogboek(){
  // Bescherm half-getypte bewerktekst tegen de 8s-poll (analoog aan de VvE-composer).
  const _editEl=document.getElementById('log-edit-tekst');
  const _editBewaar=(state.logEdit && _editEl)?{
    tekst:_editEl.value,
    wie:document.getElementById('log-edit-wie')?.value
  }:null;
  const q=(document.getElementById('s-logboek')?.value||'').toLowerCase();
  const rows=D.logboek.filter(r=>{
    if(!logPaginaSoort(r.actie)) return false;   // ruis weren — alleen notities/contact + afgerond/aangemaakt
    if(state.logWho && displayName(r.gebruiker)!==state.logWho) return false;
    if(state.logAct){
      const m = r.actie===state.logAct || (state.logAct==='Aangemaakt' && (r.actie||'').indexOf('Aangemaakt')===0);
      if(!m) return false;
    }
    if(q&&!`${r.timestamp} ${r.code} ${r.sectie} ${r.actie} ${r.veld} ${r.oudeWaarde} ${r.nieuweWaarde} ${r.gebruiker} ${displayName(r.gebruiker)}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const countEl=document.getElementById('logboek-count');
  if(countEl) countEl.textContent=`${rows.length} ${rows.length===1?'gebeurtenis':'gebeurtenissen'}`;

  const sl=rows.slice((pgs.logboek-1)*PG,pgs.logboek*PG);
  const el=document.getElementById('logboek-feed');
  if(!el) return;

  if(!sl.length){
    el.innerHTML=`<div class="log-empty">Niets gevonden met deze filters.</div>`;
  } else {
    let html='', lastDay='';
    sl.forEach(r=>{
      const dag=logDayLabel(r.timestamp);
      if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
      html+=logItemHtml(r,logPaginaSoort(r.actie)==='subtiel',true);
    });
    el.innerHTML=html;
  }
  if(_editBewaar){
    const t=document.getElementById('log-edit-tekst'); if(t) t.value=_editBewaar.tekst;
    const w=document.getElementById('log-edit-wie'); if(w&&_editBewaar.wie) w.value=_editBewaar.wie;
  }
  renderPag('logboek-pag',rows.length,pgs.logboek,'logboek');
}

// Ctrl/Cmd+Enter in het logboek-veld voegt de notitie toe; gewone Enter = witregel
function histNoteKey(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addTaskNote();}
}

function renderTaskHistory(code,sec){
  const container=document.getElementById('fg-history');
  const body=document.getElementById('hist-body');
  const countEl=document.getElementById('hist-count');
  const noteInput=document.getElementById('hist-note');
  if(noteInput)noteInput.value='';
  if(!code){container.style.display='none';return}
  container.style.display='';
  container.dataset.code=code;
  container.dataset.sec=sec||'';
  const entries=(D.logboek||[]).filter(r=>r.code===code&&(!sec||r.sectie===sec));
  countEl.textContent=entries.length||'';
  countEl.style.display=entries.length?'':'none';
  if(!entries.length){
    body.innerHTML='<div style="color:var(--mut);font-size:12px;padding:4px 0 8px">Nog geen notities — wees de eerste die iets vastlegt.</div>';
  } else {
    body.innerHTML=entries.slice(0,50).map(r=>`<div class="hist-entry">
      <div class="hist-ts">${esc(fmtLogTs(r.timestamp))}</div>
      <div class="hist-detail">
        ${actieBadge(r.actie)}
        <span style="margin-left:6px;color:var(--mut)">${esc(displayName(r.gebruiker))}</span>
        ${r.veld?`<div class="hist-change">${esc(r.veld)}: ${esc(r.oudeWaarde)} → ${esc(r.nieuweWaarde)}</div>`:''}
        ${r.actie==='Opmerking'&&r.nieuweWaarde?`<div class="log-note">${esc(r.nieuweWaarde)}</div>`:''}
      </div>
    </div>`).join('');
  }
}

async function addTaskNote(){
  const note=(document.getElementById('hist-note').value||'').trim();
  if(!note){alert('Typ eerst een opmerking.');return}
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const container=document.getElementById('fg-history');
  const code=container.dataset.code;
  const sec=container.dataset.sec;
  if(!code)return;
  // Eerst écht wegschrijven; pas bij succes optimistisch tonen + veld legen. Zo "verdwijnt"
  // een opmerking nooit stil bij een schrijffout — de tekst blijft staan om te herproberen.
  const ok=await logEvent(code,sec,'Opmerking','','',note);
  if(!ok){ alert('Opmerking kon niet worden opgeslagen. Controleer je verbinding en probeer het opnieuw.'); return; }
  document.getElementById('hist-note').value='';
  D.logboek.unshift({_row:0,timestamp:new Date().toISOString(),code,sectie:sec,actie:'Opmerking',veld:'',oudeWaarde:'',nieuweWaarde:note,gebruiker:getCurrentWho()||'?'});
  renderTaskHistory(code,sec);
}

// Geeft true terug bij succes, false bij falen (geen token of schrijffout). Fire-and-forget-
// aanroepers negeren de return; addTaskNote gebruikt 'm om stille notitie-verdwijning te voorkomen.
async function logEvent(code, sec, actie, veld, oudeWaarde, nieuweWaarde) {
  try {
    if (!state.oauthToken) return false;
    const who = getCurrentWho() || '?';
    const ts = new Date().toISOString();
    await appendRange("'Logboek'!A:H", [ts, code||'', sec||'', actie||'', veld||'', oudeWaarde||'', nieuweWaarde||'', who]);
    return true;
  } catch(e) { console.warn('Logboek schrijffout:', e); return false; }
}


export {
  ONTW_CATS, ONTW_CAT_COLORS, parseOntw, renderOntw, setOntw, openOntwModal, closeOntwModal,
  submitOntwItem, deleteOntwItem, editOntwItem, parseLogboek, fmtLogTs, actieBadge, _LOG_AVKLEUR, avatarKleur,
  logDayLabel, logZin, logTijd, logItemHtml, logPaginaSoort, renderLogboek, histNoteKey, renderTaskHistory, addTaskNote, logEvent,
  _shiftRows, _shiftLogboekRows, logEditWrite, logDeleteLabel,
  logEditForm, editLogboek, saveLogboek, cancelLogboek, setLogSoort, deleteLogboek, undoDeleteLog,
};
