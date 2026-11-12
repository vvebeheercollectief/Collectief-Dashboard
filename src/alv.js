// ══════════════════════════════════════
//  ALV — overzicht (vier stappen per VvE), nieuwe ronde, archief
// ══════════════════════════════════════
// Werkt zoals v15: een vinkje is een echt selectievakje in "ALV's overzicht" (kolom C, D, E, G);
// Notulen aanvinken zet de VvE ook in "ALV's afgerond". De rij wordt vlak vóór het schrijven
// opnieuw op VvE-code opgezocht.
import { state, D } from './state.js';
import { TAB, ALVO_KOLOM, ALVO_EERSTE_RIJ } from './config.js';
import { fetchSheet, appendRows, batchUpdate, getSheetIds, sheetIdVan, _a1 } from './api.js';
import { schrijf, magSchrijven, conflict, bijNieuweData, loadAll, BEREIK } from './data.js';
import { alvoStatus, vindAlvoRij, parseAlfa } from './parse.js';
import { esc, bevat, kortDatum, vandaagSheet, parseDatum } from './util.js';
import { vraagBevestiging, toast, speel } from './ui.js';
import { ICOON } from './iconen.js';

const $ = id => document.getElementById(id);
const STAPPEN = [['klaargezet','Klaargezet'], ['uitnodiging','Uitnodiging'], ['notulen','Notulen'], ['begroting','Begroting']];
const DOT = { Open:'', Klaargezet:'dot-wacht', Gepland:'dot-loopt', Afgerond:'dot-klaar' };
const FILTERS = [['','Alle'], ['Open','Open'], ['Klaargezet','Klaargezet'], ['Gepland','Gepland'], ['Afgerond','Afgerond'], ['Budget','Budget']];

// ── Overzicht ───────────────────────────────────────────────────────────
export function tekenAlvo(){
  if(!$('pagina-alvo')) return;
  const alle=D.alvo||[], f=state.filters.alvo;
  const uit=alle.filter(r=>r.uitnodiging).length, tot=alle.length;
  $('alvo-voortgang-tekst').textContent=`${uit}/${tot} uitgeschreven`;
  $('alvo-voortgang').title=`${uit} van de ${tot} vergaderingen zijn uitgeschreven`;
  $('alvo-balkje').style.width = tot ? Math.round(uit/tot*100)+'%' : '0%';
  const tel=w => w==='' ? tot : w==='Budget' ? alle.filter(r=>r.budget).length : alle.filter(r=>r.status===w).length;
  $('alvo-filters').innerHTML=FILTERS.map(([w,lbl])=>{
    const aan=(f.status||'')===w, dot=DOT[w];
    return `<button type="button" class="keuze${aan?' actief':''}" aria-pressed="${aan}" data-actie="alvo-filter" data-status="${w}">${dot!==undefined && w ? `<span class="st-dot ${dot}" aria-hidden="true"></span>` : ''}${lbl}<span class="keuze-tel">${tel(w)}</span></button>`;
  }).join('');
  const q=(f.q||'').toLowerCase().trim();
  const zicht=alle.filter(r=>(f.status==='Budget' ? r.budget : (!f.status || r.status===f.status)) && bevat(q, r.code, r.naam));
  $('alvo-rijen').innerHTML = zicht.length ? zicht.map(rijHtml).join('') : `<p class="leeg">Geen VvE gevonden.</p>`;
}
function rijHtml(r){
  const vlaggen=STAPPEN.map(([veld,naam])=>{
    const aan=!!r[veld];
    return `<button type="button" class="vlag${aan?' aan':''}" aria-pressed="${aan}" aria-label="${naam} ${esc(r.naam)}" data-actie="alvo-vlag" data-code="${esc(r.code)}" data-veld="${veld}"><span class="vak" aria-hidden="true">${ICOON.vink}</span></button>`;
  }).join('');
  return `<div class="rij kol-alvo"><span></span>
    <span class="vve"><span class="code">${esc(r.code)}</span><span class="naam">${esc(r.naam)}</span>${r.budget?'<span class="budget">Budget</span>':''}</span>
    ${vlaggen}<span class="st"><span class="st-dot ${DOT[r.status]||''}" aria-hidden="true"></span>${esc(r.status)}</span></div>`;
}

export function wisselVlag(code, veld){
  const r=(D.alvo||[]).find(x=>x.code===code);
  if(!r || !(veld in ALVO_KOLOM)) return;
  if(!magSchrijven()) return;
  const nieuw=!r[veld];
  const was=r.status;
  r[veld]=nieuw; r.status=alvoStatus(r);
  tekenAlvo();
  if(nieuw){
    const knop=document.querySelector(`#alvo-rijen .vlag[data-code="${CSS.escape(code)}"][data-veld="${veld}"]`);
    speel(knop, 'pop');
    if(r.status==='Afgerond' && was!=='Afgerond') speel(knop?.closest('.rij'), 'rij-gloed');
  }
  schrijf('Vinkje niet opgeslagen', async()=>{
    const row=vindAlvoRij(await fetchSheet(_a1(TAB.ALVO,'A:A')), code);
    if(!row) throw conflict(`VvE ${code} staat niet (of dubbel) in het ALV-overzicht. Er is niets gewijzigd.`);
    const id=sheetIdVan(await getSheetIds(), TAB.ALVO);
    if(id==null) throw new Error(`Tabblad '${TAB.ALVO}' niet gevonden`);
    const col=ALVO_KOLOM[veld];
    await batchUpdate([{ updateCells:{ range:{ sheetId:id, startRowIndex:row-1, endRowIndex:row, startColumnIndex:col, endColumnIndex:col+1 },
      rows:[{ values:[{ userEnteredValue:{ boolValue:nieuw } }] }], fields:'userEnteredValue' } }]);
    if(veld==='notulen' && nieuw){
      // Ook in het archief, behalve als hij daar vandaag al staat (dubbel klikken, of een collega).
      const datum=vandaagSheet(), vandaag=parseDatum(datum);
      const al=parseAlfa(await fetchSheet(BEREIK.alfa)).some(a=>a.code===code && JSON.stringify(parseDatum(a.datum))===JSON.stringify(vandaag));
      if(!al) await appendRows(_a1(TAB.ALFA,'A:C'), [[r.code, r.naam, datum]]);
    }
  }, ()=>{ r[veld]=!nieuw; r.status=alvoStatus(r); });
}

// ── Nieuwe ronde ────────────────────────────────────────────────────────
// Eerst een kopie van het hele tabblad als archief ('ALV-archief 2026'), dan pas de vier vinkjes
// uit. Overgenomen uit v15 (alv-reset.js).
const RESET_KOLOMMEN=[2,3,4,6];
export function archiefNaam(jaar, bestaand){
  const basis=`ALV-archief ${jaar}`;
  if(!bestaand.includes(basis)) return basis;
  let n=2; while(bestaand.includes(`${basis} (${n})`)) n++;
  return `${basis} (${n})`;
}
export function blokkenVan(rijnummers){
  const rij=[...new Set(rijnummers)].sort((a,b)=>a-b);
  if(!rij.length) return [];
  const uit=[{ start:rij[0], eind:rij[0] }];
  for(const r of rij.slice(1)){ const l=uit[uit.length-1]; if(r===l.eind+1) l.eind=r; else uit.push({ start:r, eind:r }); }
  return uit;
}
export async function nieuweRonde(){
  const n=(D.alvo||[]).length;
  if(!n) return;
  const ja=await vraagBevestiging({ titel:'Nieuwe ronde starten?',
    tekst:`Alle vier de vinkjes gaan uit bij ${n} VvE's. De huidige stand wordt eerst bewaard in een archieftabblad in de Sheet, dus er gaat niets verloren.`,
    bevestigTekst:'Nieuwe ronde starten' });
  if(!ja || !magSchrijven()) return;
  let naam='';
  const gelukt=await schrijf('Nieuwe ronde mislukt', async()=>{
    const kolA=await fetchSheet(_a1(TAB.ALVO,'A:A'));
    const rijen=[];
    kolA.forEach((r,i)=>{ const c=((r&&r[0])||'').toString().trim(); if(i+1>=ALVO_EERSTE_RIJ && c && c.length<=12 && !/^(Totaal|Uitnodigingen|Notulen|Nog)/.test(c)) rijen.push(i+1); });
    if(!rijen.length) throw new Error('Geen VvE-rijen gevonden.');
    await getSheetIds(true);
    const props=state._sheetProps||[];
    const bron=props.find(p=>p.title.trim().toLowerCase()===TAB.ALVO.toLowerCase());
    if(!bron) throw new Error(`Tabblad '${TAB.ALVO}' niet gevonden.`);
    naam=archiefNaam(new Date().getFullYear(), props.map(p=>p.title));
    await batchUpdate([{ duplicateSheet:{ sourceSheetId:bron.sheetId, insertSheetIndex:bron.index+1, newSheetName:naam } }]);
    const verzoeken=[];
    for(const b of blokkenVan(rijen)) for(const col of RESET_KOLOMMEN) verzoeken.push({ repeatCell:{
      range:{ sheetId:bron.sheetId, startRowIndex:b.start-1, endRowIndex:b.eind, startColumnIndex:col, endColumnIndex:col+1 },
      cell:{ userEnteredValue:{ boolValue:false } }, fields:'userEnteredValue' } });
    try{ await batchUpdate(verzoeken); }
    catch(e){ throw Object.assign(e, { melding:`Wissen mislukt. Het archief '${naam}' is wel aangemaakt; de vinkjes staan nog aan.` }); }
  });
  if(gelukt){ await loadAll(true); toast('Nieuwe ronde gestart', `Alle VvE's staan op Open. Archief: '${naam}'.`, 'ok'); }
}

// ── Archief ─────────────────────────────────────────────────────────────
export function tekenAlfa(){
  if(!$('pagina-alfa')) return;
  const q=(state.filters.alfa.q||'').toLowerCase().trim();
  const alle=D.alfa||[];
  $('alfa-tel').textContent=`${alle.length} vergaderingen, nieuwste bovenaan`;
  const zicht=alle.filter(r=>bevat(q, r.code, r.naam));
  $('alfa-rijen').innerHTML = zicht.length ? zicht.map(r=>`<div class="rij kol-alfa"><span></span>
      <span class="vve"><span class="code">${esc(r.code)}</span><span class="naam">${esc(r.naam)}</span></span>
      <span class="datum">${esc(kortDatum(r.datum))}</span></div>`).join('')
    : `<p class="leeg">Geen afgeronde vergadering gevonden.</p>`;
}

export function initAlv(){
  bijNieuweData(tekenAlvo);
  bijNieuweData(tekenAlfa);
  $('alvo-zoek').addEventListener('input', e=>{ state.filters.alvo.q=e.target.value; tekenAlvo(); });
  $('alfa-zoek').addEventListener('input', e=>{ state.filters.alfa.q=e.target.value; tekenAlfa(); });
}
