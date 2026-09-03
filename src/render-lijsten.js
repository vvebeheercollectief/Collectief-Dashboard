// ══════════════════════════════════════
//  RENDER-LIJSTEN — NTD-orchestratie (stats, Nog-te-doen, filter, Afgerond)
//  + re-export van render-offerte / render-alv / render-tabel (publieke interface stabiel).
//  Batch D / punt 11: offerte/ALV/tabel-render zijn naar eigen modules verplaatst.
// ══════════════════════════════════════
import { esc, filt, NIET_ZOEKBAAR, berekenPrioriteit, teLaatVoorTelling, parseDt, opvolgStatus, _vandaagAmsterdam, toISODate, isoWeek, vveCodeSpan, splitBehandelaar, periodeBereik, AF_PERIODES, parseAannemers } from "./util.js";
import { rijSleutel } from "./rij.js";
import { SECS, SKEYS, PG } from "./config.js";
import { state, D, pgs } from "./state.js";
import { bulkWis, renderBulkUi, allesVinkjeHtml, bulkHerstel } from "./bulk.js";
import { showToast } from "./notifications.js";
import { renderThead, renderTbody, renderPag, bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf } from "./render-tabel.js";
import { _verrijkOfferteRij, offerteAannemerPaneel, offerteAannSamenvatting, herstelAannemerFocus } from "./render-offerte.js";
import { renderAlvo, renderAlfa, toggleAlvoFlag, ALVO_ICONS, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, statusIco } from "./render-alv.js";
import { bundelWeergave, wordtGeabsorbeerd, bundelSleutel, bundelMetId, bouwBundelIndex, zichtbareKop, isAutoOfferteStap, telbaar } from "./bundel.js";

// ══════════════════════════════════════
//  NTD STATS
// ══════════════════════════════════════
// Open/dicht-stand van het uitklappaneel. Bewust in localStorage: de gebruiker die
// hem één keer openzet wil hem morgen ook open.
const KOP_KEY = 'ntd_kop_open';
function kopOpen(){ return localStorage.getItem(KOP_KEY) === '1'; }

const CHEV_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

function renderNtdStats(){
  let open=0, telaat=0, weg=0;
  // Over `telbaar` en niet over de rauwe D.ntd/D.af: de automatische offerte-stappen staan niet in
  // de lijst eronder en mogen dus ook niet in deze pillen meetellen — anders zegt de kop '123 open'
  // boven een lijst die er 100 toont. Beide kanten uit dezelfde bron, zodat 'af' niet omhoog kan
  // gaan voor een stap die in 'open' nooit heeft meegeteld. Zie isAutoOfferteStap (bundel.js).
  const tel=telbaar(D.ntd, D.af);
  SKEYS.forEach(s=>{
    (tel.ntd[s]||[]).forEach(r=>{
      open++;
      if(teLaatVoorTelling(r,s)) telaat++;
      if(opvolgStatus(r).weggelegd) weg++;
    });
  });
  const tv=_vandaagAmsterdam();
  const todayISO=`${tv.getFullYear()}-${String(tv.getMonth()+1).padStart(2,'0')}-${String(tv.getDate()).padStart(2,'0')}`;
  let afVandaag=0;
  SKEYS.forEach(s=>{(tel.af?.[s]||[]).forEach(r=>{ if(toISODate(r.datum||'')===todayISO) afVandaag++; })});

  const host=document.getElementById('ntd-kop-pillen');
  if(!host) return;

  // Plat = alleen aflezen. 'Open' filtert niet (filteren op alles is geen filter) en
  // 'af' komt uit D.af, dat de lijst eronder niet kan tonen.
  const plat=(val,cap,cls='')=>
    `<span class="kop-pil ${cls}"><b>${val}</b> ${cap}</span>`;
  const knop=(val,cap,cls,status)=>{
    const aan=state.ntdStatus===status;
    return `<button type="button" class="kop-pil kop-pil-klik ${cls}${aan?' aan':''}" data-action="ntd-stat" data-status="${status}" aria-pressed="${aan}" title="${aan?'Filter uitzetten':'Toon alleen '+cap}"><b>${val}</b> ${cap}${aan?' <span aria-hidden="true">✕</span>':''}</button>`;
  };
  const paneelOpen=kopOpen();
  const chev=`<button type="button" class="kop-chev" data-action="ntd-kop-toggle" aria-expanded="${paneelOpen}" aria-controls="ntd-top-row" aria-label="${paneelOpen?'Details verbergen':'Week en vergaderingen tonen'}" title="${paneelOpen?'Details verbergen':'Week en vergaderingen tonen'}">${CHEV_SVG}</button>`;

  host.innerHTML=
    plat(open,'open')+
    knop(telaat,'te laat','pil-rd','telaat')+
    knop(weg,'weggelegd','pil-am','weggelegd')+
    plat(afVandaag,'af','pil-dof')+
    chev;

  renderNtdWeek();
  renderNtdDonut();
}

// Weekblok, nu in het uitklappaneel in plaats van in de statstrook.
function renderNtdWeek(){
  const host=document.getElementById('ntd-week'); if(!host) return;
  const tv=_vandaagAmsterdam();
  const MND=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const wk=isoWeek(tv);
  const ma=new Date(tv); ma.setDate(tv.getDate()-((tv.getDay()+6)%7));
  const zo=new Date(ma); zo.setDate(ma.getDate()+6);
  const range=`${ma.getDate()} ${MND[ma.getMonth()]} – ${zo.getDate()} ${MND[zo.getMonth()]} ${zo.getFullYear()}`;
  host.innerHTML=`<span class="stat-week-cap">Week</span><span class="stat-week-val">${wk}</span>`;
  host.title=`ISO-week ${wk} · ${range}`;
}

// NTD: voortgangsbalk uitgeschreven vergaderingen (alvo: uitnodiging=TRUE → uitnodiging verzonden)
function renderNtdDonut(){
  const track=document.getElementById('ntd-progress-track');
  if(!track) return;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const total=(D.alvo||[]).length;
  const pct=total?Math.round(done/total*100):0;
  // Voorbereid = klaargezet óf al verstuurd; de balk toont dat als lichter voorloopstuk.
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
  const txt=`${done} / ${total}`;
  document.getElementById('ntd-progress-val-base').textContent=txt;
  document.getElementById('ntd-progress-val-rev').textContent=txt;
  document.getElementById('ntd-progress-sub').textContent = voorbereid>done
    ? `${pct}% verstuurd, ${pctVoor}% klaargezet`
    : `${pct}% van de vergaderingen uitgeschreven`;
  // Alleen vullen als het paneel zichtbaar is. Staat het op hidden, dan zou de animatie
  // ongezien afgelopen zijn en de balk bij het openklappen in één keer vol staan.
  if(kopOpen()) vulProgressBalk();
}

// Vollopend effect + reveal: witte cijfers worden onthuld over het gevulde deel,
// donkere cijfers blijven leesbaar over het lichte deel (beide identiek gecentreerd).
function vulProgressBalk(){
  const fill=document.getElementById('ntd-progress-fill'); if(!fill) return;
  const total=(D.alvo||[]).length;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pct=total?Math.round(done/total*100):0;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
  requestAnimationFrame(()=>{
    const voor=document.getElementById('ntd-progress-voor');
    if(voor) voor.style.width=pctVoor+'%';
    fill.style.width=pct+'%';
    const rev=document.getElementById('ntd-progress-val-rev');
    if(rev) rev.style.clipPath=`inset(0 ${100-pct}% 0 0)`;
  });
}

// Tegenhanger van vulProgressBalk: bij het dichtklappen alles terug op nul. Zonder deze
// reset blijft de inline breedte staan en loopt de balk alléén de eerste keer vol — daarna
// staat hij bij het openklappen meteen op zijn eindwaarde.
function leegProgressBalk(){
  const fill=document.getElementById('ntd-progress-fill'); if(!fill) return;
  fill.style.width='0';
  const voor=document.getElementById('ntd-progress-voor');
  if(voor) voor.style.width='0';
  const rev=document.getElementById('ntd-progress-val-rev');
  if(rev) rev.style.clipPath='inset(0 100% 0 0)';
}

// Paneel openen/sluiten. Schrijft de keuze weg en houdt de chevron in sync.
function zetKopOpen(aan){
  localStorage.setItem(KOP_KEY, aan?'1':'0');
  const paneel=document.getElementById('ntd-top-row');
  if(paneel) paneel.hidden=!aan;
  const chev=document.querySelector('[data-action="ntd-kop-toggle"]');
  if(chev){
    chev.setAttribute('aria-expanded', aan?'true':'false');
    const lbl = aan?'Details verbergen':'Week en vergaderingen tonen';
    chev.setAttribute('aria-label', lbl);
    chev.setAttribute('title', lbl);
  }
  if(aan) vulProgressBalk(); else leegProgressBalk();
}

// ══════════════════════════════════════
//  NOG TE DOEN
// ══════════════════════════════════════
// De gestapelde weergave verschijnt alleen in de ONGEFILTERDE standaardlijst. Zodra er wordt
// gezocht, gefilterd, op een kolomkop gesorteerd of bulk-geselecteerd, tonen we plat.
// Reden: een treffer mag niet verstopt zitten in een dichtgeklapte bundel, een vaste groepering
// is in strijd met een gekozen sortering, en in bulk-modus moet élke taak aanvinkbaar zijn.
// Plat betekent níet 'geen bundels meer': het bundel-merkje blijft staan als aanwijzing en als weg
// terug (§4.2). Wat plat precies uitzet staat bij `bundelWeergave` in bundel.js.
// Puur, dus los testbaar.
function isPlatteWeergave({ q, fCode, beh, prio, status, sortKey, bulk }){
  return erIsGefilterd({ q, fCode, beh, prio, status }) || !!sortKey || !!bulk;
}

// "Er is gefilterd": de zoekterm, de drie filtervelden en de statuspil. Als eigen helper omdat
// renderNtd dit antwoord op TWEE plekken nodig heeft — hierboven voor de platte weergave, en als
// `filtered`-vlag aan renderTbody, die bij een lege lijst kiest tussen "Niets gevonden — pas je
// filter of zoekopdracht aan" en "Geen resultaten" (zie `emptyRow` in util.js). Stonden die twee
// als losse expressies naast elkaar, dan werkt een zesde filter er later maar op één plek bij: de
// lijst blijft dan gestapeld terwijl er wél gefilterd is — precies wat §4.2 moet voorkomen — en er
// faalt niets.
// Sortering en bulk horen hier bewust NIET bij: die maken de lijst wél plat, maar ze halen er geen
// rij uit. "Pas je filter aan" zou de gebruiker dan naar een filter sturen dat er niet is.
// De zoektermen komen hier al getrimd binnen (zie de leesregels bovenaan renderNtd). Dat is geen
// schoonheidsfoutje: één spatie in het zoekveld is een niet-lege string, en dan gold de lijst als
// 'gefilterd'. De gestapelde bundelweergave klapte plat en er verscheen 'pas je filter aan',
// terwijl er zichtbaar niets was weggefilterd — een spatie komt in vrijwel elke taak voor.
function erIsGefilterd({ q, fCode, beh, prio, status }){
  return !!(q || fCode || beh || prio || status);
}

// Haal subtaken uit de vlakke lijst weg wanneer hun zichtbare kop in HETZELFDE tabblad staat —
// die worden dan in het bundelpaneel onder die kop getekend. Staat de kop in een ander tabblad,
// dan blijft de rij gewoon staan, met het bundel-merkje erop (§4.1). Zo wordt elke taak per tabblad
// precies één keer getoond en blijven de tellers kloppen.
// Het predikaat zelf staat in bundel.js, gedeeld met het bundel-merkje: precies de rijen die hier
// blijven staan krijgen daar een merkje, en omgekeerd (zie `wordtGeabsorbeerd`).
// Krijgt de hele weergave en niet alleen de index, want zonder stapel is er geen paneel om
// subtaken in op te nemen en hoeft er dus ook niets uit de lijst te verdwijnen. Die toets hoort
// hier en niet in een ternary bij de aanroeper, zodat absorptie en paneel gegarandeerd op dezelfde
// vlag besluiten — één antwoord, niet twee die uit elkaar kunnen lopen.
function absorbeer(rows, sec, bw){
  if (!bw || !bw.stapel || !bw.ix.size) return rows;
  return rows.filter(r => !wordtGeabsorbeerd(r, bw.ix, sec));
}

// Een bundel om-klappen. De stand gaat op bundelId de Set in en niet op rijnummer:
// rijnummers schuiven bij elke insert/delete, dus een op rijnummer bewaarde stand zet na een
// poll de verkeerde rij open (vandaar ook de snoei van `state.expandedRows` in renderNtd).
// Op bundelId is die snoei niet nodig — een verdwenen id vindt straks gewoon geen bundel meer.
//
// Het omschakelen zit hier en niet bij de aanroeper, zodat de vraag (`has`) en het antwoord
// (`add`/`delete`) gegarandeerd dezelfde sleutel gebruiken. Vergeleek de aanroeper zelf, dan kon
// een getrimde sleutel de Set in gaan terwijl `has()` naar de ongetrimde zoekt — de bundel opent
// dan wel, maar sluit nooit meer. Zie `bundelSleutel` in bundel.js.
//
// Hertekenen en niet alleen een klasse omzetten: bij het openen komt er een hele paneelrij bij
// en verdwijnen de stapelrandjes eronder, en dat zijn andere <tr>'s dan de kop-rij zelf.
function toggleBundel(bundelId){
  const id = bundelSleutel(bundelId);
  if (!id) return;
  if (state.bundelOpen.has(id)) state.bundelOpen.delete(id); else state.bundelOpen.add(id);
  renderNtd();
}

// Een bundel openzetten zónder te hertekenen, voor aanroepers die daarna zelf al een render doen.
// Dat scheelt geen zichtbaar geflikker maar verspild werk: `toggleBundel` zou de hele tabel eerst
// nog een keer opbouwen mét het OUDE actieve tabblad, en `state._rowCache` daarbij een tweede keer
// volpompen.
function openBundel(bundelId){
  const id = bundelSleutel(bundelId);
  if (id) state.bundelOpen.add(id);
}

// Alles wat de NTD-lijst plat maakt terug op de standaardstand. Geeft terug of er daadwerkelijk
// iets stond, zodat de aanroeper kan uitleggen waarom het filter van de gebruiker weg is.
// Bulk-modus staat er bewust niet bij: die zet je aan om een selectie te maken, en zo'n halve
// selectie mag niet als bijvangst van een andere handeling sneuvelen. Daarom tekent het bundel-merkje
// in bulk-modus niet eens (zie `bundelWeergave`) — dan kan deze weg daar ook niet vandaan komen.
function wisNtdFilters(){
  let gewist = false, sortWeg = false;
  ['s-ntd','f-code-ntd','f-beh-ntd','f-prio-ntd'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value){ el.value = ''; gewist = true; }
  });
  if (state.ntdStatus){ state.ntdStatus = ''; gewist = true; }
  // De SORTERING apart bijhouden. Een kolomkop-sortering is geen filter — hij haalt geen enkele
  // rij uit de lijst — en de melding die hierop volgt spreekt alleen over zoekterm en filters.
  // Zonder dit onderscheid verscheen 'Zoekterm en filters zijn gewist' terwijl er alleen gesorteerd
  // was, en dan zoekt de gebruiker naar een filter dat hij nooit gezet heeft.
  if (state.ntdSort.key){ state.ntdSort = { key:null, asc:true }; sortWeg = true; }
  return { gewist, sortWeg, iets: gewist || sortWeg };
}

// Het bundel-merkje: laat de bundel zien waar deze taak bij hoort.
//
// Drie dingen moeten gebeuren, en alleen samen leveren ze iets op: naar het tabblad van de
// zichtbare kop, de bundel daar openzetten, en de lijst uit de platte weergave halen. Dat laatste
// is geen extraatje — het merkje verschijnt juist vooral in platte weergave (§4.2), en zolang er
// een zoekterm of filter staat tekent renderNtd géén paneel en kan de kop zelfs weggefilterd zijn.
// Wie alleen van tabblad wisselt, belooft met dit knopje iets wat niet gebeurt.
//
// De index vers uit D en niet uit `state._bundelWeergave`: dat is de momentopname van de laatste
// render, die van vóór de laatste poll kan zijn. Via `bundelMetId`, dus mét `isBundel`-toets:
// tussen tekenen en klikken kan de bundel tot één lid gekrompen zijn en valt er niets te tonen.
function springNaarBundel(bundelId){
  const id = bundelSleutel(bundelId);
  const leden = bundelMetId(bouwBundelIndex(D.ntd, D.af), id);
  const kop = leden && zichtbareKop(leden);
  // Niets te tonen: de bundel is tussen tekenen en klikken tot één lid gekrompen of helemaal
  // afgerond. Wél melden — zonder melding klikt de gebruiker op een knop die zichtbaar in de rij
  // staat en gebeurt er precies niets, en dan leest dat als een kapot dashboard.
  if (!kop){
    showToast('Deze bundel bestaat niet meer','Er is nog één taak over of alles is afgerond.',
              null,'label',{ geenSysteemmelding:true, geenDedup:true });
    return;
  }
  openBundel(id);
  const wis = wisNtdFilters();
  const zichtbaar = setNtd(kop.r._sec);   // wist de bulk-selectie en hertekent de hele lijst
  if (wis.iets) renderNtdStats();         // de statuspillen dragen hun eigen aan/uit-stand
  // Pas ná die render is bekend op welke pagina de kop staat — de lijst hangt immers af van de
  // zojuist gewiste filters. Daarom de getekende lijst uit setNtd, en niet de pijplijn hier
  // nabouwen: een tweede kopie van filteren/sorteren/absorberen loopt bij de eerste wijziging
  // stil uit de pas. Staat de kop er niet in, dan laten we de pagina met rust; springen naar een
  // rij die er niet is heeft geen zin.
  // Via `ntdPagina` en niet met een eigen `Math.floor(i / PG) + 1`: die afspraak (0/1-basis, wat
  // 'staat er niet in' betekent, hoe PG erin zit) hoort op één plek te staan. Twee kopieën lopen
  // bij de eerste wijziging aan de paginering stil uit de pas, en het gevolg — op de verkeerde
  // pagina landen — geeft geen fout maar een knop die niets lijkt te doen.
  const pg = ntdPagina(zichtbaar, kop.r);
  if (pg){
    if (pg !== pgs.ntd){ pgs.ntd = pg; renderNtd(); }
    const tr = document.querySelector(`#ntd-tbody tr[data-row="${kop.r._row}"]`);
    if (tr && tr.scrollIntoView) tr.scrollIntoView({ block:'center' });
  }
  // Geen systeemmelding: dit is uitleg bij een handeling die de gebruiker net zélf deed, geen
  // gebeurtenis waarvoor hij uit een ander venster gehaald hoort te worden. Om dezelfde reden
  // geen ontdubbeling: die bestaat om een herhaalde GEBEURTENIS in te slikken, maar wie binnen
  // vijftien seconden twee keer springt, ziet zijn filters dan de tweede keer zonder uitleg
  // verdwijnen.
  // De tekst volgt wat er ÉCHT is teruggezet. Alleen sorteren is geen filter, en 'filters zijn
  // gewist' laat de gebruiker dan zoeken naar iets wat hij nooit heeft gezet.
  if (wis.iets) showToast('Bundel geopend',
                          wis.gewist
                            ? (wis.sortWeg
                                ? 'Zoekterm, filters en sortering zijn teruggezet — anders valt de bundel buiten beeld.'
                                : 'Zoekterm en filters zijn gewist — anders valt de bundel buiten beeld.')
                            : 'De sortering is teruggezet — anders valt de bundel buiten beeld.',
                          null,'label',{ geenSysteemmelding:true, geenDedup:true });
}

// De automatische offerte-stap hoort niet in de vlakke lijst van Oppakken en telt daar ook niet
// mee — zie `isAutoOfferteStap` (bundel.js) voor het waarom en de randgevallen. Eén helper voor de
// twee plekken die de rijen van een tabblad opleveren (de tabteller en de lijst zelf), zodat het
// getal op de tab niet stil kan afwijken van wat eronder staat.
const zonderAutoStap = (rows, bw) => (rows||[]).filter(r => !isAutoOfferteStap(r, bw && bw.ix));

function renderNtd(){
  // Eerst de selectie ontdoen van rij-objecten die na een verversing niet meer bestaan; anders
  // tekent de tabel lege vinkjes terwijl de balk nog een aantal noemt (zie bulkHerstel).
  // Viel er iets weg, dan moet de balk mee: de teller en de knoppen horen bij dezelfde selectie.
  // `renderAll` doet dat toch al, maar niet elke render loopt daarlangs (sorteren, bladeren,
  // een bundel openklappen) — en dan zou de teller alsnog een verouderd getal tonen.
  if(bulkHerstel(D.ntd)) renderBulkUi();
  const q=document.getElementById('s-ntd').value.toLowerCase().trim();
  const fCode=document.getElementById('f-code-ntd').value.toLowerCase().trim();
  const fBeh=document.getElementById('f-beh-ntd').value;
  const fPrio=document.getElementById('f-prio-ntd').value;

  // Eén bundelweergave per render: de index plus de vlaggen `stapel` en `merk`. Wat die betekenen
  // en waarom ze samen bepaald worden staat bij `bundelWeergave` — bewust dáár, zodat er één
  // producent voor beide vlaggen is en ze los van de DOM te toetsen zijn.
  // Eén set filterwaarden voor beide vragen ('is de lijst plat?' en 'is er gefilterd?'), zodat de
  // gedeelde termen niet op twee plekken los uitgeschreven staan — zie `erIsGefilterd`.
  const filters={ q, fCode, beh:fBeh, prio:fPrio, status:state.ntdStatus };
  const plat=isPlatteWeergave({ ...filters, sortKey:state.ntdSort.key, bulk:state.bulkMode });
  const bw=bundelWeergave({ plat, bulk:state.bulkMode },D.ntd,D.af);
  // Op `state` en niet als parameter: de rij-opmaak zit in render-tabel.js en heeft geen ingang
  // hiervoor. Die leest hem daar straks uit — bewust dezelfde momentopname als de absorptie
  // hieronder, anders verdwijnt een rij hier terwijl hij daar geen stapel krijgt.
  state._bundelWeergave=bw;

  // Snoei de uitklap-Set tot sleutels die nog bestaan. De sleutel is sinds de naloop van
  // 2026-08-28 de taak-identiteit (rijSleutel: taaknummer, met het rijnummer als terugval), dus
  // een verschuiving van rijnummers kan de stand niet meer naar een ándere taak dragen; deze
  // snoei ruimt alleen nog op wat écht verdwenen is (afgerond, verwijderd).
  if(state.expandedRows.size){
    state.expandedRows=new Set([...state.expandedRows].filter(id=>SKEYS.some(s=>(D.ntd[s]||[]).some(r=>rijSleutel(r)===id))));
  }

  // Tabs
  document.getElementById('ntd-tabs').innerHTML=SKEYS.map(s=>{
    const rows=zonderAutoStap(filterNtd(D.ntd[s]||[],q,fCode,fBeh,fPrio,s,state.ntdStatus), bw);
    return`<button type="button" class="tab ${s===state.activeNtd?'on':''}" role="tab" aria-selected="${s===state.activeNtd}" style="${s===state.activeNtd?SECS[s].css:''}" data-action="ntd-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></button>`;
  }).join('');

  document.getElementById('ntd-title').textContent=SECS[state.activeNtd].label;
  // Apply card theme
  const card=document.getElementById('ntd-card');
  SECS[state.activeNtd].css.split(';').forEach(p=>{const[k,v]=p.split(':');if(k&&v)card.style.setProperty(k.trim(),v.trim())});

  // Absorptie als laatste stap, ná filteren en sorteren: alleen de lijst die getekend wordt
  // krimpt. De tab-tellers hierboven blijven bewust op de ONgeabsorbeerde lijst staan — een
  // geabsorbeerde subtaak is niet verdwenen, alleen anders getekend, en moet dus meetellen.
  //
  // `zonderAutoStap` staat daar bewust NAAST en niet ín: absorptie geldt alleen in de gestapelde
  // weergave (bundelWeergave zet `stapel` uit zodra er gezocht, gefilterd, gesorteerd of in bulk
  // gewerkt wordt), en dan kwamen de automatische stappen terug zodra iemand één letter in het
  // zoekveld typt. Ze horen ALTIJD weg uit deze lijst én uit de tabteller.
  //
  // DE TERUGWEG, eerlijk opgeschreven — een rij die uit de lijst verdwijnt moet ergens anders
  // volledig bereikbaar blijven:
  //   · altijd: het uitklappaneel van het traject op het tabblad Offerte-trajecten, en de
  //     VvE-dossierpagina (groepeerBundels, render-vve.js — daar verdwijnt per ontwerp geen rij).
  //     Afvinken, bewerken, verwijderen en wegleggen kunnen daar allemaal.
  //   · meestal: Ctrl+K, dat rechtstreeks het bewerkscherm opent (palette.js:124). Let op dat dat
  //     GEEN garantie is: het palet toont hooguit vijf open taken en sorteert op urgentie, en deze
  //     stap heeft geen deadline en staat dus achteraan. Bij een VvE met vijf of meer open taken
  //     valt hij buiten de lijst. Noem Ctrl+K dus nooit als enige terugweg.
  //   · NIET in de selecteerstand (bulk): daar staat `stapel` én `merk` uit, dus het traject toont
  //     geen chevron en geen merkje en is de stap onbereikbaar. Bewuste keuze — bulk is een stand
  //     waar de gebruiker zelf in en uit stapt, en een bulk-actie op deze stappen heeft geen zin.
  const zichtbaar=absorbeer(sorteerNtd(zonderAutoStap(filterNtd(D.ntd[state.activeNtd]||[],q,fCode,fBeh,fPrio,state.activeNtd,state.ntdStatus), bw),state.ntdSort),state.activeNtd,bw);
  // De bulk-kolom krijgt een px-ONDERGRENS en geen gewicht, precies zoals elke andere kolom met een
  // bekende minimuminhoud (VvE-code 130, datums 165, acties 150/120 — zie config.js).
  // Met een gewicht van 3 deelde hij mee in de ruimte die ná de px-kolommen overblijft, en bij de
  // smalste stand (min-width 1150) werd dat smaller dan het vinkje zelf plus zijn celopvulling —
  // dan valt het vinkje van de rij af. 48px: 20 opvulling links + 14 vinkje + 14 rechts, waarbij
  // die 14 de RUIMSTE stand van --row-px is (de dichtheidsknop zet hem op 10 of 14). Rekenen met
  // de standaardstand gaf een kolom die in 'Ruim' vier pixels te smal was.
  renderThead('ntd-thead',[...(state.bulkMode?[allesVinkjeHtml(zichtbaar)]:[]),...SECS[state.activeNtd].cols,''],SECS[state.activeNtd].css,
    {active:state.ntdSort, keyFor:ntdSorteerKey, kopUitleg:SECS[state.activeNtd].kopUitleg},
    [...(state.bulkMode?['48px']:[]),...(SECS[state.activeNtd].breedtes||[])]);
  renderTbody('ntd-tbody',zichtbaar,state.activeNtd,pgs.ntd,false,erIsGefilterd(filters));
  // Dezelfde lijst die hierboven over de pagina's verdeeld is, ook op state — daar leest
  // 'alles selecteren' hem. Bewust hier en niet in `renderTbody`: die krijgt alleen de rijen van
  // ÉÉN pagina, en 'alles' moet juist over de paginagrens heen gaan.
  // En bewust ná `renderTbody`: gooit het tekenen, dan hoort 'alles selecteren' niet te werken op
  // een lijst die nooit in beeld is gekomen (zie de catch rond renderAll in data.js).
  state._ntdZichtbaar=zichtbaar;
  renderPag('ntd-pag',zichtbaar.length,pgs.ntd,'ntd');
  renderNtdCrossList(state.activeNtd);
  // Werd er een aannemersnaam aangepast, dan is dat invoerveld hierboven vervangen door een NIEUW
  // element en is de cursor eruit gesprongen. Dit zet hem terug. Bewust hier en niet in
  // renderTbody: de poll tekent elke acht seconden opnieuw zodra een collega iets wijzigt, en dat
  // mag je niet merken terwijl je aan het typen bent.
  herstelAannemerFocus();
  // De getekende lijst gaat terug naar de aanroeper: na filteren, sorteren én absorberen, dus in
  // exact de volgorde waarin de rijen op de pagina's verdeeld worden. `springNaarBundel` zoekt er
  // de pagina van de kop mee op zonder die hele pijplijn na te bouwen.
  return zichtbaar;
}
// Cross-list (bug #2): taken die fysiek in een ándere sectie staan maar via hun
// Subcategorie-veld óók bij dit scherm horen. We tonen ze als apart lijstje onderaan
// ("Ook hier"), met een herkomst-tag en een bewerk-knop die de eigen-sectie-modal opent.
// De taak blijft gewoon in z'n eigen scherm staan (geen verplaatsing).
function renderNtdCrossList(sec){
  const host=document.getElementById('ntd-crosslist'); if(!host) return;
  const label=((SECS[sec]?.label)||'').trim().toLowerCase();
  const q=(document.getElementById('s-ntd')?.value||'').toLowerCase().trim();
  const fCode=(document.getElementById('f-code-ntd')?.value||'').toLowerCase().trim();
  const fBeh=(document.getElementById('f-beh-ntd')?.value||'').toLowerCase();
  const fPrio=(document.getElementById('f-prio-ntd')?.value||''); // exacte waarde (niet lowercasen), net als filterNtd
  const treffers=[];
  if(label){
    SKEYS.forEach(s=>{ if(s===sec) return;
      (D.ntd[s]||[]).forEach(r=>{
        if(((r.subcategorie||'')+'').trim().toLowerCase()!==label) return;
        // Zelfde filterdefinitie als de hoofdtabel (filterNtd): zoek over de sectie-keys van de
        // herkomst-sectie en pas óók het prioriteitsfilter toe — anders toont 'Ook hier' items
        // van álle prioriteiten terwijl de hoofdtabel netjes filtert.
        // NIET_ZOEKBAAR erbij, net als in `filterNtd`. Kolom H bevat letterlijk 'TRUE'/'FALSE'
        // en de prioriteit is een woord: zonder deze filter gaf 'al', 'se' of 'fa' hier wél
        // treffers terwijl de hoofdtabel niets liet zien — dezelfde reparatie die filterNtd al had.
        if(q && !SECS[s].keys.some(k=>!NIET_ZOEKBAAR.has(k)&&(r[k]||'').toLowerCase().includes(q))) return;
        if(fCode && !((r.code||'').toLowerCase().includes(fCode))) return;
        if(fBeh && !((r.behandelaar||'').toLowerCase().includes(fBeh))) return;
        if(fPrio && berekenPrioriteit(r.deadline,s).prioriteit!==fPrio) return;
        if(state.ntdStatus==='telaat'    && !teLaatVoorTelling(r,s)) return;
        if(state.ntdStatus==='weggelegd' && !opvolgStatus(r).weggelegd) return;
        treffers.push(r);
      });
    });
  }
  if(!treffers.length){ host.innerHTML=''; return; }
  const rij=r=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const herkomst=esc((SECS[r._sec]?.label)||r._sec||'');
    const dl=r.deadline?` · ${esc(r.deadline)}`:'';
    const opm=esc(((r.opmerkingen||'').split('\n')[0]||'').slice(0,60));
    // De code via de gedeelde bouwsteen, zodat élke VvE-code in de app hetzelfde doet:
    // deze was als enige niet klikbaar. De sectie-css zet --sec, zodat de kleur blijft kloppen.
    return `<div class="xl-rij">
      ${vveCodeSpan(r.code, SECS[r._sec]?.css||'')}
      <div class="xl-mid"><div class="xl-naam">${esc(r.naam||'')}</div>
        <div class="xl-ctx"><span class="xl-herk">${herkomst}</span>${dl}${opm?` · ${opm}`:''}</div></div>
      <button class="xl-edit" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    </div>`;
  };
  host.innerHTML=`<div class="xl-blok">
    <div class="xl-kop">Ook hier <span class="xl-sub">· via subcategorie · ${treffers.length}</span></div>
    ${treffers.map(rij).join('')}
  </div>`;
}
// Geeft de getekende lijst van renderNtd door (zie daar): een aanroeper die net van tabblad
// wisselde weet daarmee meteen wat er nu staat, zonder een tweede render of een eigen filterronde.
function setNtd(s){
  state.activeNtd=s;pgs.ntd=1;bulkWis();
  const zichtbaar=renderNtd();renderBulkUi();
  return zichtbaar;
}

// Op welke pagina van de takenlijst staat deze rij? 0 = hij staat er niet in (weggefilterd, of
// opgeslokt door het paneel van zijn bundel), en dan valt er ook niets te bladeren.
//
// `zichtbaar` is de lijst die `renderNtd`/`setNtd` teruggeeft: ná filteren, sorteren én absorberen,
// dus in exact de volgorde waarin `renderTbody` de rijen over de pagina's verdeelt. Bewust als
// parameter en niet zelf opnieuw opgebouwd — een tweede kopie van die pijplijn loopt bij de eerste
// wijziging stil uit de pas (zelfde afweging als in `springNaarBundel`, dat om die reden op de
// teruggave van `setNtd` leunt en deze functie gebruikt in plaats van de rekensom over te schrijven).
// Zo blijft dit bovendien een pure functie.
function ntdPagina(zichtbaar, r){
  const i=(zichtbaar||[]).indexOf(r);
  return i<0 ? 0 : Math.floor(i/PG)+1;
}

function filterNtd(rows,q,fCode,beh,prio,sec,status){
  const out=rows.filter(r=>{
    // Dezelfde uitsluitlijst als NIET_ZOEKBAAR (util.js). Twee velden vallen daarmee buiten de zoekterm:
    //  · `inBehandeling` draagt letterlijk 'TRUE'/'FALSE', dus elke term die in die twee woorden zit
    //    ('al', 'se', 'fa', 'ru') gaf de hele lijst terug;
    //  · `prioriteit` staat sinds v8.9 niet meer in beeld — op 'hoog' zoeken vond taken waar dat
    //    woord nergens te lezen is. Bewust, en niet stil: zie de toets hieronder.
    // En wat de rij WÉL toont maar niet in SECS.keys staat, telt sinds de naloop van 2026-08-28
    // óók mee: de subcategorie-badge, de 'Terug'-pil (opvolgdatum) en de aannemersnamen uit het
    // uitklap-paneel — zoeken op 'Jansen' filterde het traject mét Jansen juist wég. Alleen de
    // NAMEN, niet de rauwe cel: de |0/|1-markering hoort niet te matchen.
    if(q){
      const extra=[r.subcategorie, r.opvolgdatum, ...parseAannemers(r.aannemers).map(a=>a.naam)];
      if(!SECS[sec].keys.some(k=>!NIET_ZOEKBAAR.has(k)&&(r[k]||'').toLowerCase().includes(q))
         && !extra.some(v=>String(v??'').toLowerCase().includes(q))) return false;
    }
    if(fCode&&!(r.code||'').toLowerCase().includes(fCode)) return false;
    if(beh&&!(r.behandelaar||'').toLowerCase().includes(beh.toLowerCase())) return false;
    if(prio){
      const berekend = berekenPrioriteit(r.deadline, sec).prioriteit;
      if (berekend !== prio) return false;
    }
    // Statusfilter uit de kop-pillen. Onbekende waarden filteren niets weg, zodat een
    // oude/rare state nooit een lege lijst oplevert.
    if(status==='telaat'    && !teLaatVoorTelling(r, sec)) return false;
    if(status==='weggelegd' && !opvolgStatus(r).weggelegd) return false;
    return true;
  });
  // Aannemerslijst (kolom P) op de rij zetten + de X/N-teller bijstellen. Moet vóór de
  // render gebeuren, anders blijft het uitklap-paneel leeg en toont de teller de rauwe
  // kolom D. Sortering loopt daarna via hetzelfde generieke pad als de andere secties.
  if(sec==='OFFERTE-TRAJECTEN') out.forEach(r=>_verrijkOfferteRij(r));
  return out.sort((a,b)=>{
    // Groepen (Fase 4): 0 = actief, 1 = in behandeling, 2 = weggelegd (opvolgdatum in toekomst)
    const grp = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
    const gA = grp(a), gB = grp(b);
    if (gA !== gB) return gA - gB;
    if (gA === 2){ // binnen Weggelegd: vroegste opvolgdatum eerst
      const oA = parseDt(a.opvolgdatum), oB = parseDt(b.opvolgdatum);
      if (oA !== oB) return oA - oB;
    }
    const pa = berekenPrioriteit(a.deadline, sec);
    const pb = berekenPrioriteit(b.deadline, sec);
    // 1. Te laat altijd bovenaan — bewust de rauwe teLaat en niet teLaatVoorTelling (util.js):
    //    een aangevraagd offerte-traject waarvan de opvolgdatum over is hoort óók bovenaan.
    if (pa.teLaat !== pb.teLaat) return pa.teLaat ? -1 : 1;
    // 2. Opvolgen-vandaag direct daarna (Fase 4)
    const ovA = opvolgStatus(a).vandaag ? 0 : 1, ovB = opvolgStatus(b).vandaag ? 0 : 1;
    if (ovA !== ovB) return ovA - ovB;
    // 3. Prioriteit-rang
    const rang = { 'Hoog':0, 'Midden':1, 'Laag':2, '':3 };
    if (rang[pa.prioriteit] !== rang[pb.prioriteit]) return rang[pa.prioriteit] - rang[pb.prioriteit];
    // 4. Deadline oplopend (vroegste eerst)
    const dA = parseDt(a.deadline), dB = parseDt(b.deadline);
    if (dA && dB && dA !== dB) return dA - dB;
    if (dA && !dB) return -1;
    if (dB && !dA) return 1;
    // 5. VvE-code alfabetisch
    return (a.code || '').localeCompare(b.code || '');
  });
}

// Welke kolomkoppen zijn sorteerbaar? 'VvE Code' → code; elke 'Deadline…'-kop → deadline.
function ntdSorteerKey(lbl){
  return lbl==='VvE Code' ? 'code' : (String(lbl).startsWith('Deadline') ? 'deadline' : null);
}

// Kolomkop-sortering (klikcyclus ▲/▼/uit). key:null = standaardvolgorde uit filterNtd.
// De groepsindeling (actief → in behandeling → weggelegd) blijft altijd leidend zodat de
// blokken in de tabel intact blijven; er wordt bínnen de blokken gesorteerd. Stabiele sort:
// gelijke waarden houden de slimme standaardvolgorde.
function sorteerNtd(rows,sort){
  if(!sort||!sort.key) return rows;
  const dir=sort.asc?1:-1;
  const grp=r=>opvolgStatus(r).weggelegd?2:(r.inBehandeling==='TRUE'?1:0);
  return rows.slice().sort((a,b)=>{
    const g=grp(a)-grp(b);
    if(g) return g;
    if(sort.key==='code')
      return dir*String(a.code||'').localeCompare(String(b.code||''),undefined,{numeric:true,sensitivity:'base'});
    const dA=parseDt(a.deadline),dB=parseDt(b.deadline);
    if(!dA&&!dB) return 0;
    if(!dA) return 1;              // zonder deadline altijd onderaan, in beide richtingen
    if(!dB) return -1;
    return dir*(dA-dB);
  });
}

// ══════════════════════════════════════
//  AFGEROND
// ══════════════════════════════════════
// De keuzelijst met periodes uit één bron (AF_PERIODES in util.js) i.p.v. handgeschreven
// <option>'s in index.html: de rekenregel en het label horen bij elkaar te blijven.
//
// Bij het OPSTARTEN vullen en niet pas bij de eerste `renderAf`. Gemeten: op een verse lading had
// `#f-per-af` nul opties en nul breedte totdat renderAf voor het eerst draaide. Mislukt die eerste
// lading (offline, verlopen token, Sheets-storing) en is er geen cache, dan bleef er een gat in de
// filterbalk staan naast een behandelaar-filter dat wél gevuld was.
// Alleen de eerste keer, anders zou de keuze van de gebruiker bij elke render terugspringen.
function vulPeriodeKeuze(){
  const el=document.getElementById('f-per-af');
  if(!el || el.options.length) return;
  el.innerHTML=AF_PERIODES.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('');
}

// De vier filtervelden van de Afgerond-pagina uitgelezen en vertaald naar één plat object.
// Apart van `filterAf` zodat dat filter PUUR blijft (geen DOM) en los te toetsen is — dezelfde
// scheiding als tussen `renderNtd` en `filterNtd`.
function afFilterWaarden(){
  const el=id=>document.getElementById(id);
  const per=(el('f-per-af')&&el('f-per-af').value)||'';
  // 'Eigen bereik' leest de twee datumvelden; de vaste periodes rekent `periodeBereik` uit.
  const bereik = per==='eigen'
    ? { van:(el('f-van-af')&&el('f-van-af').value)||'', tot:(el('f-tot-af')&&el('f-tot-af').value)||'' }
    : periodeBereik(per);
  return { q:((el('s-af')&&el('s-af').value)||'').toLowerCase().trim(),
           beh:(el('f-beh-af')&&el('f-beh-af').value)||'',
           per, bereik };
}

// Puur: rijen → gefilterde rijen. Geen DOM, geen state.
//
// De datumvergelijking gaat over ISO-strings (jjjj-mm-dd) en niet over Date-objecten. Dat mag,
// omdat die vorm links-naar-rechts vergelijkbaar is, en het scheelt honderden Date-constructies
// per render. `toISODate` kent de Nederlandse long-date die Google Sheets teruggeeft ("19 aug
// 2026"); een rij zonder leesbare datum valt buiten élk bereik in plaats van er stil in te vallen.
//
// De behandelaar via `splitBehandelaar` en niet met `includes`: het veld kan 'Cihad, Jer' zijn, en
// een kale `includes('Jer')` zou ook 'Jeroen' raken.
// Wél hoofdletter-ONgevoelig vergelijken. Kolom E wordt met de hand getypt en soms door Apps
// Script gevuld; een rij met 'cihad' viel bij het filter 'Cihad' zonder melding weg en dan leest
// 'Niets gevonden' als 'die taak bestaat niet meer'. Op Nog Te Doen werd diezelfde rij wél
// gevonden (filterNtd vergelijkt in kleine letters), dus de twee pagina's spraken elkaar tegen.
function filterAf(rows, f){
  let uit = filt(rows||[], (f&&f.q)||'');
  if(f&&f.beh){
    const doel = String(f.beh).toLowerCase();
    uit = uit.filter(r=>splitBehandelaar(r.behandelaar).some(n=>n.toLowerCase()===doel));
  }
  const b = f && f.bereik;
  if(b && (b.van || b.tot)){
    uit = uit.filter(r=>{
      const d = toISODate(r.datum||'');
      if(!d) return false;                 // geen leesbare afronddatum → niet in een periode
      if(b.van && d < b.van) return false;
      if(b.tot && d > b.tot) return false;
      return true;
    });
  }
  return uit;
}

function renderAf(){
  // De keuzelijst met periodes staat er al vóór de eerste lading (vulPeriodeKeuze wordt bij het
  // opstarten aangeroepen); hier alleen een vangnet voor het geval renderAf eerder draait.
  vulPeriodeKeuze();
  const f=afFilterWaarden();
  // De twee datumvelden alleen tonen bij 'Eigen bereik'. `hidden` en geen inline display: de
  // stylesheet regelt het, en `#af-eigen[hidden]` houdt het standaardgedrag overeind.
  const eigen=document.getElementById('af-eigen');
  if(eigen) eigen.hidden = f.per!=='eigen';
  document.getElementById('af-tabs').innerHTML=SKEYS.map(s=>{
    const rows=filterAf(D.af[s]||[],f);
    return`<button type="button" class="tab ${s===state.activeAf?'on':''}" role="tab" aria-selected="${s===state.activeAf}" style="${s===state.activeAf?SECS[s].css:''}" data-action="af-sectie" data-sec="${s}">${SECS[s].label}<span class="cnt">${rows.length}</span></button>`;
  }).join('');
  // 'Behandelaar' als kolom erbij: je kunt nu op iemand filteren, en dan hoort in de lijst te
  // staan op wie. Zonder die kolom is een filter dat rijen weghaalt niet te controleren.
  const cols=['VvE Code','VvE','Taak','Subcategorie','Behandelaar','Afgerond op','Opmerking'];
  renderThead('af-thead',cols,SECS[state.activeAf].css);
  const rows=filterAf(D.af[state.activeAf]||[],f);
  // De lege-lijst-tekst moet weten dát er gefilterd is, anders leest 'niets gevonden' als 'er is
  // niets afgerond'. Alle vier de filters tellen mee, niet alleen de zoekterm.
  const gefilterd = !!(f.q || f.beh || (f.bereik && (f.bereik.van || f.bereik.tot)));
  renderTbody('af-tbody',rows,state.activeAf,pgs.af,true,gefilterd);
  renderPag('af-pag',rows.length,pgs.af,'af');
}
function setAf(s){state.activeAf=s;pgs.af=1;renderAf()}

export {
  renderNtdStats, renderNtdDonut, renderNtd, setNtd, ntdPagina, filterNtd, sorteerNtd, ntdSorteerKey, renderAf, setAf,
  filterAf, afFilterWaarden, vulPeriodeKeuze,
  kopOpen, zetKopOpen, toggleBundel, springNaarBundel, wisNtdFilters, absorbeer, isPlatteWeergave, erIsGefilterd,
  offerteAannemerPaneel, offerteAannSamenvatting,
  ALVO_ICONS, renderAlvo, ALVO_COLS, ALVO_LABELS, flagPill, _recomputeAlvoStatus, toggleAlvoFlag, statusIco, renderAlfa,
  renderThead, renderTbody, bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf, renderPag,
};
