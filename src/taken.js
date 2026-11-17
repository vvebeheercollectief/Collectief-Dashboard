// ══════════════════════════════════════
//  TAKEN — 'Mijn taken': eigen lijst per account, collega's kunnen meekijken
// ══════════════════════════════════════
// Opslag: tabblad 'Mijn taken' (zie TAKEN_KOP in config.js). Afvinken zet een datum in kolom H; de
// regel blijft bewaard. Een rij wordt vlak vóór elke wijziging opnieuw opgezocht op zijn ID, zodat
// rijen die intussen in de Sheet verschoven niet de verkeerde taak raken.
//
// Bundels (v16.2): kolom I draagt de naam van een bundel. Taken met dezelfde naam staan samen onder
// één kopje dat in- en uitklapt, met 'Alles afvinken' en 'Opheffen'. Bundelen gaat door een taak op
// een andere te slepen (of op een bundelkop); slepen naar 'Losse taken' haalt hem eruit. Zonder muis
// kan het ook: bij 'aanpassen' staat een veld Bundel. Welke bundels dicht staan, onthoudt de browser.
import { state, D } from './state.js';
import { TAB, TAKEN_KOP, TEAM, BUNDEL_MAX, naamBijEmail } from './config.js';
import { fetchSheet, appendRows, writeRange, writeRanges, batchUpdate, getSheetIds, _a1 } from './api.js';
import { schrijf, magSchrijven, conflict, bijNieuweData, BEREIK } from './data.js';
import { parseTaken, takenKopKlopt } from './parse.js';
import { esc, bevat, nieuwTaakRegelId, nuSheet, vandaagSheet } from './util.js';
import { ongedaanBalk, vraagBevestiging, toast } from './ui.js';
import { koppelVveVeld, leesVve, zetVve } from './vve.js';
import { ICOON } from './iconen.js';

export const ikZelf = () => naamBijEmail(state.currentUserEmail) || (state.currentUserEmail||'').split('@')[0] || 'Ik';
const lijstVan = () => state.lijstVan || ikZelf();
const isEigen = () => lijstVan()===ikZelf();
const open = naam => D.taken.filter(t=>t.eigenaar===naam && !t.afgevinkt);
const $ = id => document.getElementById(id);

// ── Bundels: pure hulpjes ───────────────────────────────────────────────
const nieuwsteEerst = (a,b) => (b._row||1e9)-(a._row||1e9);   // nog niet opgeslagen = bovenaan
const opNaam = (a,b) => a.localeCompare(b, 'nl', { numeric:true, sensitivity:'base' });

// Taken → { bundels:[{ naam, taken }], los:[taak] }. Bundels op naam, taken nieuwste eerst.
export function groepeer(taken){
  const per=new Map(), los=[];
  for(const t of taken){
    if(!t.bundel){ los.push(t); continue; }
    if(!per.has(t.bundel)) per.set(t.bundel, []);
    per.get(t.bundel).push(t);
  }
  const bundels=[...per].map(([naam, lijst])=>({ naam, taken:lijst.sort(nieuwsteEerst) })).sort((a,b)=>opNaam(a.naam, b.naam));
  return { bundels, los:los.sort(nieuwsteEerst) };
}

// Een naam zoals iemand hem typt: spaties netjes, niet te lang.
export const schoneNaam = s => String(s||'').replace(/\s+/g,' ').trim().slice(0, BUNDEL_MAX).trim();

// Bestaat er al een bundel met deze naam (los van hoofdletters)? Dan die schrijfwijze, zodat
// 'notulen' bij 'Notulen' komt en niet ernaast.
export const bestaandeNaam = (naam, namen) => namen.find(n=>n.toLowerCase()===naam.toLowerCase()) || naam;

// Naam voor een nieuwe bundel van twee losse taken: dezelfde VvE → de naam van die VvE, anders
// 'Nieuwe bundel'. Is die naam al bezet, dan met een volgnummer.
export function nieuweBundelNaam(a, b, namen){
  const zelfdeVve = !!(a.code || a.vve) && a.code===b.code && a.vve===b.vve;
  const basis = schoneNaam(zelfdeVve ? (a.vve || a.code) : '') || 'Nieuwe bundel';
  const bezet=new Set(namen.map(n=>n.toLowerCase()));
  if(!bezet.has(basis.toLowerCase())) return basis;
  for(let i=2;;i++){ const n=`${basis} ${i}`; if(!bezet.has(n.toLowerCase())) return n; }
}

// Eén VvE herkennen: op code, en zonder code op de naam.
export const vveSleutel = t => t.code ? 'c:'+t.code : t.vve ? 'n:'+t.vve.toLowerCase() : '';

// Het filter: '' = alles, 'los' = zonder bundel, 'b:<naam>' = één bundel, 'v:<VvE-sleutel>' = één VvE.
export function pastBijFilter(t, f){
  if(!f) return true;
  if(f==='los') return !t.bundel;
  if(f.startsWith('b:')) return t.bundel===f.slice(2);
  if(f.startsWith('v:')) return vveSleutel(t)===f.slice(2);
  return true;
}

const bundelNamen = (naam=ikZelf()) => [...new Set(open(naam).map(t=>t.bundel).filter(Boolean))];

// ── Welke bundels dicht staan (alleen in deze browser) ──────────────────
const DICHT_SLEUTEL='cd16_bundels_dicht';
let _dicht=null;
function dicht(){
  if(_dicht) return _dicht;
  try{ _dicht=new Set(JSON.parse(localStorage.getItem(DICHT_SLEUTEL)||'[]')); }catch(_){ _dicht=new Set(); }
  return _dicht;
}
const dichtSleutel = naam => lijstVan()+'\x1f'+naam;
function zetDicht(naam, aan){
  const s=dicht(), k=dichtSleutel(naam);
  if(aan) s.add(k); else s.delete(k);
  try{ localStorage.setItem(DICHT_SLEUTEL, JSON.stringify([...s])); }catch(_){}
}
export function klapBundel(naam){
  zetDicht(naam, !dicht().has(dichtSleutel(naam)));
  tekenTaken();
  document.querySelector(`#taken-rijen .bundel-pijl[data-bundel="${CSS.escape(naam)}"]`)?.focus();
}

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

  // Niet hertekenen onder de handen van de gebruiker: tijdens het slepen, het aanpassen van een
  // taak of het wijzigen van een bundelnaam. Na afloop tekent het scherm zichzelf opnieuw.
  if(state.sleept) return;
  if(state.bewerkt && document.querySelector('#taken-rijen form.bewerk')) return;
  if(state.hernoemt && document.querySelector('#taken-rijen form.bundel-hernoem')) return;

  const alle=open(wie);
  const alleBundels=groepeer(alle).bundels;
  tekenFilter(alle, alleBundels);
  const datalijst=$('taken-bundels');
  if(datalijst) datalijst.innerHTML=alleBundels.map(b=>`<option value="${esc(b.naam)}"></option>`).join('');

  const f=state.filters.taken.filter, q=(state.filters.taken.q||'').toLowerCase().trim();
  const zichtbaar=alle.filter(t=>pastBijFilter(t, f) && bevat(q, t.taak, t.code, t.vve, t.notitie, t.bundel));
  const { bundels, los }=groepeer(zichtbaar);
  const totaal=new Map(alleBundels.map(b=>[b.naam, b.taken.length]));
  const altijdOpen=!!(q || f);   // bij zoeken of filteren alles uitgeklapt, anders zie je de treffers niet

  let html=bundels.map(b=>bundelHtml(b, totaal.get(b.naam), eigen, altijdOpen)).join('');
  // 'Losse taken' is ook de plek om een taak uit zijn bundel te halen; met een filter alleen als er iets onder staat.
  if(bundels.length && !f.startsWith('b:') && (los.length || !f)) html+=losKopHtml(los.length, eigen);
  html+=los.map(t=>rijHtml(t, eigen)).join('');
  if(!zichtbaar.length){
    html=`<p class="leeg">${q || f ? 'Niets gevonden.' : eigen ? 'Niets op je lijst. Typ hierboven een nieuwe taak.' : `${esc(wie)} heeft niets open staan.`}</p>`;
  } else if(eigen && !alleBundels.length && alle.length>=2 && !q && !f){
    html+=`<p class="tip">Tip: sleep een taak op een andere taak om ze te bundelen.</p>`;
  }
  $('taken-rijen').innerHTML=html;

  const nieuw=$('nieuw-taak');
  nieuw.placeholder = f.startsWith('b:') ? `Nieuwe taak in ${f.slice(2)}, Enter om toe te voegen` : 'Nieuwe taak, Enter om toe te voegen';

  if(state.hernoemt){
    const inp=document.querySelector('#taken-rijen form.bundel-hernoem input');
    if(inp){ inp.focus(); inp.select(); } else state.hernoemt=null;
  }
}

// De keuzelijst 'Filter': alle taken, per bundel, per VvE. Alleen opnieuw opbouwen als er iets
// veranderde, anders klapt een open keuzelijst dicht bij elke verversing.
function tekenFilter(alle, bundels){
  const sel=$('taken-filter'); if(!sel) return;
  let f=state.filters.taken.filter;
  const vves=new Map();
  for(const t of alle){
    const k=vveSleutel(t); if(!k) continue;
    const v=vves.get(k) || { k, code:t.code, vve:t.vve, n:0 };
    v.n++; vves.set(k, v);
  }
  const vveLijst=[...vves.values()].sort((a,b)=>opNaam(a.code||a.vve, b.code||b.vve));
  const opties=[['', 'Alle taken']];
  if(bundels.length) opties.push(['los', `Alleen losse taken (${alle.filter(t=>!t.bundel).length})`]);
  let html=opties.map(([w,l])=>`<option value="${esc(w)}">${esc(l)}</option>`).join('');
  if(bundels.length) html+=`<optgroup label="Bundels">${bundels.map(b=>`<option value="b:${esc(b.naam)}">${esc(b.naam)} (${b.taken.length})</option>`).join('')}</optgroup>`;
  if(vveLijst.length) html+=`<optgroup label="VvE's">${vveLijst.map(v=>`<option value="v:${esc(v.k)}">${esc([v.code, v.vve].filter(Boolean).join(' '))} (${v.n})</option>`).join('')}</optgroup>`;
  const geldig=new Set(['', ...(bundels.length?['los']:[]), ...bundels.map(b=>'b:'+b.naam), ...vveLijst.map(v=>'v:'+v.k)]);
  if(!geldig.has(f)){ f=''; state.filters.taken.filter=''; }   // die bundel of VvE is er niet meer
  if(sel._html!==html){ sel.innerHTML=html; sel._html=html; }
  sel.value=f;
  sel.classList.toggle('aan', !!f);
}

function rijHtml(t, eigen){
  const vve = t.vve || t.code
    ? `<span class="vve"><span class="code">${esc(t.code)}</span><span class="naam">${esc(t.vve)}</span></span>`
    : `<span class="zacht">Geen VvE</span>`;
  const taak = eigen
    ? `<button type="button" class="cel-knop afkap" data-actie="taak-bewerk" data-id="${esc(t.id)}" title="${esc(t.taak)} — klik om aan te passen, sleep om te bundelen">${esc(t.taak)}</button>`
    : `<span class="afkap" title="${esc(t.taak)}">${esc(t.taak)}</span>`;
  return `<div class="rij kol-taken" data-id="${esc(t.id)}" data-drop="taak"${eigen?' draggable="true"':''}>
    <label class="vink"><input type="checkbox" data-actie="taak-af" data-id="${esc(t.id)}" ${eigen?'':'disabled'} aria-label="${eigen?'Vink af':'Alleen inzien'}: ${esc(t.taak)}"><span class="vak" aria-hidden="true">${ICOON.vink}</span></label>
    ${taak}${vve}<span class="afkap zacht" title="${esc(t.notitie)}">${esc(t.notitie)}</span></div>`;
}

function bundelHtml(b, totaal, eigen, altijdOpen){
  const isDicht = !altijdOpen && dicht().has(dichtSleutel(b.naam));
  const n=b.taken.length;
  const telTekst = n===totaal ? String(n) : `${n} van ${totaal}`;
  const naamHtml = eigen && state.hernoemt===b.naam
    ? `<form class="bundel-hernoem" data-oud="${esc(b.naam)}" autocomplete="off"><input type="text" name="naam" value="${esc(b.naam)}" maxlength="${BUNDEL_MAX}" aria-label="Naam van de bundel" enterkeyhint="done"></form>`
    : eigen
      ? `<button type="button" class="cel-knop afkap bundel-naam" data-actie="bundel-hernoem" data-bundel="${esc(b.naam)}" title="${esc(b.naam)} — klik om de naam te wijzigen">${esc(b.naam)}</button>`
      : `<span class="afkap bundel-naam" title="${esc(b.naam)}">${esc(b.naam)}</span>`;
  // In de VvE-kolom: de VvE als alle taken bij dezelfde horen, anders hoeveel VvE's het zijn.
  const vves=[...new Set(b.taken.map(vveSleutel).filter(Boolean))];
  const een = vves.length===1 ? b.taken.find(t=>vveSleutel(t)===vves[0]) : null;
  const vveHtml = een
    ? `<span class="vve"><span class="code">${esc(een.code)}</span><span class="naam">${esc(een.vve)}</span></span>`
    : `<span class="zacht">${vves.length>1 ? `${vves.length} VvE's` : ''}</span>`;
  const knoppenHtml = eigen
    ? `<span class="bundel-knoppen"><button type="button" class="tekst-knop" data-actie="bundel-af" data-bundel="${esc(b.naam)}">Alles afvinken</button><button type="button" class="tekst-knop zacht" data-actie="bundel-op" data-bundel="${esc(b.naam)}">Opheffen</button></span>`
    : `<span></span>`;
  return `<div class="bundel${isDicht?' dicht':''}" data-bundel="${esc(b.naam)}" role="group" aria-label="Bundel ${esc(b.naam)}, ${totaal} ${totaal===1?'taak':'taken'}">
    <div class="bundel-kop kol-taken" data-drop="bundel" data-bundel="${esc(b.naam)}">
      <button type="button" class="bundel-pijl" data-actie="bundel-klap" data-bundel="${esc(b.naam)}" aria-expanded="${!isDicht}" aria-label="${isDicht?'Uitklappen':'Inklappen'}: ${esc(b.naam)}"${altijdOpen?' disabled':''}>${ICOON.pijl}</button>
      <span class="bundel-titel">${naamHtml}<span class="bundel-tel">${esc(telTekst)}</span></span>
      ${vveHtml}${knoppenHtml}
    </div>${isDicht ? '' : b.taken.map(t=>rijHtml(t, eigen)).join('')}</div>`;
}

// Het kopje boven de taken zonder bundel; tijdens het slepen ook de plek om een taak uit zijn bundel
// te halen.
function losKopHtml(n, eigen){
  const hint = eigen ? `<span class="los-hint">Sleep een taak hierheen om hem uit zijn bundel te halen</span>` : `<span></span>`;
  return `<div class="bundel-kop los-kop kol-taken" data-drop="los"><span></span><span class="bundel-titel"><span class="bundel-naam">Losse taken</span><span class="bundel-tel">${n}</span></span>${hint}</div>`;
}

// ── Toevoegen ───────────────────────────────────────────────────────────
// Maakt het tabblad aan als het ontbreekt, en zet bij een tabblad van vóór v16.2 de kolom 'Bundel'
// erbij (eerst het raster een kolom breder: buiten het raster schrijven weigert Google).
async function zorgVoorTakenTab(){
  if(state._takenTabOk) return;
  let ids=await getSheetIds(true);
  if(ids[TAB.TAKEN]==null){
    try{
      await batchUpdate([{ addSheet:{ properties:{ title:TAB.TAKEN, gridProperties:{ frozenRowCount:1, columnCount:TAKEN_KOP.length } } } }]);
    }catch(e){ if(!/already exists|bestaat al/i.test(e.message||'')) throw e; }
    ids=await getSheetIds(true);
  }
  const props=(state._sheetProps||[]).find(p=>p.title===TAB.TAKEN);
  const kolommen=props?.gridProperties?.columnCount || 0;
  if(kolommen && kolommen<TAKEN_KOP.length){
    await batchUpdate([{ appendDimension:{ sheetId:ids[TAB.TAKEN], dimension:'COLUMNS', length:TAKEN_KOP.length-kolommen } }]);
  }
  const kop=(await fetchSheet(_a1(TAB.TAKEN,'1:1')))[0]||[];
  if(!kop.length) await writeRange(_a1(TAB.TAKEN,'A1:I1'), TAKEN_KOP);
  else if(!takenKopKlopt(kop)) throw Object.assign(new Error('Kop klopt niet'), { melding:"De kopregel van het tabblad 'Mijn taken' klopt niet meer. Er is niets opgeslagen; vraag even om hulp." });
  else if(!String(kop[8]??'').trim()) await writeRange(_a1(TAB.TAKEN,'I1'), [TAKEN_KOP[8]]);
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
  const f=state.filters.taken.filter;
  const bundel = f.startsWith('b:') ? f.slice(2) : '';   // filter op een bundel: de taak komt erin
  const t={ id:nieuwTaakRegelId(), eigenaar:ikZelf(), taak, code, vve:naam, notitie:notVeld.value.trim(), aangemaakt:nuSheet(), afgevinkt:'', bundel, _row:0 };
  D.taken.push(t);
  veld.value=''; zetVve(vveVeld,'',''); notVeld.value='';
  vulVveUitFilter();
  veld.focus();
  tekenTaken();
  if(!pastBijFilter(t, f)) toast('Taak toegevoegd', 'Hij valt buiten het filter. Kies "Alle taken" om hem te zien.');
  schrijf('Taak niet toegevoegd', async()=>{
    await zorgVoorTakenTab();
    await appendRows(_a1(TAB.TAKEN,'A:I'), [[t.id, t.eigenaar, t.taak, t.code, t.vve, t.notitie, t.aangemaakt, '', t.bundel]]);
  }, ()=>{ D.taken=D.taken.filter(x=>x!==t); });
}

// ── Filter ──────────────────────────────────────────────────────────────
// Bij een filter op een VvE staat die VvE alvast in het veld voor een nieuwe taak (alleen als het
// veld leeg was), zodat een nieuwe taak niet meteen uit beeld valt.
function vulVveUitFilter(){
  const veld=$('nieuw-vve'), f=state.filters.taken.filter;
  if(!f.startsWith('v:') || veld.value.trim()) return;
  const t=open(lijstVan()).find(x=>vveSleutel(x)===f.slice(2));
  if(!t) return;
  zetVve(veld, t.code, t.vve);
  veld.dataset.uitFilter=veld.value;
}
export function kiesFilter(waarde){
  const veld=$('nieuw-vve');
  if(veld.dataset.uitFilter && veld.value===veld.dataset.uitFilter) zetVve(veld,'','');
  delete veld.dataset.uitFilter;
  state.filters.taken.filter=waarde||'';
  vulVveUitFilter();
  tekenTaken();
}

// ── Opzoeken vlak vóór het schrijven ────────────────────────────────────
async function verseTaak(id){
  const rijen=await fetchSheet(BEREIK.taken);
  const t=parseTaken(rijen).find(x=>x.id===id);
  if(!t) throw conflict('Deze taak staat niet meer in de Sheet. Je scherm is bijgewerkt.');
  if(t.eigenaar!==ikZelf()) throw conflict('Deze taak staat niet op jouw lijst. Er is niets gewijzigd.');
  return t;
}
// Hetzelfde voor een reeks taken in één keer. Ontbreekt er één, dan wordt er niets geschreven.
async function verseTaken(ids){
  const lijst=parseTaken(await fetchSheet(BEREIK.taken));
  return ids.map(id=>{
    const t=lijst.find(x=>x.id===id);
    if(!t) throw conflict('Een van deze taken staat niet meer in de Sheet. Er is niets gewijzigd; je scherm is bijgewerkt.');
    if(t.eigenaar!==ikZelf()) throw conflict('Een van deze taken staat niet op jouw lijst. Er is niets gewijzigd.');
    return t;
  });
}
// Eén kolom (H = afgevinkt, I = bundel) van een reeks taken in één verzoek. `paren` is [[taak, waarde]].
function schrijfKolom(kolom, paren, foutTitel, terugdraaien){
  return schrijf(foutTitel, async()=>{
    if(kolom==='I') await zorgVoorTakenTab();
    const vers=await verseTaken(paren.map(([t])=>t.id));
    await writeRanges(vers.map((v,i)=>({ bereik:_a1(TAB.TAKEN, `${kolom}${v._row}`), waarden:[paren[i][1]] })));
  }, terugdraaien);
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

// Een hele bundel in één keer afvinken, na een ja/nee-vraag. Ongedaan maken zet ze allemaal terug.
export async function bundelAf(naam){
  if(!isEigen()) return;
  const n=open(ikZelf()).filter(t=>t.bundel===naam).length;
  if(!n) return;
  const ja=await vraagBevestiging({
    titel:'Hele bundel afvinken?',
    tekst: n===1 ? `De taak in "${naam}" wordt afgevinkt.` : `Alle ${n} taken in "${naam}" worden afgevinkt. Daarna kun je het nog ongedaan maken.`,
    bevestigTekst: n===1 ? 'Afvinken' : `${n} taken afvinken`,
  });
  if(!ja || !magSchrijven()) return;
  const lijst=open(ikZelf()).filter(t=>t.bundel===naam);   // opnieuw: de lijst kan intussen ververst zijn
  if(!lijst.length) return;
  const datum=vandaagSheet();
  lijst.forEach(t=>{ t.afgevinkt=datum; });
  tekenTaken();
  const gelukt=schrijfKolom('H', lijst.map(t=>[t, datum]), 'Afvinken mislukt', ()=>lijst.forEach(t=>{ t.afgevinkt=''; }));
  ongedaanBalk(`Afgevinkt: ${naam} (${lijst.length})`, async()=>{
    if(!await gelukt || !magSchrijven()) return;
    lijst.forEach(t=>{ t.afgevinkt=''; });
    tekenTaken();
    await schrijfKolom('H', lijst.map(t=>[t, '']), 'Ongedaan maken mislukt', ()=>lijst.forEach(t=>{ t.afgevinkt=datum; }));
  });
}

// ── Bundelen ────────────────────────────────────────────────────────────
// Zet de bundel van een reeks taken: eerst in beeld, dan in de Sheet. `paren` is [[taak, naam]].
// Met `ongedaanTekst` verschijnt de balk 'Ongedaan maken'.
function zetBundels(paren, foutTitel, ongedaanTekst){
  paren=paren.filter(([t, naam])=>t.bundel!==naam);
  if(!paren.length || !magSchrijven()) return null;
  const oud=paren.map(([t])=>[t, t.bundel]);
  const nieuw=()=>paren.forEach(([t, naam])=>{ t.bundel=naam; });
  const terug=()=>oud.forEach(([t, naam])=>{ t.bundel=naam; });
  nieuw();
  tekenTaken();
  const gelukt=schrijfKolom('I', paren, foutTitel, terug);
  if(ongedaanTekst) ongedaanBalk(ongedaanTekst, async()=>{
    if(!await gelukt || !magSchrijven()) return;
    terug();
    tekenTaken();
    await schrijfKolom('I', oud, 'Ongedaan maken mislukt', nieuw);
  });
  return gelukt;
}

// Taak `id` losgelaten op een doel (zie dropDoel).
export function laatLos(id, doel){
  const t=D.taken.find(x=>x.id===id);
  if(!t || !doel || !isEigen() || t.eigenaar!==ikZelf()) return;
  if(doel.soort==='los') return zetBundels([[t, '']], 'Uit bundel halen mislukt', `Uit bundel gehaald: ${t.taak}`);
  if(doel.soort==='bundel') return zetBundels([[t, doel.naam]], 'Bundelen mislukt', `In ${doel.naam}: ${t.taak}`);
  const b=D.taken.find(x=>x.id===doel.id);
  if(!b || b===t) return;
  const naam=nieuweBundelNaam(t, b, bundelNamen());
  const gelukt=zetBundels([[t, naam], [b, naam]], 'Bundelen mislukt', 'Twee taken gebundeld');
  if(!gelukt) return;
  zetDicht(naam, false);
  startHernoemen(naam);   // meteen een naam geven; Enter of ergens anders klikken bewaart hem
  return gelukt;
}

export function bundelOpheffen(naam){
  if(!isEigen()) return;
  const lijst=open(ikZelf()).filter(t=>t.bundel===naam);
  return zetBundels(lijst.map(t=>[t, '']), 'Opheffen mislukt', `Bundel opgeheven: ${naam}`);
}

// ── Bundelnaam wijzigen ─────────────────────────────────────────────────
export function startHernoemen(naam){
  if(!isEigen()) return;
  const al=document.querySelector('#taken-rijen form.bundel-hernoem');
  if(al) bewaarHernoemen(al);   // een ander naamveld stond nog open: eerst dat bewaren
  state.hernoemt=naam;
  tekenTaken();
}
function stopHernoemen(){
  state.hernoemt=null;
  tekenTaken();
}
function bewaarHernoemen(form){
  if(form._klaar) return;
  form._klaar=true;
  const oud=form.dataset.oud;
  const naam=schoneNaam(form.elements.naam.value);
  state.hernoemt=null;
  if(!naam || naam===oud){ tekenTaken(); return; }
  const nieuw=bestaandeNaam(naam, bundelNamen().filter(n=>n!==oud));   // gelijk aan een andere bundel = samenvoegen
  const wasDicht=dicht().has(dichtSleutel(oud));
  zetDicht(oud, false); if(wasDicht) zetDicht(nieuw, true);
  if(state.filters.taken.filter==='b:'+oud) state.filters.taken.filter='b:'+nieuw;
  const lijst=open(ikZelf()).filter(t=>t.bundel===oud);
  if(!zetBundels(lijst.map(t=>[t, nieuw]), 'Naam wijzigen mislukt')) tekenTaken();
}

// ── Slepen ──────────────────────────────────────────────────────────────
// Waar mag de gesleepte taak heen? Op een losse taak (nieuwe bundel), een bundel (kop of een taak
// erin) of 'Losse taken'. Geeft { el, soort, … } of null als loslaten hier niets verandert.
function dropDoel(el){
  const t=D.taken.find(x=>x.id===state.sleept);
  const plek=el && el.closest ? el.closest('#taken-rijen [data-drop]') : null;
  if(!t || !plek) return null;
  const d=plek.dataset;
  if(d.drop==='los') return t.bundel ? { el:plek, soort:'los' } : null;
  if(d.drop==='bundel') return t.bundel!==d.bundel ? { el:plek.closest('.bundel'), soort:'bundel', naam:d.bundel } : null;
  if(d.drop==='taak'){
    const doel=D.taken.find(x=>x.id===d.id);
    if(!doel || doel===t) return null;
    if(doel.bundel) return t.bundel!==doel.bundel ? { el:plek.closest('.bundel'), soort:'bundel', naam:doel.bundel } : null;
    return { el:plek, soort:'taak', id:doel.id };
  }
  return null;
}
let _gemarkeerd=null;
function markeer(el){
  if(_gemarkeerd===el) return;
  _gemarkeerd?.classList.remove('drop-aan');
  _gemarkeerd=el||null;
  _gemarkeerd?.classList.add('drop-aan');
}
function stopSlepen(){
  if(!state.sleept) return;
  state.sleept=null;
  markeer(null);
  $('taken-rijen').classList.remove('bij-slepen');
  tekenTaken();
}
function koppelSlepen(host){
  host.addEventListener('dragstart', e=>{
    const rij=e.target.closest && e.target.closest('.rij[draggable="true"]');
    if(!rij || !isEigen()){ return; }
    state.sleept=rij.dataset.id;
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain', rij.dataset.id);   // zonder dit begint Firefox niet
    host.classList.add('bij-slepen');
    requestAnimationFrame(()=>rij.classList.add('sleept'));
  });
  host.addEventListener('dragover', e=>{
    if(!state.sleept) return;
    const doel=dropDoel(e.target);
    markeer(doel && doel.el);
    if(doel){ e.preventDefault(); e.dataTransfer.dropEffect='move'; }
  });
  host.addEventListener('dragleave', e=>{ if(!host.contains(e.relatedTarget)) markeer(null); });
  host.addEventListener('drop', e=>{
    if(!state.sleept) return;
    e.preventDefault();
    const id=state.sleept, doel=dropDoel(e.target);
    stopSlepen();
    if(doel) laatLos(id, doel);
  });
  // Losgelaten buiten de lijst, of met Escape afgebroken.
  document.addEventListener('dragend', ()=>stopSlepen());
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
    <button type="submit" class="knop knop-klein">Opslaan</button><button type="button" class="tekst-knop" data-actie="taak-bewerk-stop">Annuleren</button></span>
    <span class="bewerk-bundel"><input type="text" name="bundel" aria-label="Bundel, mag leeg blijven" placeholder="Bundel (mag leeg)" list="taken-bundels" maxlength="${BUNDEL_MAX}" autocomplete="off" value="${esc(t.bundel)}"></span>`;
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
  const bundelNaam=schoneNaam(form.elements.bundel.value);
  const bundel=bundelNaam ? bestaandeNaam(bundelNaam, bundelNamen()) : '';
  const oud={ taak:t.taak, code:t.code, vve:t.vve, notitie:t.notitie, bundel:t.bundel };
  const inhoudGelijk = oud.taak===taak && oud.code===code && oud.vve===naam && oud.notitie===notitie;
  if(inhoudGelijk && oud.bundel===bundel){ stopBewerken(); return; }
  if(!magSchrijven()) return;
  Object.assign(t, { taak, code, vve:naam, notitie, bundel });
  stopBewerken();
  schrijf('Aanpassen mislukt', async()=>{
    if(oud.bundel!==bundel) await zorgVoorTakenTab();
    const vers=await verseTaak(t.id);
    const lijst=[];
    if(!inhoudGelijk) lijst.push({ bereik:_a1(TAB.TAKEN,`C${vers._row}:F${vers._row}`), waarden:[taak, code, naam, notitie] });
    if(oud.bundel!==bundel) lijst.push({ bereik:_a1(TAB.TAKEN,`I${vers._row}`), waarden:[bundel] });
    await writeRanges(lijst);
  }, ()=>{ Object.assign(t, oud); });
}

// ── Opstarten ───────────────────────────────────────────────────────────
export function initTaken(){
  bijNieuweData(tekenTaken);
  const form=$('taken-nieuw');
  form.addEventListener('submit', e=>{ e.preventDefault(); voegTaakToe(); });
  koppelVveVeld($('nieuw-vve'));
  $('taken-zoek').addEventListener('input', e=>{ state.filters.taken.q=e.target.value; tekenTaken(); });
  $('taken-filter').addEventListener('change', e=>kiesFilter(e.target.value));
  const host=$('taken-rijen');
  koppelSlepen(host);
  // Bundelnaam: Enter of ergens anders klikken bewaart, Escape breekt af.
  host.addEventListener('submit', e=>{
    const f=e.target.closest('form.bundel-hernoem'); if(!f) return;
    e.preventDefault(); bewaarHernoemen(f);
  });
  host.addEventListener('focusout', e=>{
    const f=e.target.closest && e.target.closest('form.bundel-hernoem');
    if(f && !f.contains(e.relatedTarget)) bewaarHernoemen(f);
  });
  host.addEventListener('keydown', e=>{
    const f=e.target.closest && e.target.closest('form.bundel-hernoem');
    if(f && e.key==='Escape'){ e.preventDefault(); f._klaar=true; stopHernoemen(); }
  });
}
export function kiesLijst(naam){
  state.lijstVan = naam===ikZelf() ? null : naam;
  state.bewerkt=null;
  state.hernoemt=null;
  const veld=$('nieuw-vve');
  if(veld && veld.dataset.uitFilter && veld.value===veld.dataset.uitFilter) zetVve(veld,'','');
  if(veld) delete veld.dataset.uitFilter;
  state.filters.taken.filter='';   // de bundels en VvE's verschillen per lijst
  tekenTaken();
}
