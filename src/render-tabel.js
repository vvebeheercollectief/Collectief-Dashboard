// ══════════════════════════════════════
//  RENDER-TABEL — generieke tabel/paginering (thead, tbody, rij-render, paginatie)
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, vveCodeSpan, persBadges, subBadge, taakActieKnoppen, offProg, emptyRow, berekenPrioriteit, opvolgStatus, taakTitel, kortDatum, _verschilInKalenderdagen, _vandaagAmsterdam, stilDrempel, aannSleutel } from "./util.js";
import { SECS, SKEYS, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkGeselecteerd } from "./bulk.js";
import { offerteAannSamenvatting, offerteAannemerPaneel } from "./render-offerte.js";
import { ico } from "./icons.js";
import { faseRijHtml } from "./subsidie-fase.js";
import { heeftInBehandeling } from "./inbehandeling.js";
import { zichtbareKop, bundelVan, zelfdeTaak } from "./bundel.js";
import { bundelKopExtra, bundelPaneelHtml, bundelMerkje, STAPEL_GREEP } from "./render-bundel.js";

// Zie de toelichting bij het gebruik in rowNtd().
const GEEN_STIL_PILL = ['OFFERTE-TRAJECTEN', 'SUBSIDIE-TRAJECTEN'];

// De secties met een eigen Signaal-kolom. AFGELEID uit `cols` en met opzet geen eigen handlijst:
// drie dingen moeten kloppen voor één sectie (de kop in `cols`, deze lijst, en de aanroep van
// signaalCel in het case-blok), en een handlijst die uit de pas loopt met `cols` levert precies
// het probleem op dat deze hele kolom oplost — de melding staat dan weer op twee plekken, of
// nergens, en dat gaat stil. Offerte en subsidie krijgen de kop niet: daar kan 'stil' per ontwerp
// niet voorkomen (zie GEEN_STIL_PILL) en zou de kolom vrijwel elke rij leeg blijven.
const HEEFT_SIGNAAL_KOLOM = SKEYS.filter(s => SECS[s].cols.includes('Signaal'));

// ══════════════════════════════════════
//  TABLE HELPERS
// ══════════════════════════════════════
// Optionele 4e parameter maakt kolomkoppen sorteerbaar: {active:{key,asc}, keyFor:(label)=>key|null}.
// Sorteerbare koppen worden een echte knop (toetsenbord-bedienbaar) met pijl + aria-sort op de th.
// De breedte die elke kolom in de <colgroup> krijgt, als CSS-waarde.
//
// Een getal is een GEWICHT en wordt een percentage. Een string als '155px' legt een ONDERGRENS
// vast: bij de smalste tabel is die kolom precies zo breed, ongeacht hoe de gewichten eromheen
// staan. Dat is nodig voor de datumkolommen, want "22 september 2026" is 128px en moet er altijd
// in passen — met alleen gewichten was dat een som die bij elke bijstelling opnieuw moest kloppen.
//
// LET OP wat het NIET doet. Een px-kolom blijft niet op 155 staan. Bij `table-layout:fixed`
// verdeelt de browser de ruimte bóven de opgegeven som GELIJK over alle kolommen, ook over die met
// een pixelbreedte — gemeten: 155px bij een tabel van 1150, 220px bij een tabel van 1650. Er is
// binnen een vaste kolomindeling geen manier om een kolom écht te pinnen. De winst is dus de
// ondergrens, niet een plafond.
//
// De gewichten delen wat er ná de vaste kolommen overblijft, gerekend bij TABEL_MIN — de smalste
// stand die de tabel kan aannemen (styles.css houdt hem daar op).
const TABEL_MIN = 1150;   // gelijk houden aan `min-width` van #ntd-tbl-wrap table in styles.css
function kolBreedtes(breedtes){
  const isPx = w => typeof w === 'string';
  const pxTotaal = breedtes.filter(isPx).reduce((a,w) => a + (parseFloat(w) || 0), 0);
  const restAandeel = Math.max(0, 100 - (pxTotaal / TABEL_MIN * 100));
  const gewichtSom = breedtes.filter(w => !isPx(w)).reduce((a,b) => a + b, 0);
  return breedtes.map(w => isPx(w) ? w
    : (gewichtSom > 0 ? (w / gewichtSom * restAandeel).toFixed(3) + '%' : 'auto'));
}

// `breedtes` (optioneel) zijn GEWICHTEN, één per kolom. Ze worden hier omgerekend naar
// percentages en als <colgroup> vóór de kop gezet. Dat werkt alleen samen met `table-layout:fixed`
// (styles.css, alleen op de NTD-tabel): zonder dat deelt de browser de ruimte zelf uit en negeert
// hij de colgroup zodra de inhoud breder wil. Omrekenen en niet hardcoderen, zodat het bulk-vinkje
// er als extra kolom tussen kan schuiven zonder dat alle getallen opnieuw moeten kloppen.
function renderThead(id,cols,css,sort,breedtes){
  const kf=sort&&sort.keyFor;
  const cg=(breedtes && breedtes.length===cols.length)
    ? `<colgroup>${kolBreedtes(breedtes).map(w=>`<col style="width:${w}">`).join('')}</colgroup>`
    : '';
  // De colgroup hoort in de <table>, niet in de <thead>. Hij wordt daarom apart geplaatst.
  const tbl=document.getElementById(id).closest('table');
  if(tbl){ tbl.querySelector('colgroup')?.remove(); if(cg) tbl.insertAdjacentHTML('afterbegin', cg); }
  document.getElementById(id).innerHTML=`<tr>${cols.map(c=>{
    const key=kf?kf(c):null;
    if(!key) return `<th style="${css}">${c}</th>`;
    const aan=!!(sort.active&&sort.active.key===key);
    const richting=aan?(sort.active.asc?'ascending':'descending'):'none';
    const uitleg=aan?(sort.active.asc?'nu oplopend — klik voor aflopend':'nu aflopend — klik voor standaardvolgorde'):'klik om te sorteren';
    return `<th style="${css}" aria-sort="${richting}"><button type="button" class="th-sort${aan?' aan':''}" data-action="ntd-sorteer" data-key="${key}" title="Sorteren op ${c} (${uitleg})">${c}<span class="th-pijl" aria-hidden="true">${aan?(sort.active.asc?'▲':'▼'):''}</span></button></th>`;
  }).join('')}</tr>`;
}

function renderTbody(tbodyId,rows,sec,page,isAf,filtered){
  // Clamp de pagina: krimpt de dataset (bv. collega haalt rijen weg) tot onder het
  // huidige paginanummer, dan toonden we anders een lege lijst terwijl er wél data is.
  const p=Math.min(Math.max(1,page),Math.max(1,Math.ceil(rows.length/PG)));
  const sl=rows.slice((p-1)*PG,p*PG);
  const el=document.getElementById(tbodyId);
  // Lege-rij colspan dynamisch: af-tabel heeft 6 kolommen, NTD = cols+1 (+1 in bulk).
  // 7 sinds de Behandelaar-kolom erbij kwam; dit getal is de colspan van de 'niets gevonden'-rij
  // en moet dus gelijk lopen met `cols` in renderAf.
  const leegCols=isAf?7:(SECS[sec].cols.length+1+(state.bulkMode?1:0));
  if(!sl.length){el.innerHTML=`<tr><td colspan="${leegCols}">${emptyRow(leegCols,true,filtered)}</td></tr>`;return}
  if(isAf){el.innerHTML=sl.map(r=>rowAf(r,sec)).join('');return}
  // Eén opzoeklijst voor de hele render i.p.v. een logboekscan per rij (zie bouwStilIndex).
  _zetStilIndex(bouwStilIndex(D.logboek, sec));
  try{
  // Drie groepen (Fase 4): actief / in behandeling / weggelegd
  const grpOf = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
  const main=sl.filter(r=>grpOf(r)===0);
  const ib=sl.filter(r=>grpOf(r)===1);
  const wg=sl.filter(r=>grpOf(r)===2);
  // Groeptellingen over álle pagina's i.p.v. alleen de huidige slice.
  const ibAll=rows.filter(r=>grpOf(r)===1).length, wgAll=rows.filter(r=>grpOf(r)===2).length;
  const cols=SECS[sec].cols.length+1+(state.bulkMode?1:0);
  let html=main.map(r=>rowNtd(r,sec)).join('');
  if(ib.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('chevronRechts',12)} In behandeling (${ibAll})</td></tr>`;
    html+=ib.map(r=>rowNtd(r,sec)).join('');
  }
  if(wg.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('pauze',12)} Weggelegd (${wgAll}) — komt terug op de opvolgdatum</td></tr>`;
    html+=wg.map(r=>rowNtd(r,sec)).join('');
  }
  el.innerHTML=html;
  } finally { _zetStilIndex(null); }   // index nooit laten overleven: hij mag niet verouderen
}

// Eén pass over het logboek: VvE-code → de logregels van DEZE sectie. Voorheen scande
// bepaalStil het hele logboek (±1.300 regels) opnieuw voor élke getoonde taakrij; op een pagina
// van 25 rijen dus 25 keer. De index wordt per render één keer gebouwd en daarna weggegooid,
// zodat hij nooit kan verouderen ten opzichte van D.logboek.
// Bewust ZONDER de timestamps vooraf te parsen: alle ~1.300 Date-objecten vooraf maken is bij de
// werkelijke verhouding (een handvol in-behandeling-rijen per pagina) juist trager dan de scan
// die het vervangt. Het aantal Date-objecten blijft zo exact gelijk; alleen het herhaalde
// doorlopen verdwijnt. Puur, dus los testbaar.
// Een regel ZONDER sectie telt voor élke sectie van die VvE. Dat zijn de handmatige
// contactmomenten uit het VvE-dossier (addContactLog schrijft kolom C leeg) — precies het bewijs
// dat er wél iets gebeurd is. Met de oude, strikte vergelijking vielen ze buiten elke sectie en
// bleef een taak 'Stil 6d' tonen nadat je er die ochtend nog over had gebeld. Dat is erger dan
// geen pil: het beweert iets dat aantoonbaar niet klopt.
// Welke acties tellen als 'werk aan een taak' wanneer de logregel GEEN sectie draagt. Zo'n regel
// telt voor élke taak van die VvE, dus dit vangnet moet smal zijn: een kenmerkwijziging op de
// dossierpagina schrijft óók een sectieloze regel, en die zou anders in haar eentje het
// stil-signaal van alle lopende taken van die VvE uitzetten.
// LET OP — SYNC met CD_SECTIELOOS_TELT in apps-script/Opvolging.gs.
const SECTIELOOS_TELT = new Set(['Contact', 'Opmerking']);

function bouwStilIndex(logboek, sec){
  const m = new Map();
  (logboek || []).forEach(e => {
    // 'systeem'-regels tellen niet als activiteit — precies zoals `cd_laatsteActiviteitMap` in
    // apps-script/Opvolging.gs. Ze zijn geen handeling van een mens maar een gevolg van de klok
    // (Auto-prioriteit) of een foutmelding, en het scherm hield daarmee een taak stil-vrij waar de
    // escalatiemotor gewoon over doorescaleerde. LET OP — SYNC met die functie: scherm en motor
    // moeten dezelfde vraag hetzelfde beantwoorden.
    if (String(e.gebruiker || '').trim().toLowerCase() === 'systeem') return;
    if (sec && !e.sectie && !SECTIELOOS_TELT.has(e.actie)) return;
    if (sec && e.sectie && e.sectie !== sec) return;
    const v = m.get(e.code);
    if (v) v.push(e); else m.set(e.code, [e]);
  });
  // De index draagt zijn eigen sectie mee. bepaalStil mag hem namelijk alleen gebruiken voor
  // rijen ván die sectie: hij is gefilterd op `e.sectie`, dus de logregels van een taak uit een
  // ándere sectie zitten er niet in. Zonder deze stempel las het bundelpaneel — waar een subtaak
  // uit Oppakken onder een kop uit Vergaderverzoeken kan hangen — een lege trefferlijst en bleef
  // 'stil' daar altijd uit. Gemeten: index voor VERGADERVERZOEKEN gaf geen pil, index voor
  // OPPAKKEN gaf '20d stil' voor dezelfde subtaak.
  m.sectie = sec || null;
  return m;
}

// Index van de lopende render. null = geen index → bepaalStil valt terug op de oude scan, zodat
// losse aanroepers (en de tests) ongemoeid blijven werken.
let _stilIndex = null;
const _zetStilIndex = ix => { _stilIndex = ix || null; };

function bepaalStil(r, sec){
  if (opvolgStatus(r).weggelegd) return null; // weggelegd = bewust geparkeerd, niet stil (Fase 4)
  if (r.inBehandeling !== 'TRUE') return null;
  // De index alleen gebruiken als hij VOOR DEZE SECTIE gebouwd is. Anders terugvallen op de
  // volledige scan: langzamer, maar een lege trefferlijst uit de verkeerde index zou stil
  // 'geen activiteit' betekenen, en dat is precies het signaal dat we niet mogen missen.
  const entries = (_stilIndex && (!sec || !_stilIndex.sectie || _stilIndex.sectie === sec))
    ? (_stilIndex.get(r.code) || [])
    : (D.logboek || []).filter(e => e.code === r.code
        && String(e.gebruiker || '').trim().toLowerCase() !== 'systeem'
        && (!sec || (e.sectie ? e.sectie === sec : SECTIELOOS_TELT.has(e.actie))));
  if (!entries.length) return null; // geen activiteit-data → niet markeren
  let laatst = null;
  entries.forEach(e => {
    const t = e.timestamp ? new Date(e.timestamp) : null;
    if (t && !isNaN(t) && (!laatst || t > laatst)) laatst = t;
  });
  if (!laatst) return null;
  const dagen = _verschilInKalenderdagen(_vandaagAmsterdam(), laatst);
  return dagen >= stilDrempel(sec) ? dagen : null;
}

// Vanaf hoeveel dagen vóór de deadline 'bijna te laat' aangaat. Bewust ÉÉN vast getal voor alle
// secties — hetzelfde dat deadlineCel hieronder al gebruikte voor zijn amberkleur, en beide lezen
// nu deze constante zodat ze niet uit elkaar kunnen lopen.
//
// WAAROM NIET PER SECTIE. PRIO_REGELS meebewegen zou voor de hand liggen, maar die drempels zijn
// veel ruimer: `hoog` is voor LOD 90 dagen. Elke LOD-rij met een deadline binnen drie maanden zou
// dan permanent 'bijna te laat' roepen, en dat is precies de soort melding-die-altijd-aanstaat
// waar deze hele kolom vanaf moet.
const BIJNA_TE_LAAT_DAGEN = 7;

// De signalen van een rij, van zwaar naar licht. PUUR: leest alleen `r` en bestaande helpers,
// raakt geen DOM en geen state. De cel toont er hoogstens twee; deze functie geeft ze allemaal,
// zodat de derde nog in de title kan.
//
// Waarom deze volgorde: 'te laat' is de enige die zegt dat er een afspraak al gebroken is.
// 'vandaag opvolgen' is een afspraak met jezelf voor vandaag. 'bijna te laat' kijkt vooruit.
// 'stil' en 'weggelegd' zeggen alleen iets over de geschiedenis van de taak.
//
// Drie tegelijk KAN (te laat + vandaag + stil). Weggelegd sluit vandaag uit (opvolgStatus,
// util.js) en stil uit (bepaalStil, hierboven), dus met weggelegd blijven het er twee.
//
// `kleur` is het vocabulaire dat taak 4 in CSS omzet, en bestaat uit vier standen:
//   crit     = te laat            -> --prio (baksteen; niet --rd, dat is óók de tabkleur van LOD)
//   warn     = vandaag opvolgen   -> --am
//   warn-dof = bijna te laat      -> gedempte amber, mag de echte waarschuwing niet overstemmen
//   dof      = stil / weggelegd   -> --mut, want dit zegt iets over het verleden, niet over nu
//
// `cls` draagt de OUDE klassenaam mee. Die staat er niet voor de opmaak - binnen `.cell-sig`
// worden ze in styles.css leeggemaakt (taak 4) - maar omdat negen bestaande toetsen op die namen
// zoeken en omdat er zo een plek is waar staat welke klasse bij welk signaal hoort.
function signaalDelen(r, sec){
  const uit = [];
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  const ov = opvolgStatus(r);
  if (teLaat)
    uit.push({ soort:'telaat', kleur:'crit', cls:'s-telaat',
               tekst:`Te laat (${Math.abs(dagenTot)}d)` });
  if (ov.vandaag)
    uit.push({ soort:'vandaag', kleur:'warn', cls:'pill-opvolg', tekst:'Vandaag opvolgen' });
  if (!teLaat && dagenTot !== null && dagenTot <= BIJNA_TE_LAAT_DAGEN)
    uit.push({ soort:'bijna', kleur:'warn-dof', cls:'s-soon',
               tekst: dagenTot === 0 ? 'Deadline vandaag' : `Nog ${dagenTot}d` });
  const stil = GEEN_STIL_PILL.includes(sec) ? null : bepaalStil(r, sec);
  if (stil !== null)
    uit.push({ soort:'stil', kleur:'dof', cls:'pill-stil', tekst:`${stil}d stil` });
  if (ov.weggelegd)
    uit.push({ soort:'weggelegd', kleur:'dof', cls:'pill-snooze',
               tekst:`Terug ${kortDatum(r.opvolgdatum)}` });
  return uit;
}

// Eén cel met de zwaarste melding groot en de tweede klein en gedempt erachter. Een derde
// melding past niet en staat alleen in de title - dat is een bewuste keuze: liever één ding dat
// opvalt dan drie die elkaar verdringen (dat was precies het probleem dat deze kolom oplost).
//
// `rid` komt van de aanroeper en wordt hier NIET opnieuw gemaakt: rowNtd zet één rid per rij die
// gedeeld wordt met de knoppen, het bulk-vinkje en de fase-bolletjes. Een tweede push naar
// state._rowCache zou de indexOf in crud.js laten verspringen.
//
// De hele cel draagt data-action="taak-wegleggen". Vandaag heeft 'Te laat' als enige signaal géén
// actie, waardoor juist de rijen die het hardst een opvolgdatum nodig hebben die snelweg missen.
// Zonder data-action zou de cel bovendien de rij-uitklapper van main.js aanspreken.
function signaalCel(r, sec, rid){
  const delen = signaalDelen(r, sec);
  if(!delen.length) return `<td class="cell-sig"></td>`;
  const eerste = delen[0];
  const tweede = delen[1];
  const titel = delen.map(d => d.tekst).join(' · ');
  const bij = tweede ? `<span class="sig-bij ${tweede.cls}">${esc(tweede.tekst)}</span>` : '';
  return `<td class="cell-sig" data-action="taak-wegleggen" data-rid="${rid}" title="${esc(titel)}">`
       + `<span class="sig sig-${eerste.kleur}">`
       + `<span class="sig-dot" aria-hidden="true"></span>`
       + `<span class="sig-hoofd ${eerste.cls}">${esc(eerste.tekst)}</span>`
       + `${bij}</span></td>`;
}

// De deadline-kolom is een DATUM, meer niet. 'Te laat' en 'bijna te laat' zijn naar de
// signaal-kolom verhuisd; ze hier óók tonen zou de melding weer op twee plekken zetten.
// Alleen op de secties zónder signaal-kolom (offerte, subsidie) blijft de oude kleuring staan,
// want daar is de deadline-kolom de enige plek waar urgentie kan staan.
function deadlineCel(r, sec){
  if (HEEFT_SIGNAAL_KOLOM.includes(sec)){
    return r.deadline
      ? `<td><span class="s-normal">${esc(r.deadline)}</span></td>`
      : `<td class="cell-sm"><span class="warn-geen-deadline geen-dl-dof">Geen deadline</span></td>`;
  }
  if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen deadline</span></td>`;
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  if (teLaat) return `<td><span class="s-telaat">Te laat (${Math.abs(dagenTot)}d)</span></td>`;
  const soon = dagenTot !== null && dagenTot <= BIJNA_TE_LAAT_DAGEN;
  return `<td><span class="${soon ? 's-soon' : 's-normal'}">${esc(r.deadline)}</span></td>`;
}

function rowNtd(r,sec){
  const css=SECS[sec].css;
  const rid=state._rowCache.length; state._rowCache.push(r);
  const bulkCel=state.bulkMode
    ?`<td class="bulk-cel"><button type="button" class="cb${bulkGeselecteerd(r)?' aan':''}" data-action="bulk-vink" data-rid="${rid}" role="checkbox" aria-checked="${bulkGeselecteerd(r)}" aria-label="Selecteer ${esc(taakTitel(r,sec))}"></button></td>`
    :'';
  // De vierde knop (In behandeling) alleen waar de sectie dat veld kent. Offerte-trajecten
  // hebben 'inBehandeling' niet in hun keys en hun bewerkscherm heeft er ook geen schakelaar
  // voor; daar zou de knop een kolom schrijven die die sectie niet gebruikt.
  const ibStand = heeftInBehandeling(sec) ? (r.inBehandeling==='TRUE'?'TRUE':'FALSE') : null;
  const editBtn=`<div class="acts">${taakActieKnoppen(rid, ibStand)}</div>`;
  let cells='';
  // GEEN stil-pil meer hier. Sinds de Signaal-kolom (v10.41) draagt die kolom het stil-signaal
  // voor Oppakken, Vergaderverzoeken en LOD. Wat hier stond kón per definitie nooit op het scherm
  // komen: `extraPills` wordt alleen gebruikt in de case-blokken van OFFERTE-TRAJECTEN en
  // SUBSIDIE-TRAJECTEN, en juist voor díe twee secties is de stil-pil onderdrukt (GEEN_STIL_PILL).
  // De regel zelf leeft door in `signaalDelen` hieronder; daar wordt hij ook echt toegepast.
  // Het kostte bovendien een volledige logboekscan per rij voor een pil die nergens verscheen.
  const ov = opvolgStatus(r);
  const opvolgPill = ov.vandaag
    ? `<span class="pill-opvolg" data-action="taak-wegleggen" data-rid="${rid}" title="Opvolgen vandaag — opvolgdatum ${esc(r.opvolgdatum)}">${ico('bel',11)}Vandaag</span>`
    : ov.weggelegd
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}" title="Weggelegd tot ${esc(r.opvolgdatum)}">${ico('pauze',11)}${esc(kortDatum(r.opvolgdatum))}</span>`
      : '';
  const extraPills = opvolgPill;
  // ── Takenbundel ──
  // state._bundelWeergave wordt door renderNtd voor déze render klaargezet (zie `bundelWeergave`):
  // de index plus `stapel`/`merk`. Via state en niet via een parameter: renderTbody geeft alleen
  // rij + sectie door.
  const _bw    = state._bundelWeergave || null;
  const _ix    = _bw ? _bw.ix : null;
  const _leden = _ix ? bundelVan(_ix, r) : null;
  const _kop   = _leden ? zichtbareKop(_leden) : null;
  // Een kop-rij bestáát alleen in gestapelde weergave; plat tekent élk lid als gewone rij. Deze ene
  // vlag houdt chevron, telpill, stapelrandjes en paneel bij elkaar: ze hangen alle vier aan _isKop.
  //
  // 'Ben ik zelf de kop' via `zelfdeTaak`, net als `wordtGeabsorbeerd` en `bundelMerkje`. Drie
  // plekken beantwoorden dezelfde vraag en moeten hem dus op dezelfde manier beantwoorden; op
  // objectidentiteit zou déze plek als enige afwijken, en het gevolg daarvan is stil. Komt de kop
  // uit een ándere momentopname dan de rij (een ander object met hetzelfde taaknummer), dan bleef
  // de kop-rij wel staan maar zónder chevron, telpill en paneel, terwijl `absorbeer` — die wél op
  // taaknummer vergelijkt — zijn leden uit de lijst haalt: de subtaken verdwijnen dan uit beeld.
  // De prijs is een randgeval de andere kant op: dragen twee verschillende rijen hetzelfde
  // taaknummer (een dubbele rij in de Sheet, precies wat `checkNummers` aan de gebruiker meldt),
  // dan tekenen ze allebei een paneel. Dubbel getoond is zichtbare ruis; weggeabsorbeerd zonder
  // paneel is verdwenen werk.
  const _isKop = !!(_bw && _bw.stapel && _kop && zelfdeTaak(_kop.r, r));
  const _extra = _isKop ? bundelKopExtra(_leden, _kop) : { chevron:'', pill:'', open:false };
  const bdlChev = _extra.chevron;
  // Op de kop de telpill; verder het bundel-merkje — wie dat krijgt beslist bundelMerkje zelf.
  const bdlNaam = _isKop ? _extra.pill : bundelMerkje(r, _bw, sec);
  // De telpil ("1 van 1 klaar") staat NAAST de naam, anders dan het merkje dat een eigen regel
  // krijgt. Naam + pil samen zijn dan breder dan de cel en de pil liep de buurkolom in (gemeten:
  // 79px bij een venster van 1440). Met deze klasse laat de naam ruimte voor de pil; zonder pil
  // mag hij de volle celbreedte houden. Een klasse en geen :has(), want dat is op de Safari van
  // deze werkplek niet te vertrouwen.
  const naamCls = 'cell-name' + ((_isKop && _extra.pill) ? ' met-telpil' : '');
  // Het sleep-handvat om deze rij onder een andere te hangen. Het hangt aan dezelfde `stapel`-vlag
  // als de rest van de gestapelde weergave: bij een zoekterm, filter, kolomsortering of
  // bulk-selectie staat die uit en kan er niet gestapeld worden (§4.2), dus dan hoort er ook geen
  // handvat te staan dat het tegendeel belooft.
  // Bewust dezelfde `_bw.stapel` die `initStapelSlepen` via zijn `magSlepen` leest (main.js), en
  // geen eigen afleiding ernaast: zo kunnen het zichtbare handvat en het toegestane gebaar niet uit
  // elkaar lopen.
  const bdlGreep = (_bw && _bw.stapel) ? STAPEL_GREEP : '';
  switch(sec){
    case'OPPAKKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        ${signaalCel(r, sec, rid)}
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt)}">${esc(r.actiepunt)}</span></td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar, true)}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    case'VERGADERVERZOEKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        ${signaalCel(r, sec, rid)}
        <td><span class="badge badge-periode" style="background:var(--am-l);color:var(--am)">${esc(r.periode||r.agendapunten||'')}</span></td>
        <td class="cell-txt"><span class="ct" title="${esc(r.agendapunten||r.actiepunt||'')}">${esc(r.agendapunten||r.actiepunt||'')}</span></td>
        <td>${persBadges(r.behandelaar, true)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    case'OFFERTE-TRAJECTEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-sm">${esc(r.datumAangevraagd||'')}</td>
        <td class="cell-of"><div class="of-rij">${offProg(r.offertes)}<div class="of-aann-tbl-tog">${offerteAannSamenvatting(r)}</div></div></td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'OFFERTE-TRAJECTEN')}
        <td class="cell-note"><div class="pil-rij"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</div></td>
        <td>${editBtn}</td>`;
      break;
    case'LOD':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        ${signaalCel(r, sec, rid)}
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt||'')}">${esc(r.actiepunt||'')}</span></td>
        <td class="cell-txt" style="font-style:italic"><span class="ct" title="${esc(r.status||'')}">${esc(r.status||'')}</span></td>
        <td>${persBadges(r.behandelaar, true)}</td>
        ${deadlineCel(r, 'LOD')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
    // Zes kolommen, niet zeven: Opmerkingen bestaat wel als veld (kolom G) maar staat
    // bewust niet in de tabel — de fase-bolletjes hebben die ruimte nodig en de rij
    // moet rustig blijven. Houd dit gelijk aan SECS['SUBSIDIE-TRAJECTEN'].cols.
    case'SUBSIDIE-TRAJECTEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-txt"><div class="pil-rij"><span class="ct" title="${esc(r.subsidie||'')}">${esc(r.subsidie||'')}</span>${extraPills}</div></td>
        <td>${faseRijHtml(r.subsidieFase, rid)}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'SUBSIDIE-TRAJECTEN')}
        <td>${editBtn}</td>`;
      break;
  }
  const { teLaat: rowTeLaat, prioriteit: rowPrio } = berekenPrioriteit(r.deadline, sec);
  const prioAttr = ` data-prio="${(rowPrio||'geen').toLowerCase()}"`;
  const rowCls = [
    r.inBehandeling === 'TRUE' ? 'ib-row' : '',
    rowTeLaat ? 'row-telaat' : '',
    ov.weggelegd ? 'snooze-row' : '',
    state.expandedRows.has(''+r._row) ? 'expanded' : ''
  ].filter(Boolean).join(' ');
  const aannRow = (sec==='OFFERTE-TRAJECTEN' && state.offerteAannOpen.has(aannSleutel(r)))
    ? `<tr class="of-aann-tr"><td colspan="${(state.bulkMode?1:0)+SECS[sec].cols.length+1}">${offerteAannemerPaneel(r)}</td></tr>`
    : '';
  // Dicht: twee 'papierrandjes' onder de rij. Open: het bundelpaneel.
  // `_extra.open` komt van bundelKopExtra, dat er de chevron mee zet — één antwoord voor de knop
  // en voor wat eronder komt, zodat die twee niet uit elkaar kunnen lopen.
  let bdlNa = '';
  if (_isKop){
    const kolommen = SECS[sec].cols.length + 1 + (state.bulkMode?1:0);
    bdlNa = _extra.open
      ? `<tr class="bdl-tr"><td colspan="${kolommen}">${bundelPaneelHtml(_leden, _kop)}</td></tr>`
      // `aria-hidden` op de twee stapelrandjes: het zijn zuiver decoratieve rijen met een lege cel,
      // dus zonder dat meldt een schermlezer na élke dichtgeklapte bundel twee lege rijen en klopt
      // het rijaantal dat hij noemt niet meer met het aantal taken. Visueel verandert er niets.
      // De paneelrij hierboven krijgt hem juist NIET — daar staat echte, bedienbare inhoud in.
      : `<tr class="bdl-peek" aria-hidden="true"><td colspan="${kolommen}"><span class="l"></span></td></tr>`
      + `<tr class="bdl-peek d2" aria-hidden="true"><td colspan="${kolommen}"><span class="l"></span></td></tr>`;
  }
  // `data-rid` op de <tr>: het slepen (Taak 15) moet van de gesleepte rij naar het taak-object
  // komen. `rid` is een directe index in state._rowCache — precies het mechanisme waarmee elke
  // andere rij-actie (bewerken, wegleggen, afronden, bulk) hier al werkt. Op `_row` zoeken zou
  // een scan door alle vijf de secties van D.ntd worden voor iets wat hier al bij de hand is.
  return `<tr class="${rowCls}" data-row="${r._row}" data-rid="${rid}"${prioAttr}>${bulkCel}${cells}</tr>${aannRow}${bdlNa}`;
}

function rowAf(r,sec){
  const css=SECS[sec].css;
  return`<tr>
    <td>${vveCodeSpan(r.code, css)}</td>
    <td class="cell-name">${esc(r.naam)}</td>
    <td class="cell-txt">${esc(taakTitel(r,r._sec))}</td>
    <td class="cell-sm">${esc(r.subcategorie||'')}</td>
    <td>${persBadges(r.behandelaar)}</td>
    <td class="cell-sm">${esc(r.datum||'')}</td>
    <td class="cell-txt">${r.opmerking?`<span style="font-size:12px">${esc(r.opmerking)}</span>`:''}</td>
  </tr>`;
}

// ══════════════════════════════════════
//  PAGINATION
// ══════════════════════════════════════
function renderPag(id,total,cur,doel){
  const el=document.getElementById(id);if(!el)return;
  const tp=Math.ceil(total/PG);
  if(tp<=1){pgs[doel]=1;el.innerHTML='';return}
  // Clamp + persisteer: na het krimpen van de dataset blijft een te hoog paginanummer
  // anders hangen (lege lijst). Zo corrigeert het zich vanzelf.
  cur=Math.min(Math.max(1,cur),tp); pgs[doel]=cur;
  const s=(cur-1)*PG+1,e=Math.min(cur*PG,total);
  const rng=tp<=7?[...Array(tp).keys()].map(i=>i+1)
    :cur<=4?[1,2,3,4,5,'…',tp]
    :cur>=tp-3?[1,'…',tp-4,tp-3,tp-2,tp-1,tp]
    :[1,'…',cur-1,cur,cur+1,'…',tp];
  // aria-label op de pijltjes ('‹' en '›' worden voorgelezen als 'kleiner dan'-achtige tekens of
  // helemaal niet) en aria-current op het paginanummer waar je staat — dat was alleen aan de
  // kleur te zien. Het '…' is een span en geen knop, dus die krijgt aria-hidden.
  el.innerHTML=`<div class="pag-info">Toont ${s}–${e} van ${total}</div>
    <div class="pag-btns">
      <button class="pb" data-action="pagineer" data-doel="${doel}" data-pg="${cur-1}" aria-label="Vorige pagina" ${cur<=1?'disabled':''}>‹</button>
      ${rng.map(p=>p==='…'?`<span class="pb" style="border:none;cursor:default" aria-hidden="true">…</span>`
        :`<button class="pb ${p===cur?'on':''}" data-action="pagineer" data-doel="${doel}" data-pg="${p}" aria-label="Pagina ${p}"${p===cur?' aria-current="page"':''}>${p}</button>`).join('')}
      <button class="pb" data-action="pagineer" data-doel="${doel}" data-pg="${cur+1}" aria-label="Volgende pagina" ${cur>=tp?'disabled':''}>›</button>
    </div>`;
}

export { renderThead, renderTbody, bepaalStil, bouwStilIndex, _zetStilIndex, signaalDelen, deadlineCel, rowNtd, rowAf, renderPag };
