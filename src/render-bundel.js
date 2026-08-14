// ══════════════════════════════════════
//  RENDER-BUNDEL — HTML voor de Takenbundel
// ══════════════════════════════════════
// Alleen opmaak: deze module leest de bundel-index (uit bundel.js) en levert strings.
// Hij beslist niets over lidmaatschap, volgorde of nummers — dat hoort in bundel.js, zodat
// er maar één plek is waar "wie is de kop" en "wat is de volgorde" beantwoord wordt.
import { esc, taakTitel, kortDatum } from "./util.js";
import { SECS } from "./config.js";
import { zichtbareKop, bundelVan } from "./bundel.js";
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
  return `<div class="bdl-sub" data-taak="${esc(tekst(r.taakId))}">`
       + `<span class="bdl-h" data-bdl-grip="1" title="Sleep om de volgorde te wijzigen" aria-hidden="true">⠿</span>`
       + `<span class="bdl-num">${i+1}</span>`
       + `<span class="bdl-dot" style="background:${kleur}"></span>`
       + `<button type="button" class="bdl-txt" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken">${esc(taakTitel(r))}</button>`
       + `<span class="bdl-meta">${esc(label)}${r.deadline?' · '+esc(kortDatum(r.deadline)):''}</span>`
       + `<span class="bdl-acts">`
       +   `<button class="act-bw act-ico" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken">${ico('potlood',14)}</button>`
       +   `<button class="act-bw act-ico" data-action="taak-wegleggen" data-rid="${rid}" title="Wegleggen / opvolgdatum" aria-label="Wegleggen">${ico('klok',14)}</button>`
       +   `<button class="act-af act-ico" data-action="taak-afronden" data-rid="${rid}" title="Afronden" aria-label="Afronden">${ico('vink',14)}</button>`
       + `</span></div>`;
}

// Het hele paneel: alle leden behálve de zichtbare kop, op volgnummer.
export function bundelPaneelHtml(leden, kop, plat){
  if (plat) return '';
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
  if (kop.r._sec === sec) return '';   // wordt geabsorbeerd, merkje niet nodig
  const titel = `Hoort bij: ${taakTitel(kop.r)} — klik om de bundel te openen`;
  return `<button type="button" class="bdl-merk" data-action="bundel-spring" data-bundel="${esc(tekst(r.bundelId))}" title="${esc(titel)}" aria-label="${esc(titel)}">⛓</button>`;
}
