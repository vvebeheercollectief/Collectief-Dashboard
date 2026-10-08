// ══════════════════════════════════════
//  OFFERTEVERGELIJKER — het venster: slepen, lezen, nakijken, downloaden
//  Eén sessie per offerte-traject, in het geheugen tot je opnieuw begint of het dashboard
//  sluit: wie het venster dichtdoet en weer opent, staat terug in het nakijkscherm zonder
//  opnieuw te betalen (spec: Toestand in de browser).
// ══════════════════════════════════════
import { D } from './state.js';
import { esc, aannSleutel, parseAannemers } from './util.js';
import { IS_STAGING } from './config.js';
import { offerteUpload, offerteVergelijk, offerteWis } from './api.js';
import { logEvent } from './render-overig.js';
import { getCurrentWho, showToast } from './notifications.js';
import { DEEL_MAX, controleerBestanden, raadAannemer, planDelen, valideerAntwoord, maakOverzicht,
  controleerSommen, celMarkering, zetCel, logRegelTekst, bestandsNaam, trajectNaam } from './vergelijk-model.js';
import { laadPdfLib, knipDeel, pdfInhoud, downloadPdf } from './vergelijk-pdf.js';

const _sessies = new Map();
let _actief = null;
let _vensterGekoppeld = false;
const sessie = () => _sessies.get(_actief);
export const _vergelijkerSessie = () => sessie();
export function _resetVergelijker(){ _sessies.clear(); _actief = null; }

function _vindTraject(sleutel){
  const t = (D.ntd['OFFERTE-TRAJECTEN'] || []).filter(r => aannSleutel(r) === sleutel);
  return t.length === 1 ? t[0] : null;
}
function nieuweSessie(r, sleutel){
  return { sleutel, code:r.code || '', vveNaam:r.naam || r.code || '', traject:trajectNaam(r.opmerkingen),
    aannemers:parseAannemers(r.aannemers).map(a => a.naam), stap:'slepen', bestanden:[], fouten:[], melding:'',
    model:'claude-sonnet-5-5', voortgang:'', overzicht:null, gelezenDoor:'', paginas:0, bewerk:null,
    gelogd:false, logFout:false, logBezig:false, bezig:false };
}

export function openVergelijker(sleutel){
  const r = _vindTraject(sleutel);
  if(!r){ showToast('Traject niet gevonden', 'Vernieuw het dashboard en probeer het opnieuw.', 'var(--rd)', null, { geenSysteemmelding:true }); return; }
  if(!_sessies.has(sleutel)) _sessies.set(sleutel, nieuweSessie(r, sleutel));
  else _sessies.get(sleutel).aannemers = parseAannemers(r.aannemers).map(a => a.naam);
  _actief = sleutel;
  koppelVenster();
  render();
  document.getElementById('ov-bg').classList.add('open');
}

// Eén keer, op het hele venster. Een PDF die naast het sleepvlak valt, opent de browser anders
// zelf: dan is het dashboard weg, en met hem elke (betaalde) vergelijking in het geheugen. Dus
// overal in het venster opvangen, en in de stap 'slepen' telt zo'n bestand gewoon mee.
function koppelVenster(){
  if(_vensterGekoppeld) return;
  _vensterGekoppeld = true;
  const bg = document.getElementById('ov-bg');
  bg.addEventListener('dragover', e => {
    e.preventDefault();
    const s = sessie();
    if(e.dataTransfer) e.dataTransfer.dropEffect = s && s.stap === 'slepen' ? 'copy' : 'none';
  });
  bg.addEventListener('drop', e => {
    e.preventDefault();
    document.getElementById('ov-drop')?.classList.remove('over');
    const s = sessie();
    // Kopie van de lijst nu al: buiten de gebeurtenis geeft dataTransfer niets meer prijs.
    if(s && s.stap === 'slepen' && e.dataTransfer && e.dataTransfer.files.length) voegBestandenToe([...e.dataTransfer.files]);
  });
}
export function sluitVergelijker(){ document.getElementById('ov-bg').classList.remove('open'); }
export function nieuweVergelijking(){
  const s = sessie(); if(!s) return;
  const r = _vindTraject(s.sleutel);
  if(r) _sessies.set(s.sleutel, nieuweSessie(r, s.sleutel));
  render();
}

export async function voegBestandenToe(files){
  const s = sessie(); if(!s || s.stap !== 'slepen') return;
  let PDFLib;
  try { PDFLib = await laadPdfLib(); }
  catch(_) { s.melding = 'De PDF-lezer kon niet laden. Controleer de verbinding en probeer het opnieuw.'; render(s); return; }
  for(const file of [...files]){
    const b = { file, naam:file.name, grootte:file.size, isPdf:/\.pdf$/i.test(file.name) || file.type === 'application/pdf', paginas:0, versleuteld:false, kolom:'' };
    if(b.isPdf){
      try { b.paginas = (await PDFLib.PDFDocument.load(await file.arrayBuffer())).getPageCount(); }
      catch(e){ if(/encrypt/i.test((e && e.message) || '')) b.versleuteld = true; }
    }
    const vrij = s.aannemers.filter(n => !s.bestanden.some(x => x.kolom === n));
    const i = raadAannemer(b.naam, vrij);
    b.kolom = i >= 0 ? vrij[i] : '';
    s.bestanden.push(b);
  }
  s.fouten = []; s.melding = '';
  render(s);
}
export function verwijderBestand(i){
  const s = sessie(); if(!s || s.stap !== 'slepen') return;
  s.bestanden.splice(i, 1); s.fouten = [];
  render(s);
}

function foutTekst(e){
  if(e && e.status === 401) return 'Je sessie is verlopen. Vernieuw de pagina en log opnieuw in.';
  if(e && e.status === 403) return 'Je hebt geen toegang tot de offertevergelijker.';
  return (e && e.message) || 'Er ging iets mis. Probeer het opnieuw.';
}

// Eén bestand in delen van hoogstens DEEL_MAX bytes, met hun oorspronkelijke paginabereik.
async function delenVan(PDFLib, b){
  const bytes = new Uint8Array(await b.file.arrayBuffer());
  if(bytes.length <= DEEL_MAX) return [{ van:1, tot:b.paginas, bytes }];
  const bron = await PDFLib.PDFDocument.load(bytes);
  const cache = new Map();
  const maak = async (van, tot) => {
    const k = van + '-' + tot;
    if(!cache.has(k)) cache.set(k, await knipDeel(PDFLib, bron, van, tot));
    return cache.get(k);
  };
  const delen = [];
  for(const d of await planDelen(b.paginas, async (van, tot) => (await maak(van, tot)).length))
    delen.push({ ...d, bytes:await maak(d.van, d.tot) });
  return delen;
}

export async function vergelijk(){
  const s = sessie(); if(!s || s.bezig) return;
  s.fouten = controleerBestanden(s.bestanden);
  if(s.fouten.length){ s.stap = 'slepen'; render(s); return; }
  s.bezig = true; s.stap = 'lezen'; s.melding = ''; s.voortgang = 'Offertes klaarmaken…';
  render(s);
  const bewijzen = [];
  try {
    const PDFLib = await laadPdfLib();
    const offertes = [];
    for(const [i, b] of s.bestanden.entries()){
      s.voortgang = `Offerte ${i + 1} van ${s.bestanden.length} versturen…`; render(s);
      const verstuurd = [];
      for(const d of await delenVan(PDFLib, b)){
        const bewijs = await offerteUpload(d.bytes, b.naam);
        bewijzen.push(bewijs);
        verstuurd.push({ bewijs, van:d.van, tot:d.tot });
      }
      offertes.push({ naam:b.kolom.trim(), paginas:b.paginas, delen:verstuurd });
    }
    s.voortgang = 'Claude leest de offertes…'; render(s);
    const uit = await offerteVergelijk({ vve:s.vveNaam, traject:s.traject, offertes, ...(IS_STAGING ? { model:s.model } : {}) });
    const namen = offertes.map(o => o.naam);
    const fout = valideerAntwoord(uit.antwoord, namen.length);
    if(fout) throw new Error(fout);
    s.overzicht = maakOverzicht(uit.antwoord, namen);
    s.gelezenDoor = uit.model || '';
    s.paginas = 0;
    for(const o of offertes) s.paginas += o.paginas;
    s.stap = 'nakijken'; s.gelogd = false; s.logFout = false; s.bewerk = null;
    // Ook als er intussen een ánder traject in het venster staat: dan zie je deze niet.
    if(!document.getElementById('ov-bg').classList.contains('open') || s !== sessie())
      showToast('Vergelijking klaar', 'Open de offertevergelijker bij het traject om na te kijken.', 'var(--gn)', null, { geenSysteemmelding:true });
  } catch(e){
    // Na een geslaagde vergelijking heeft de proxy de bestanden al gewist; dit vangt een fout halverwege.
    offerteWis(bewijzen);
    s.stap = 'slepen'; s.melding = foutTekst(e);
  } finally { s.bezig = false; render(s); }
}

export function startBewerk(blok, rij, kol){
  const s = sessie(); if(!s || s.stap !== 'nakijken') return;
  if(s.bewerk) stopBewerk(true);
  s.bewerk = { blok, rij, kol };
  render();
}
export function stopBewerk(bewaren){
  const s = sessie(); if(!s || !s.bewerk) return;
  const b = s.bewerk;
  s.bewerk = null;   // eerst: de focusout van het verdwijnende veld vindt dan niets meer te doen
  if(bewaren){
    const tekst = document.getElementById('ov-edit')?.value ?? '';
    const waarde = b.blok === 'onderdelen' ? { status:document.getElementById('ov-edit-status')?.value, toelichting:tekst } : tekst;
    zetCel(s.overzicht, b.blok, b.rij, b.kol, waarde);
  }
  tekenCelOpnieuw(s, b);
}

// Alleen de bewerkte cel en de kop (optelsom-waarschuwing) opnieuw, niet het hele venster. stopBewerk
// loopt meestal vanuit focusout, en die valt tussen mousedown en click in: een volledige hertekening
// verving dan precies de knop waarop geklikt werd, en de klik (volgende cel, 'PDF downloaden') ging
// verloren. zetCel raakt alleen die ene cel, dus meer hoeft er ook niet.
function tekenCelOpnieuw(s, b){
  const oud = document.querySelector('#ov-body .ov-bew');
  const kop = document.querySelector('#ov-body .ov-t thead');
  if(!oud || !kop || s.stap !== 'nakijken' || s !== sessie()){ render(s); return; }
  const o = s.overzicht;
  if(b.blok === 'opvallend'){
    const p = o.opvallend[b.rij];
    if(p) oud.outerHTML = opvallendHtml(s, p, b.rij);
    else {
      // Leeg gemaakt = weggehaald: de punten erna schuiven een plaats op.
      const ul = oud.parentElement;
      oud.remove();
      ul.querySelectorAll('.ov-cel[data-blok="opvallend"]').forEach((x, i) => { x.dataset.rij = i; });
      if(!o.opvallend.length) ul.innerHTML = LEEG_OPV;
    }
  } else {
    const c = o[b.blok][b.rij].cellen[b.kol];
    oud.outerHTML = b.blok === 'onderdelen' ? onderdeelHtml(s, b.rij, b.kol, c) : celHtml(s, b.blok, b.rij, b.kol, c, b.blok === 'bedragen');
  }
  kop.innerHTML = kopHtml(s);
}

export async function download(){
  const s = sessie(); if(!s || !s.overzicht || s.bezig) return;
  s.bezig = true; render(s);
  try {
    const nu = new Date();
    await downloadPdf(pdfInhoud(s.overzicht, { vveNaam:s.vveNaam, traject:s.traject, datum:nu }), bestandsNaam(s.vveNaam, nu));
    s.melding = '';
  } catch(e){
    s.melding = 'De PDF kon niet gemaakt worden: ' + ((e && e.message) || 'onbekende fout');
    s.bezig = false; render(s);
    return;
  }
  // bezig blijft aan tot de logregel er staat: anders schreef een tweede klik op 'PDF downloaden'
  // tijdens het wegschrijven een tweede regel (gelogd wordt pas waar als de Sheet antwoordt).
  try { if(!s.gelogd) await schrijfLogregel(s); }
  finally { s.bezig = false; render(s); }
}

// Eén regel per vergelijking, via de gewone schrijfroute voor notities (logEvent).
// Zonder argument: het traject dat nu in het venster staat (knop 'Opnieuw proberen').
// logBezig: een tweede aanroep tijdens het wegschrijven doet niets (anders twee regels).
export async function schrijfLogregel(s = sessie()){
  if(!s || !s.overzicht || s.gelogd || s.logBezig) return;
  s.logBezig = true;
  const tekst = logRegelTekst(s.overzicht.kolommen, s.traject);
  let ok = false;
  try { ok = await logEvent(s.code, 'OFFERTE-TRAJECTEN', 'Opmerking', '', '', tekst); }
  finally { s.logBezig = false; }
  s.gelogd = ok; s.logFout = !ok;
  if(ok){
    D.logboek.unshift({ _row:0, timestamp:new Date().toISOString(), code:s.code, sectie:'OFFERTE-TRAJECTEN', actie:'Opmerking',
      veld:'', oudeWaarde:'', nieuweWaarde:tekst, gebruiker:getCurrentWho() || '?' });
    showToast('In het logboek gezet', tekst, 'var(--gn)', null, { geenSysteemmelding:true });
  }
  render(s);
}

// ── Tekenen ──
const mb = n => (n / 1048576).toLocaleString('nl-NL', { maximumFractionDigits:1 }) + ' MB';
const meldingen = s => [...s.fouten, s.melding].filter(Boolean).map(t => `<p class="ov-fout" role="alert">${esc(t)}</p>`).join('');
const PAG = p => p ? `<span class="ov-ref">p. ${p}</span>` : '';
const STATUS = { inbegrepen:'Inbegrepen', uitgesloten:'Uitgesloten', niet_genoemd:'Niet genoemd' };
const modelNaam = id => /haiku/.test(id) ? 'Claude Haiku' + (/5-5/.test(id) ? ' 5.5' : '')
  : /sonnet/.test(id) ? 'Claude Sonnet' + (/5-5/.test(id) ? ' 5.5' : '') : id;
const isBewerk = (s, blok, ri, ki) => !!s.bewerk && s.bewerk.blok === blok && s.bewerk.rij === ri && s.bewerk.kol === ki;

function htmlSlepen(s){
  const rijen = s.bestanden.map((b, i) => `<div class="ov-frij">
      <span class="ov-fnaam" title="${esc(b.naam)}">${esc(b.naam)}</span>
      <span class="ov-fmeta">${b.paginas ? b.paginas + ' pag. · ' : ''}${mb(b.grootte)}</span>
      <input class="ov-fkol" data-idx="${i}" list="ov-aannemers" value="${esc(b.kolom)}" placeholder="Kies of typ de aannemer" autocomplete="off" aria-label="Aannemer bij ${esc(b.naam)}">
      <button type="button" class="ov-fweg" data-action="ov-verwijder" data-idx="${i}" aria-label="${esc(b.naam)} weghalen">×</button>
    </div>`).join('');
  const model = IS_STAGING ? `<label class="ov-model">Model (alleen op staging)
      <select id="ov-model"><option value="claude-haiku-5-5"${s.model === 'claude-haiku-5-5' ? ' selected' : ''}>Haiku 5.5</option>
      <option value="claude-sonnet-5-5"${s.model === 'claude-sonnet-5-5' ? ' selected' : ''}>Sonnet 5.5</option></select></label>` : '';
  return `<div class="ov-drop" id="ov-drop" role="button" tabindex="0" data-action="ov-kies">
      <b>Sleep de offertes hierheen</b><span>PDF, twee tot vier offertes · of <u>kies bestanden</u></span>
    </div>
    <input type="file" id="ov-file" accept="application/pdf,.pdf" multiple hidden>
    <datalist id="ov-aannemers">${s.aannemers.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    ${s.bestanden.length ? `<div class="ov-flist">${rijen}</div>
      <p class="ov-klein">Achter elk bestand staat bij welke aannemer het hoort. Klopt het niet, kies of typ dan de goede naam.</p>` : ''}
    ${model}${meldingen(s)}`;
}

function htmlLezen(s){
  return `<div class="ov-flist">${s.bestanden.map(b => `<div class="ov-frij"><span class="ov-fnaam">${esc(b.kolom)}</span><span class="ov-fmeta">${b.paginas} pag.</span></div>`).join('')}</div>
    <div class="ov-balk" role="progressbar" aria-label="Bezig met lezen"><span></span></div>
    <p class="ov-klein" aria-live="polite">${esc(s.voortgang)} Dit duurt meestal een halve tot een hele minuut. Je kunt ondertussen verder in het dashboard.</p>`;
}

function celHtml(s, blok, ri, ki, c, rechts){
  if(isBewerk(s, blok, ri, ki))
    return `<td class="ov-bew${rechts ? ' r' : ''}"><span class="ov-editor"><input id="ov-edit" value="${esc(c.tekst)}" aria-label="Nieuwe waarde"></span></td>`;
  const m = celMarkering(c);
  const extra = m === 'berekend' ? `<span class="ov-berekend">berekend · ${esc(c.som)}</span>`
    : m === 'geen_pagina' ? '<span class="ov-ref">geen pagina</span>' : '';
  return `<td class="${rechts ? 'r ' : ''}${m === 'ontbreekt' || m === 'geen_pagina' ? 'ov-oranje' : ''}"><button type="button" class="ov-cel" data-action="ov-cel" data-blok="${blok}" data-rij="${ri}" data-kol="${ki}">${c.tekst ? esc(c.tekst) + PAG(c.pagina) : 'Niet vermeld in de offerte'}${extra}</button></td>`;
}
function onderdeelHtml(s, ri, ki, c){
  if(isBewerk(s, 'onderdelen', ri, ki))
    return `<td class="ov-bew"><span class="ov-editor"><select id="ov-edit-status" aria-label="Zit het erin?">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === c.status ? ' selected' : ''}>${v}</option>`).join('')}</select><input id="ov-edit" value="${esc(c.toelichting)}" placeholder="Toelichting" aria-label="Toelichting"></span></td>`;
  const oranje = c.status !== 'niet_genoemd' && !c.pagina && !c.handmatig;
  return `<td class="${oranje ? 'ov-oranje' : ''}"><button type="button" class="ov-cel" data-action="ov-cel" data-blok="onderdelen" data-rij="${ri}" data-kol="${ki}"><b class="ov-st ov-st-${c.status}">${STATUS[c.status]}</b>${c.toelichting ? ' · ' + esc(c.toelichting) : ''}${PAG(c.pagina)}</button></td>`;
}
const LEEG_OPV = '<li class="ov-leeg">Niets opvallends genoemd.</li>';
function opvallendHtml(s, p, ri){
  if(isBewerk(s, 'opvallend', ri, -1))
    return `<li class="ov-bew"><span class="ov-editor"><input id="ov-edit" value="${esc(p.tekst)}" aria-label="Opvallend punt (leeg maken = weghalen)"></span></li>`;
  return `<li><button type="button" class="ov-cel" data-action="ov-cel" data-blok="opvallend" data-rij="${ri}" data-kol="-1"><b>${esc(s.overzicht.kolommen[p.kolom])}</b> ${esc(p.tekst)}${PAG(p.pagina)}</button></li>`;
}

function kopHtml(s){
  const o = s.overzicht, som = controleerSommen(o);
  return `<tr><th></th>${o.kolommen.map((k, i) => `<th>${esc(k)}${som[i] ? `<span class="ov-waarsch" role="note">${esc(som[i])}</span>` : ''}</th>`).join('')}</tr>`;
}
function htmlNakijken(s){
  const o = s.overzicht, n = o.kolommen.length;
  const sectie = t => `<tr class="ov-sectie"><th colspan="${n + 1}">${t}</th></tr>`;
  const tekstRijen = blok => o[blok].map((r, ri) => `<tr><td class="ov-lbl">${esc(r.label)}</td>${r.cellen.map((c, ki) => celHtml(s, blok, ri, ki, c, blok === 'bedragen')).join('')}</tr>`).join('');
  const inhoud = o.onderdelen.map((r, ri) => `<tr><td class="ov-lbl">${esc(r.label)}</td>${r.cellen.map((c, ki) => onderdeelHtml(s, ri, ki, c)).join('')}</tr>`).join('');
  return `<div class="ov-tip">Klik op een cel om hem te verbeteren. Controleer vooral de bedragen: bij elk bedrag staat op welke pagina van de offerte het staat.</div>
    <div class="ov-scroll"><table class="ov-t"><thead>${kopHtml(s)}</thead><tbody>
      ${sectie('Wat het kost')}${tekstRijen('bedragen')}
      ${sectie('Wat er in zit')}${inhoud}
      ${sectie('Voorwaarden')}${tekstRijen('voorwaarden')}
    </tbody></table></div>
    <h3 class="ov-h3">Opvallend</h3>
    <ul class="ov-opv">${o.opvallend.map((p, ri) => opvallendHtml(s, p, ri)).join('') || LEEG_OPV}</ul>
    ${s.logFout ? `<p class="ov-fout" role="alert">De logregel kon niet worden opgeslagen. <button type="button" class="ov-link" data-action="ov-log-opnieuw">Opnieuw proberen</button></p>` : ''}
    ${meldingen(s)}`;
}

function htmlVoet(s){
  if(s.stap === 'slepen'){
    let pag = 0;
    for(const b of s.bestanden) pag += b.paginas;
    return `<span class="ov-voet-info">${s.bestanden.length} ${s.bestanden.length === 1 ? 'offerte' : 'offertes'}${s.bestanden.length ? ` · ${pag} pagina's` : ''}</span>
      <span class="ov-knoppen"><button type="button" class="btn btn-sec" data-action="ov-sluit">Annuleren</button><button type="button" class="btn btn-pri" data-action="ov-vergelijk"${s.bestanden.length < 2 ? ' disabled' : ''}>Vergelijken</button></span>`;
  }
  if(s.stap === 'lezen')
    return `<span class="ov-voet-info">Even geduld…</span><span class="ov-knoppen"><button type="button" class="btn btn-sec" data-action="ov-sluit">Venster verbergen</button></span>`;
  return `<span class="ov-voet-info">${s.gelezenDoor ? `Gelezen door ${esc(modelNaam(s.gelezenDoor))} · ` : ''}${s.paginas} pagina's</span>
    <span class="ov-knoppen"><button type="button" class="btn btn-sec" data-action="ov-nieuw">Opnieuw beginnen</button><button type="button" class="btn btn-sec" data-action="ov-vergelijk"${s.bezig ? ' disabled' : ''}>Opnieuw laten lezen</button><button type="button" class="btn btn-pri" data-action="ov-download"${s.bezig ? ' disabled' : ''}>PDF downloaden</button></span>`;
}

function koppel(s){
  const drop = document.getElementById('ov-drop');
  if(drop){
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    // De drop zelf vangt koppelVenster op, op het hele venster (hij bubbelt hierheen).
    document.getElementById('ov-file').addEventListener('change', e => { voegBestandenToe([...e.target.files]); e.target.value = ''; });
  }
  document.querySelectorAll('#ov-body .ov-fkol').forEach(inp =>
    inp.addEventListener('input', () => { const b = s.bestanden[+inp.dataset.idx]; if(b) b.kolom = inp.value; }));
  document.getElementById('ov-model')?.addEventListener('change', e => { s.model = e.target.value; });
  const ed = document.querySelector('#ov-body .ov-editor');
  if(ed){
    const inp = document.getElementById('ov-edit');
    inp.focus(); inp.select();
    // Escape hier afvangen: anders sluit de centrale Escape (main.js) het hele venster.
    // Na Enter of Escape komt de cursor terug op de cel zelf, zodat je met Tab verder kunt.
    const terug = b => document.querySelector(`#ov-body .ov-cel[data-blok="${b.blok}"][data-rij="${b.rij}"][data-kol="${b.kol}"]`)?.focus();
    ed.addEventListener('keydown', e => {
      const b = s.bewerk;
      if(e.key === 'Enter'){ e.preventDefault(); stopBewerk(true); if(b) terug(b); }
      else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); stopBewerk(false); if(b) terug(b); }
    });
    ed.addEventListener('focusout', e => { if(!ed.contains(e.relatedTarget)) stopBewerk(true); });
  }
}

// Tekent alleen het traject dat in het venster staat: een vergelijking die op de achtergrond
// klaar is, mag een ander traject (met misschien een half getypt invoerveld) niet overtekenen.
function render(s = sessie()){
  if(!s || s !== sessie()) return;
  document.getElementById('ov-sub').textContent = [s.code, s.vveNaam, s.traject].filter(Boolean).join(' · ');
  document.getElementById('ov-body').innerHTML = s.stap === 'slepen' ? htmlSlepen(s) : s.stap === 'lezen' ? htmlLezen(s) : htmlNakijken(s);
  document.getElementById('ov-foot').innerHTML = htmlVoet(s);
  koppel(s);
}
