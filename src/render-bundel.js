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
// taak. Wél groeit de cache dan door: alleen `renderAll` leegt hem (main.js), en de poll roept die
// uitsluitend aan als de datahash veranderde (data.js) — op een rustige middag dus mogelijk uren
// niet, terwijl elke bundel-toggle, sortering, paginawissel en toetsaanslag in het zoekveld een
// renderNtd is. Dat kost geheugen, geen correctheid; behandel `state._rowCache` daarom niet als
// een eindige of volledige lijst van wat er nú op het scherm staat.
import { esc, taakTitel, taakVerwijzing, kortDatum, taakActieKnoppen, opvolgStatus, berekenPrioriteit } from "./util.js";
import { SECS } from "./config.js";
import { wordtGeabsorbeerd, bundelSleutel, bundelStand, bundelVerwijzing } from "./bundel.js";
// LET OP — dit is een KRINGETJE: render-tabel.js importeert hierboven al uit render-bundel.js.
// ES-modules kunnen dat aan. Let op WAAROM: een functie-DECLARATIE is bij het koppelen al
// klaargezet, dus zelfs een aanroep op modulehoogte zou werken. Het gevaar zit in de omgekeerde
// richting: zodra `signaalDelen` een `const` wordt, of render-tabel.js iets van hier op
// modulehoogte gaat gebruiken, klapt de kringloop om. Houd beide dus binnen functielichamen.
import { signaalDelen } from "./render-tabel.js";
import { ico } from "./icons.js";
import { state } from "./state.js";

// Dezelfde normalisatie als overal (zie `bundelSleutel` in bundel.js). Lokaal een kortere naam,
// want hij staat hier in elke sjabloon; het is bewust dezelfde functie en geen eigen kopie, omdat
// de open-stand op precies deze sleutel wordt bewaard.
const tekst = bundelSleutel;

// Het sleep-handvat op een gewone taakrij: hiermee — en alleen hiermee — hang je een taak onder
// een andere. `initStapelSlepen` (bundel-acties.js) toetst op precies dit attribuut en ketst elke
// pointerdown erbuiten af, dus de HTML en die toets horen bij elkaar te blijven.
//
// Eén gedeelde constante voor de takentabel én de dossierpagina. Twee kopieën zou betekenen dat
// een gebruiker het gebaar op de ene lijst anders ziet werken dan op de andere, terwijl het
// dezelfde handeling is; bovendien hangt het attribuut aan de sleepcode, niet aan de lijst.
//
// Hetzelfde `sleepGreep`-icoon als het handvat in het bundelpaneel (`.bdl-h`), en op dezelfde maat
// (14), want het is voor de gebruiker hetzelfde soort ding: pak hier op om te slepen.
//
// `aria-hidden`, net als bij `.bdl-h`: het handvat draagt geen eigen actie, alleen een
// aanwijzer-gebaar, en een schermlezer zou hier dus een element aankondigen dat met het toetsenbord
// niets doet. Anders dan bij het herordenen is er hier wél een volwaardige weg zonder muis: het
// veld 'Hoort bij' in het bewerkscherm (§6.1) maakt exact dezelfde koppeling. Dat veld is met Tab
// te bereiken én de suggestielijst eronder is met ↓/↑ en Enter te bedienen (`initVveZoekveld`,
// vve-zoekveld.js) — die tweede helft ontbrak, en zonder haar was deze zin een lege belofte: de
// koppeling loopt uitsluitend via `state._hbDoel`, en dat werd alleen door een muisklik gezet.
// De `title` blijft staan voor wie met de muis over het handvat gaat.
//
// De `data-action` is met opzet een lege actie (zie ACTIONS in actions.js). Een handvat hoort
// alleen te slepen: pak je hem op en laat je weer los zónder te verplaatsen, dan volgt er een gewone
// `click` — die het gebaar niet tegenhoudt (preventDefault op pointerdown onderdrukt alleen de
// muis-compatibiliteitsevents) en die anders bij de klik-afhandeling van de rij zelf uitkomt. Op de
// dossierpagina is dat het bewerkscherm (de rij draagt daar `data-action="taak-bewerken"`), in de
// takentabel het uitklappen van de volledige tekst. Beide delegaties slaan een element met een eigen
// `data-action` over, dus dit ene attribuut maakt het handvat voor allebei inert.
//
// De `aria-hidden` hierboven blijft op de SPAN staan, ook al draagt de SVG die `ico()` levert er
// zelf ook één. Dat is geen dubbelop: aria-hidden dekt het element en zijn subboom, en de SPAN met
// zijn `title` valt daar niet onder. Wie hem hier weghaalt omdat "het icoon hem al heeft", zet de
// title dus alsnog terug in de toegankelijkheidsboom — precies wat de vorige alinea niet wil.
export const STAPEL_GREEP =
  `<span class="stapel-h" data-stapel-grip="1" data-action="stapel-greep"`
  + ` title="Sleep om onder een andere taak te hangen" aria-hidden="true">${ico('sleepGreep',14)}</span>`;

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
    // Maar géén sleep-handvat — een afgerond lid slepen zou niets doen, en een dood handvat
    // belooft iets wat de functie niet waarmaakt. De lege plaatshouder houdt de kolommen recht
    // omdat `.bdl-h` in styles.css een VASTE breedte heeft; haalt iemand die weg, dan krimpt deze
    // span tot niets (de padding daar is horizontaal 0) en verspringt elke afgeronde regel
    // naar links.
    return `<div class="bdl-sub af" data-taak="${esc(tekst(r.taakId))}"><span class="bdl-h" aria-hidden="true"></span>`
         + `<span class="bdl-num">${i+1}</span>`
         + `<span class="bdl-dot" style="background:${kleur}"></span>`
         + `<span class="bdl-txt">${esc(taakTitel(r))}</span>`
         + `<span class="bdl-meta">${esc(label)}</span>`
         + `<span class="bdl-klaar" title="Afgerond${r.datum?' '+esc(kortDatum(r.datum)):''}">${ico('vinkCirkel',13)}${r.datum?' '+esc(kortDatum(r.datum)):''}</span></div>`;
  }
  const rid = state._rowCache.length; state._rowCache.push(r);
  // 'In behandeling' is in de TABEL af te lezen aan de groepskop en de grijzere rij; in het paneel
  // bestaat geen van beide, dus stond een subtaak die iemand al had opgepakt er precies zo bij als
  // een die nog vrij lag. Een stil label en nadrukkelijk geen knop: het zegt iets, het doet niets —
  // de knoppenrij rechts is al vol en dit is achtergrondinformatie, geen handeling.
  const ibPil = r.inBehandeling === 'TRUE' ? `<span class="bdl-ib">In behandeling</span>` : '';
  // 'Weggelegd' bestaat in de TABEL als een eigen groep onderaan de lijst, met een gedempte rij en
  // een pil met de opvolgdatum. In het paneel bestaat die groep niet — sterker nog, `absorbeer`
  // haalt de rij uit de vlakke lijst, dus hij komt daar ook niet meer in de groep 'Weggelegd'
  // terecht. Zonder deze pil stond een subtaak die tot volgende maand geparkeerd is er dus precies
  // zo bij als werk dat nu moet gebeuren, terwijl de teller in de paginakop hem wél als weggelegd
  // meetelt. Dezelfde bron als de tabelrij (`opvolgStatus`), zodat 'weggelegd' hier en daar
  // hetzelfde betekent, en dezelfde actie op de pil — in de tabel is dat de snelle weg om de
  // opvolgdatum aan te passen, en dat hoort hier niet anders te werken.
  const ov = opvolgStatus(r);
  const snoozePil = ov.weggelegd
    ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}" title="Weggelegd tot ${esc(r.opvolgdatum)}">${ico('pauze',11)}${esc(kortDatum(r.opvolgdatum))}</span>`
    : '';
  // 'Vandaag opvolgen' en 'stil' ontbraken hier terwijl de tabelrij ze wél toont. Uit dezelfde
  // bron als de rij (signaalDelen), zodat 'vandaag' en 'stil' hier en daar hetzelfde betekenen.
  // De deadline en 'weggelegd' worden hieronder al door dlTekst en snoozePil getekend; die twee
  // slaan we hier over om ze niet dubbel te zetten.
  // Alleen 'vandaag opvolgen' en 'stil': de deadline en 'te laat' staan hieronder al in dlTekst en
  // 'weggelegd' in snoozePil. Zonder dit filter komt 'Te laat (Nd)' twee keer in dezelfde regel te
  // staan — met de datum ernaast, en bij een weggelegde subtaak drie datums achter elkaar.
  //
  // 'Bijna te laat' laten we hier bewust weg: de meta-regel toont de datum al voluit ("Oppakken ·
  // 28 aug"), dus een aftelling erbij zegt niets nieuws. Dat is het ENE verschil met de tabelrij,
  // waar de datum juist neutraal is en de aftelling het signaal draagt.
  //
  // Dezelfde data-action als in de tabel (render-tabel.js): een pil met een wijzende hand die
  // nergens op reageert is de vierde variant die dit bestand niet moet krijgen — snoozePil hier
  // draagt zijn actie wél, en styles.css legt bij .cell-sig uit waarom een hand zonder actie fout is.
  const PANEEL_ACTIE = { vandaag:'taak-wegleggen', stil:'taak-bewerken' };
  const paneelSignalen = signaalDelen(r, r._sec)
    .filter(d => PANEEL_ACTIE[d.soort])
    .map(d => `<span class="${d.cls}" data-action="${PANEEL_ACTIE[d.soort]}" data-rid="${rid}"`
             + ` title="${esc(d.tekst)}">${esc(d.tekst)}</span>`)
    .join('');
  // LET OP — de gelijkloop met de tabel is inhoudelijk hersteld, maar de PLAATS verschilt bewust.
  // De tabelrij heeft sinds de Signaal-kolom één signaal-cel en houdt in de deadline-kolom een
  // kale datum over; het paneel heeft die kolommen niet, dus 'Te laat' blijft hier in de meta-regel
  // staan (hieronder, via dlTekst) en 'vandaag opvolgen'/'stil' staan hierboven bij de pillen.
  // Wat de gebruiker LEEST is daarmee op beide plekken hetzelfde; alleen de vorm is anders.
  // Wie hier iets verplaatst: dlTekst en snoozePil zijn met opzet onaangeroerd gebleven — zes
  // toetsen in src/tests.js hangen aan precies deze markup.
  //
  // De deadline via dezelfde berekening als de tabel (`berekenPrioriteit`), en niet
  // als kale datum. Een kale datum liet achterstallig werk er in het paneel precies zo uitzien als
  // werk dat nog ruim op tijd is: de kop-pil zei 'N te laat' terwijl er in de hele lijst geen enkele
  // rij te zien was die dat liet zien. Eén bron voor 'wat is te laat', dus alleen opmaak hier.
  const prio = berekenPrioriteit(r.deadline, r._sec);
  const dlTekst = !r.deadline
    ? `<span class="warn-geen-deadline geen-dl-dof">Geen deadline</span>`
    : (prio.teLaat ? `<span class="s-telaat">Te laat (${Math.abs(prio.dagenTot)}d)</span>`
                   : esc(kortDatum(r.deadline)));
  // Het handvat is voor een schermlezer verborgen: het draagt geen eigen actie, alleen een
  // muisgebaar. Herordenen met het toetsenbord kan dus (nog) niet — die weg hoort bij het slepen
  // zelf en moet daar bewust gekozen worden, niet stil overgeslagen.
  return `<div class="bdl-sub${ov.weggelegd?' snooze-row':''}" data-taak="${esc(tekst(r.taakId))}">`
       + `<span class="bdl-h" data-bdl-grip="1" title="Sleep om de volgorde te wijzigen" aria-hidden="true">${ico('sleepGreep',14)}</span>`
       + `<span class="bdl-num">${i+1}</span>`
       + `<span class="bdl-dot" style="background:${kleur}"></span>`
       + `<button type="button" class="bdl-txt" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken">${esc(taakTitel(r))}</button>`
       + ibPil + snoozePil + paneelSignalen
       + `<span class="bdl-meta">${esc(label)} · ${dlTekst}</span>`
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

// Het bundel-merkje op een taakrij: een leesbaar labeltje, geen kaal icoontje. Krijgt `bw` (uit
// `bundelWeergave`) en niet los de index, want de vraag "krijgt deze rij een merkje" hangt van álle
// drie de onderdelen daarvan af — en het antwoord hoort op één plek te staan, niet half hier en half
// bij de aanroeper. Wélk lid van de bundel deze rij is, komt uit `bundelVerwijzing` (bundel.js), zodat
// "wie is de kop" ook hier maar op één plek beantwoord wordt.
//
// Twee standen:
//  - Gestapeld (`stapel`): alleen een subtaak waarvan de kop in een ánder tabblad zit. De kop draagt
//    hier zelf de telpill, en een subtaak in hetzelfde tabblad staat al in het paneel. Die laatste
//    toets loopt via `wordtGeabsorbeerd`, precies de tegenpool van de absorptie in render-lijsten.js.
//  - Plat: élk lid van de bundel krijgt het merkje, kop incluis. Er is dan geen paneel en geen
//    telpill, dus dit is de enige aanwijzing dát er een bundel is (§4.2) — en de enige weg terug
//    naar de gestapelde weergave. Ook de kop, want een hoofdtaak met drie subtaken zou anders in een
//    gefilterde lijst als een gewone losse taak staan.
//
// De `aria-label` staat er nog steeds, maar niet meer om de oude reden. Die was: het icoon dat `ico()`
// levert draagt `aria-hidden="true"`, dus de knop was leeg en viel voor zijn naam terug op de `title`
// — de laatste stap in de naam-berekening, en een terugval die niet elke schermlezer voorleest. Nu
// staat de tekst wél in de knop en is er hoe dan ook een naam. Het label blijft omdat de zichtbare
// tekst wordt AFGEKAPT (`text-overflow:ellipsis` op `.bdl-merk-t`) en niet zegt wat klikken doet: het
// vult die zin aan en levert de hele verwijzing, ook als er op het scherm nog 'stap in: Vergaderverz…'
// staat. Het begint met exact de zichtbare tekst, zodat de naam die tekst blijft bevatten (WCAG 2.5.3,
// 'label in name') en wie de knop met zijn stem aanwijst begrepen wordt.
export function bundelMerkje(r, bw, sec){
  if (!bw || !bw.merk) return '';
  const verw = bundelVerwijzing(r, bw.ix);
  if (!verw) return '';
  // In de gestapelde weergave draagt de kop zijn telpill al en staat een stap uit hetzelfde
  // tabblad al in het paneel. `wordtGeabsorbeerd` is de exacte tegenpool van de absorptie in
  // render-lijsten.js — die twee horen dezelfde rijen aan te wijzen.
  if (bw.stapel){
    if (verw.rol === 'kop') return '';
    if (wordtGeabsorbeerd(r, bw.ix, sec)) return '';
  }
  // De tekst staat in de KNOP, niet alleen in de title. Als kaal icoontje was dit in een
  // gefilterde lijst de enige aanwijzing dát er een bundel is, en dan nog een die je alleen met
  // de muis kon lezen — met daarin alleen de kale omschrijving van de hoofdtaak.
  const label = verw.rol === 'kop'
    ? `Bundel · ${verw.klaar} van ${verw.totaal} klaar`
    : `stap in: ${taakVerwijzing(verw.kopRij)}`;
  const titel = `${label} — klik om de bundel te openen`;
  // Elke variant zijn eigen klasse, met `bdl-merk` als gedeelde noemer. Die noemer draagt alleen
  // wat écht van allebei is — de aanraakhalo mikt erop; het uiterlijk staat in de varianten. Eerder
  // was de kop 'bdl-merk' kaal en overschreef de stap zes van de tien declaraties daarvan; dat las
  // als "een pil die geen pil is" en dwong de tests tot een `:not(.bdl-merk-sub)`-selector.
  // Beide varianten staan op een EIGEN REGEL onder de VvE-naam (§4.1) — ook de kop, die eerst naast
  // de naam stond. Naast de naam telde zijn breedte op bij de al op 160px geklemde naam en werd de
  // VvE-kolom 165px breder; zie de meting bij `.bdl-merk-kop` in styles.css.
  // Wat wél verschilt is het uiterlijk, en dat hoort ook te verschillen: een kop springt eruit
  // (accentpil: dit ís een bundel), een stap is gedempt (dit hoort ergens bij).
  const cls = verw.rol === 'kop' ? 'bdl-merk bdl-merk-kop' : 'bdl-merk bdl-merk-sub';
  return `<button type="button" class="${cls}" data-action="bundel-spring" data-bundel="${esc(tekst(r.bundelId))}" title="${esc(titel)}" aria-label="${esc(titel)}">${ico('bundel',12)}<span class="bdl-merk-t">${esc(label)}</span></button>`;
}
