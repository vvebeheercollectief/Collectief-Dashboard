// ══════════════════════════════════════
//  RENDER-BUNDEL — HTML voor de Takenbundel
// ══════════════════════════════════════
// Alleen opmaak: deze module leest de bundel-index (uit bundel.js) en levert strings.
// Hij beslist niets over lidmaatschap, volgorde of nummers — dat hoort in bundel.js, zodat
// er maar één plek is waar "wie is de kop" en "wat is de volgorde" beantwoord wordt.
//
// Eén voorwaarde aan de aanroeper: `bundelPaneelHtml` VULT de rij-cache (state._rowCache), net als
// rowNtd, want de actieknoppen verwijzen via `data-rid` naar die cache. De rid's die hij uitdeelt
// moeten dus uit dezelfde renderronde komen als de tabel waar het paneel in belandt — in de
// praktijk: alleen aanroepen vanuit rowNtd.
// Nadrukkelijk NIET vereist is dat de cache vooraf leeg is. renderNtd bouwt de hele tbody opnieuw
// op, dus elke getekende `data-rid` krijgt in die ronde een verse index en wijst naar de juiste
// taak. Een renderNtd zonder voorafgaande renderAll (die de cache leegt) laat de cache alleen
// groeien tot de eerstvolgende renderAll uit de poll — dat kost geheugen, geen correctheid.
import { esc, taakTitel, kortDatum, taakActieKnoppen } from "./util.js";
import { SECS } from "./config.js";
import { zichtbareKop, bundelVan, wordtGeabsorbeerd, bundelSleutel } from "./bundel.js";
import { ico } from "./icons.js";
import { state } from "./state.js";

// Dezelfde normalisatie als overal (zie `bundelSleutel` in bundel.js). Lokaal een kortere naam,
// want hij staat hier in elke sjabloon; het is bewust dezelfde functie en geen eigen kopie, omdat
// de open-stand op precies deze sleutel wordt bewaard.
const tekst = bundelSleutel;

// Stand van de bundel: alles behalve de zichtbare kop zelf — dus precies wat in het paneel staat.
// Zo blijft het getal stabiel terwijl een bundel vordert en de kop doorschuift.
export function bundelStand(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  return { klaar: rest.filter(m => m.af).length, totaal: rest.length };
}

// Extra's op de kop-rij: chevron vóór de VvE-code en de telpill achter de naam.
// De chevron is een EIGEN knop met data-action; de klik op de rij zelf is al bezet
// (main.js klapt daarmee de volledige tekst uit) en die handler negeert [data-action].
//
// `open` gaat mee naar buiten omdat de aanroeper hetzelfde antwoord nodig heeft: die tekent
// ónder deze rij het paneel of de stapelrandjes. Zou hij dat zelf uit `state.bundelOpen` halen,
// dan staat de normalisatie van bundelId op twee plaatsen en kan de chevron 'open' zeggen terwijl
// de rij eronder dicht blijft.
export function bundelKopExtra(leden, kop){
  const id = esc(tekst(kop.r.bundelId));
  const open = state.bundelOpen.has(tekst(kop.r.bundelId));
  const { klaar, totaal } = bundelStand(leden, kop);
  const lbl = open ? 'Bundel sluiten' : `Bundel openen — ${klaar} van ${totaal} subtaken klaar`;
  return {
    chevron: `<button type="button" class="bdl-chev${open?' open':''}" data-action="bundel-toggle" data-bundel="${id}" aria-expanded="${open}" title="${lbl}" aria-label="${lbl}">${ico('chevronRechts',12)}</button>`,
    pill: `<span class="bdl-pill" title="${klaar} van ${totaal} subtaken klaar">${klaar} van ${totaal} klaar</span>`,
    open,
  };
}

// Eén regel in het paneel. Een subtaak is een volwaardige taak: dezelfde drie acties als een
// tabelrij. Afgeronde leden krijgen geen acties, net als in 'Afgerond'.
//
// `i+1` is bewust de POSITIE in het paneel en niet het volgnummer uit de Sheet. Die nummers
// lopen met gaten van tien en houden bij afgeronde leden hun oude waarde (§3.4), dus rauw
// getoond zou de gebruiker 0, 20, 30 zien.
function subRegel(m, i){
  const r = m.r;
  const kleur = (SECS[r._sec]||{}).color || 'var(--fnt)';
  const label = SECS[r._sec] ? SECS[r._sec].label : r._sec;
  if (m.af){
    // `data-taak` óók hier: een afgerond lid is bij het hernummeren een VAST ANKER
    // (zie hernummerLeden), dus de sleepcode moet hem in de volgorde kunnen terugvinden.
    // Maar géén ⠿-handvat — een afgerond lid slepen zou niets doen, en een dood handvat
    // belooft iets wat de functie niet waarmaakt. De lege plaatshouder houdt de kolommen recht
    // omdat `.bdl-h` in styles.css een VASTE breedte heeft; haalt iemand die weg, dan krimpt deze
    // span tot zijn padding en verspringt elke afgeronde regel naar links.
    return `<div class="bdl-sub af" data-taak="${esc(tekst(r.taakId))}"><span class="bdl-h" aria-hidden="true"></span>`
         + `<span class="bdl-num">${i+1}</span>`
         + `<span class="bdl-dot" style="background:${kleur}"></span>`
         + `<span class="bdl-txt">${esc(taakTitel(r))}</span>`
         + `<span class="bdl-meta">${esc(label)}</span>`
         + `<span class="bdl-klaar" title="Afgerond${r.datum?' '+esc(kortDatum(r.datum)):''}">${ico('vinkCirkel',13)}${r.datum?' '+esc(kortDatum(r.datum)):''}</span></div>`;
  }
  const rid = state._rowCache.length; state._rowCache.push(r);
  // Het handvat is voor een schermlezer verborgen: het draagt geen eigen actie, alleen een
  // muisgebaar. Herordenen met het toetsenbord kan dus (nog) niet — die weg hoort bij het slepen
  // zelf en moet daar bewust gekozen worden, niet stil overgeslagen.
  return `<div class="bdl-sub" data-taak="${esc(tekst(r.taakId))}">`
       + `<span class="bdl-h" data-bdl-grip="1" title="Sleep om de volgorde te wijzigen" aria-hidden="true">⠿</span>`
       + `<span class="bdl-num">${i+1}</span>`
       + `<span class="bdl-dot" style="background:${kleur}"></span>`
       + `<button type="button" class="bdl-txt" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken">${esc(taakTitel(r))}</button>`
       + `<span class="bdl-meta">${esc(label)}${r.deadline?' · '+esc(kortDatum(r.deadline)):''}</span>`
       // Exact dezelfde drie knoppen als op een tabelrij, uit één helper: ze staan op hetzelfde
       // scherm pal onder elkaar, dus een eigen variant hier zou meteen als verschil opvallen.
       + `<span class="bdl-acts">${taakActieKnoppen(rid)}</span></div>`;
}

// Het hele paneel: alle leden behálve de zichtbare kop, op volgnummer.
// Geen plat-vlag: of er gestapeld wordt staat in `stapel` van `bundelWeergave`, en rowNtd tekent
// deze functie alleen als die aanstaat — dezelfde vlag waarop de absorptie besluit. Een eigen
// tweede afweging hier zou daar stil van kunnen afwijken.
export function bundelPaneelHtml(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  const id = esc(tekst(kop.r.bundelId));
  return `<div class="bdl-paneel" data-bundel="${id}">`
       + rest.map(subRegel).join('')
       + `<div class="bdl-add"><button type="button" class="bdl-addb" data-action="bundel-nieuw" data-bundel="${id}">+ Voeg een subtaak toe</button></div>`
       + `</div>`;
}

// Het ⛓-merkje op een taakrij. Krijgt `bw` (uit `bundelWeergave`) en niet los de index, want de
// vraag "krijgt deze rij een merkje" hangt van álle drie de onderdelen daarvan af — en het antwoord
// hoort op één plek te staan, niet half hier en half bij de aanroeper.
//
// Twee standen:
//  - Gestapeld (`stapel`): alleen een subtaak waarvan de kop in een ánder tabblad zit. De kop draagt
//    hier zelf de telpill, en een subtaak in hetzelfde tabblad staat al in het paneel. Die laatste
//    toets loopt via `wordtGeabsorbeerd`, precies de tegenpool van de absorptie in render-lijsten.js.
//  - Plat: élk lid van de bundel krijgt het merkje, kop incluis. Er is dan geen paneel en geen
//    telpill, dus dit is de enige aanwijzing dát er een bundel is (§4.2) — en de enige weg terug
//    naar de gestapelde weergave. Ook de kop, want een hoofdtaak met drie subtaken zou anders in een
//    gefilterde lijst als een gewone losse taak staan.
export function bundelMerkje(r, bw, sec){
  if (!bw || !bw.merk) return '';
  const leden = bundelVan(bw.ix, r);
  if (!leden) return '';
  const kop = zichtbareKop(leden);
  if (!kop) return '';
  if (bw.stapel){
    if (kop.r === r) return '';
    if (wordtGeabsorbeerd(r, bw.ix, sec)) return '';
  }
  const titel = (kop.r === r ? `Bundel van ${leden.length} taken` : `Hoort bij: ${taakTitel(kop.r)}`)
              + ' — klik om de bundel te openen';
  return `<button type="button" class="bdl-merk" data-action="bundel-spring" data-bundel="${esc(tekst(r.bundelId))}" title="${esc(titel)}" aria-label="${esc(titel)}">⛓</button>`;
}
