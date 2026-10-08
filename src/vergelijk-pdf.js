// ══════════════════════════════════════
//  VERGELIJK-PDF — bibliotheken laden, PDF's knippen, en (Task 5) de PDF in de huisstijl
//  De bibliotheken staan in vendor/ en laden pas bij gebruik: het dashboard wordt er niet
//  trager van, en de CSP (script-src 'self') hoeft niet te veranderen.
// ══════════════════════════════════════

import { documentCode, vveTitel, pdfTitel } from './vergelijk-model.js';

// Twee gelijktijdige aanroepen mogen de bibliotheek maar één keer laden.
const _laden = new Map();

export function laadScript(src, globaal){
  if(window[globaal]) return Promise.resolve(window[globaal]);
  if(_laden.has(src)) return _laden.get(src);

  const belofte = new Promise((ok, nee) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => window[globaal] ? ok(window[globaal]) : nee(new Error('Bibliotheek niet geladen: ' + src));
    s.onerror = () => {
      _laden.delete(src);
      s.remove();
      nee(new Error('Bibliotheek niet geladen: ' + src));
    };
    document.head.appendChild(s);
  });
  _laden.set(src, belofte);
  return belofte;
}
const vendor = pad => new URL('vendor/' + pad, document.baseURI).href;
export const laadPdfLib = () => laadScript(vendor('pdf-lib.min.js'), 'PDFLib');

// Pagina `van` t/m `tot` (1-gebaseerd, inclusief) als losse PDF.
export async function knipDeel(PDFLib, bron, van, tot){
  const doc = await PDFLib.PDFDocument.create();
  const nummers = [];
  for(let i = van - 1; i < tot; i++) nummers.push(i);
  for(const p of await doc.copyPages(bron, nummers)) doc.addPage(p);
  return doc.save();
}

// ── De PDF in de huisstijl (Design System 'VvE Beheer Collectief', opmaak B) ──
export const KLEUR = { inkt:'#1C242E', tekst:'#3B4653', gedempt:'#68717C', staal:'#4E6885', lijn:'#E7EBEF', streep:'#C9D0D8' };
// pdfmake kent alleen normal/bold/italics/bolditalics. Karla 600 speelt 'bold' (de eerste kolom
// van een lichte tabel), Spectral 500 is het enige kopgewicht.
export const LETTERS = {
  Karla:    { normal:'Karla-Regular.ttf', bold:'Karla-SemiBold.ttf', italics:'Karla-Italic.ttf', bolditalics:'Karla-SemiBold.ttf' },
  Spectral: { normal:'Spectral-Medium.ttf', bold:'Spectral-Medium.ttf', italics:'Spectral-Italic.ttf', bolditalics:'Spectral-Italic.ttf' },
  Jost:     { normal:'Jost-Regular.ttf', bold:'Jost-Regular.ttf', italics:'Jost-Regular.ttf', bolditalics:'Jost-Regular.ttf' },
};
// Het getekende pennenvinkje uit het Design System (Vinkje), nooit het teken ✓.
const VINK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${KLEUR.staal}" d="M5,59 C11,51 21,52 27,61 L37,75 C47,51 63,29 85,15 C89,12 94,11 97,12 C80,24 61,47 43,89 C42,92 39,92 38,89 C32,76 20,65 5,59 Z"/></svg>`;
const BREED = 447;   // 595 − 2 × 74 (pagina-marge-zij)
const NIET = { text:'Niet vermeld', italics:true, color:KLEUR.gedempt };
const STATUS_TEKST = { uitgesloten:'uitgesloten', niet_genoemd:'niet genoemd' };
const ALTIJD_TONEN = new Set(['betaling', 'garantie', 'planning']);

// Lichte tabel: lijn in staal onder de kop, haarlijnen ertussen, lijn in inkt onder de laatste rij.
const LICHT = {
  hLineWidth:(i, node) => i === 0 ? 0 : (i === 1 || i === node.table.body.length ? 0.8 : 0.5),
  vLineWidth:() => 0,
  hLineColor:(i, node) => i === 1 ? KLEUR.staal : (i === node.table.body.length ? KLEUR.inkt : KLEUR.lijn),
  paddingLeft:i => i === 0 ? 0 : 6, paddingRight:() => 6, paddingTop:() => 5, paddingBottom:() => 5,
};
const kopRij = (kolommen, uitlijning) => [{ text:'' }, ...kolommen.map(k => ({ text:k.toUpperCase(), style:'kolomtitel', alignment:uitlijning }))];
const breedtes = n => [112, ...Array(n).fill('*')];
const tabel = (kolommen, rijen, uitlijning) =>
  ({ table:{ headerRows:1, dontBreakRows:true, widths:breedtes(kolommen.length), body:[kopRij(kolommen, uitlijning), ...rijen] }, layout:LICHT });

function kostRijen(o){
  return o.bedragen.map(r => {
    const totaal = r.sleutel === 'inclBtw';
    return [{ text:r.label, style:'rijkop' }, ...r.cellen.map(c => {
      if(!c.tekst) return { ...NIET, alignment:'right' };
      const cel = { text:c.tekst, alignment:'right', color:KLEUR.inkt };
      // Het totaal staat in Spectral 500 (enige gewicht, dus geen bold), iets groter dan de lopende tekst; gewone bedragen blijven Karla.
      if(totaal) Object.assign(cel, { font:'Spectral', fontSize:10.5, decoration:'underline', decorationStyle:'double', decorationColor:KLEUR.inkt });
      return cel;
    })];
  });
}
function inhoudRijen(o){
  return o.onderdelen.map(r => [{ text:r.label, style:'rijkop' }, ...r.cellen.map(c => {
    const toel = c.toelichting ? [{ text:c.toelichting, style:'klein', alignment:'center' }] : [];
    if(c.status === 'inbegrepen') return { stack:[{ svg:VINK, width:9, alignment:'center' }, ...toel] };
    const uitleg = STATUS_TEKST[c.status] + (c.toelichting ? ', ' + c.toelichting : '');
    return { stack:[{ text:'—', color:KLEUR.streep, alignment:'center' }, { text:uitleg, style:'klein', alignment:'center' }] };
  })]);
}
function voorwaardenRijen(o){
  return o.voorwaarden.filter(r => ALTIJD_TONEN.has(r.sleutel) || r.cellen.some(c => c.tekst))
    .map(r => [{ text:r.label, style:'rijkop' }, ...r.cellen.map(c => c.tekst ? { text:c.tekst } : { ...NIET })]);
}
function opvallendLijst(o){
  return { stack:o.opvallend.map(p => ({ columns:[
    { text:'—', color:KLEUR.staal, width:12 },
    { text:[{ text:o.kolommen[p.kolom] + ' ', bold:true, color:KLEUR.inkt }, p.tekst] },
  ], margin:[0, 0, 0, 3] })) };
}
const blok = (titel, inhoud, onbreekbaar) => ({ stack:[{ text:titel, style:'tussenkop' }, inhoud], unbreakable:!!onbreekbaar, margin:[0, 14, 0, 0] });
const lijn = y => ({ canvas:[{ type:'line', x1:0, y1:y, x2:BREED, y2:y, lineWidth:0.5, lineColor:KLEUR.lijn }] });

export function pdfInhoud(o, { vveNaam, traject, datum }){
  const content = [
    { text:pdfTitel(o.kolommen.length), style:'paginatitel' },
    { text:'Wat de aannemers aanbieden, volgens hun eigen offertes.', style:'inleiding' },
    blok('Wat het kost', tabel(o.kolommen, kostRijen(o), 'right'), true),
    blok('Wat er in zit', tabel(o.kolommen, inhoudRijen(o), 'center'), false),
    blok('Voorwaarden', tabel(o.kolommen, voorwaardenRijen(o), 'left'), false),
  ];
  if(o.opvallend.length) content.push(blok('Opvallend', opvallendLijst(o), true));
  content.push({ stack:[ lijn(0), { text:'Bedragen en omschrijvingen volgens de offertes van de aannemers. Wij hebben ze naast elkaar gezet; de inhoud van elke offerte is de verantwoordelijkheid van de aannemer.', style:'noot', margin:[0, 5, 0, 0] } ],
    margin:[0, 18, 0, 0], unbreakable:true });
  return {
    pageSize:'A4', pageMargins:[74, 72, 74, 62],
    info:{ title:`Offertevergelijking ${vveTitel(vveNaam)}`, author:'VvE Beheer Collectief' },
    header:() => ({ margin:[74, 42, 74, 0], stack:[
      { columns:[ { text:`Offertevergelijking · ${vveTitel(vveNaam)}`.toUpperCase(), style:'kopregel' },
                  { text:String(traject || '').toUpperCase(), style:'kopregel', alignment:'right' } ] },
      lijn(5) ] }),
    footer:(huidige, totaal) => ({ margin:[74, 14, 74, 0], stack:[
      lijn(0),
      { columns:[ { text:documentCode(datum), style:'voet', margin:[0, 6, 0, 0] },
                  { text:[{ text:String(huidige), color:KLEUR.inkt }, { text:` / ${totaal}`, color:KLEUR.gedempt }], font:'Spectral', fontSize:10, alignment:'right', margin:[0, 3, 0, 0] } ] } ] }),
    content,
    defaultStyle:{ font:'Karla', fontSize:9.5, lineHeight:1.3, color:KLEUR.tekst },
    styles:{
      paginatitel:{ font:'Spectral', fontSize:24, color:KLEUR.inkt, margin:[0, 8, 0, 4] },
      inleiding:{ font:'Spectral', italics:true, fontSize:12.5, color:KLEUR.inkt, margin:[0, 0, 0, 4] },
      tussenkop:{ font:'Spectral', fontSize:13, color:KLEUR.inkt, margin:[0, 0, 0, 6] },
      kolomtitel:{ font:'Jost', fontSize:7, characterSpacing:1, color:KLEUR.gedempt },
      rijkop:{ bold:true, color:KLEUR.inkt },
      kopregel:{ font:'Jost', fontSize:6.5, characterSpacing:1.2, color:KLEUR.gedempt },
      voet:{ fontSize:7, color:KLEUR.gedempt },
      noot:{ fontSize:7.5, color:KLEUR.gedempt },
      klein:{ fontSize:7.5, color:KLEUR.gedempt },
    },
  };
}

const laadPdfMake = () => laadScript(vendor('pdfmake.min.js'), 'pdfMake');
function naarBase64(buf){
  const b = new Uint8Array(buf);
  let s = '';
  for(let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
let _vfs = null;
async function letters(){
  if(_vfs) return _vfs;
  const vfs = {};
  const namen = [...new Set(Object.values(LETTERS).flatMap(f => Object.values(f)))];
  await Promise.all(namen.map(async n => {
    const r = await fetch(vendor('fonts/' + n));
    if(!r.ok) throw new Error('Lettertype niet gevonden: ' + n);
    vfs[n] = naarBase64(await r.arrayBuffer());
  }));
  return (_vfs = vfs);
}
// pdfmake 0.2 bouwt de PDF in een eigen promise. Gaat daar iets mis, dan roept hij de callback
// nooit aan en blijft de fout 'onafgevangen' rondzweven: zonder vangnet wachtte de aanroeper
// eeuwig. Die fout pakken we hier op (unhandledrejection, alleen zolang deze PDF gemaakt wordt),
// met een tijdslimiet als laatste rem.
const PDF_MAX_MS = 60_000;
export async function maakPdfBuffer(doc){
  const pdfMake = await laadPdfMake();
  const vfs = await letters();
  return new Promise((ok, nee) => {
    let klaar = false, tid = 0;
    const vang = e => einde(nee, e && e.reason instanceof Error ? e.reason : new Error(String((e && e.reason) || 'onbekende fout')));
    function einde(f, v){
      if(klaar) return;
      klaar = true; clearTimeout(tid); window.removeEventListener('unhandledrejection', vang);
      f(v);
    }
    tid = setTimeout(() => einde(nee, new Error('het maken duurde te lang')), PDF_MAX_MS);
    window.addEventListener('unhandledrejection', vang);
    try { pdfMake.createPdf(doc, null, LETTERS, vfs).getBuffer(b => einde(ok, new Uint8Array(b))); }
    catch(e){ einde(nee, e); }
  });
}
// Lost pas op als het bestand er echt is: eerst de hele PDF maken, dan pas opslaan. Zo schrijft een
// mislukte PDF geen logregel 'Offertevergelijking gemaakt' (pdfmake's eigen .download() gaf meteen
// antwoord, nog vóór er iets gemaakt was).
export async function downloadPdf(doc, naam){
  const bytes = await maakPdfBuffer(doc);
  const url = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = naam; a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Niet meteen intrekken: de browser leest de blob pas na de klik.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
