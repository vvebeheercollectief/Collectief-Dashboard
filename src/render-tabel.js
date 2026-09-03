// ══════════════════════════════════════
//  RENDER-TABEL — generieke tabel/paginering (thead, tbody, rij-render, paginatie)
//  Verplaatst uit render-lijsten.js (Batch D / punt 11) — zuivere refactor, geen gedragswijziging.
// ══════════════════════════════════════
import { esc, vveCodeSpan, persBadges, subBadge, taakActieKnoppen, offProg, emptyRow, berekenPrioriteit, opvolgStatus, taakTitel, kortDatum, _verschilInKalenderdagen, _vandaagAmsterdam, stilDrempel, aannSleutel, parseWeekPeriode, metDagnamen, offerteAangevraagd, teLaatVoorTelling } from "./util.js";
import { rijSleutel } from "./rij.js";
import { SECS, SKEYS, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkGeselecteerd } from "./bulk.js";
import { offerteAannSamenvatting, offerteAannemerPaneel } from "./render-offerte.js";
import { ico } from "./icons.js";
import { faseRijHtml } from "./subsidie-fase.js";
import { heeftInBehandeling } from "./inbehandeling.js";
import { zichtbareKop, bundelVan, zelfdeTaak } from "./bundel.js";
import { bundelKopExtra, bundelPaneelHtml, bundelMerkje, STAPEL_GREEP } from "./render-bundel.js";

// (Hier stonden GEEN_STIL_PILL en HEEFT_SIGNAAL_KOLOM. Allebei weg met de Signaal-kolom in v12.0;
//  de urgentie zit sindsdien in de deadline-cel — zie `deadlineCel` verderop.)

// ══════════════════════════════════════
//  TABLE HELPERS
// ══════════════════════════════════════
// Optionele 4e parameter maakt kolomkoppen sorteerbaar: {active:{key,asc}, keyFor:(label)=>key|null}.
// Sorteerbare koppen worden een echte knop (toetsenbord-bedienbaar) met pijl + aria-sort op de th.
// De breedte die elke kolom in de <colgroup> krijgt, als CSS-waarde.
//
// Een getal is een GEWICHT en wordt een percentage. Een string als '165px' is een VASTE breedte:
// die kolom is altijd precies zo breed. Dat is nodig voor de datumkolommen, want
// "22 september 2026" is 128px en moet er altijd in passen.
//
// DE SOM MOET PRECIES DE TABEL VULLEN, EN DAT KAN ALLEEN MET DE ECHTE BREEDTE ERBIJ. Bij
// `table-layout:fixed` verdeelt de browser wat er bóven de opgegeven som overschiet GELIJK over
// álle kolommen — ook over de px-kolommen, die daar niets mee doen. Eerder werden de gewichten
// omgerekend tegen de smalste tabel (1150px); op een breder venster schoot er dus ruimte over en
// kreeg elke kolom er evenveel bij. Gemeten bij een tabel van 1650px: de deadline stond op 216px
// voor een datum van 85px en de actiekolom op 211px voor 127px aan knoppen — twee gaten in de rij,
// terwijl het actiepunt en de opmerkingen ernaast werden afgekapt. Daarom krijgt kolBreedtes() de
// GEMETEN tabelbreedte mee: px-kolommen blijven op hun getal en de gewichten delen exact de rest.
//
// EN NIET MET calc(). `calc((100% - 410px) * 0.29)` op een <col> is geldige CSS en Chrome neemt
// hem netjes over, maar in een vaste kolomindeling behandelt hij zo'n kolom als `auto` — gemeten:
// alle vijf de gewichtskolommen kwamen op exact dezelfde 248px uit. Vandaar het narekenen in JS.
const TABEL_MIN = 1150;   // gelijk houden aan `min-width` van #ntd-tbl-wrap table in styles.css
// EEN DERDE SOORT: een gewicht MET een plafond, geschreven als {w:26, max:260}.
//
// Waarom dat er moest komen. De VvE-naamkolom was een kaal gewicht en groeide dus mee met het
// venster. Gemeten op de echte namen in 'Nog Te Doen': de mediaan is 29-32 tekens (216-236px),
// het 90e percentiel 39-51. Bij een tabel van 1637 werd de kolom 316-325px, en de helft van de
// rijen liet daar 80 tot 100px leeg — precies het vlak dat de gebruiker drie keer heeft
// aangewezen. Vastzetten in px loste het niet op: bij de smalste tabel (1150) zou een vaste
// 260px juist MEER pakken dan het gewicht daar geeft (192px), en dan gaat het ten koste van het
// actiepunt op precies het scherm waar de ruimte al krap is.
//
// Met een plafond klopt het aan beide kanten: smal venster = gewoon zijn aandeel, breed venster
// = tot 260px en geen pixel meer, en wat overblijft gaat naar de kolommen die WÉL afkappen.
//
// De verdeling loopt in rondes: pin elke kolom die boven zijn plafond uitkomt vast en verdeel de
// rest opnieuw over de overgeblevenen, tot er niets meer omvalt. Zonder die herhaling zou het
// vrijgekomen deel van de ene kolom een andere over zijn plafond kunnen duwen.
function kolBreedtes(breedtes, tabelBreedte){
  const isPx = w => typeof w === 'string';
  const gew  = w => (w && typeof w === 'object') ? w.w : w;
  const plaf = w => (w && typeof w === 'object') ? w.max : Infinity;
  const breedte = Math.max(TABEL_MIN, tabelBreedte || 0);
  const pxTotaal = breedtes.reduce((a,w) => a + (isPx(w) ? (parseFloat(w) || 0) : 0), 0);

  const vast = new Map();                       // index -> pixels, voor gepinde plafondkolommen
  let rest = Math.max(0, breedte - pxTotaal);
  for(let ronde = 0; ronde < 8; ronde++){
    const open = breedtes.map((w,i)=>({w,i})).filter(o => !isPx(o.w) && !vast.has(o.i));
    const som = open.reduce((a,o) => a + gew(o.w), 0);
    if(!som) break;
    const teVeel = open.filter(o => gew(o.w) / som * rest > plaf(o.w));
    if(!teVeel.length) break;
    teVeel.forEach(o => { vast.set(o.i, plaf(o.w)); rest -= plaf(o.w); });
  }
  const open = breedtes.map((w,i)=>({w,i})).filter(o => !isPx(o.w) && !vast.has(o.i));
  const som = open.reduce((a,o) => a + gew(o.w), 0);
  return breedtes.map((w,i) => {
    if(isPx(w)) return w;
    if(vast.has(i)) return vast.get(i) + 'px';
    return som > 0 ? (gew(w) / som * Math.max(0,rest) / breedte * 100).toFixed(3) + '%' : 'auto';
  });
}

// De percentages hangen aan de gemeten tabelbreedte, dus ze moeten opnieuw gezet worden zodra die
// verandert. Alleen de <colgroup> wordt herschreven — de rijen blijven staan, dus dit is geen
// hertekening van de tabel. `_kolLaatste` voorkomt werk als de breedte niet echt veranderde.
let _kolTabel = null, _kolGewichten = null, _kolLaatste = 0, _kolObs = null, _kolTimer = null;

function herzetKolomBreedtes(){
  if(!_kolTabel || !_kolGewichten || !_kolTabel.isConnected) return;
  const b = Math.round(_kolTabel.getBoundingClientRect().width);
  if(!b || b === _kolLaatste) return;
  _kolLaatste = b;
  const cg = kolBreedtes(_kolGewichten, b).map(w => `<col style="width:${w}">`).join('');
  _kolTabel.querySelector('colgroup')?.remove();
  _kolTabel.insertAdjacentHTML('afterbegin', `<colgroup>${cg}</colgroup>`);
}

// Twee wekkers, met opzet allebei. Een `resize` van het venster is de gewone weg; de
// ResizeObserver vangt de gevallen waarin de tabel van maat verandert zónder dat het venster dat
// doet (een tabblad dat zichtbaar wordt, de zijbalk die inklapt). In de preview-tab tikt een
// ResizeObserver niet altijd door — daarom is `resize` er ook, en roepen de toetsen
// herzetKolomBreedtes() rechtstreeks aan.
if(typeof window !== 'undefined' && typeof window.addEventListener === 'function'){
  window.addEventListener('resize', () => {
    clearTimeout(_kolTimer);
    _kolTimer = setTimeout(herzetKolomBreedtes, 80);
  });
}

function renderThead(id,cols,css,sort,breedtes){
  const kf=sort&&sort.keyFor;
  // De colgroup hoort in de <table>, niet in de <thead>. Hij wordt daarom apart geplaatst, en
  // door herzetKolomBreedtes() — die meet de tabel en kan later opnieuw langskomen bij een
  // vensterwijziging.
  const tbl=document.getElementById(id).closest('table');
  if(tbl){
    tbl.querySelector('colgroup')?.remove();
    // ALLEEN een tabel MÉT breedtes neemt de registratie over. Dit is geen detail: er is één
    // registratie voor de hele app, en `renderAll` tekent ná de takentabel ook 'Afgerond' en
    // 'Ontwikkeling' — allebei zónder breedtes. Die zetten `_kolGewichten` op null en `_kolTabel`
    // op hún tabel, en dan doet `herzetKolomBreedtes()` daarna helemaal niets meer. Gevolg,
    // gemeten op een venster van 1900: de takentabel hield de percentages van de vorige,
    // smallere meting, kwam 173px tekort, en `table-layout:fixed` verdeelde dat verschil GELIJK
    // over alle kolommen — precies waar v11.1 vanaf wilde. De VvE-code stond op 182px i.p.v. 130,
    // de deadline op 217 i.p.v. 155 en de actiekolom op 210 i.p.v. 150.
    // De ResizeObserver hoort om dezelfde reden op de takentabel te blijven staan: die vangt het
    // geval dat de tabel van maat verandert zonder dat het venster dat doet (tabbladwissel).
    if(breedtes && breedtes.length===cols.length){
      _kolTabel     = tbl;
      _kolGewichten = breedtes;
      _kolLaatste   = 0;                       // dwing een verse berekening af
      herzetKolomBreedtes();
      if(!_kolObs && typeof ResizeObserver === 'function') _kolObs = new ResizeObserver(herzetKolomBreedtes);
      if(_kolObs){ _kolObs.disconnect(); _kolObs.observe(tbl); }
    }
  }
  // Uitleg per kolomkop (SECS[sec].kopUitleg). Alleen SORTEERBARE koppen kregen een title, en
  // daardoor verloor 'Offertes' de uitleg die 'Ontvangen/Aangevr.' letterlijk in zijn naam gaf.
  const uitlegVan = (sort && sort.kopUitleg) || {};
  document.getElementById(id).innerHTML=`<tr>${cols.map(c=>{
    const key=kf?kf(c):null;
    if(!key){
      const u=uitlegVan[c];
      return `<th style="${css}"${u?` title="${u}"`:''}>${c}</th>`;
    }
    const aan=!!(sort.active&&sort.active.key===key);
    const richting=aan?(sort.active.asc?'ascending':'descending'):'none';
    const uitleg=aan?(sort.active.asc?'nu oplopend — klik voor aflopend':'nu aflopend — klik voor standaardvolgorde'):'klik om te sorteren';
    return `<th style="${css}" aria-sort="${richting}"><button type="button" class="th-sort${aan?' aan':''}" data-action="ntd-sorteer" data-key="${key}" title="Sorteren op ${c} (${uitleg})">${c}<span class="th-pijl" aria-hidden="true">${aan?(sort.active.asc?'▲':'▼'):''}</span></button></th>`;
  }).join('')}</tr>`;
}

// De kopregel boven de taken van één VvE.
//
// GEEN tabindex en geen role="button": de kop is niet klikbaar, en tien koppen met een tabstop
// ertussen maken de lijst met het toetsenbord onbruikbaar — te meer omdat de tbody elke acht
// seconden hertekend wordt en alleen `herstelAannemerFocus` daar focus terugzet.
// `role="rowheader"` kost niets en geeft een schermlezer wél het verband met de rijen eronder.
//
// De flex staat op de WIKKEL en niet op de <td>. Die fout staat elders in dit bestand al
// beschreven (zie de offerte-cel): display:flex op een td haalt hem uit de tabelopmaak, de
// browser wikkelt er een anonieme cel omheen, de colspan telt niet meer mee en de kopband klapt
// terug naar de breedte van kolom 1.
//
// 'taken hier' en niet 'taken': het getal gaat over de ZICHTBARE lijst. Staat er een filter aan,
// dan is het kleiner dan wat de VvE werkelijk open heeft staan. Het staat in de zichtbare tekst
// en niet alleen in een title — op een telefoon is er geen hover, met het toetsenbord is title
// onbereikbaar, en sommige schermlezers lezen title ÍN PLAATS VAN de celtekst.
function vveGroepKop(k, cols, vervolg){
  // De te-laat-pil vervalt als het statusfilter 'te laat' aanstaat: dan is élke zichtbare rij te
  // laat en zou er twee keer hetzelfde getal op de kop staan.
  const pil = (k.teLaat>0 && state.ntdStatus!=='telaat')
    ? `<span class="grp-w">${k.teLaat} te laat</span>` : '';
  return `<tr class="grp-kop grp-vve"><td colspan="${cols}" role="rowheader"><div class="grp-in">`
       + `<span class="grp-cd">${esc(k.code)}</span>`
       + `<span class="grp-nm">${esc(k.naam)}</span>`
       + `<span class="grp-ct">${k.aantal} ${k.aantal===1?'taak':'taken'} hier${vervolg?' · vervolg':''}</span>${pil}`
       + `</div></td></tr>`;
}

function renderTbody(tbodyId,rows,sec,page,isAf,filtered,grp){
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
  // Drie groepen (Fase 4): actief / in behandeling / weggelegd
  const grpOf = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
  // Groeptellingen over álle pagina's i.p.v. alleen de huidige slice.
  const ibAll=rows.filter(r=>grpOf(r)===1).length, wgAll=rows.filter(r=>grpOf(r)===2).length;
  const cols=SECS[sec].cols.length+1+(state.bulkMode?1:0);
  // Eén doorloop over de pagina in plaats van drie deellijsten achter elkaar. De lijst is al
  // blok-geordend (filterNtd sorteert daarop), dus 'de blokkop komt waar het blok wisselt' geeft
  // exact hetzelfde resultaat — en alleen zo staan de VvE-koppen op hun juiste plek ertussen.
  // `koppen` is gesleuteld op de index in de VOLLEDIGE lijst, want groeperen gebeurt vóór het
  // pagineren (zie renderNtd).
  const koppen=(grp&&grp.koppen)||new Map(), hoort=(grp&&grp.hoort)||[];
  const begin=(p-1)*PG;
  let html='', vorigBlok=0;
  sl.forEach((r,j)=>{
    const i=begin+j, b=grpOf(r);
    if(b!==vorigBlok){
      if(b===1) html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('chevronRechts',12)} In behandeling (${ibAll})</td></tr>`;
      if(b===2) html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('pauze',12)} Weggelegd (${wgAll}) — komt terug op de opvolgdatum</td></tr>`;
      vorigBlok=b;
    }
    const k=koppen.get(i);
    if(k) html+=vveGroepKop(k,cols,false);
    // Begint deze pagina MIDDEN in een groep, dan herhaalt de kop zich met '· vervolg'. Zonder
    // dat staat de tweede helft van een groep zonder enige aanduiding van bij welke VvE hij
    // hoort. Het aantal gaat over de hele groep en niet over het zichtbare deel — anders zegt de
    // vervolgkop '1 taak hier' voor een groep van vier.
    else if(j===0 && hoort[i]) html+=vveGroepKop(hoort[i],cols,true);
    html+=rowNtd(r,sec);
  });
  el.innerHTML=html;
}

// ── HET STIL-SIGNAAL STAAT SINDS v12.0 NIET MEER IN DE TABEL ──────────────────
// De signaal-kolom is weg en daarmee ook de pil 'Xd stil'. `bouwStilIndex` en `bepaalStil`
// hieronder worden dus niet meer aangeroepen bij het tekenen — de index wordt niet langer per
// render opgebouwd, dat was werk voor niemand.
// Ze blijven wél staan, en niet uit gemakzucht: dit is de SCHERMKANT van dezelfde regel waarop
// `apps-script/Opvolging.gs` herinneringsmails verstuurt (cd_laatsteActiviteitMap,
// CD_SECTIELOOS_TELT, CD_STIL_ESCALATIE_REGELS). Die mails gaan gewoon door. Weggooien zou de
// enige getoetste uitwerking van die regel weghalen, en dan kan het scherm nooit meer nagaan of
// het hetzelfde antwoord geeft als de motor. De toetsen erop blijven daarom ook staan.
//
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

// De deadline-cel draagt sinds v12.0 de urgentie zélf, op twee regels: de DATUM blijft staan en
// eronder komt hoe ver hij afligt. Daarvoor stond dat in de signaal-kolom ernaast, die daarmee
// tweemaal hetzelfde vertelde — 'Te laat (76d)' naast een datum waar diezelfde 76 dagen uit te
// rekenen zijn. Die kolom is weg; dit is de ene plek geworden.
//
// De datum blijft bewust staan. De oude vorm op offerte- en subsidie-trajecten VERVING de datum
// door 'Te laat (48d)', en dan weet je wel dát het misgaat maar niet sinds wanneer.
//
// Geen tweede regel als er niets te melden valt: een rij die gewoon op tijd is hoort er niet
// hoger door te worden.
function deadlineCel(r, sec){
  // Aangevraagd offerte-traject: kolom F is dan een OPVOLGDATUM (ontwerp 2026-09-01). Altijd
  // tweeregelig — het woord 'opvolgen' is precies wat deze cel van een deadline onderscheidt.
  // Verstreken of vandaag = amber ('check of ze binnen zijn'), nooit rood 'te laat'.
  if (sec === 'OFFERTE-TRAJECTEN' && offerteAangevraagd(r)){
    if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen opvolgdatum</span></td>`;
    const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
    const kleur = (teLaat || dagenTot === 0) ? 'bijna' : 'opvolg';
    const bij = teLaat ? `opvolgen · ${Math.abs(dagenTot)}d over`
              : dagenTot === 0 ? 'opvolgen · vandaag'
              : dagenTot === null ? 'opvolgen'
              : `opvolgen · nog ${dagenTot}d`;
    // KORTE datum, alleen op dit tabblad (v12.8): '16 sep' i.p.v. '16 september 2026', met het
    // jaar erbij zodra hij buiten het lopende jaar valt (kortDatum, util.js). Dat is wat de
    // kolom van 165 naar 148px laat: de tweede regel ('opvolgen · nog 14d') is hier de breedste.
    return `<td><span class="dl-2 ${kleur}"><span class="dl-dat">${esc(kortDatum(r.deadline))}</span><span class="dl-bij">${esc(bij)}</span></span></td>`;
  }
  if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen deadline</span></td>`;
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  const bijna = !teLaat && dagenTot !== null && dagenTot <= BIJNA_TE_LAAT_DAGEN;
  if (!teLaat && !bijna) return `<td><span class="s-normal">${esc(r.deadline)}</span></td>`;
  const bij = teLaat ? `${Math.abs(dagenTot)}d te laat`
                     : (dagenTot === 0 ? 'vandaag' : `nog ${dagenTot}d`);
  return `<td><span class="dl-2 ${teLaat ? 'laat' : 'bijna'}">`
       + `<span class="dl-dat">${esc(r.deadline)}</span>`
       + `<span class="dl-bij">${esc(bij)}</span></span></td>`;
}

// De periodecel (Vergaderverzoeken). Twee regels: weeknummer boven, werkdagen eronder.
// Tot v11.9 stond hier een felgele pil met vetgedrukte tekst om een met de hand getypte
// periode heen; de gebruiker vond dat onprofessioneel en de waarden liepen alle kanten op.
// Herkent de waarde als week? Dan tweeregelig. Zo niet — een oude, met de hand getypte
// waarde zoals 'sept/okt' — dan gedempt en ongewijzigd. Er wordt niets herschreven.
// Het JAAR staat er alleen bij als het niet het lopende jaar is: in de smalste stand is
// deze kolom 96px en '14–18 sep 2026' past daar niet naast het weeknummer.
function periodeCel(waarde){
  const w = parseWeekPeriode(waarde);
  // `title` op allebei de vormen: de tweede regel kapt af zodra de kolom krap staat — bij een week
  // over de JAARgrens ('28 dec 2026 – 1 jan 2027') is dat onvermijdelijk, want dat is de langste
  // tekst die dit veld kent en die kolom permanent daarop verbreden kost elders in de rij meer.
  // Aanwijzen laat dan de hele periode zien, net als bij de andere afkappende cellen in deze tabel.
  if(!w) return `<span class="per-oud" title="${esc(waarde)}">${esc(waarde)}</span>`;
  const ditJaar = _vandaagAmsterdam().getFullYear();
  // Mét dagnamen ('ma 14 – vr 18 sep'). Dat past sinds v12.0: de signaal-kolom ernaast is weg en
  // die breedte is grotendeels naar deze kolom gegaan. In de Sheet blijft de korte vorm staan —
  // daar is 'Week 38 · 14–18 sep 2026' één leesbare regel en zeggen 'ma' en 'vr' niets extra's.
  const dagen = metDagnamen(w.dagen) + (w.jaar === ditJaar ? '' : ` ${w.jaar}`);
  return `<span class="per-wk" title="${esc(waarde)}"><span class="wk">wk ${w.nr}</span><span class="dg">${esc(dagen)}</span></span>`;
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
  // Sinds v12.0 draagt élke sectie deze pil: de signaal-kolom is weg, en 'Terug <datum>' was het
  // enige dat daarin stond zonder andere plek. Bij een weggelegde taak is dit de enige regel op
  // het scherm die zegt wannéér hij terugkomt — de groepskop zegt alleen dát het gebeurt.
  // 'Vandaag opvolgen' staat sinds v12.0 nergens meer in de tabel: hij zat alleen in de
  // signaal-kolom en die is weg. `opvolgStatus(r).vandaag` blijft wel bestaan — het bundelpaneel
  // (render-bundel.js) leest hem nog.
  // 'Weggelegd' blijft hier wél staan: die pil is gedempt grijs, noemt een DATUM die nergens
  // anders in deze rij te zien is, en hoort bij de eveneens gedempte rij (tr.snooze-row).
  const ov = opvolgStatus(r);
  const extraPills = ov.weggelegd
    ? `<span class="pill-snooze" role="button" tabindex="0" data-action="taak-wegleggen" data-rid="${rid}" title="Weggelegd tot ${esc(r.opvolgdatum)}">${ico('pauze',11)}${esc(kortDatum(r.opvolgdatum))}</span>`
    : '';
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
  // De telpil ("1 van 1 klaar") staat sinds 26-08 op een EIGEN REGEL onder de naam, net als het
  // bundel-merkje. Naast de naam hield hij 96px bezet en bleef er van een kolom van 168px maar
  // 52px naam over — 'Vereniging Parkzicht Noord' werd 'Vereni…', en juist de bundelkop is de rij
  // waarvan je wilt zien om wélke VvE het gaat. De klasse zet dat aan (styles.css); de naam houdt
  // daardoor de volle celbreedte. Een klasse en geen :has(), want dat is op de Safari van deze
  // werkplek niet te vertrouwen.
  const naamCls = 'cell-name' + ((_isKop && _extra.pill) ? ' met-telpil' : '');
  // Het sleep-handvat om deze rij onder een andere te hangen. Het hangt aan dezelfde `stapel`-vlag
  // als de rest van de gestapelde weergave: bij een zoekterm, filter, kolomsortering of
  // bulk-selectie staat die uit en kan er niet gestapeld worden (§4.2), dus dan hoort er ook geen
  // handvat te staan dat het tegendeel belooft.
  // Bewust dezelfde `_bw.stapel` die `initStapelSlepen` (bundel-acties.js) leest via de
  // `magSlepen`-callback die main.js meegeeft, en
  // geen eigen afleiding ernaast: zo kunnen het zichtbare handvat en het toegestane gebaar niet uit
  // elkaar lopen.
  const bdlGreep = (_bw && _bw.stapel) ? STAPEL_GREEP : '';
  switch(sec){
    case'OPPAKKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt)}">${esc(r.actiepunt)}</span></td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar, true)}</td>
        <td class="cell-note"><div class="pil-rij"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</div></td>
        <td>${editBtn}</td>`;
      break;
    case'VERGADERVERZOEKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        <td class="cell-per">${periodeCel(r.periode||r.agendapunten||'')}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.agendapunten||r.actiepunt||'')}">${esc(r.agendapunten||r.actiepunt||'')}</span></td>
        <td>${persBadges(r.behandelaar, true)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td class="cell-note"><div class="pil-rij"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</div></td>
        <td>${editBtn}</td>`;
      break;
    case'OFFERTE-TRAJECTEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
        <td class="cell-sm">${esc(kortDatum(r.datumAangevraagd||''))}</td>
        <td class="cell-of"><div class="of-aann-tbl-tog">${offerteAannSamenvatting(r)}</div></td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'OFFERTE-TRAJECTEN')}
        <td class="cell-note"><div class="pil-rij"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</div></td>
        <td>${editBtn}</td>`;
      break;
    case'LOD':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="${naamCls}"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt||'')}">${esc(r.actiepunt||'')}</span></td>
        <td class="cell-txt" style="font-style:italic"><span class="ct" title="${esc(r.status||'')}">${esc(r.status||'')}</span></td>
        <td>${persBadges(r.behandelaar, true)}</td>
        ${deadlineCel(r, 'LOD')}
        <td class="cell-note"><div class="pil-rij"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span>${extraPills}</div></td>
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
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
  }
  const rowPrio  = berekenPrioriteit(r.deadline, sec).prioriteit;
  const rowTeLaat = teLaatVoorTelling(r, sec);
  const prioAttr = ` data-prio="${(rowPrio||'geen').toLowerCase()}"`;
  const rowCls = [
    r.inBehandeling === 'TRUE' ? 'ib-row' : '',
    rowTeLaat ? 'row-telaat' : '',
    ov.weggelegd ? 'snooze-row' : '',
    state.expandedRows.has(rijSleutel(r)) ? 'expanded' : ''
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
  return `<tr class="${rowCls}" data-row="${r._row}" data-rid="${rid}" data-uitklap="${esc(rijSleutel(r))}"${prioAttr}>${bulkCel}${cells}</tr>${aannRow}${bdlNa}`;
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
    <td class="cell-note">${r.opmerking?`<span class="ct" title="${esc(r.opmerking)}">${esc(r.opmerking)}</span>`:''}</td>
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

export {
  periodeCel, renderThead, herzetKolomBreedtes, kolBreedtes, renderTbody, bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf, renderPag };
