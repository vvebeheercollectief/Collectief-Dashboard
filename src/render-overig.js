// ══════════════════════════════════════
//  RENDER-OVERIG — Ontwikkeling + Logboek
// ══════════════════════════════════════
import { esc, displayName, persBadges, emptyRow, _vandaagAmsterdam, vveCodeSpan } from "./util.js";
import { ico } from "./icons.js";
import { PG, SID } from "./config.js";
import { state, D, pgs } from "./state.js";
import { regelIndex } from "./rij.js";
import { ensureToken } from "./auth.js";
import { writeRange, appendRange, appendRows, assertRowMatch, _herstelShift, sheetsFetch } from "./api.js";
import { renderThead, renderPag } from "./render-lijsten.js";
import { getSheetIds, setv, gv, insertAndWriteRow, taakUitCache } from "./crud.js";
import { loadAll, backgroundWrite, metWriteMarkering, serieleWrite, blokkeerOffline } from "./data.js";
import { getCurrentWho, showToast, showUndoToast } from "./notifications.js";
import { animateRowOut } from "./anim.js";
import { renderVve } from "./render-vve.js";
import { opmaakHtml, opmaakBalk } from "./opmaak.js";
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

// De volledige vingerafdruk van een Ontwikkeling-item, zoals `parseOntw` hierboven hem oplevert.
// Alle velden, want dit antwoordt op 'staat deze regel er nog?' in een rollback: een sleutel die te
// grof is wijst een ÁNDERE regel aan, en dan denkt de rollback ten onrechte dat er niets terug
// hoeft. Blijft er dan toch twijfel (twee regels die op alles gelijk zijn), dan geeft `regelIndex`
// -1 en zetten we terug — dat is de veilige kant: hooguit één regel dubbel, die de eerstvolgende
// verversing weer opruimt. `_row` hoort er NIET in: dat schuift bij het verwijderen juist mee.
// LET OP — SYNC: verandert `parseOntw`, dan verandert dit mee.
const _ontwSleutel = x => [x.titel,x.categorie,x.inhoud,x.door,x.datum,x.status].join('\x1f');

function renderOntw(){
  const q=(document.getElementById('s-ontw')?.value||'').toLowerCase().trim();
  const cats=['Alles',...ONTW_CATS,'Afgerond'];
  // De zoekterm telt óók mee in de TABTELLERS. Zonder dat zei het tabblad '12' terwijl er drie
  // regels in beeld stonden — de takenlijst en de Afgerond-lijst doen dit al wél (filterNtd /
  // filterAf draaien mét zoekterm). Eén helper, zodat teller en lijst niet uiteen kunnen lopen.
  const zoek=lijst=>q?lijst.filter(r=>`${r.titel} ${r.inhoud} ${r.categorie} ${r.door}`.toLowerCase().includes(q)):lijst;
  const openItems=zoek(D.ontw.filter(r=>r.status!=='Afgerond'));
  const doneItems=zoek(D.ontw.filter(r=>r.status==='Afgerond'));
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
  // (het zoekfilter zit al in openItems/doneItems hierboven)

  renderThead('ontw-thead',['Titel','Categorie','Inhoud','Door','Datum','Status',''],'--sec:var(--pk);--sec-l:var(--pk-l);--sec-b:var(--pk-b)');
  // Clamp, zoals de ALV-lijsten al doen: verwijder je op pagina 2 het laatste item, dan wees
  // pgs.ontw naar een pagina die niet meer bestaat en bleef de lijst permanent op 'Geen
  // resultaten' staan — óók na verversen, want niets zette het paginanummer terug.
  pgs.ontw=Math.min(Math.max(1,pgs.ontw),Math.max(1,Math.ceil(rows.length/PG)));
  const sl=rows.slice((pgs.ontw-1)*PG,pgs.ontw*PG);
  const el=document.getElementById('ontw-tbody');
  // Ook bij een lege uitkomst de paginabalk bijwerken; anders bleef daar de oude, onjuiste
  // tekst staan en was er geen knop om terug te klikken.
  // `!!q` als derde argument: met een zoekterm hoort er 'Niets gevonden — pas je filter aan' te
  // staan en niet 'Geen resultaten'. De categoriekeuze is een tabblad en geen filter, dus die telt
  // hier bewust niet mee — zelfde afweging als `erIsGefilterd` in render-lijsten.js.
  if(!sl.length){el.innerHTML=`<tr><td colspan="7">${emptyRow(7,true,!!q)}</td></tr>`;renderPag('ontw-pag',rows.length,pgs.ontw,'ontw');return}
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
  const r=taakUitCache(idx);   // zelfde melding als elders i.p.v. een klik die niets doet
  if(r) openOntwModal(true,r);
}

async function submitOntwItem(){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
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
  // Bij BEWERKEN blijven 'Door' en 'Datum' van de oorspronkelijke schrijver staan. Ze werden
  // onvoorwaardelijk overschreven met de huidige gebruiker en de dag van vandaag, dus wie een
  // typefout van een collega verbeterde, zette zijn eigen naam en datum onder diens item — de
  // herkomst was daarmee weg. Een oude regel zonder die velden krijgt ze alsnog (vandaar de ||).
  const bewerken = !!(state.ontwEditMode && state.ontwEditRow?._row);
  const door  = bewerken ? ((state.ontwEditRow.door  || '').trim() || who)   : who;
  const datum = bewerken ? ((state.ontwEditRow.datum || '').trim() || today) : today;
  const values=[titel,cat,inhoud,door,datum,status];
  try{
    // Eén beurt in de seriële schrijfwachtrij (serieleWrite): dit pad kon tot nu toe dwars door
    // een lopende undo of bulk heen schrijven (naloop 2026-08-28).
    await serieleWrite(()=>metWriteMarkering(async()=>{
      if(state.ontwEditMode&&state.ontwEditRow?._row){
        // Het HELE rij-object en niet alleen de titel: die is niet uniek, en na een verschuiving
        // keurde de kolom-A-controle het gelijknamige buur-item goed (naloop 2026-08-28).
        // `ontwEditRow` is de kloon van VÓÓR de bewerking — precies wat er nu in de Sheet hoort.
        await assertRowMatch(state.ontwEditRow._row, state.ontwEditRow, 'Ontwikkeling');
        await writeRange(`'Ontwikkeling'!A${state.ontwEditRow._row}:F${state.ontwEditRow._row}`,values);
      } else {
        await appendRange("'Ontwikkeling'!A:F",values);
      }
    }));
    closeOntwModal();
    await loadAll();
  }catch(e){alert('Fout: '+e.message)}
}

async function deleteOntwItem(){
  if(!state.ontwEditRow) return;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
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
  // Alleen meeschuiven als het item lokaal ook echt weg is: was het al verdwenen (pos -1, een
  // poll verving de lijst), dan verschoof deze regel de nummers van rijen die níet verschoven
  // zijn — en wees elk volgend rijnummer één mis (naloop 2026-08-28).
  if(pos>-1) D.ontw.forEach(x=>{ if(x._row>oudeRow) x._row--; });
  closeOntwModal();
  // De melding met 'ongedaan maken' verschijnt meteen, maar de verwijdering in de Sheet loopt nog.
  // Mislukt die, dan draait de rollback hieronder het item lokaal terug — en stáát de rij dus nog
  // in de Sheet. Wie dán op 'ongedaan maken' klikte, kreeg er een TWEEDE rij bij: undoOntwDelete
  // voegt de waarden immers gewoon opnieuw toe. Deze stand reist mee naar de undo, die er (ná het
  // afwachten van de schrijfketen) op kan afgaan.
  const stand={gelukt:false};
  showUndoToast('Item verwijderd', r.titel||'', ()=>undoOntwDelete(values, r.titel, stand), 'prullenbak');
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Ontwikkeling'];
      if(sheetId==null) throw new Error('Sheet "Ontwikkeling" niet gevonden');
      await assertRowMatch(oudeRow, r, 'Ontwikkeling'); // hele rij, niet alleen de (niet-unieke) titel — zie submitOntwItem
      const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
      });
      if(!resp.ok){const e=await resp.json();const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
      stand.gelukt=true;
    },
    // Op titel+datum en niet op objectidentiteit: een poll tussen de klik en deze rollback vervangt
    // élk item in D.ontw, en dan zou `indexOf` -1 geven en er een tweede bij zetten.
    ()=>{ if(echte&&regelIndex(D.ontw, echte, _ontwSleutel)===-1){ D.ontw.forEach(x=>{ if(x._row>=oudeRow) x._row++; }); D.ontw.splice(Math.min(pos<0?D.ontw.length:pos,D.ontw.length),0,echte); } },
    'Verwijderen mislukt'
  );
  // rode puls + fade op de oude rij; daarná pas hertekenen
  animateRowOut(tr,'rij-puls-rood',renderOntw);
}

async function undoOntwDelete(values, titel, stand){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  try{
    // Eén beurt in de seriële schrijfwachtrij; pas dán is ook bekend of de verwijdering ècht
    // doorging. Ging hij níet door, dan heeft de rollback het item al teruggezet en stáát de rij
    // nog in de Sheet — dan zou dit er een tweede van maken (naloop 2026-08-28).
    await serieleWrite(async()=>{
      if(stand && !stand.gelukt){
        showToast('Niets terug te zetten', 'De verwijdering is niet doorgegaan; het item staat er nog.',
                  'var(--am)', 'waarschuwing', {geenDedup:true, geenSysteemmelding:true});
        return;
      }
      await metWriteMarkering(()=>appendRange("'Ontwikkeling'!A:F", values));
      showToast('Ongedaan gemaakt', `"${titel||''}" teruggezet`, 'var(--am)', 'ongedaan');
      await loadAll();
    });
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

// startRij = het Sheet-rijnummer van rows[0]. Weggelaten (of 1) → de klassieke vorm waarin
// rows[0] de koprij is en de eerste datarij Sheet-rij 2 is. Bij een staartlezing
// ('Logboek'!A1262:H) is rows[0] géén koprij en telt _row door vanaf 1262.
// _row MOET de ruwe Sheet-index blijven: bewerken en verwijderen van logregels schrijven op dat
// nummer, en het filter + de omkering hieronder mogen daar niets aan veranderen.
function parseLogboek(rows, startRij){
  if(!rows||!rows.length) return [];
  const start=startRij||1;
  const data=start===1 ? rows.slice(1) : rows;
  const eersteRij=start===1 ? 2 : start;
  return data.map((r,i)=>{
    const c=j=>((r&&r[j])||'').trim();
    return {
      _row:eersteRij+i,
      timestamp:c(0), code:c(1), sectie:c(2), actie:c(3),
      veld:c(4), oudeWaarde:c(5), nieuweWaarde:c(6), gebruiker:c(7)
    };
  }).filter(o=>o.timestamp&&!LOG_VERBORGEN.has(o.actie)).reverse();
}

// Welke optimistische regels (_row 0) staan nog niet écht in de Sheet?
// Bewust alleen vergelijken met de regels die deze ronde NIEUW binnenkwamen en niet met de hele
// historie: de sleutel bevat geen tijd, dus een tweede identieke notitie ('gebeld' bij dezelfde
// VvE door dezelfde persoon) zou anders meteen weer van het scherm verdwijnen omdat de eerste er
// al staat. NIET op timestamp vergelijken: bij twee van de drie optimistische paden (addTaskNote
// en saveKenmerken) is de lokale tijd een andere dan die de append in de Sheet zet — minstens de
// duur van het netwerkverkeer ertussen. De inhoud is wél gelijk. Puur, dus los testbaar.
const _logSleutel=o=>[o.code,o.sectie,o.actie,o.veld,o.nieuweWaarde,o.gebruiker].join('\x1f');
function _nogNietBevestigd(optimistisch, nieuweRegels){
  const gezien=new Set((nieuweRegels||[]).map(_logSleutel));
  return (optimistisch||[]).filter(o=>!gezien.has(_logSleutel(o)));
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
    'Fase gewijzigd':['--sec:var(--tl);--sec-l:var(--tl-l)',ico('chevronRechts')],
    // Zelfde paars/pauze als de Opgevolgd-knop en zijn toast; teruggezet in het amber/ongedaan
    // van de andere terugzet-acties.
    'Opgevolgd':['--sec:var(--pu);--sec-l:var(--pu-l)',ico('pauze')],
    'Opvolgdatum teruggezet':['--sec:var(--am);--sec-l:var(--am-l)',ico('ongedaan')],
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

// Eén kleurbron per logboek-actie: het werkwoord in de zin én de stip van de dunne
// regel gebruiken dezelfde kleur, zodat ze elkaar nooit tegenspreken.
const LOG_KLEUR={Afgerond:'var(--gn)',Aangevinkt:'var(--gn)',Uitgevinkt:'var(--am)',Teruggezet:'var(--am)',Opmerking:'var(--am)',Verwijderd:'var(--rd)','Behandelaar gewijzigd':'var(--ac)',Contact:'var(--ac)',Aangemaakt:'var(--pu)','Aangemaakt (sheet)':'var(--pu)',Kenmerk:'var(--pu)',Weggelegd:'var(--am)','Opvolgdatum gewist':'var(--am)','Auto-prioriteit':'var(--mut)',Opgevolgd:'var(--pu)','Opvolgdatum teruggezet':'var(--am)'};
const logKleur=a=>LOG_KLEUR[a]||'var(--pu)';

// Eén zinnengenerator voor alle logregels (gedeeld door Logboek-pagina en VvE-dossier).
// opts.zonderCode → laat de VvE-code weg; in een dossier is die redundant.
function logZin(r, opts){
  const zonderCode=!!(opts&&opts.zonderCode);
  const naam=esc(displayName(r.gebruiker)||'Iemand');
  const chip=vveCodeSpan(r.code, '--sec:var(--ac);--sec-l:var(--ac-l)');
  // "… bij 121027" → in het dossier gewoon niets; anders blijft "bij" bungelen.
  const bij=zonderCode?'':' bij '+chip;
  const staart=zonderCode?'':' '+chip;   // default-geval: chip los achter de ruwe actienaam
  const kleur=logKleur(r.actie);
  const A=verb=>`<b>${naam}</b> <span class="log-act" style="color:${kleur}">${verb}</span> `;
  switch(r.actie){
    case'Afgerond':            return A('rondde')+(zonderCode?'een taak':chip)+' af';
    case'Verwijderd':          return A('verwijderde')+'een taak'+bij;
    case'Teruggezet':          return A('zette')+(zonderCode?'een taak':chip)+' terug';
    case'Opmerking':           return A('noteerde')+(zonderCode?'iets':'bij '+chip);
    case'Behandelaar gewijzigd':return A('wees')+(zonderCode?'een taak':chip)+' toe'+(r.nieuweWaarde?` aan <b>${esc(r.nieuweWaarde)}</b>`:'');
    case'Aangemaakt':
    case'Aangemaakt (sheet)':  return A('maakte')+'een nieuwe taak'+bij+(r.nieuweWaarde?` <span style="color:var(--mut)">→ ${esc(r.nieuweWaarde)}</span>`:'');
    // Het soort contact (telefoon/mail/…) staat achter een punt-scheiding. Is dat veld leeg — dat
    // kan bij regels van vóór deze functie of bij een met de hand getypte regel — dan hoort de
    // scheiding óók weg te blijven; anders eindigt de zin op een losse '·'.
    case'Contact':             return A('sprak')+`met ${esc(r.oudeWaarde||'—')}`+bij+(r.veld?` <span style="color:var(--mut)">· ${esc(r.veld)}</span>`:'');
    case'Aangevinkt':          return A('vinkte')+`<b>${esc(r.veld||'')}</b> aan`+bij;
    case'Uitgevinkt':          return A('vinkte')+`<b>${esc(r.veld||'')}</b> uit`+bij;
    case'Kenmerk':             return A('wijzigde')+`kenmerk <b>${esc(r.veld||'')}</b>`+bij+(r.nieuweWaarde?` <span style="color:var(--mut)">→ ${esc(r.nieuweWaarde)}</span>`:'');
    case'Weggelegd':           return A('legde')+(zonderCode?'een taak':chip)+' weg'+(r.nieuweWaarde?` tot <b>${esc(r.nieuweWaarde)}</b>`:'');
    case'Opvolgdatum gewist':  return A('haalde')+(zonderCode?'een taak':chip)+' terug uit weggelegd';
    // De Opgevolgd-knop (offerte-paneel): zonder eigen zin vielen deze twee in de default-tak
    // en stond de nieuwe opvolgdatum nergens — precies het gegeven waar de regel om draait.
    case'Opgevolgd':           return A('volgde')+(zonderCode?'een offerte-traject':chip)+' op'+(r.nieuweWaarde?` → volgende check <b>${esc(r.nieuweWaarde)}</b>`:'');
    case'Opvolgdatum teruggezet':return A('zette')+'de opvolgdatum'+bij+' terug'+(r.nieuweWaarde?` naar <b>${esc(r.nieuweWaarde)}</b>`:'');
    case'Fase gewijzigd':      return A('zette')+(zonderCode?'het subsidietraject':chip)+` op <b>${esc(r.nieuweWaarde||'—')}</b>`+(r.oudeWaarde?` <span style="color:var(--mut)">(was ${esc(r.oudeWaarde)})</span>`:'');
    case'Auto-prioriteit':     return A('paste')+'de prioriteit automatisch aan'+(r.nieuweWaarde?` <span style="color:var(--mut)">· ${esc(r.nieuweWaarde)}</span>`:'');
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
// 'normaal' wordt óók gebruikt als eigen/bewerkbaar-criterium in dossierFeed.
function logPaginaSoort(actie){
  const a=(actie||'').trim();
  if(a==='Opmerking'||a==='Contact') return 'normaal';
  // Fasewijzigingen horen op de logboekpagina thuis — het verloop van een
  // subsidietraject is juist wat je later wilt terugzien. Gedempt, want de app
  // schrijft ze zelf, net als 'Afgerond' en 'Aangemaakt'.
  if(a==='Afgerond'||a==='Fase gewijzigd'||a.indexOf('Aangemaakt')===0) return 'subtiel';
  return null;
}

// Eén logregel als HTML (gedeeld door Logboek-pagina en VvE-dossier).
// subtiel=true → gedempte dunne regel voor automatische acties.
// opts.zonderCode → geef door aan logZin (dossier: code is redundant).
function logItemHtml(r,subtiel,acties,opts){
  // Optimistische regels (_row<=0: net toegevoegd, nog niet terug uit de Sheet) hebben
  // geen echt rijnummer — bewerk-/verwijderknoppen zouden niets (of het verkeerde) doen.
  // Na de stille resync krijgt de regel z'n echte _row en verschijnen de knoppen alsnog.
  const magActies=!!acties&&r._row>0;
  if(subtiel){
    const kleur=logKleur(r.actie);
    const acts=magActies?`<span class="log-acts"><button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">${ico('prullenbak')}</button></span>`:'';
    return `<div class="log-mini">
      <span class="log-mini-dot" style="background:${kleur}"></span>
      <span class="log-mini-txt">${logZin(r,opts)}</span>
      <span class="log-time">${esc(logTijd(r.timestamp))}</span>
      ${acts}
    </div>`;
  }
  if(magActies && state.logEdit===r._row) return logEditForm(r);
  let extra='';
  if((r.actie==='Behandelaar gewijzigd'||r.actie==='Kenmerk') && r.veld && (r.oudeWaarde||r.nieuweWaarde)){
    extra=`<div class="log-change"><span class="old">${esc(r.oudeWaarde||'—')}</span><span class="arr">→</span><span class="new">${esc(r.nieuweWaarde||'—')}</span></div>`;
  }
  if((r.actie==='Opmerking'||r.actie==='Contact') && r.nieuweWaarde){
    extra=`<div class="log-note">${opmaakHtml(r.nieuweWaarde)}</div>`;
  }
  const init=(displayName(r.gebruiker)||'?').charAt(0).toUpperCase();
  const acts=magActies?`<span class="log-acts">
    <button class="log-act-btn" data-action="log-bewerken" data-row="${r._row}" title="Bewerken" aria-label="Regel bewerken">${ico('potlood')}</button>
    <button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">${ico('prullenbak')}</button>
  </span>`:'';
  return `<div class="log-item">
    <span class="log-av" style="background:${avatarKleur(displayName(r.gebruiker))}">${esc(init)}</span>
    <div class="log-body"><div class="log-line">${logZin(r,opts)}</div>${extra}</div>
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

// Pure (testbaar): schuif een open bewerk-verwijzing (state.logEdit = _row) mee met een
// rij-verwijdering/-herstel, zodat het open formulier bij dezelfde REGEL blijft horen.
// delta -1 (delete): regels ónder fromRow schuiven omhoog; delta +1 (rollback/undo):
// regels die op of onder de herstelde positie liggen schuiven terug omlaag.
function _shiftLogEditRef(cur, fromRow, delta){
  if(cur==null) return cur;
  return (delta<0 ? cur>fromRow : cur>=fromRow) ? cur+delta : cur;
}

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
  // Bewust GEEN id's op tekst/wie: dit formulier rendert tegelijk op de Logboek-pagina
  // én in het dossier (renderAll tekent verborgen pagina's mee). getElementById zou dan
  // de verborgen eerste instantie pakken; alle lezers werken daarom class-gescoped.
  const contactRij=isContact?`<div class="log-edit-rij">
    <div class="dos-chips">${LOG_CONTACT_SOORTEN.map(([s,sIco])=>
      `<button type="button" class="soort-chip${sel===s?' aan':''}" data-action="log-soort" data-soort="${esc(s)}">${sIco} ${esc(s)}</button>`).join('')}</div>
    <select class="log-edit-wie" title="Met wie?">${LOG_WIE_OPTIES.map(w=>
      `<option${(r.oudeWaarde||'Overig')===w?' selected':''}>${esc(w)}</option>`).join('')}</select>
  </div>`:'';
  return `<div class="log-item"><div class="log-edit" data-row="${r._row}" data-ts="${esc(r.timestamp||'')}">
    <div class="opmaak-veld">
      <textarea class="log-edit-tekst" rows="2" aria-label="Tekst van deze logregel">${esc(r.nieuweWaarde||'')}</textarea>
      ${opmaakBalk()}
    </div>
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
  // De IDENTITEIT van de bewerkte regel erbij. `state.logEdit` is een Sheet-RIJNUMMER, en dat
  // schuift op zodra een collega elders een logregel verwijdert of een undo er een invoegt: het
  // formulier stond dan opeens op de BUURREGEL, met diens tekst erin, en Opslaan schreef jouw
  // tekst naar die buurregel. `_shiftLogEditRef` dekt alleen de verschuivingen die dit scherm
  // zélf veroorzaakt, niet die van een ander. De timestamp verschuift nooit.
  state.logEditTs=e?_logAnkerSleutel(e):'';
  state.logEditSoort=e?e.veld:null;
  _rerenderLog();
  // Focus op de ZICHTBARE instantie (het formulier staat ook in de verborgen andere pagina)
  setTimeout(()=>{ const t=document.querySelector('.page.active .log-edit-tekst'); if(t){ t.focus(); t.setSelectionRange(t.value.length,t.value.length); } },0);
}

function cancelLogboek(){ state.logEdit=null; state.logEditTs=null; state.logEditSoort=null; _rerenderLog(); }

function setLogSoort(soort){
  state.logEditSoort=soort;
  document.querySelectorAll('.log-edit .soort-chip').forEach(c=>c.classList.toggle('aan', c.dataset.soort===soort));
}

async function saveLogboek(row, box){
  const entry=(D.logboek||[]).find(e=>e._row===row);
  if(!entry) return;
  // Lees uit het formulier waarin daadwerkelijk geklikt/getypt is (class-gescoped):
  // hetzelfde formulier staat óók op de verborgen andere pagina en zou via een
  // document-brede lookup verouderde tekst kunnen leveren.
  box=box||document.querySelector('.page.active .log-edit');
  const tekst=(box?.querySelector('.log-edit-tekst')?.value||'').trim();
  if(!tekst){ alert('De tekst mag niet leeg zijn.'); return; }
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const isContact=entry.actie==='Contact';
  const soort=isContact ? (state.logEditSoort||entry.veld||'Telefoon') : entry.veld;
  const wie=isContact ? (box?.querySelector('.log-edit-wie')?.value||entry.oudeWaarde||'Overig') : entry.oudeWaarde;
  const oud={veld:entry.veld, oudeWaarde:entry.oudeWaarde, nieuweWaarde:entry.nieuweWaarde};
  // optimistisch bijwerken + sluiten
  if(isContact){ entry.veld=soort; entry.oudeWaarde=wie; }
  entry.nieuweWaarde=tekst;
  state.logEdit=null; state.logEditTs=null; state.logEditSoort=null;
  _rerenderLog();
  const w=logEditWrite(entry.actie, row, soort, wie, tekst);
  backgroundWrite(
    // Het rij-OBJECT meegeven, niet alleen de timestamp: dan vergelijkt de guard de hele regel.
    // Alleen op kolom A vergelijken liet een bewerking van een collega stil overschrijven — het
    // bewerken van een logregel raakt namelijk alleen kolom E/F/G, dus de timestamp bleef gelijk.
    // LET OP DE RICHTING (zelfde val als bij bulkVeld): `entry` is hierboven al optimistisch
    // bijgewerkt, dus vergelijken met `entry` zelf zou de NIEUWE tekst afzetten tegen de oude in
    // de Sheet en élke bewerking laten mislukken. Vergelijk met de stand die er nú nog hoort te
    // staan: entry met de oude veld/wie/tekst terug.
    async ()=>{ await assertRowMatch(row, {...entry, ...oud}, 'Logboek'); await writeRange(w.range, w.values); },
    ()=>{ entry.veld=oud.veld; entry.oudeWaarde=oud.oudeWaarde; entry.nieuweWaarde=oud.nieuweWaarde; },
    'Bewerken mislukt'
  );
}

async function deleteLogboek(row){
  const entries=D.logboek||[];
  const idx=entries.findIndex(e=>e._row===row);
  if(idx<0) return;
  const entry=entries[idx];
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const vals=[entry.timestamp, entry.code, entry.sectie, entry.actie, entry.veld, entry.oudeWaarde, entry.nieuweWaarde, entry.gebruiker];
  const oudeRow=entry._row;
  // optimistisch: lokaal weg + rij-indexen meeschuiven + edit sluiten óf meeschuiven
  // (een open formulier op een regel erónder moet bij dezelfde regel blijven horen,
  //  anders verspringt het en kan Opslaan de verkeerde logregel overschrijven)
  entries.splice(idx,1);
  _shiftLogboekRows(oudeRow,-1);
  if(state.logEdit===row){ state.logEdit=null; state.logEditTs=null; state.logEditSoort=null; }
  else state.logEdit=_shiftLogEditRef(state.logEdit,oudeRow,-1);
  _rerenderLog();
  // Idempotentie-vlag: deleteDimension is positie-gebaseerd en NIET idempotent (zie
  // deleteTaskRow). De undo-knop krijgt een kijkgaatje op deze vlag mee, zodat
  // undoDeleteLog zéker weet of de delete doorging — géén timestamp-heuristiek,
  // want bulk-acties schrijven meerdere logregels met exact dezelfde milliseconde.
  let verwijderd=false;
  // geenDedup: twee gelijkluidende logregels (bulk-regels van dezelfde VvE, of tweemaal
  // 'Aangevinkt') kort na elkaar verwijderen gaf voor de tweede geen toast — en die toast is de
  // enige weg terug. Elke klik is hier een eigen handeling met een eigen undo (naloop 2026-08-28).
  showUndoToast('Logregel verwijderd', logDeleteLabel(entry), ()=>undoDeleteLog(vals, oudeRow, ()=>verwijderd), 'prullenbak', { geenDedup:true });
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Logboek'];
      if(sheetId==null) throw new Error('Sheet "Logboek" niet gevonden');
      if(!verwijderd){
        await assertRowMatch(oudeRow, entry, 'Logboek'); // rij nog dezelfde REGEL (hele inhoud) vóór verwijderen
        const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',
          headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
        });
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
        verwijderd=true;
      }
    },
    // D.logboek OPNIEUW lezen en niet de `entries`-verwijzing van hierboven gebruiken.
    // `_verwerkLogboek` (data.js) HERTOEKENT D.logboek bij een ronde die nieuwe regels vindt; die
    // oude verwijzing wijst dan naar een array waar niemand meer naar kijkt, en de teruggezette
    // regel kwam nooit meer in beeld. Zelfde vorm als de rij-val in src/rij.js: een verwijzing
    // vasthouden over een await heen.
    ()=>{ const lijst=D.logboek||[];
      if(regelIndex(lijst, entry, _logRegelSleutel)===-1){
        _herstelShift(_shiftLogboekRows,oudeRow);
        state.logEdit=_shiftLogEditRef(state.logEdit,oudeRow,+1);
        lijst.splice(Math.min(idx,lijst.length),0,entry);
      } },
    'Verwijderen mislukt'
  );
}

// Undo: rij terugzetten op de oude positie en lokaal vers herladen (zoals taak-undo).
// wasVerwijderd = kijkgaatje op de idempotentie-vlag van de delete-closure.
async function undoDeleteLog(vals, oudeRow, wasVerwijderd){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    // Eén beurt in de seriële schrijfwachtrij: de delete (of z'n rollback) is dan gegarandeerd
    // afgerond, en deze positionele insert kan niet meer verweven raken met een andere
    // schrijfactie (naloop 2026-08-28).
    await serieleWrite(async()=>{
      // Was de delete mislukt, dan heeft de rollback de regel lokaal al teruggezet en is
      // er in de Sheet niets verwijderd: een insert zou een duplicaatregel maken en een
      // tweede logEdit-verschuiving zou het open formulier één regel te ver zetten.
      if(wasVerwijderd && !wasVerwijderd()){
        showToast('Niets te herstellen','De regel staat er nog — verwijderen was niet gelukt.','var(--am)','ongedaan');
        return;
      }
      await metWriteMarkering(()=>insertAndWriteRow('Logboek', oudeRow-1, vals));
      // Open bewerkformulier op een regel die bij de delete omhoog schoof: terug omlaag,
      // zodat het ná de verse loadAll (echte _row-nummers) weer bij dezelfde regel hoort.
      state.logEdit=_shiftLogEditRef(state.logEdit,oudeRow,+1);
      showToast('Ongedaan gemaakt','Logregel teruggezet','var(--am)','ongedaan');
      await loadAll();                               // _row-indexen vers uit de Sheet
    });
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}

// Trek het rijnummer van een open bewerkformulier bij naar de regel waar het écht bij hoort.
// Verschoof de regel doordat iemand ANDERS een logregel verwijderde of terugzette, dan wijst
// `state.logEdit` naar de buurregel; is de regel zelf weg, dan sluiten we het formulier met een
// melding in plaats van de tekst stil op een vreemde regel te laten staan.
// Sleutel van een logregel voor de her-ankering. NIET de timestamp alleen: `deleteLogboek` legt
// honderd regels hoger al uit dat die géén identiteit is — bulk-acties schrijven meerdere regels
// met exact dezelfde milliseconde. Met code, actie en gebruiker erbij blijft er in de praktijk één
// treffer over; is dat niet zo, dan doen we liever niets dan gokken.
const _logAnkerSleutel = e => [e && e.timestamp, e && e.code, e && e.actie, e && e.gebruiker].join('\x1f');

function _herankerLogEdit(){
  if(state.logEdit==null || !state.logEditTs) return;
  const treffers=(D.logboek||[]).filter(x=>_logAnkerSleutel(x)===state.logEditTs);
  // Precies één treffer → het rijnummer bijtrekken. Meerdere treffers → niets doen: dan is het
  // rijnummer nog altijd het beste houvast dat we hebben, en een gok zou de bewerking op een
  // andere regel kunnen laten landen.
  if(treffers.length===1){ state.logEdit=treffers[0]._row; return; }
  if(treffers.length>1) return;
  state.logEdit=null; state.logEditTs=null; state.logEditSoort=null;
  showToast('De lijst is ververst','De regel die je bewerkte bestaat niet meer — het formulier is gesloten.',
            'var(--am)','label',{geenDedup:true,geenSysteemmelding:true});
}

// Idem voor een logregel: alle acht velden die `parseLogboek` leest. Vier velden was te grof —
// een bulk-actie op twee taken van dezelfde VvE levert regels op die op timestamp, code, actie en
// nieuwe waarde gelijk zijn, en dan hield de rollback een verwijderde regel voor 'staat er nog'.
// Bewust NIET `_logSleutel` hierboven: die laat de tijdstempel en de oude waarde juist weg, omdat
// hij een optimistische regel moet herkennen in wat de server terugstuurt. Voor die vraag is grof
// goed; voor deze vraag is grof gevaarlijk.
// LET OP — SYNC: verandert `parseLogboek`, dan verandert dit mee.
const _logRegelSleutel = e => [e.timestamp,e.code,e.sectie,e.actie,e.veld,e.oudeWaarde,e.nieuweWaarde,e.gebruiker].join('\x1f');

function renderLogboek(){
  // Bescherm half-getypte bewerktekst tegen de 8s-poll (analoog aan de VvE-composer).
  // Gescoped op de eigen feed (hetzelfde formulier staat óók in het dossier) én op
  // REGEL-IDENTITEIT via de timestamp: bij wisselen van bewerkregel mag de tekst van
  // de vórige regel niet in het verse formulier belanden. De timestamp is shift-
  // bestendig (rijnummers verschuiven bij deletes, het tijdstip van de entry nooit).
  const _editBox=document.querySelector('#logboek-feed .log-edit');
  const _editTekstEl=_editBox?.querySelector('.log-edit-tekst');
  _herankerLogEdit();
  const _editEntry=state.logEdit?(D.logboek||[]).find(x=>x._row===state.logEdit):null;
  const _editBewaar=(_editTekstEl && _editEntry && _editBox.dataset.ts===(_editEntry.timestamp||''))?{
    tekst:_editTekstEl.value,
    wie:_editBox.querySelector('.log-edit-wie')?.value
  }:null;
  // Waar stond de cursor? De WAARDE bewaren is maar de helft: `el.innerHTML=html` hieronder
  // vervangt het hele formulier, dus de <textarea> waarin iemand staat te typen verdwijnt uit de
  // DOM en de focus valt terug op <body>. Wie midden in een zin zat, typte de rest in het niets —
  // en dat gebeurt elke acht seconden, want de poll hertekent deze pagina. `renderVve` loste dit
  // al zo op (zie `_focusHerstel` daar); alleen deze pagina deed het nog niet.
  const _actLog=document.activeElement;
  const _focusLog=(()=>{
    const feed=document.getElementById('logboek-feed');
    if(!_actLog || !feed || !feed.contains(_actLog)) return null;
    const klasse=['log-edit-tekst','log-edit-wie'].find(k=>_actLog.classList && _actLog.classList.contains(k));
    if(!klasse) return null;
    // selectionStart bestaat niet op een <select>; dan is er ook geen cursor om terug te zetten.
    return { klasse, start:_actLog.selectionStart ?? null, eind:_actLog.selectionEnd ?? null };
  })();
  const q=(document.getElementById('s-logboek')?.value||'').toLowerCase().trim();
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

  // Paginanummer klemmen vóór het snijden, net als renderTbody dat doet. renderPag klemt hem ook,
  // maar pas ná deze regel — dus precies in de ronde waarin de lijst krimpt (een logregel
  // verwijderd, of een filter aangezet) stond de tijdlijn leeg terwijl de paginabalk eronder al
  // naar de juiste pagina wees. Pas de volgende hertekening herstelde dat.
  const _pg=Math.min(Math.max(1,pgs.logboek),Math.max(1,Math.ceil(rows.length/PG)));
  pgs.logboek=_pg;
  const sl=rows.slice((_pg-1)*PG,_pg*PG);
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
    const t=document.querySelector('#logboek-feed .log-edit-tekst'); if(t) t.value=_editBewaar.tekst;
    const w=document.querySelector('#logboek-feed .log-edit-wie'); if(w&&_editBewaar.wie) w.value=_editBewaar.wie;
  }
  if(_focusLog){
    const el2=document.querySelector('#logboek-feed .'+_focusLog.klasse);
    if(el2){
      try{ el2.focus(); }catch(_){}
      // Pas ná focus(): een setSelectionRange vóór de focus wordt door de browser genegeerd.
      if(_focusLog.start!=null && el2.setSelectionRange)
        try{ el2.setSelectionRange(_focusLog.start,_focusLog.eind); }catch(_){}
    }
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
        ${r.actie==='Opmerking'&&r.nieuweWaarde?`<div class="log-note">${opmaakHtml(r.nieuweWaarde)}</div>`:''}
      </div>
    </div>`).join('');
  }
}

async function addTaskNote(){
  const note=(document.getElementById('hist-note').value||'').trim();
  if(!note){alert('Typ eerst een opmerking.');return}
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  // Dubbelklik-rem over het async-gat hieronder (ensureToken + logEvent): twee snelle klikken
  // lazen allebei hetzelfde veld en schreven dezelfde opmerking twee keer (naloop 2026-08-28).
  if(state._notitieBezig) return;
  state._notitieBezig=true;
  try{
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
  } finally { state._notitieBezig=false; }
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

// Meerdere logregels in ÉÉN append. Zelfde contract als logEvent: gooit nooit, geeft een
// boolean terug — het logboek is een journaal, geen bronwaarheid, en een mislukte logregel mag
// een geslaagde bulk-actie niet alsnog laten omvallen.
// Alle regels van één bulk-actie delen bewust dezelfde timestamp: het ís één handeling, en het
// Logboek toont ze daardoor als één blok in plaats van als twintig losse gebeurtenissen.
// Vervangt de lus `for(const it of items) await logEvent(...)`, die bij 20 taken 20 aparte
// schrijfverzoeken deed (~4,7 s 'Opslaan…', en in die tijd ziet het dashboard geen wijzigingen
// van collega's omdat de poll op pendingWrites wacht).
async function logEvents(regels) {
  try {
    if (!state.oauthToken) return false;
    const lijst = (regels || []).filter(Boolean);
    if (!lijst.length) return true;
    const who = getCurrentWho() || '?';
    const ts = new Date().toISOString();
    await appendRows("'Logboek'!A:H", lijst.map(e =>
      [ts, e.code||'', e.sec||'', e.actie||'', e.veld||'', e.oudeWaarde||'', e.nieuweWaarde||'', who]));
    return true;
  } catch(e) { console.warn('Logboek schrijffout:', e); return false; }
}


export {
  ONTW_CATS, ONTW_CAT_COLORS, parseOntw, renderOntw, setOntw, openOntwModal, closeOntwModal,
  submitOntwItem, deleteOntwItem, editOntwItem, parseLogboek, _logSleutel, _logRegelSleutel, _ontwSleutel, _nogNietBevestigd, fmtLogTs, actieBadge, _LOG_AVKLEUR, avatarKleur,
  logDayLabel, logZin, logTijd, logItemHtml, logPaginaSoort, renderLogboek, histNoteKey, renderTaskHistory, addTaskNote, logEvent, logEvents,
  _shiftRows, _shiftLogboekRows, _shiftLogEditRef, _herankerLogEdit, logEditWrite, logDeleteLabel,
  logEditForm, editLogboek, saveLogboek, cancelLogboek, setLogSoort, deleteLogboek, undoDeleteLog,
};
