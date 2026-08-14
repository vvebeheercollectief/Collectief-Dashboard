// ══════════════════════════════════════
//  RENDER-BUNDEL — HTML voor de Takenbundel
// ══════════════════════════════════════
// Alleen opmaak: deze module leest de bundel-index (uit bundel.js) en levert strings.
// Hij beslist niets over lidmaatschap, volgorde of nummers — dat hoort in bundel.js, zodat
// er maar één plek is waar "wie is de kop" en "wat is de volgorde" beantwoord wordt.
//
// Eén voorwaarde aan de aanroeper: `bundelPaneelHtml` VULT de rij-cache (state._rowCache), net als
// rowNtd, want de actieknoppen verwijzen via `data-rid` naar die cache. Roep hem dus aan binnen
// dezelfde renderronde waarin renderAll die cache leeggemaakt heeft — één paneel los hertekenen
// zou rid's toevoegen aan een cache die daarna niet meer bij de getekende tabel hoort.
import { esc, taakTitel, kortDatum, taakActieKnoppen } from "./util.js";
import { SECS } from "./config.js";
import { zichtbareKop, bundelVan, wordtGeabsorbeerd } from "./bundel.js";
import { ico } from "./icons.js";
import { state } from "./state.js";

// Bundelvelden komen uit de Sheet als string, maar het herordenen zet bundelId/bundelVolg
// optimistisch op het rij-object en dat mag een getal zijn (zie `nulVeilig` in crud.js).
// `.trim()` op een getal geeft een TypeError, en omdat deze module bij élke render draait zou
// dat de hele takenlijst wegnemen. Zelfde reden als de gelijknamige helper in bundel.js.
const tekst = v => String(v ?? '').trim();

// Stand van de bundel: alles behalve de zichtbare kop zelf — dus precies wat in het paneel staat.
// Zo blijft het getal stabiel terwijl een bundel vordert en de kop doorschuift.
export function bundelStand(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  return { klaar: rest.filter(m => m.af).length, totaal: rest.length };
}

// Extra's op de kop-rij: chevron vóór de VvE-code en de telpill achter de naam.
// De chevron is een EIGEN knop met data-action; de klik op de rij zelf is al bezet
// (main.js klapt daarmee de volledige tekst uit) en die handler negeert [data-action].
export function bundelKopExtra(leden, kop){
  const id = esc(tekst(kop.r.bundelId));
  const open = state.bundelOpen.has(tekst(kop.r.bundelId));
  const { klaar, totaal } = bundelStand(leden, kop);
  const lbl = open ? 'Bundel sluiten' : `Bundel openen — ${klaar} van ${totaal} subtaken klaar`;
  return {
    chevron: `<button type="button" class="bdl-chev${open?' open':''}" data-action="bundel-toggle" data-bundel="${id}" aria-expanded="${open}" title="${lbl}" aria-label="${lbl}">${ico('chevronRechts',12)}</button>`,
    pill: `<span class="bdl-pill" title="${klaar} van ${totaal} subtaken klaar">${klaar} van ${totaal} klaar</span>`,
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
    // belooft iets wat de functie niet waarmaakt. Een lege plaatshouder houdt de kolommen recht.
    return `<div class="bdl-sub af" data-taak="${esc(tekst(r.taakId))}"><span class="bdl-h leeg" aria-hidden="true"></span>`
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
// Geen plat-vlag: platte weergave is een LEGE bundel-index (zie renderNtd), dan vindt `bundelVan`
// niets, is er geen kop en komt deze functie niet aan de beurt. Zo staat de plat-of-niet-beslissing
// op precies één plek — een tweede vlag hier zou stil kunnen afwijken van de absorptie.
export function bundelPaneelHtml(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  const id = esc(tekst(kop.r.bundelId));
  return `<div class="bdl-paneel" data-bundel="${id}">`
       + rest.map(subRegel).join('')
       + `<div class="bdl-add"><button type="button" class="bdl-addb" data-action="bundel-nieuw" data-bundel="${id}">+ Voeg een subtaak toe</button></div>`
       + `</div>`;
}

// Merkje voor een subtaak die in zijn EIGEN tabblad staat terwijl de kop elders zit.
// Leeg wanneer er geen bundel is, of wanneer deze rij zelf de kop is.
export function bundelMerkje(r, index, sec){
  const leden = bundelVan(index, r);
  if (!leden) return '';
  const kop = zichtbareKop(leden);
  if (!kop || kop.r === r) return '';
  // Precies de tegenpool van de absorptie in render-lijsten.js, en daarom uit hetzelfde
  // predikaat: staat de kop in dit tabblad, dan tekent zíjn paneel deze rij al.
  if (wordtGeabsorbeerd(r, index, sec)) return '';
  const titel = `Hoort bij: ${taakTitel(kop.r)} — klik om de bundel te openen`;
  return `<button type="button" class="bdl-merk" data-action="bundel-spring" data-bundel="${esc(tekst(r.bundelId))}" title="${esc(titel)}" aria-label="${esc(titel)}">⛓</button>`;
}
