// ══════════════════════════════════════
//  TAKEN — 'Mijn taken': eigen lijst per account, collega's kunnen meekijken
// ══════════════════════════════════════
// Opslag: tabblad 'Mijn taken' (zie TAKEN_KOP in config.js). Afvinken zet een datum in kolom H; de
// regel blijft bewaard. Een rij wordt vlak vóór elke wijziging opnieuw opgezocht op zijn ID, zodat
// rijen die intussen in de Sheet verschoven niet de verkeerde taak raken.
import { state, D } from './state.js';
import { TAB, TAKEN_KOP, TEAM, naamBijEmail } from './config.js';
import { fetchSheet, appendRows, writeRange, batchUpdate, getSheetIds, _a1 } from './api.js';
import { schrijf, magSchrijven, conflict, bijNieuweData, BEREIK } from './data.js';
import { parseTaken, takenKopKlopt } from './parse.js';
import { esc, bevat, nieuwTaakRegelId, nuSheet, vandaagSheet } from './util.js';
import { ongedaanBalk } from './ui.js';
import { koppelVveVeld, leesVve, zetVve } from './vve.js';
import { ICOON } from './iconen.js';

export const ikZelf = () => naamBijEmail(state.currentUserEmail) || (state.currentUserEmail||'').split('@')[0] || 'Ik';
const lijstVan = () => state.lijstVan || ikZelf();
const isEigen = () => lijstVan()===ikZelf();
const open = naam => D.taken.filter(t=>t.eigenaar===naam && !t.afgevinkt);
const $ = id => document.getElementById(id);

// ── Tekenen ─────────────────────────────────────────────────────────────
export function tekenTaken(){
  const ik=ikZelf(), wie=lijstVan(), eigen=isEigen();
  const tel=$('tel-taken'); if(tel) tel.textContent=String(open(ik).length);
  if(!$('pagina-taken')) return;

  $('taken-titel').textContent = eigen ? 'Mijn taken' : `Taken van ${wie}`;
  $('taken-tel').textContent = `${open(wie).length} open`;
  const namen=[ik, ...TEAM.filter(n=>n!==ik)];
  $('taken-wie').innerHTML=namen.map(n=>{
    const aan=n===wie;
    return `<button type="button" class="keuze${aan?' actief':''}" aria-pressed="${aan}" data-actie="lijst-van" data-wie="${esc(n)}">${n===ik?'Ik':esc(n)}<span class="keuze-tel">${open(n).length}</span></button>`;
  }).join('');
  $('taken-info').hidden = eigen;
  $('taken-info-wie').textContent = wie;
  $('taken-nieuw').hidden = !eigen;

  // Een taak die nu bewerkt wordt niet onder de vingers van de gebruiker weghalen.
  if(state.bewerkt && document.querySelector('#taken-rijen form.bewerk')) return;

  const q=(state.filters.taken.q||'').toLowerCase().trim();
  const rijen=open(wie).filter(t=>bevat(q, t.taak, t.code, t.vve, t.notitie))
                       .sort((a,b)=>(b._row||1e9)-(a._row||1e9));   // nieuwste bovenaan (nog niet opgeslagen = bovenaan)
  $('taken-rijen').innerHTML = rijen.length ? rijen.map(t=>rijHtml(t, eigen)).join('')
    : `<p class="leeg">${q ? 'Niets gevonden.' : eigen ? 'Niets op je lijst. Typ hierboven een nieuwe taak.' : `${esc(wie)} heeft niets open staan.`}</p>`;
}

function rijHtml(t, eigen){
  const vve = t.vve || t.code
    ? `<span class="vve"><span class="code">${esc(t.code)}</span><span class="naam">${esc(t.vve)}</span></span>`
    : `<span class="zacht">Geen VvE</span>`;
  const taak = eigen
    ? `<button type="button" class="cel-knop afkap" data-actie="taak-bewerk" data-id="${esc(t.id)}" title="${esc(t.taak)} — klik om aan te passen">${esc(t.taak)}</button>`
    : `<span class="afkap" title="${esc(t.taak)}">${esc(t.taak)}</span>`;
  return `<div class="rij kol-taken" data-id="${esc(t.id)}">
    <label class="vink"><input type="checkbox" data-actie="taak-af" data-id="${esc(t.id)}" ${eigen?'':'disabled'} aria-label="${eigen?'Vink af':'Alleen inzien'}: ${esc(t.taak)}"><span class="vak" aria-hidden="true">${ICOON.vink}</span></label>
    ${taak}${vve}<span class="afkap zacht" title="${esc(t.notitie)}">${esc(t.notitie)}</span></div>`;
}

// ── Toevoegen ───────────────────────────────────────────────────────────
async function zorgVoorTakenTab(){
  if(state._takenTabOk) return;
  let ids=await getSheetIds(true);
  if(ids[TAB.TAKEN]==null){
    try{
      await batchUpdate([{ addSheet:{ properties:{ title:TAB.TAKEN, gridProperties:{ frozenRowCount:1, columnCount:TAKEN_KOP.length } } } }]);
    }catch(e){ if(!/already exists|bestaat al/i.test(e.message||'')) throw e; }
    ids=await getSheetIds(true);
  }
  const kop=(await fetchSheet(_a1(TAB.TAKEN,'A1:H1')))[0]||[];
  if(!kop.length) await writeRange(_a1(TAB.TAKEN,'A1:H1'), TAKEN_KOP);
  else if(!takenKopKlopt(kop)) throw Object.assign(new Error('Kop klopt niet'), { melding:"De kopregel van het tabblad 'Mijn taken' klopt niet meer. Er is niets opgeslagen; vraag even om hulp." });
  state._takenTabOk=true;
  state.takenTabOntbreekt=false;
}

export function voegTaakToe(){
  const veld=$('nieuw-taak'), vveVeld=$('nieuw-vve'), notVeld=$('nieuw-notitie');
  const taak=veld.value.trim();
  if(!taak){ veld.setAttribute('aria-invalid','true'); veld.focus(); return; }
  veld.removeAttribute('aria-invalid');
  if(!isEigen() || !magSchrijven()) return;
  const { code, naam } = leesVve(vveVeld);
  const t={ id:nieuwTaakRegelId(), eigenaar:ikZelf(), taak, code, vve:naam, notitie:notVeld.value.trim(), aangemaakt:nuSheet(), afgevinkt:'', _row:0 };
  D.taken.push(t);
  veld.value=''; zetVve(vveVeld,'',''); notVeld.value='';
  veld.focus();
  tekenTaken();
  schrijf('Taak niet toegevoegd', async()=>{
    await zorgVoorTakenTab();
    await appendRows(_a1(TAB.TAKEN,'A:H'), [[t.id, t.eigenaar, t.taak, t.code, t.vve, t.notitie, t.aangemaakt, '']]);
  }, ()=>{ D.taken=D.taken.filter(x=>x!==t); });
}

// ── Opzoeken vlak vóór het schrijven ────────────────────────────────────
async function verseTaak(id){
  const rijen=await fetchSheet(BEREIK.taken);
  const t=parseTaken(rijen).find(x=>x.id===id);
  if(!t) throw conflict('Deze taak staat niet meer in de Sheet. Je scherm is bijgewerkt.');
  if(t.eigenaar!==ikZelf()) throw conflict('Deze taak staat niet op jouw lijst. Er is niets gewijzigd.');
  return t;
}

// ── Afvinken en ongedaan maken ──────────────────────────────────────────
export function vinkAf(id){
  const t=D.taken.find(x=>x.id===id);
  if(!t || !isEigen() || t.eigenaar!==ikZelf()) return;
  if(!magSchrijven()){ tekenTaken(); return; }
  const datum=vandaagSheet();
  t.afgevinkt=datum;
  tekenTaken();
  const gelukt=schrijf('Afvinken mislukt', async()=>{
    const vers=await verseTaak(id);
    await writeRange(_a1(TAB.TAKEN,`H${vers._row}`), [datum]);
  }, ()=>{ t.afgevinkt=''; });
  ongedaanBalk(`Afgevinkt: ${t.taak}`, async()=>{
    if(!await gelukt) return;              // mislukt = al teruggezet
    if(!magSchrijven()) return;
    t.afgevinkt='';
    tekenTaken();
    await schrijf('Ongedaan maken mislukt', async()=>{
      const vers=await verseTaak(id);
      await writeRange(_a1(TAB.TAKEN,`H${vers._row}`), ['']);
    }, ()=>{ t.afgevinkt=datum; });
  });
}

// ── Bewerken op de plek zelf ────────────────────────────────────────────
export function startBewerken(id){
  const t=D.taken.find(x=>x.id===id);
  if(!t || !isEigen()) return;
  if(state.bewerkt) stopBewerken();
  state.bewerkt=id;
  const rij=document.querySelector(`#taken-rijen .rij[data-id="${CSS.escape(id)}"]`);
  if(!rij) return;
  const form=document.createElement('form');
  form.className='rij kol-taken bewerk';
  form.dataset.id=id;
  form.setAttribute('aria-label','Taak aanpassen');
  form.innerHTML=`<span class="plus" aria-hidden="true">${ICOON.potlood}</span>
    <input type="text" name="taak" aria-label="Taak" value="${esc(t.taak)}">
    <span class="veld-vve"><input type="text" name="vve" aria-label="VvE, mag leeg blijven" placeholder="VvE (mag leeg)" autocomplete="off"></span>
    <span class="bewerk-eind"><input type="text" name="notitie" aria-label="Notitie" placeholder="Notitie" value="${esc(t.notitie)}">
    <button type="submit" class="knop knop-klein">Opslaan</button><button type="button" class="tekst-knop" data-actie="taak-bewerk-stop">Annuleren</button></span>`;
  rij.replaceWith(form);
  const vveVeld=form.elements.vve;
  zetVve(vveVeld, t.code, t.vve);
  koppelVveVeld(vveVeld);
  form.addEventListener('submit', e=>{ e.preventDefault(); bewaarBewerking(form); });
  form.addEventListener('keydown', e=>{ if(e.key==='Escape'){ e.preventDefault(); stopBewerken(); } });
  form.elements.taak.focus();
  form.elements.taak.select();
}
export function stopBewerken(){
  state.bewerkt=null;
  tekenTaken();
}
function bewaarBewerking(form){
  const t=D.taken.find(x=>x.id===form.dataset.id);
  if(!t){ stopBewerken(); return; }
  const taak=form.elements.taak.value.trim();
  if(!taak){ form.elements.taak.setAttribute('aria-invalid','true'); form.elements.taak.focus(); return; }
  const { code, naam } = leesVve(form.elements.vve);
  const notitie=form.elements.notitie.value.trim();
  const oud={ taak:t.taak, code:t.code, vve:t.vve, notitie:t.notitie };
  if(oud.taak===taak && oud.code===code && oud.vve===naam && oud.notitie===notitie){ stopBewerken(); return; }
  if(!magSchrijven()) return;
  Object.assign(t, { taak, code, vve:naam, notitie });
  stopBewerken();
  schrijf('Aanpassen mislukt', async()=>{
    const vers=await verseTaak(t.id);
    await writeRange(_a1(TAB.TAKEN,`C${vers._row}:F${vers._row}`), [taak, code, naam, notitie]);
  }, ()=>{ Object.assign(t, oud); });
}

// ── Opstarten ───────────────────────────────────────────────────────────
export function initTaken(){
  bijNieuweData(tekenTaken);
  const form=$('taken-nieuw');
  form.addEventListener('submit', e=>{ e.preventDefault(); voegTaakToe(); });
  koppelVveVeld($('nieuw-vve'));
  $('taken-zoek').addEventListener('input', e=>{ state.filters.taken.q=e.target.value; tekenTaken(); });
}
export function kiesLijst(naam){
  state.lijstVan = naam===ikZelf() ? null : naam;
  state.bewerkt=null;
  tekenTaken();
}
