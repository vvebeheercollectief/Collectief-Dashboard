// ══════════════════════════════════════
//  DOSSIERS — LOD en Subsidie-trajecten (gedeeld, in 'Nog Te Doen')
// ══════════════════════════════════════
// Elke wijziging zoekt de rij vlak vóór het schrijven opnieuw op (taaknummer in kolom Q, anders op
// inhoud) en controleert of hij nog is zoals wij hem kenden. Zo raakt een wijziging nooit een rij
// die intussen verschoof, en overschrijven we niet stil wat een collega net aanpaste.
// Afronden verplaatst de rij in één verzoek naar hetzelfde blok in 'Afgerond' (zoals v15 deed).
import { state, D } from './state.js';
import { TAB, SECS, TEAM, SUBSIDIE_FASES, initialen } from './config.js';
import { fetchSheet, writeRange, batchUpdate, getSheetIds, sheetIdVan, kapCel, _a1 } from './api.js';
import { schrijf, magSchrijven, conflict, bijNieuweData, BEREIK } from './data.js';
import { blokken, invoegNa, vindDossier, dossierInhoud, rijInhoud } from './parse.js';
import { esc, bevat, wanneer, dagenTot, datumSleutel, naarISO, naarSheetDatum, vandaagSheet, nieuwTaakId, leegBijErfenis } from './util.js';
import { ongedaanBalk, vraagBevestiging, meldFout, laatVertrekken, zetRijen, speel, LEEG_KLAAR } from './ui.js';
import { koppelVveVeld, leesVve, zetVve } from './vve.js';
import { ICOON } from './iconen.js';

const SEC_VAN_PAGINA = { lod:'LOD', subsidie:'SUBSIDIE-TRAJECTEN' };
const PAGINA_VAN_SEC = { LOD:'lod', 'SUBSIDIE-TRAJECTEN':'subsidie' };
const rijVan = (sec, sleutel) => document.querySelector(`#${PAGINA_VAN_SEC[sec]}-rijen .rij[data-sleutel="${CSS.escape(sleutel)}"]`);
const _netLeeg = {};   // per lijst: zojuist leeg geraakt door afronden
const $ = id => document.getElementById(id);
const faseNr = woord => { const i=SUBSIDIE_FASES.findIndex(f=>f.toLowerCase()===(woord||'').trim().toLowerCase()); return i<0 ? 1 : i+1; };

// ── Tekenen ─────────────────────────────────────────────────────────────
export function tekenDossiers(){
  for(const [pagina, sec] of Object.entries(SEC_VAN_PAGINA)){
    const lijst=D.dossiers[sec]||[];
    const tel=$('tel-'+pagina); if(tel) tel.textContent=String(lijst.length);
    if(!$('pagina-'+pagina)) continue;
    const f=state.filters[pagina];
    $(pagina+'-tel').textContent=`${lijst.length} lopend`;
    $(pagina+'-wie').innerHTML=['', ...TEAM].map(n=>{
      const aan=(f.wie||'')===n;
      return `<button type="button" class="keuze${aan?' actief':''}" aria-pressed="${aan}" data-actie="dossier-wie" data-pagina="${pagina}" data-wie="${esc(n)}">${n?esc(n):'Iedereen'}</button>`;
    }).join('');
    const q=(f.q||'').toLowerCase().trim();
    const zicht=lijst.filter(r=>(!f.wie || (r.behandelaar||'').split(/\s*,\s*/).includes(f.wie))
                               && bevat(q, r.code, r.naam, r[SECS[sec].omschrijving], r.status, r.opmerkingen, r.behandelaar))
                     .slice().sort((a,b)=>datumSleutel(a.deadline)-datumSleutel(b.deadline));
    if(lijst.length) _netLeeg[sec]=false;
    zetRijen($(pagina+'-rijen'), zicht.length ? zicht.map(r=>rijHtml(r, pagina)).join('')
      : !q && !f.wie && _netLeeg[sec] ? LEEG_KLAAR('Alles afgerond. Geen lopende dossiers.')
      : `<p class="leeg">${q||f.wie ? 'Niets gevonden.' : 'Geen lopende dossiers.'}</p>`);
  }
}

function rijHtml(r, pagina){
  const sec=r._sec, oms=r[SECS[sec].omschrijving]||'';
  const sleutel=esc(r.taakId || `${r._row}`);
  const n=dagenTot(r.deadline);
  const datumKlas = n===null ? 'datum' : n<0 ? 'laat' : n<=7 ? 'datum dichtbij' : 'datum';
  const midden = sec==='LOD'
    ? `<span class="st afkap" title="${esc(r.status)}"><span class="st-dot ${stDot(r.status)}" aria-hidden="true"></span>${esc(r.status)||'<span class="zacht">Geen status</span>'}</span>`
    : faseHtml(r);
  const wie = r.behandelaar
    ? `<span class="wie"><span class="ini" aria-hidden="true">${esc(initialen(r.behandelaar.split(/\s*,\s*/)[0]))}</span><span class="afkap">${esc(r.behandelaar)}</span></span>`
    : `<span class="zacht">–</span>`;
  return `<div class="rij kol-${pagina}" data-sleutel="${sleutel}">
    <label class="vink"><input type="checkbox" data-actie="dossier-af" data-sec="${esc(sec)}" data-sleutel="${sleutel}" aria-label="Rond af: ${esc(oms)}"><span class="vak" aria-hidden="true">${ICOON.vink}</span></label>
    <span class="vve"><span class="code">${esc(r.code)}</span><span class="naam">${esc(r.naam)}</span></span>
    <button type="button" class="cel-knop afkap" data-actie="dossier-open" data-sec="${esc(sec)}" data-sleutel="${sleutel}" title="${esc(oms)} — klik om te openen">${esc(oms)||'<span class="zacht">(geen omschrijving)</span>'}</button>
    ${midden}${wie}<span class="${datumKlas}">${esc(wanneer(r.deadline))}</span></div>`;
}
// Een LOD-status is vrije tekst; het bolletje volgt een paar herkenbare woorden.
function stDot(status){
  const s=(status||'').toLowerCase();
  if(/afgerond|betaald|voldaan|opgelost/.test(s)) return 'dot-klaar';
  if(/wacht|regeling|aanmaning|herinnering/.test(s)) return 'dot-wacht';
  if(s) return 'dot-loopt';
  return '';
}
function faseHtml(r){
  const nu=faseNr(r.subsidieFase);
  const stappen=SUBSIDIE_FASES.map((f,i)=>{
    const stap=i+1, klas='stap'+(stap<nu?' gedaan':'')+(stap===nu?' nu':'');
    return `<button type="button" class="${klas}" data-actie="dossier-fase" data-sleutel="${esc(r.taakId||String(r._row))}" data-stap="${stap}" aria-pressed="${stap===nu}" aria-label="Fase ${stap}: ${f}"></button>`;
  }).join('');
  return `<span class="fase"><span class="stappen" role="group" aria-label="Fase van ${esc(r.subsidie)}">${stappen}</span><span class="fase-tekst">${esc(SUBSIDIE_FASES[nu-1])}</span></span>`;
}

export function vindInBeeld(sec, sleutel){
  return (D.dossiers[sec]||[]).find(r=>(r.taakId||String(r._row))===sleutel) || null;
}

// ── Schrijfhulpen ───────────────────────────────────────────────────────
const leesNtd = () => fetchSheet(BEREIK.ntd);
async function versOpgezocht(r){
  const rijen=await leesNtd();
  const x=vindDossier(rijen, r);
  if(!x) throw conflict('Dit dossier staat niet meer in de lijst; een collega heeft het mogelijk afgerond. Je scherm is bijgewerkt.');
  if(rijInhoud(r._sec, x.waarden)!==dossierInhoud(r)) throw conflict();
  return x;
}
async function sheetId(tab){
  const id=sheetIdVan(await getSheetIds(), tab);
  if(id==null) throw new Error(`Tabblad '${tab}' niet gevonden`);
  return id;
}
// Rij invoegen aan het eind van een blok in 'Nog Te Doen' en vullen (A..S). Lukt het vullen niet,
// dan gaat de lege rij er weer uit.
async function voegInNtd(sec, waarden){
  const blok=blokken(await leesNtd())[sec];
  if(!blok) throw Object.assign(new Error('Blok ontbreekt'), { melding:`Het blok ${SECS[sec].label} staat niet in het tabblad 'Nog Te Doen'. Er is niets opgeslagen.` });
  const na=invoegNa(blok), id=await sheetId(TAB.NTD);
  await batchUpdate([{ insertDimension:{ range:{ sheetId:id, dimension:'ROWS', startIndex:na, endIndex:na+1 }, inheritFromBefore:true } }]);
  try{ await writeRange(_a1(TAB.NTD, `A${na+1}:S${na+1}`), waarden); }
  catch(e){
    try{ await batchUpdate([{ deleteDimension:{ range:{ sheetId:id, dimension:'ROWS', startIndex:na, endIndex:na+1 } } }]); }catch(_){}
    throw e;
  }
}
const naarA_S = rij => { const v=Array.from({length:19}, (_,i)=>(rij&&rij[i]!=null)?String(rij[i]):''); return v; };

// ── Afronden (vinkje) en ongedaan maken ─────────────────────────────────
export async function rondAf(sec, sleutel){
  const r=vindInBeeld(sec, sleutel);
  if(!r){ meldFout('Dit dossier staat niet meer in beeld. Je scherm is bijgewerkt.'); return; }
  if(!magSchrijven()){ tekenDossiers(); return; }
  const lijst=D.dossiers[sec], pos=lijst.indexOf(r);
  lijst.splice(pos,1);
  _netLeeg[sec] = !lijst.length;
  laatVertrekken(rijVan(sec, sleutel));
  tekenDossiers();
  speel($(PAGINA_VAN_SEC[sec]+'-tel'), 'tik'); speel($('tel-'+PAGINA_VAN_SEC[sec]), 'tik');
  let archiefWaarden=null, ntdWaarden=null;
  const gelukt=schrijf('Afronden mislukt', async()=>{
    const x=await versOpgezocht(r);
    ntdWaarden=naarA_S(x.waarden);
    // A..H uit de Sheet zelf, I = datum afgerond, K/L/Q/R/S mee (zoals afrondWaarden in v15).
    const w=x.waarden, c=i=>(w[i]==null?'':String(w[i]));
    archiefWaarden=[...Array.from({length:8},(_,i)=>c(i)), vandaagSheet(), '', leegBijErfenis(w[10]), leegBijErfenis(w[12]), '', '', '', '', c(16), c(17), c(18)];
    const afBlok=blokken(await fetchSheet(_a1(TAB.AF,'A:A')))[sec];
    if(!afBlok) throw Object.assign(new Error('Blok ontbreekt'), { melding:`Het blok ${SECS[sec].label} staat niet in het tabblad 'Afgerond'. Er is niets gewijzigd.` });
    const afNa=invoegNa(afBlok), afId=await sheetId(TAB.AF), ntdId=await sheetId(TAB.NTD);
    await batchUpdate([
      { insertDimension:{ range:{ sheetId:afId, dimension:'ROWS', startIndex:afNa, endIndex:afNa+1 }, inheritFromBefore:true } },
      { updateCells:{ range:{ sheetId:afId, startRowIndex:afNa, endRowIndex:afNa+1, startColumnIndex:0, endColumnIndex:archiefWaarden.length },
        rows:[{ values:archiefWaarden.map(v=>({ userEnteredValue:{ stringValue:kapCel(String(v)) } })) }], fields:'userEnteredValue' } },
      { deleteDimension:{ range:{ sheetId:ntdId, dimension:'ROWS', startIndex:x.row-1, endIndex:x.row } } },
    ]);
  }, ()=>{ if(!lijst.includes(r)) lijst.splice(Math.min(pos,lijst.length),0,r); });
  ongedaanBalk(`Afgerond: ${r[SECS[sec].omschrijving]||r.naam}`, async()=>{
    if(!await gelukt || !ntdWaarden) return;
    if(!magSchrijven()) return;
    lijst.splice(Math.min(pos,lijst.length),0,r);
    tekenDossiers();
    speel(rijVan(sec, sleutel), 'rij-terug');
    await schrijf('Ongedaan maken mislukt', async()=>{
      // Eerst terug in 'Nog Te Doen', dan pas uit het archief: gaat het halverwege mis, dan staat
      // hij hooguit dubbel en is er niets kwijt.
      await voegInNtd(sec, ntdWaarden);
      const afRijen=await fetchSheet(_a1(TAB.AF,'A:S'));
      const afBlok=blokken(afRijen)[sec];
      const zelfde=x=>naarA_S(x.waarden).slice(0,9).join('\x1f')===archiefWaarden.slice(0,9).join('\x1f')
                    && String(x.waarden[16]||'')===String(archiefWaarden[16]||'');
      const kand=(afBlok?.rijen||[]).filter(zelfde);
      if(kand.length){
        const doel=kand[kand.length-1];
        await batchUpdate([{ deleteDimension:{ range:{ sheetId:await sheetId(TAB.AF), dimension:'ROWS', startIndex:doel.row-1, endIndex:doel.row } } }]);
      }
    }, ()=>{ const i=lijst.indexOf(r); if(i>=0) lijst.splice(i,1); });
  });
}

// ── Fase (Subsidie) ─────────────────────────────────────────────────────
export function zetFase(sleutel, stap){
  const r=vindInBeeld('SUBSIDIE-TRAJECTEN', sleutel);
  if(!r) return;
  const nieuw=SUBSIDIE_FASES[stap-1], oud=r.subsidieFase;
  if(!nieuw || faseNr(oud)===stap) return;
  if(!magSchrijven()) return;
  const kopie={ ...r };            // zoals wij hem kenden, voor de controle
  r.subsidieFase=nieuw;
  tekenDossiers();
  schrijf('Fase niet opgeslagen', async()=>{
    const x=await versOpgezocht(kopie);
    await writeRange(_a1(TAB.NTD, `D${x.row}`), [nieuw]);
  }, ()=>{ r.subsidieFase=oud; });
}

// ── Venster: nieuw of aanpassen ─────────────────────────────────────────
let _open=null;   // { sec, r (null = nieuw), fase }
export function openDossier(sec, sleutel){
  const r = sleutel ? vindInBeeld(sec, sleutel) : null;
  if(sleutel && !r){ meldFout('Dit dossier staat niet meer in beeld. Je scherm is bijgewerkt.'); return; }
  const cfg=SECS[sec], lod=sec==='LOD';
  _open={ sec, r, fase: r ? faseNr(r.subsidieFase) : 1 };
  $('dos-titel').textContent = r ? `${cfg.label}: ${r.naam||r.code}` : (lod ? 'Nieuw LOD-dossier' : 'Nieuw subsidie-traject');
  $('dos-oms-lbl').textContent = cfg.omschrijvingLabel;
  $('dos-oms').value = r ? (r[cfg.omschrijving]||'') : '';
  zetVve($('dos-vve'), r?.code||'', r?.naam||'');
  $('dos-status-veld').hidden = !lod;
  $('dos-fase-veld').hidden = lod;
  $('dos-status').value = r?.status||'';
  tekenFaseKeuze();
  const beh=$('dos-beh');
  const opties=['', ...TEAM];
  if(r?.behandelaar && !opties.includes(r.behandelaar)) opties.push(r.behandelaar);   // een duo-waarde nooit kwijtraken
  beh.innerHTML=opties.map(n=>`<option value="${esc(n)}">${n?esc(n):'Kies…'}</option>`).join('');
  beh.value=r?.behandelaar||'';
  $('dos-deadline').value = naarISO(r?.deadline||'');
  $('dos-opm').value = r?.opmerkingen||'';
  $('dos-af').hidden = !r; $('dos-weg').hidden = !r;
  $('dos-fout').hidden = true;
  $('dossier-bg').classList.add('open');
  setTimeout(()=>(r ? $('dos-oms') : $('dos-vve')).focus(), 0);
}
function tekenFaseKeuze(){
  if(!_open) return;
  $('dos-fase').innerHTML=SUBSIDIE_FASES.map((f,i)=>`<button type="button" class="keuze${_open.fase===i+1?' actief':''}" aria-pressed="${_open.fase===i+1}" data-actie="dos-kies-fase" data-stap="${i+1}">${esc(f)}</button>`).join('');
}
export function kiesFaseInVenster(stap){ if(_open){ _open.fase=stap; tekenFaseKeuze(); } }
export function sluitDossier(){ _open=null; $('dossier-bg').classList.remove('open'); }

export function bewaarDossier(){
  if(!_open) return;
  const { sec, r } = _open, cfg=SECS[sec];
  const { code, naam } = leesVve($('dos-vve'));
  const oms=$('dos-oms').value.trim();
  const fout=t=>{ $('dos-fout').textContent=t; $('dos-fout').hidden=false; };
  if(!code) return fout('Kies een VvE uit de lijst (typ de code of de naam).');
  if(!oms) return fout(`Vul ${cfg.omschrijvingLabel.toLowerCase()} in.`);
  const deadlineRuw=$('dos-deadline').value;
  const nieuw={ code, naam, [cfg.omschrijving]:oms,
    status: sec==='LOD' ? $('dos-status').value.trim() : undefined,
    subsidieFase: sec==='LOD' ? undefined : SUBSIDIE_FASES[_open.fase-1],
    behandelaar:$('dos-beh').value, deadline: deadlineRuw ? naarSheetDatum(deadlineRuw) : '', opmerkingen:$('dos-opm').value.trim() };
  if(!magSchrijven()) return;
  const waardenAG = o => cfg.keys.slice(0,7).map(k=>o[k]??'');
  if(!r){
    const taakId=nieuwTaakId();
    const regel={ ...nieuw, _sec:sec, _row:0, taakId, inBehandeling:false };
    D.dossiers[sec].push(regel);
    sluitDossier();
    tekenDossiers();
    const waarden=[...waardenAG(regel), '', '', '', '', '', '', '', '', '', taakId];   // A..G, H leeg, I..P leeg, Q = taaknummer
    schrijf('Niet toegevoegd', ()=>voegInNtd(sec, waarden), ()=>{ D.dossiers[sec]=D.dossiers[sec].filter(x=>x!==regel); });
    return;
  }
  const kopie={ ...r }, oud={};
  Object.keys(nieuw).forEach(k=>{ if(nieuw[k]!==undefined){ oud[k]=r[k]; r[k]=nieuw[k]; } });
  sluitDossier();
  tekenDossiers();
  schrijf('Niet opgeslagen', async()=>{
    const x=await versOpgezocht(kopie);
    await writeRange(_a1(TAB.NTD, `A${x.row}:G${x.row}`), waardenAG(r));
  }, ()=>{ Object.assign(r, oud); });
}

export async function rondAfUitVenster(){
  if(!_open?.r) return;
  const { sec, r } = _open;
  sluitDossier();
  await rondAf(sec, r.taakId || String(r._row));
}

export async function verwijderUitVenster(){
  if(!_open?.r) return;
  const { sec, r } = _open;
  const ja=await vraagBevestiging({ titel:'Dossier verwijderen?', tekst:`"${r[SECS[sec].omschrijving]||r.naam}" gaat helemaal weg, niet naar Afgerond. Wil je het afronden, gebruik dan het rondje.`, bevestigTekst:'Verwijderen', gevaarlijk:true });
  if(!ja) return;
  sluitDossier();
  if(!magSchrijven()) return;
  const lijst=D.dossiers[sec], pos=lijst.indexOf(r);
  if(pos>=0) lijst.splice(pos,1);
  tekenDossiers();
  let bewaard=null;
  const gelukt=schrijf('Verwijderen mislukt', async()=>{
    const x=await versOpgezocht(r);
    bewaard=naarA_S(x.waarden);
    await batchUpdate([{ deleteDimension:{ range:{ sheetId:await sheetId(TAB.NTD), dimension:'ROWS', startIndex:x.row-1, endIndex:x.row } } }]);
  }, ()=>{ if(!lijst.includes(r)) lijst.splice(Math.min(pos<0?lijst.length:pos,lijst.length),0,r); });
  ongedaanBalk(`Verwijderd: ${r[SECS[sec].omschrijving]||r.naam}`, async()=>{
    if(!await gelukt || !bewaard || !magSchrijven()) return;
    lijst.splice(Math.min(pos<0?lijst.length:pos,lijst.length),0,r);
    tekenDossiers();
    await schrijf('Terugzetten mislukt', ()=>voegInNtd(sec, bewaard), ()=>{ const i=lijst.indexOf(r); if(i>=0) lijst.splice(i,1); });
  });
}

// ── Opstarten ───────────────────────────────────────────────────────────
export function initDossiers(){
  bijNieuweData(tekenDossiers);
  for(const pagina of Object.keys(SEC_VAN_PAGINA)){
    $(pagina+'-zoek').addEventListener('input', e=>{ state.filters[pagina].q=e.target.value; tekenDossiers(); });
  }
  koppelVveVeld($('dos-vve'));
  $('dos-form').addEventListener('submit', e=>{ e.preventDefault(); bewaarDossier(); });
}
