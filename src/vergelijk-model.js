// ══════════════════════════════════════
//  VERGELIJK-MODEL — de rekenkern van de offertevergelijker (puur, geen DOM, geen netwerk)
//  Claude levert het antwoord in het vaste formaat van offerte-schema.js. Hier wordt het
//  nagelopen, uitgerekend (in centen) en omgezet in één overzicht dat zowel het nakijkscherm
//  als de PDF tekent. Wat de gebruiker verbetert, verandert dat overzicht (zetCel).
// ══════════════════════════════════════
import { BEDRAGEN, VOORWAARDEN, ONDERDEEL_STATUS } from '../offerte-schema.js';
import { MIN_OFFERTES, MAX_OFFERTES, MAX_PAGINAS } from '../offerte-proxy.js';

const NBSP = '\u00a0';
const MAANDEN = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

export function formatBedrag(cent){
  if(!Number.isFinite(cent)) return '';
  const neg = cent < 0, a = Math.abs(Math.round(cent));
  const euro = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' + NBSP : '') + '€' + NBSP + euro + ',' + String(a % 100).padStart(2, '0');
}

// Leest een bedrag zoals een mens het typt of zoals formatBedrag het schrijft. Een komma is altijd
// de decimaalscheiding; zonder komma is een punt alleen een duizendtal als het patroon 1.605 is.
export function parseBedrag(tekst){
  let s = String(tekst ?? '').replace(/[€\s ]/g, '').replace(/[−–]/g, '-');
  if(!s) return null;
  const neg = s.startsWith('-');
  if(neg) s = s.slice(1);
  if(s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if(!/^\d+(\.\d+)?$/.test(s)) return null;
  const c = Math.round(parseFloat(s) * 100);
  return neg ? -c : c;
}

const euroNaarCent = x => Number.isFinite(x) ? Math.round(x * 100) : null;
const geldigePagina = p => Number.isInteger(p) && p > 0 ? p : null;
const factor = p => ((100 + p) / 100).toLocaleString('nl-NL', { maximumFractionDigits:4 });

// Bedragen per aannemer. Claude neemt alleen letterlijk over; wat ontbreekt rekent de browser
// exact uit, en alleen met precies één btw-percentage uit de offerte zelf (spec: Rekenen).
export function rekenUit(bedragen, btwPercentages){
  const b = bedragen || {};
  const uit = {};
  for(const [k] of BEDRAGEN){
    const v = b[k] || {};
    // vermeld:false = niet in de offerte (het schema kent geen null, zie offerte-schema.js).
    const cent = v.vermeld === false ? null : euroNaarCent(v.bedrag);
    const posten = Array.isArray(v.posten) ? v.posten.filter(p => p && Number.isFinite(p.bedrag)) : [];
    if(cent !== null) uit[k] = { cent, bron:'letterlijk', pagina:geldigePagina(v.pagina), som:'' };
    else if(posten.length){
      let som = 0;
      for(const p of posten) som += Math.round(p.bedrag * 100);
      const pags = [...new Set(posten.map(p => geldigePagina(p.pagina)).filter(Boolean))];
      uit[k] = { cent:som, bron:'berekend', pagina:pags[0] ?? null,
        som:`som van ${posten.length} posten` + (pags.length ? ` (p. ${pags.join(', ')})` : '') };
    }
    else uit[k] = { cent:null, bron:'niet_vermeld', pagina:null, som:'' };
  }
  const pcts = Array.isArray(btwPercentages) ? [...new Set(btwPercentages.filter(Number.isFinite))] : [];
  const p = pcts.length === 1 ? pcts[0] : null;
  const f = k => uit[k].cent;
  const zet = (k, cent, som, pagina) => { uit[k] = { cent, bron:'berekend', pagina, som }; };
  for(let ronde = 0; ronde < 2; ronde++){
    if(f('exclBtw') === null && f('inclBtw') !== null && f('btw') !== null)
      zet('exclBtw', f('inclBtw') - f('btw'), `${formatBedrag(f('inclBtw'))} − ${formatBedrag(f('btw'))}`, uit.inclBtw.pagina);
    if(f('exclBtw') === null && f('inclBtw') !== null && p !== null)
      zet('exclBtw', Math.round(f('inclBtw') * 100 / (100 + p)), `${formatBedrag(f('inclBtw'))} ÷ ${factor(p)}`, uit.inclBtw.pagina);
    if(f('btw') === null && f('exclBtw') !== null && f('inclBtw') !== null)
      zet('btw', f('inclBtw') - f('exclBtw'), `${formatBedrag(f('inclBtw'))} − ${formatBedrag(f('exclBtw'))}`, uit.inclBtw.pagina);
    if(f('btw') === null && f('exclBtw') !== null && p !== null)
      zet('btw', Math.round(f('exclBtw') * p / 100), `${p}% van ${formatBedrag(f('exclBtw'))}`, uit.exclBtw.pagina);
    if(f('inclBtw') === null && f('exclBtw') !== null && f('btw') !== null)
      zet('inclBtw', f('exclBtw') + f('btw'), `${formatBedrag(f('exclBtw'))} + ${formatBedrag(f('btw'))}`, uit.exclBtw.pagina);
  }
  return uit;
}

export function valideerAntwoord(antwoord, n){
  if(!antwoord || typeof antwoord !== 'object') return 'Het antwoord van Claude was leeg.';
  if(!Array.isArray(antwoord.aannemers)) return 'In het antwoord ontbreken de aannemers.';
  for(let i = 0; i < n; i++)
    if(!antwoord.aannemers.some(a => a && a.index === i)) return `In het antwoord ontbreekt aannemer ${i + 1}.`;
  if(!Array.isArray(antwoord.onderdelen) || !antwoord.onderdelen.length) return 'In het antwoord ontbreekt wat er in de offertes zit.';
  return '';
}

export function maakOverzicht(antwoord, kolomNamen){
  const n = kolomNamen.length;
  const lijst = Array.isArray(antwoord.aannemers) ? antwoord.aannemers : [];
  const perIndex = Array.from({ length:n }, (_, i) => lijst.find(a => a && a.index === i) || {});
  const reken = perIndex.map(a => rekenUit(a.bedragen, a.btwPercentages));
  const bedragen = BEDRAGEN.map(([sleutel, label]) => ({
    sleutel, label,
    cellen: reken.map(r => ({ tekst:formatBedrag(r[sleutel].cent), pagina:r[sleutel].pagina, berekend:r[sleutel].bron === 'berekend', som:r[sleutel].som })),
  })).filter(r => r.sleutel !== 'subsidie' || r.cellen.some(c => c.tekst));
  const onderdelen = (Array.isArray(antwoord.onderdelen) ? antwoord.onderdelen : [])
    .filter(o => o && typeof o.naam === 'string' && o.naam.trim())
    .map(o => ({
      label: o.naam.trim(),
      cellen: Array.from({ length:n }, (_, i) => {
        const c = (Array.isArray(o.perAannemer) ? o.perAannemer : []).find(x => x && x.index === i) || {};
        return { status:ONDERDEEL_STATUS.includes(c.status) ? c.status : 'niet_genoemd',
                 toelichting:typeof c.toelichting === 'string' ? c.toelichting.trim() : '', pagina:geldigePagina(c.pagina) };
      }),
    }));
  const voorwaarden = VOORWAARDEN.map(([sleutel, label]) => ({
    sleutel, label,
    cellen: perIndex.map(a => {
      const v = (a.voorwaarden || {})[sleutel] || {};
      return { tekst:typeof v.tekst === 'string' ? v.tekst.trim() : '', pagina:geldigePagina(v.pagina), berekend:false, som:'' };
    }),
  }));
  const opvallend = (Array.isArray(antwoord.opvallend) ? antwoord.opvallend : [])
    .filter(o => o && Number.isInteger(o.index) && o.index >= 0 && o.index < n && typeof o.tekst === 'string' && o.tekst.trim())
    .slice(0, 5)
    .map(o => ({ kolom:o.index, tekst:o.tekst.trim(), pagina:geldigePagina(o.pagina) }));
  return { kolommen:kolomNamen.slice(), bedragen, onderdelen, voorwaarden, opvallend };
}

// Op de waarden zoals ze NU in het nakijkscherm staan, dus ook na verbeteren.
export function controleerSommen(overzicht){
  const rij = s => overzicht.bedragen.find(r => r.sleutel === s);
  const ex = rij('exclBtw'), bt = rij('btw'), inc = rij('inclBtw');
  return overzicht.kolommen.map((_, i) => {
    const e = parseBedrag(ex && ex.cellen[i].tekst), b = parseBedrag(bt && bt.cellen[i].tekst), t = parseBedrag(inc && inc.cellen[i].tekst);
    if(e === null || b === null || t === null || Math.abs(e + b - t) <= 1) return '';
    return `Exclusief btw plus btw is ${formatBedrag(e + b)}, maar inclusief btw staat op ${formatBedrag(t)}.`;
  });
}

export function celMarkering(cel){
  if(!cel.tekst) return 'ontbreekt';
  if(cel.handmatig) return '';
  if(cel.berekend) return 'berekend';
  if(!cel.pagina) return 'geen_pagina';
  return '';
}

export function zetCel(o, blok, rij, kol, waarde){
  if(blok === 'opvallend'){
    const p = o.opvallend[rij];
    if(!p) return;
    const t = String(waarde ?? '').trim();
    if(t){ p.tekst = t; p.handmatig = true; } else o.opvallend.splice(rij, 1);
    return;
  }
  const r = (o[blok] || [])[rij];
  const c = r && r.cellen[kol];
  if(!c) return;
  if(blok === 'onderdelen'){
    if(ONDERDEEL_STATUS.includes(waarde && waarde.status)) c.status = waarde.status;
    c.toelichting = String((waarde && waarde.toelichting) || '').trim();
    c.handmatig = true;
    return;
  }
  const t = String(waarde ?? '').trim();
  if(blok === 'bedragen'){ const cent = parseBedrag(t); c.tekst = cent === null ? t : formatBedrag(cent); }
  else c.tekst = t;
  c.berekend = false; c.som = ''; c.handmatig = true;
}

export function logRegelTekst(kolommen, traject){
  const t = String(traject || '').trim();
  return `Offertevergelijking gemaakt: ${kolommen.join(', ')} (${kolommen.length} offertes)` + (t ? ` — ${t}` : '');
}
export const datumVoluit = d => `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
export const documentCode = d =>
  `VBC · Offertevergelijking ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} · versie 1.0`;
export function vveTitel(naam){
  const n = String(naam || '').trim();
  return /^vve\b/i.test(n) ? n : ('VvE ' + n).trim();
}
export const bestandsNaam = (vveNaam, d) =>
  `Offertevergelijking ${vveTitel(vveNaam)} - ${datumVoluit(d)}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
export const trajectNaam = opmerkingen => String(opmerkingen || '').split('\n')[0].replace(/\*\*/g, '').trim();
const AANTAL = { 2:'Twee', 3:'Drie', 4:'Vier' };
export const pdfTitel = n => `${AANTAL[n] || n} offertes naast elkaar`;

// ── Bestanden ──
// Een deel blijft onder de 4 MB; Vercel weigert boven 4,5 MB per verzoek (zie MAX_UPLOAD).
export const DEEL_MAX = 4_000_000;

export function controleerBestanden(lijst){
  const fouten = [];
  if(lijst.length < MIN_OFFERTES) fouten.push(`Sleep minstens ${MIN_OFFERTES} offertes in het venster.`);
  if(lijst.length > MAX_OFFERTES) fouten.push(`Hoogstens ${MAX_OFFERTES} offertes per vergelijking.`);
  for(const b of lijst){
    if(!b.isPdf) fouten.push(`${b.naam} is geen PDF.`);
    // pdf-lib weigert ook PDF's met alleen een eigenaarsslot (niet afdrukken/kopiëren), dus geen 'wachtwoord'.
    else if(b.versleuteld) fouten.push(`${b.naam} is beveiligd. Druk hem af als PDF (Bewaar als PDF) en probeer het opnieuw.`);
    else if(!b.paginas) fouten.push(`${b.naam} kon niet gelezen worden.`);
    if(!String(b.kolom || '').trim()) fouten.push(`Kies bij ${b.naam} welke aannemer het is.`);
  }
  const namen = lijst.map(b => String(b.kolom || '').trim().toLowerCase()).filter(Boolean);
  if(new Set(namen).size !== namen.length) fouten.push('Twee bestanden staan op dezelfde aannemer.');
  let totaal = 0;
  for(const b of lijst) totaal += b.paginas || 0;
  if(totaal > MAX_PAGINAS) fouten.push(`Samen ${totaal} pagina's; het maximum is ${MAX_PAGINAS}.`);
  return fouten;
}

// Woorden die in veel bedrijfs- en bestandsnamen staan en dus niets zeggen over wélke aannemer.
const ALGEMEEN = new Set(['offerte','offertes','bouw','bouwbedrijf','aannemer','aannemersbedrijf','bedrijf','schilders',
  'schildersbedrijf','installatie','installatiebedrijf','techniek','onderhoud','vve','van','der','den','het','en','pdf']);
const woordenVan = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !ALGEMEEN.has(w));
export function raadAannemer(bestandsnaam, namen){
  const inBestand = new Set(woordenVan(bestandsnaam));
  let beste = -1, score = 0;
  namen.forEach((naam, i) => {
    const s = woordenVan(naam).filter(w => inBestand.has(w)).length;
    if(s > score){ beste = i; score = s; }
  });
  return beste;
}

// Halveert een paginabereik tot elk deel onder `max` blijft. `grootte(van, tot)` geeft de grootte
// van dat deel in bytes (de browser knipt het echt om te meten). De volgorde blijft die van de offerte.
export async function planDelen(paginas, grootte, max = DEEL_MAX){
  const delen = [];
  async function splits(van, tot){
    if(await grootte(van, tot) <= max){ delen.push({ van, tot }); return; }
    if(van === tot){
      const e = new Error(`Pagina ${van} is op zich al groter dan 4 MB. Sla de offerte kleiner op en probeer het opnieuw.`);
      e.pagina = van;
      throw e;
    }
    const mid = Math.floor((van + tot) / 2);
    await splits(van, mid);
    await splits(mid + 1, tot);
  }
  await splits(1, paginas);
  return delen;
}
