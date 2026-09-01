// ══════════════════════════════════════
//  CRUD — taak-modals, sheet-helpers, toevoegen/afronden/verwijderen
// ══════════════════════════════════════
import { esc, berekenPrioriteit, toISODate, toDutchDate, nieuwTaakId, taakVerwijzing, voorgesteldeDeadline, DEADLINE_HINT, taakTitel, reconcileOffertes, parseAannemers, duurNaarCel, duurUitCel, _parseAnyDate, offerteAangevraagd } from "./util.js";
import { zoekDubbels, dubbelVraagTekst } from "./dubbelcheck.js";
import { extraVves, wisExtraVves, extraVvesHtml, extraVvesUitleg } from "./meervve.js";
import { state, D, pgs } from "./state.js";
import { verseRij, rijIndex } from "./rij.js";
import { SECS, SKEYS, SID, OMSCHRIJVING_SLEUTEL, VELD_LABELS } from "./config.js";
import { writeRange, writeRows, _shiftNtdRows, _shiftAfRows, _herstelShift, assertRowMatch, sheetsFetch, fetchSheet, _a1Bereik, _withRetry } from "./api.js";
import { isKolomKop, isSectieKop } from "./structuurcheck.js";
import { ensureToken } from "./auth.js";
import { showToast, showUndoToast, fireNotifEvent, undoComplete, undoDelete } from "./notifications.js";
import { animateRowOut, flashRow } from "./anim.js";
import { logEvent, logEvents, renderTaskHistory } from "./render-overig.js";
import { backgroundWrite, loadAll, blokkeerOffline } from "./data.js";
import { faseIndex, faseWoord, faseRijHtml, faseWijziging, SUBSIDIE_FASES } from "./subsidie-fase.js";
import { bouwBundelIndex, bundelVerwijzing, openSubtaken, bundelWaarschuwing, heeftSubtaken } from "./bundel.js";
import { koppelTaak } from "./bundel-acties.js";
import { zetModalAannemers, modalAannemersCel } from "./modal-aannemers.js";
import { maakVoorlegSubtaken } from "./offerte-stappen.js";
import { schrijfAannemers } from "./offerte-aannemers.js";
import { vraagBevestiging } from "./bevestig.js";
import { setNtd, renderNtd, ntdPagina } from "./render-lijsten.js";

// Welke formuliergroep hoort bij welke sectie. Eén bron: openModal verbergt ze
// allemaal via deze map en toont er precies één, dus een zesde sectie raakt
// straks maar één plek in plaats van vijf losse regels.
const FG_PER_SECTIE = {
  OPPAKKEN:'fg-opp', VERGADERVERZOEKEN:'fg-verg', 'OFFERTE-TRAJECTEN':'fg-off',
  LOD:'fg-lod', 'SUBSIDIE-TRAJECTEN':'fg-sub',
};
import { renderAll } from "./main.js";
import { zetWeekKiezer } from './weekkiezer.js';

//  MODAL — Open / Close
// ══════════════════════════════════════
// Alles wat aan de gekozen categorie hangt: de stand in `state.editSec` (waar submitTask op
// afgaat), de titel, het kleuraccent en het zichtbare veldblok. Eén functie, want de
// categorie-kiezer hieronder moet exact dezelfde vier dingen omzetten als openModal — een tweede
// kopie zou bij de eerstvolgende wijziging stil uit de pas lopen (zelfde afweging als
// FG_PER_SECTIE zelf).
function toonSectie(sec,isEdit){
  state.editSec=sec;
  document.getElementById('m-title').textContent=(isEdit?'Taak bewerken — ':'Taak toevoegen — ')+SECS[sec].label;
  // Section colour for focus rings
  document.documentElement.style.setProperty('--modal-sec',SECS[sec].color);
  // Show correct field group
  Object.values(FG_PER_SECTIE).forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const fg=FG_PER_SECTIE[sec];
  if(fg) document.getElementById(fg).style.display='';
}

// De categorie-kiezer. Alleen zichtbaar bij TOEVOEGEN: een bestaande taak van categorie wisselen
// betekent hem naar een ander blok van het tabblad verplaatsen, met een andere kolomindeling en
// een andere rij — dat bestaat niet als functie, en een kiezer die het aanbiedt belooft iets wat
// submitTask niet doet.
// De opties komen uit SKEYS en niet uit vaste HTML, maar wél gefilterd op FG_PER_SECTIE. Die map
// is handmatig (zie boven), net als het veldblok in index.html en de `switch(sec)` in submitTask:
// een sectie die alleen in SECS staat heeft hier dus geen formulier en geen kolomindeling. Zonder
// die filter bood de kiezer hem toch aan, toonde `toonSectie` géén enkel veldblok en viel
// Toevoegen om op een lege `values` ('Fout: …'). Eén keer vullen is genoeg; daarna alleen de stand
// zetten.
// De categorie-kiezer. Bij TOEVOEGEN kiest hij waar de taak komt te staan; bij BEWERKEN verplaatst
// hij hem daadwerkelijk — met zijn taaknummer, subtaken en geschiedenis mee (zie verplaats.js).
// Vroeger stond hij bij bewerken verborgen, en dan was de enige weg naar een andere categorie:
// weggooien en opnieuw intypen. Dat kostte precies díe drie dingen.
// Het bijschrift verschilt daarom per stand: 'kiezen' is iets anders dan 'verhuizen', en dat
// verschil hoort in beeld te staan vóórdat er iets gebeurt.
function zetSectieKiezer(sec,isEdit){
  const vak=document.getElementById('fld-sectie'), kies=document.getElementById('m-sec');
  if(!vak||!kies) return;
  vak.style.display='';
  const lbl=document.getElementById('m-sec-label');
  const hint=document.getElementById('m-sec-hint');
  if(lbl) lbl.textContent = isEdit ? 'Categorie — kies een andere om te verplaatsen' : 'Categorie';
  if(hint) hint.textContent = isEdit
    ? 'Taaknummer en subtaken gaan mee. Velden die de nieuwe categorie niet kent vervallen, en oudere logboekregels blijven bij de oude categorie — je krijgt het eerst te zien.'
    : '';
  if(!kies.options.length)
    kies.innerHTML=SKEYS.filter(s=>FG_PER_SECTIE[s])
      .map(s=>`<option value="${esc(s)}">${esc(SECS[s].label)}</option>`).join('');
  kies.value=sec;
}

// Een andere categorie kiezen in het toevoegscherm. Zet alleen de LOKALE stand; er gaat pas iets
// naar de Sheet bij Toevoegen (zelfde afweging als de fase-bolletjes in de modal).
// De ingevulde velden van de vorige categorie blijven staan maar zijn verborgen: submitTask leest
// uitsluitend de velden van `state.editSec`, dus ze kunnen niet meeliften.
function kiesSectie(sec){
  if(!SECS[sec]||state.editMode) return;
  toonSectie(sec,false);
  // Van sectie wisselen in een nieuw-taakscherm is een nieuwe keuze, dus ook een nieuw voorstel.
  // Zonder deze regel bleef de datum van de vorige sectie staan (of, bij LOD, bleef er een
  // voorstel staan dat daar juist NIET hoort).
  zetDeadlineVoorstel(sec,false);
}

// Sectie → het deadline-invoerveld en het zinnetje eronder. Dezelfde ids die `fillModalFields` en
// `submitTask` gebruiken; op één plek, zodat een nieuw scherm niet op drie plekken bijgewerkt hoeft.
const DEADLINE_VELD = { OPPAKKEN:'m-dl', VERGADERVERZOEKEN:'m-dl-v', 'OFFERTE-TRAJECTEN':'m-dl-o',
                        LOD:'m-dl-l', 'SUBSIDIE-TRAJECTEN':'m-dl-s' };
const DEADLINE_HINT_VELD = { OPPAKKEN:'dl-hint', VERGADERVERZOEKEN:'dl-hint-v', 'OFFERTE-TRAJECTEN':'dl-hint-o',
                             LOD:'dl-hint-l', 'SUBSIDIE-TRAJECTEN':'dl-hint-s' };

// Het deadline-voorstel bij een NIEUWE taak. Alleen daar: bij bewerken staat er een echte datum en
// zou een voorstel die overschrijven — dat is geen hulp maar gegevensverlies.
//
// Bewust ná `clearModal()` aangeroepen (die maakt élk veld leeg) en vóór het openen van het
// venster, zodat de gebruiker de datum meteen ziet staan en hem kan wissen. `voorgesteldeDeadline`
// geeft '' voor LOD en Subsidie; het veld blijft dan leeg en alleen het zinnetje verschijnt.
function zetDeadlineVoorstel(sec, isEdit){
  const hintEl = document.getElementById(DEADLINE_HINT_VELD[sec]);
  const veldEl = document.getElementById(DEADLINE_VELD[sec]);
  // Élk zinnetje leegmaken, niet alleen dat van deze sectie: de vijf schermen delen één venster en
  // een achtergebleven zin van een vorige sectie zou bij de verkeerde datum blijven staan.
  Object.values(DEADLINE_HINT_VELD).forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=''; });
  if(isEdit || !veldEl || !hintEl) return;
  // Een SUBTAAK krijgt geen voorstel. Die hoort bij een hoofdtaak die zijn eigen deadline heeft;
  // 'bel de aannemer terug' erft anders een datum van over zeven dagen die nergens op slaat, telt
  // mee in de te-laat-pil en krijgt een prioriteit. Zelfde grens als bij 'ook voor andere VvE's'.
  if(state._nieuwBundel) return;
  hintEl.textContent = DEADLINE_HINT[sec] || '';
  const iso = voorgesteldeDeadline(sec);
  if(!iso) return;
  // MAAR ÉÉN KEER PER SCHERM per categorie. Zonder deze rem kwam een bewust weggehaalde datum
  // terug zodra de gebruiker in de categorie-kiezer heen en weer ging: het veld was leeg, dus de
  // regel hieronder vulde hem opnieuw. Het zinnetje eronder belooft woordelijk 'Aanpassen of
  // leegmaken mag' — en één klik op Toevoegen legde die teruggekeerde datum vast in de Sheet.
  // Gemeten langs de echte weg: openen → 28-08, wissen → leeg, naar LOD → leeg, terug → 28-08.
  // De verzameling wordt geleegd door `clearModal`, dus elk NIEUW scherm stelt weer voor.
  if(!state._dlVoorgesteld) state._dlVoorgesteld = new Set();
  if(state._dlVoorgesteld.has(sec)) return;
  state._dlVoorgesteld.add(sec);
  if(!veldEl.value) veldEl.value = iso;
}

// ── Offerte: deadline ↔ opvolgdatum in het scherm (v12.5) ──
// Zodra 'Datum aangevraagd' voor het eerst gevuld wordt is de aanvraag uitgezet: het F-veld
// wordt een OPVOLGDATUM — label wisselt en het veld krijgt een voorstel van +3 weken na de
// aanvraagdatum (ontwerpbesluit 2026-09-01; daarna verlengt de paneel-knop telkens +2 weken).
// `state._offAangevraagdBijOpen` onthoudt de stand bij het openen: wie een al-aangevraagd
// traject opent krijgt géén nieuw voorstel over zijn bestaande opvolgdatum heen.
function zetOffLabel(aangevraagd){
  const lbl=document.getElementById('m-dl-o-label');
  if(lbl) lbl.textContent = aangevraagd ? 'Opvolgdatum' : 'Deadline';
}
// Wat het voorstel zelf in m-dl-o schreef, en wat er vóór de éérste overschrijving stond.
// Zelfde gemeten bugklasse als de rem in zetDeadlineVoorstel (_dlVoorgesteld): zonder deze twee
// kwam het voorstel bij élke aanslag in 'Datum aangevraagd' terug en verving het stil een
// opvolgdatum die de gebruiker al met de hand had gekozen. Modaal-lokaal en bewust vluchtig:
// clearModal, closeModal én het openen van een bewerkscherm (fillModalFields) wissen ze allebei.
let _offVoorstel=null;
let _offVorigeF=null;
function offerteAanvraagGewijzigd(){
  if(state.editSec!=='OFFERTE-TRAJECTEN') return;
  const veld=document.getElementById('m-dl-o');
  const hint=document.getElementById('dl-hint-o');
  const daang=gv('m-daang');
  if(!daang){
    // De terugweg: aanvraagdatum weer leeg = geen aanvraag. Label terug, en staat ons eigen
    // voorstel nog onaangeroerd in het veld, dan komt de oorspronkelijke waarde terug (kan ''
    // zijn) — anders bleef er in een bewerkscherm een wees-voorsteldatum in kolom F staan bij
    // een lege kolom C, en was de oorspronkelijke deadline onherstelbaar weg. De aanvraag-hint
    // gaat weg; een eventuele onvertaalbaar-melding ('eind juni') hoort daarna weer te zien te zijn.
    zetOffLabel(false);
    if(veld && _offVoorstel!==null && veld.value===_offVoorstel) veld.value=_offVorigeF;
    if(hint) hint.textContent='';
    toonOnvertaalbaar(state.editSec);
    _offVoorstel=null; _offVorigeF=null;
    return;
  }
  zetOffLabel(true);
  if(state._offAangevraagdBijOpen) return;
  const p=_parseAnyDate(daang);
  if(!p || !veld) return;
  // De rem: de ÉÉRSTE vulling van 'Datum aangevraagd' springt bewust over wat er staat heen —
  // het veld wórdt op dat moment een opvolgdatum. Dat geldt ook als er een onvertaalbaar-melding
  // ('eind juni') onder het lege veld staat: het voorstel vervangt die melding zichtbaar, de
  // gebruiker kan het wissen en de terugweg hierboven zet de melding dan terug — bewust zo.
  // Elke LATERE correctie van de aanvraagdatum mag het veld alleen nog verzetten zolang er leeg
  // óf exact ons eigen voorstel staat: een handmatige keuze wordt nooit stil vervangen.
  if(_offVoorstel!==null && veld.value!=='' && veld.value!==_offVoorstel) return;
  if(_offVoorstel===null) _offVorigeF=veld.value;
  const d=new Date(p.y, p.m-1, p.d + 21);
  const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  veld.value=iso;
  _offVoorstel=iso;
  if(hint) hint.textContent='Aanvraag uitgezet — de deadline is nu een opvolgdatum. Voorstel: +3 weken. Aanpassen mag.';
}

// De merkjes en het uitlegregeltje van 'ook voor andere VvE's' opnieuw tekenen. Eén functie, zodat
// toevoegen, weghalen en het openen van het scherm allemaal langs dezelfde weg lopen.
function renderExtraVves(){
  const lijst=extraVves();
  const chips=document.getElementById('m-extra-chips');
  const uitleg=document.getElementById('m-extra-uitleg');
  if(chips) chips.innerHTML=extraVvesHtml(lijst);
  if(uitleg) uitleg.textContent=extraVvesUitleg(lijst.length);
}

// Het hele blok verbergen waar het niet hoort. Twee gevallen:
//   BEWERKEN — een bestaande taak kun je niet alsnog over meer VvE's uitsmeren; dat zou een
//     tweede taak aanmaken vanuit een scherm dat 'Opslaan' heet.
//   EEN SUBTAAK — die hangt aan één bepaalde bundel bij één VvE. Twaalf subtaken van twaalf
//     verschillende VvE's in één bundel is geen bundel meer.
// LET OP — de id begint bewust NIET met `fg-`. Dat voorvoegsel is in dit venster gereserveerd voor
// de veldblokken per categorie, en er is een toets die eist dat er precies ÉÉN `fg-`-blok tegelijk
// zichtbaar is (zie 'categorie: elke aangeboden categorie heeft ook echt een veldblok'). Een
// tweede zichtbaar `fg-`-blok laat die omvallen — gemeten, niet bedacht.
function toonMeerVve(isEdit){
  const blok=document.getElementById('meervve-blok');
  if(!blok) return;
  const mag = !isEdit && !state._nieuwBundel;
  blok.style.display = mag ? '' : 'none';
  const veld=document.getElementById('m-extra-vve');
  if(veld) veld.value='';
  renderExtraVves();
}

// Het scherm bijstellen NADAT er besloten is dat dit een subtaak wordt.
//
// De volgorde is dwingend en niet vrij te kiezen: `clearModal` wist `state._nieuwBundel` (een leeg
// formulier hoort bij géén bundel), dus de knop '+ Voeg een subtaak toe' kan die vlag pas ZETTEN
// nadat het scherm open is. Gevolg: alles wat ín `openModal` op die vlag kijkt, kijkt er te vroeg
// naar. Twee dingen liepen daardoor stuk, en allebei zonder foutmelding:
//   - het blok 'Ook voor andere VvE's' bleef staan; koos je daar twee VvE's, dan kreeg je één
//     subtaak plus twee LOSSE taken buiten de bundel (alleen te zien aan een lege kolom R);
//   - de subtaak kreeg alsnog een voorgestelde deadline van over zeven dagen.
// Daarom niet een derde guard erbij, maar deze ene functie die de aanroeper ná het zetten van de
// vlag draait — dan zien beide beslissingen dezelfde waarheid.
function herzieAlsSubtaak(sec){
  toonMeerVve(false);
  const veldEl = document.getElementById(DEADLINE_VELD[sec]);
  const hintEl = document.getElementById(DEADLINE_HINT_VELD[sec]);
  if(veldEl) veldEl.value = '';
  if(hintEl) hintEl.textContent = '';
}

// De inhoud van de taak op het moment dat het bewerkscherm openging. Alleen de velden die DIT
// scherm zelf schrijft: de laatste drie kolommen blijven erbuiten, want Q is het taaknummer (dat is
// identiteit, geen inhoud) en R/S zijn de bundelkolommen — die wijzigen door 'Hoort bij' terwijl
// dit scherm openstaat, en dat is de gebruiker zelf.
function _inhoudsFoto(r){
  if(!r||!SECS[r._sec]) return null;
  const v=serializeNtdUndo(r);
  return v.slice(0, v.length-3).join('\x1f');
}

function openModal(isEdit,rowData,opts){
  state.editMode=!!isEdit;
  const sec=isEdit?rowData._sec:((opts&&opts.sec)||state.activeNtd);
  state.editRowData=rowData||null;
  state.editFoto=isEdit?_inhoudsFoto(rowData):null;
  toonSectie(sec,isEdit);

  document.getElementById('m-submit-lbl').textContent=isEdit?'Opslaan':'Toevoegen';
  document.getElementById('m-del').style.display=isEdit?'inline-flex':'none';
  document.getElementById('m-af').style.display=isEdit?'inline-flex':'none';

  if(isEdit&&state.editRowData){
    document.getElementById('m-code').value=state.editRowData.code||'';
    _zetNaamVeld(state.editRowData.code||'', state.editRowData.naam||'');
    fillModalFields(sec,state.editRowData);
    renderTaskHistory(state.editRowData.code,sec);
    zetHoortBij(state.editRowData);
  } else {
    clearModal();
    zetHoortBij(null);
    document.getElementById('fg-history').style.display='none';
    // Vooraf ingevulde VvE (bv. +-knop op de dossierpagina): code + naam zetten,
    // net alsof de gebruiker 'm via het zoekveld had gekozen.
    if(opts&&opts.code){
      document.getElementById('m-code').value=opts.code;
      _zetNaamVeld(opts.code, opts.naam||'');
    }
  }

  // Ná de tak hierboven: `clearModal` zet élk veld in de modal-body op '' en dat geldt ook voor
  // een <select>, die daarmee op 'geen selectie' zou blijven staan.
  zetSectieKiezer(sec,isEdit);
  zetDeadlineVoorstel(sec,isEdit);
  toonOnvertaalbaar(sec);   // ná het voorstel: dat maakt élk hint-zinnetje eerst leeg
  toonMeerVve(isEdit);

  document.getElementById('modal-bg').classList.add('open');
}

function editRow(r){ openModal(true,r); }

function closeModal(){
  document.getElementById('modal-bg').classList.remove('open');
  // Élke sluitweg van dit venster loopt hierlangs — kruisje, Annuleren, klik naast het venster en
  // Escape zijn in main.js alle vier aan closeModal geknoopt. Dit is dus de plek waar een
  // niet-verstuurde subtaak zijn bundel weer loslaat.
  state._nieuwBundel=null;
  // Om dezelfde reden ook de in 'Hoort bij' aangewezen doeltaak. Een volgend `openModal` ruimt hem
  // via zetHoortBij/clearModal toch al op, dus dit is vandaag geen zichtbaar verschil — maar dan
  // hangt de belofte 'een keuze hoort bij het scherm waarin hij is gemaakt' aan de aanname dat
  // submitTask nooit buiten een geopend venster om draait. Die aanname is hier niet nodig.
  state._hbDoel=null;
  // Zelfde regel voor de offerte-openstand: die hoort bij het scherm dat hem zette. Het label
  // gaat mee terug, zodat een gesloten venster niet met 'Opvolgdatum' blijft staan — en de
  // voorstel-rem gaat mee, want ook die hoorde bij dit ene scherm.
  state._offAangevraagdBijOpen=false;
  zetOffLabel(false);
  _offVoorstel=null; _offVorigeF=null;
  // En het NTD-tabblad terug naar waar de gebruiker vandaan kwam. `prefillNieuweTaak` (ai.js)
  // verzet `state.activeNtd` al bij het openen — vóór enige bevestiging — en dit venster kan op
  // vier manieren weg zonder dat er iets is aangemaakt. `submitTask` wist de vlag zodra de taak
  // wél bestaat, dus daar blijft het nieuwe tabblad staan.
  //
  // Mét hertekenen, en dat is geen overbodige render. Normaal staat de oude lijst er nog gewoon
  // (goTo hertekent de NTD-lijst niet, zie prefillNieuweTaak), maar er kán achter dit venster langs
  // getekend zijn: `backgroundWrite` doet in zijn finally `loadAll(true)` zodra de laatste
  // schrijfactie klaar is, en loadAll roept bij elke gewijzigde stand renderAll aan — zonder te
  // kijken of er een modal open staat (alleen de pollrondes in main.js slaan een open modal over).
  // Dan staat het NIEUWE tabblad al getekend, en zou het zonder deze render pas bij de
  // eerstvolgende poll terugspringen: seconden later en zonder aanleiding, precies wat de
  // terugzetting moest voorkomen. Alleen renderNtd: de statpillen tellen over alle secties heen
  // (renderNtdStats) en veranderen hier dus niet.
  if(state._ntdVoorModal){
    const terug=state._ntdVoorModal; state._ntdVoorModal=null;
    if(terug!==state.activeNtd){ state.activeNtd=terug; renderNtd(); }
  }
}

// ── 'Hoort bij' (Takenbundel) ──
// Vult het veld met de zichtbare kop van de bundel waar deze taak in zit, of verbergt het hele
// veld (r=null: een nieuwe taak heeft nog geen rij om een koppeling naar weg te schrijven).
// Geëxporteerd omdat het kruisje er ook op terugvalt als de gebruiker zijn keuze weer weggooit.
const HB_PLACEHOLDER='Zoek een taak om onder te hangen…';
export function zetHoortBij(r){
  const veld=document.getElementById('m-hoortbij');
  const wis=document.getElementById('m-hoortbij-x');
  const vak=document.getElementById('fld-hoortbij');
  state._hbDoel=null;                 // aangewezen doeltaak; wordt gezet door de kiezer (main.js)
  if(!veld||!vak) return;
  vak.style.display=r?'':'none';
  if(wis) wis.style.display='none';
  // Het slot en de bijbehorende uitleg horen bij één bepaalde taak, dus ze gaan hier open vóórdat
  // de terugkeer hieronder ze zou overslaan. Bewerk je eerst een hoofdtaak (die zet disabled) en
  // open je daarna het toevoegscherm, dan bleef het veld anders op slot staan — vandaag onzichtbaar
  // omdat het vak bij een nieuwe taak verborgen is, maar het is een val zodra dat verandert.
  veld.disabled=false;
  veld.placeholder=HB_PLACEHOLDER;
  // De tooltip hoort bij de waarde en moet hier dus óók leeg: bleef hij staan, dan zweeft bij een
  // nieuwe taak nog de verwijzing van de vórige bewerking boven een leeg veld.
  if(!r){ veld.value=''; veld.title=''; return; }
  // Eén bron voor 'wat is deze rij binnen haar bundel' (zie bundelVerwijzing in bundel.js). Hier
  // stond diezelfde afleiding met de hand uitgeschreven — twee plekken die hetzelfde antwoord
  // moeten geven, en dat is precies het soort stil verschil waar deze functie voor bestaat.
  // (En dit is de aanroeper die twee momentopnames mengt: de index is vers uit `D`, terwijl `r`
  // uit state._rowCache van de laatste render komt. bundelVerwijzing staat dat toe — het is
  // precies waarom hij op taaknummer vergelijkt en niet op objectidentiteit.)
  const _ix=bouwBundelIndex(D.ntd,D.af);
  const verw=bundelVerwijzing(r, _ix);
  // `heeftSubtaken` en niet `verw.rol==='kop'`: dat laatste is de ZICHTBARE kop (het laagste open
  // volgnummer) en dat is een andere vraag dan 'hangt er iets onder mij?'. Zie de toelichting bij
  // `heeftSubtaken` in bundel.js — het veld hieronder moet exact op slot staan wanneer
  // `magKoppelen` het straks toch zou weigeren, en op geen enkel ander moment.
  const isKop=heeftSubtaken(_ix, r);
  const isSub=!!verw && verw.rol==='sub';
  // De VOLLEDIGE verwijzing, niet alleen `taakTitel`: koppelen mag over VvE's heen, dus zonder de
  // code kan de gebruiker niet zien wélke taak dit is.
  veld.value=isSub ? taakVerwijzing(verw.kopRij) : '';
  // De regel is langer dan het veld breed is, en een <input> scrollt naar het BEGIN — dan valt
  // juist de omschrijving weg, het deel dat twee taken van dezelfde VvE uit elkaar houdt.
  veld.title=veld.value;
  // Een taak met subtaken kan nergens onder — dat weigert `magKoppelen` toch al. Het veld op slot
  // zetten voorkomt dat de gebruiker eerst een doel uitzoekt en pas bij het opslaan hoort dat het
  // niet mag.
  veld.disabled=isKop;
  veld.placeholder=isKop?'Deze taak is de hoofdtaak van een bundel':HB_PLACEHOLDER;
  if(wis&&isSub) wis.style.display='';
}

// Welke ZICHTBARE velden van het bewerkscherm wijken af van de opgeslagen rij? De categoriekiezer
// is bij bewerken de verplaats-knop, en `verplaatsTaak` bouwt de nieuwe rij volledig uit het
// rij-OBJECT — wat er op dat moment in de invoervelden staat en nog niet is opgeslagen, verdween
// daarmee zonder één woord. Deze functie levert de veldnamen zoals de gebruiker ze op het scherm
// ziet, zodat de bevestigingsvraag ze kan noemen.
// Dezelfde afbeelding als fillModalFields hierboven, maar dan de andere kant op. Bewust niet via
// `values` uit submitTask: die bouwt kolomwaarden en kent geen labels.
// Per sectie: [veld-id, sleutel op het rij-object, soort]. Soort 1 = datum (het veld draagt ISO,
// de rij een Nederlandse datum), soort 2 = schakelaar (aan/uit i.p.v. .value).
// De subcategorie en de 'In behandeling'-schakelaar staan er nadrukkelijk BIJ: de vraagtekst leest
// als een volledige opsomming, en `verplaatsWaarden` neemt allebei uit het rij-object over — een
// wijziging op het scherm die hier niet genoemd wordt, verdwijnt dus zonder één woord.
const _MODAL_VELDEN = {
  'OPPAKKEN':           [['m-actie','actiepunt'],['m-dl','deadline',1],['m-beh','behandelaar'],['m-opm','opmerkingen'],['m-sub-opp','subcategorie'],['tog-ib','inBehandeling',2]],
  'VERGADERVERZOEKEN':  [['m-per','periode'],['m-agenda','agendapunten'],['m-beh-v','behandelaar'],['m-dl-v','deadline',1],['m-opm-v','opmerkingen'],['m-sub-verg','subcategorie'],['tog-ib-v','inBehandeling',2]],
  'OFFERTE-TRAJECTEN':  [['m-daang','datumAangevraagd',1],['m-beh-o','behandelaar'],['m-dl-o','deadline',1],['m-opm-o','opmerkingen'],['m-sub-off','subcategorie']],
  'LOD':                [['m-actie-l','actiepunt'],['m-stat-l','status'],['m-beh-l','behandelaar'],['m-dl-l','deadline',1],['m-opm-l','opmerkingen'],['m-sub-lod','subcategorie'],['tog-ib-l','inBehandeling',2]],
  'SUBSIDIE-TRAJECTEN': [['m-subsidie','subsidie'],['m-beh-s','behandelaar'],['m-dl-s','deadline',1],['m-opm-s','opmerkingen'],['m-sub-sub','subcategorie'],['tog-ib-s','inBehandeling',2]],
};
const _MODAL_EXTRA_LABEL = { subcategorie:'Subcategorie', inBehandeling:'In behandeling' };
export function nietOpgeslagenVelden(r){
  const spec=_MODAL_VELDEN[r&&r._sec];
  if(!spec) return [];
  const labels=VELD_LABELS[r._sec]||{};
  const uit=spec.filter(([id,sleutel,soort])=>{
    const el=document.getElementById(id);
    if(!el) return false;
    if(soort===2) return el.classList.contains('on') !== (r[sleutel]==='TRUE');
    const opScherm=String(el.value==null?'':el.value).trim();
    const opgeslagen=soort===1 ? toISODate(r[sleutel]||'') : String(r[sleutel]==null?'':r[sleutel]).trim();
    return opScherm!==opgeslagen;
  }).map(([,sleutel])=>labels[sleutel]||_MODAL_EXTRA_LABEL[sleutel]||sleutel);
  // Twee schermwaarden leven niet in een gewoon invoerveld en vielen daardoor buiten de
  // opsomming hierboven — terwijl de vraagtekst als een VOLLEDIGE opsomming leest en
  // `verplaatsWaarden` ze uit het rij-object neemt: de wijziging verdween dan zonder één woord
  // (naloop 2026-08-28).
  //  · De aannemerslijst: werkkopie in modal-aannemers.js, geen gewoon invoerveld.
  if(r._sec==='OFFERTE-TRAJECTEN' && document.getElementById('m-aann')){
    if(modalAannemersCel()!==(r.aannemers||'')) uit.push('Aangevraagd bij');
  }
  //  · De fase-kiezer: modulestand (_modalFase), geen DOM-veld. Alleen een échte klik van de
  //    gebruiker telt (_faseGekozen) — de genormaliseerde weergave van een rommelwaarde niet.
  if(r._sec==='SUBSIDIE-TRAJECTEN' && _faseGekozen
     && _modalFaseWoord()!==faseWoord(faseIndex(r.subsidieFase||''))){
    uit.push(labels.subsidieFase||'Fase');
  }
  return uit;
}

function fillModalFields(sec,r){
  const tog=(id,on)=>{const e=document.getElementById(id);if(e){e.classList.toggle('on',!!on);e.setAttribute('aria-checked',!!on);}};
  switch(sec){
    case'OPPAKKEN':
      setv('m-actie',r.actiepunt);zetDatumVeld('m-dl',r.deadline);setv('m-beh',r.behandelaar);
      setv('m-opm',r.opmerkingen);setv('m-sub-opp',r.subcategorie);
      tog('tog-ib',r.inBehandeling==='TRUE');break;
    case'VERGADERVERZOEKEN':
      setv('m-per',r.periode);zetWeekKiezer();setv('m-beh-v',r.behandelaar);setv('m-agenda',r.agendapunten||r.actiepunt);
      zetDatumVeld('m-dl-v',r.deadline);setv('m-opm-v',r.opmerkingen);setv('m-sub-verg',r.subcategorie);
      tog('tog-ib-v',r.inBehandeling==='TRUE');break;
    case'OFFERTE-TRAJECTEN':
      zetDatumVeld('m-daang',r.datumAangevraagd);setv('m-beh-o',r.behandelaar);
      // De aannemerslijst (kolom P) ís sinds v12.5 de teller. Het scherm werkt op een
      // werkkopie; submitTask schrijft hem bij Opslaan weg (zie modal-aannemers.js).
      zetModalAannemers(r.aannemers||'');
      // Kolom D (de oude X/N-teller) heeft geen invoerveld meer. Alles wat erin staat is dus
      // per definitie 'niet te tonen' en gaat via het onvertaalbaar-mechanisme ONGEWIJZIGD
      // terug de Sheet in — rijen van vóór de aannemerslijst houden zo hun oude getal.
      // `_offertesManual` vóór `offertes`: dat eerste IS kolom D (zie _verrijkOfferteRij).
      onthoudOnvertaalbaar('m-off', ((r._offertesManual!==undefined?r._offertesManual:r.offertes)||''), '');
      zetDatumVeld('m-dl-o',r.deadline);setv('m-opm-o',r.opmerkingen);setv('m-sub-off',r.subcategorie);
      // De stand bij het OPENEN bepaalt of 'Datum aangevraagd' invullen nog een opvolgdatum-
      // voorstel mag doen (zie offerteAanvraagGewijzigd); het label toont meteen de juiste naam.
      // De voorstel-rem hoort bij het scherm, dus een vers bewerkscherm begint met een verse rem.
      state._offAangevraagdBijOpen = offerteAangevraagd(r);
      zetOffLabel(state._offAangevraagdBijOpen);
      _offVoorstel=null; _offVorigeF=null;
      break;
    case'LOD':
      setv('m-actie-l',r.actiepunt);setv('m-stat-l',r.status);setv('m-beh-l',r.behandelaar);
      zetDatumVeld('m-dl-l',r.deadline);setv('m-opm-l',r.opmerkingen);setv('m-sub-lod',r.subcategorie);
      tog('tog-ib-l',r.inBehandeling==='TRUE');break;
    case'SUBSIDIE-TRAJECTEN':
      setv('m-subsidie',r.subsidie);setv('m-beh-s',r.behandelaar);
      zetDatumVeld('m-dl-s',r.deadline);setv('m-opm-s',r.opmerkingen);setv('m-sub-sub',r.subcategorie);
      tog('tog-ib-s',r.inBehandeling==='TRUE');
      zetModalFase(r.subsidieFase);
      // De ladder kent vijf woorden; alles daarbuiten toonde 'Voorbereiden' en werd zo ook
      // weggeschreven. `faseIndex` geeft voor élke onbekende waarde 1, dus 'herkend' betekent:
      // het is leeg, óf het is letterlijk een van de vijf.
      onthoudOnvertaalbaar('m-fase', r.subsidieFase,
        SUBSIDIE_FASES.some(f=>f.toLowerCase()===String(r.subsidieFase||'').trim().toLowerCase()) ? r.subsidieFase : '');
      break;
  }
}
// Zet een waarde in een veld. Bij een <select> geldt een extra regel: staat de opgeslagen waarde
// niet in de keuzelijst, dan zet de browser de select stilletjes op '' — en schrijft submitTask die
// leegte even stilletjes terug naar de Sheet. Zo verdween de behandelaar van élke taak van Cihan
// (die stond niet in de lijst, wél in het bulk-menu) en van elke combinatie in de 'verkeerde'
// volgorde: 'Cihad, Jer' stond er wel, 'Jer, Cihad' niet. Eén keer openen en opslaan om alleen de
// deadline te wijzigen was genoeg. Een waarde die er al is mag nooit verdampen omdat een lijstje
// hem niet kent; we voegen hem dan toe.
function setv(id,v){
  const el=document.getElementById(id);
  if(!el) return;
  const w=(v===undefined||v===null)?'':v;   // 0 blijft '0' (geen falsy-coercie)
  if(el.tagName==='SELECT' && w!=='' && ![...el.options].some(o=>o.value===String(w))){
    const opt=document.createElement('option');
    opt.value=String(w); opt.textContent=String(w);
    el.appendChild(opt);
  }
  el.value=w;
}

// ══════════════════════════════════════════════════════════════════════════════
//  WAARDEN DIE HET SCHERM NIET KAN TONEN
// ══════════════════════════════════════════════════════════════════════════════
// Dit is dezelfde regel als hierboven bij `setv`, doorgetrokken naar de velden waar hij niet met
// een extra <option> op te lossen is:
//
//     een waarde die er al is mag nooit verdampen omdat het scherm hem niet kan tonen.
//
// Een `<input type=date>` kent alleen echte datums, de fase-ladder kent vijf woorden en de
// offerte-teller kent 'n/m'. Staat er in de Sheet iets anders — en dat gebeurt, dit team typte
// 'eind juli' in een periodeveld en 'eind juni' komt net zo goed in een deadline — dan toont het
// scherm leeg, of de eerste fase, of 0/0. Tot v12.1 schreef Opslaan die leegte vervolgens terug:
// één keer een taak openen om de behandelaar te wijzigen was genoeg om 'eind juni' te wissen,
// zonder dat het in de wijzigingssamenvatting stond.
//
// Wat hier onthouden wordt, wordt bij Opslaan ONGEWIJZIGD teruggeschreven — tenzij de gebruiker
// het veld zelf invult. Dat laatste is aan de vorm te zien en hoeft niet apart bijgehouden te
// worden: er wordt alléén onthouden als het veld leeg bleef, dus staat er iets, dan is dat van de
// gebruiker. De fase is de uitzondering (die is nooit leeg) en heeft daarom een eigen vlag.
let _onvertaalbaar = {};
let _faseGekozen = false;

// `getoond` = wat het veld ervan wist te maken. Leeg terwijl er wél iets stond = niet te tonen.
function onthoudOnvertaalbaar(id, ruw, getoond){
  const r = (ruw == null ? '' : String(ruw)).trim();
  if (r && !getoond) _onvertaalbaar[id] = r; else delete _onvertaalbaar[id];
}
// Wat er weggeschreven moet worden. Heeft de gebruiker het veld gevuld, dan wint dat.
function uitVeld(id, omgezet){
  return omgezet ? omgezet : (_onvertaalbaar[id] || '');
}
// Zet een datumveld én onthoud de oorspronkelijke tekst als het geen datum bleek.
function zetDatumVeld(id, ruw){
  const iso = toISODate(ruw);
  setv(id, iso);
  onthoudOnvertaalbaar(id, ruw, iso);
}
// Eén regel onder het datumveld, zodat de gebruiker het ook ZIET. Het hint-element is in de
// bewerkstand altijd leeg (zetDeadlineVoorstel maakt hem leeg en vult hem alleen bij een nieuwe
// taak), dus we lenen hem hier. Moet ná zetDeadlineVoorstel draaien — zie openModal.
function toonOnvertaalbaar(sec){
  const hintEl = document.getElementById(DEADLINE_HINT_VELD[sec]);
  const dlId = DEADLINE_VELD[sec];
  if(!hintEl || !dlId) return;
  const ruw = _onvertaalbaar[dlId];
  if(ruw) hintEl.textContent = `In de Sheet staat "${ruw}" — dat is geen datum. Dat blijft zo staan; kies een datum om het te vervangen.`;
}

// Waar de OMSCHRIJVING van een taak thuishoort, per sectie. Eén bron, want deze koppeling stond op
// twee plekken en maar één ervan klopte: de AI-hulp vulde het juiste veld, het commandopalet
// schreef altijd naar 'm-actie' — het veld van Oppakken. Stond je op een ander tabblad, dan
// belandde de tekst die je net in Ctrl+K typte in een VERBORGEN veld en gooide submitTask hem weg
// (die leest uitsluitend de velden van state.editSec). Welk veld de omschrijving draagt volgt
// dezelfde volgorde als taakTitel() in util.js.
const OMSCHRIJVING_VELD = {
  'OPPAKKEN':           'm-actie',
  'VERGADERVERZOEKEN':  'm-agenda',
  'OFFERTE-TRAJECTEN':  'm-opm-o',
  'LOD':                'm-actie-l',
  'SUBSIDIE-TRAJECTEN': 'm-subsidie',
};
function zetOmschrijving(sec, tekst){
  const el = document.getElementById(OMSCHRIJVING_VELD[sec] || '');
  if(el && tekst) el.value = tekst;
  return !!el;
}

// De naam ÉN de code waarvoor hij geldt. Het naamveld is readonly en wordt alleen gevuld door de
// suggestielijst; de code ernaast is vrij te typen. Zonder deze koppeling kon er een naam in de
// Sheet belanden die bij een héél andere VvE hoort — zie de toelichting bij `clearModal` en de
// controle in `submitTask`.
function _zetNaamVeld(code, naam){
  const el=document.getElementById('m-naam'); if(!el) return;
  el.value=naam||'';
  if(code) el.dataset.code=code; else delete el.dataset.code;
}

// De naam die bij deze VvE-code hoort, gezocht in de gegevens die we al hebben. `D.alvo` is de
// bron van de VvE-kiezer zelf; de takenlijsten zijn de terugval voor een VvE die (nog) niet in het
// ALV-overzicht staat. Levert '' op als de code nergens voorkomt — dan is een lege naam eerlijker
// dan de naam van de vorige VvE.
function _naamBijCode(code){
  const c=String(code||'').trim().toLowerCase();
  if(!c) return '';
  const uitAlvo=(D.alvo||[]).find(r=>String(r.code||'').trim().toLowerCase()===c);
  if(uitAlvo&&uitAlvo.naam) return uitAlvo.naam;
  for(const bron of [D.ntd, D.af]){
    for(const sec of SKEYS){
      const r=((bron&&bron[sec])||[]).find(x=>String(x.code||'').trim().toLowerCase()===c && x.naam);
      if(r) return r.naam;
    }
  }
  return '';
}

function clearModal(){
  document.querySelectorAll('.modal-body input,.modal-body select,.modal-body textarea').forEach(el=>{if(!el.readOnly)el.value=''});
  // 'm-naam' is het enige readonly veld in het venster en viel daardoor buiten de regel hierboven:
  // een toevoegscherm opende met de VvE-naam van de taak die je daarvóór bekeek, terwijl 'm-code'
  // er wél leeg naast stond. Kies je de nieuwe VvE uit de suggestielijst, dan overschrijft die
  // beide velden en merk je er niets van — maar tik of plak je de code met de hand (een VvE die
  // nog niet in de lijst staat), dan leest submitTask hier de náám van de vorige VvE en belandt
  // die in de Sheet.
  ['m-naam'].forEach(id=>{const el=document.getElementById(id);if(el){el.value='';delete el.dataset.code;}});
  zetModalAannemers('');
  ['tog-ib','tog-ib-v','tog-ib-l','tog-ib-s'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on')});
  zetModalFase('');   // terug naar Voorbereiden, anders erft een nieuwe taak de vorige fase
  // Hetzelfde voor de bundel: een leeg formulier hoort bij géén bundel. openModal roept clearModal
  // aan vóór het tonen van een NIEUWE taak, dus dit is de garantie dat een gewoon toevoegscherm
  // schoon begint. Die volgorde is dwingend voor de actie 'bundel-nieuw' (actions.js): die zet zijn
  // vlag daarom pas ná het openen van het scherm.
  state._nieuwBundel=null;
  // En de andere kant van dezelfde belofte: een in 'Hoort bij' aangewezen doeltaak hoort bij het
  // scherm waarin hij is aangewezen. submitTask leest hem daarom vóór het sluiten uit (zie daar).
  state._hbDoel=null;
  // Een leeg scherm is nog niet aangevraagd: het F-veld heet weer 'Deadline' en het volgende
  // offerte-scherm mag weer een opvolgdatum-voorstel doen (zie offerteAanvraagGewijzigd) —
  // dus ook de voorstel-rem en de onthouden oude veldwaarde gaan mee schoon.
  state._offAangevraagdBijOpen=false;
  zetOffLabel(false);
  _offVoorstel=null; _offVorigeF=null;
  // Om precies dezelfde reden de extra VvE's: een leeg formulier hoort bij één VvE. Zonder deze
  // regel zou het volgende toevoegscherm de twaalf VvE's van de vorige ronde meedragen en er bij
  // één klik op Toevoegen twaalf taken bij maken.
  wisExtraVves();
  // En de 'al voorgesteld'-stempels: een NIEUW scherm mag weer een deadline voorstellen, maar
  // binnen hetzelfde scherm nooit twee keer (zie zetDeadlineVoorstel).
  state._dlVoorgesteld = new Set();
  const chips=document.getElementById('m-extra-chips'); if(chips) chips.innerHTML='';
  const uitleg=document.getElementById('m-extra-uitleg'); if(uitleg) uitleg.textContent='';
  // Een leeg scherm draagt geen onvertaalbare waarden van de vorige taak mee.
  _onvertaalbaar = {}; _faseGekozen = false;
  // De regel bovenaan leegt óók het verborgen `m-per`; alleen de knop ernaast weet dat niet.
  // Zonder deze regel opende een nieuw scherm met de week van de taak die je daarvóór bekeek.
  zetWeekKiezer();
}

// ── Fase-kiezer in het bewerkscherm ──
// De stand staat in een module-variabele en niet in de DOM: submitTask heeft het
// wóórd nodig, niet de knoppen, en zo blijft de kiezer werken als de modal
// tussendoor opnieuw wordt getekend.
let _modalFase = 1;
function zetModalFase(woord){
  _modalFase = faseIndex(woord);
  _faseGekozen = false;   // dit is de stand ZOALS OPGESLAGEN, niet een keuze van de gebruiker
  const host = document.getElementById('m-fase');
  if(!host) return;
  host.innerHTML = faseRijHtml(faseWoord(_modalFase), -1, 'fase-rij-modal');
  // In de modal mag een klik niet meteen naar de Sheet schrijven — pas bij Opslaan.
  host.querySelectorAll('.fase-bol').forEach(b=>{ b.dataset.action='subsidie-fase-modal'; });
}
// Ná zetModalFase, want die zet de vlag juist terug: dít is wél een keuze van de gebruiker,
// en vanaf nu mag een onbekende opgeslagen waarde overschreven worden.
function kiesModalFase(n){ zetModalFase(faseWoord(n)); _faseGekozen = true; delete _onvertaalbaar['m-fase']; }
function _modalFaseWoord(){ return faseWoord(_modalFase); }

// ══════════════════════════════════════
//  SHEET HELPERS (insert / delete rows)
// ══════════════════════════════════════
// De breedte van elk tabblad zit al in het antwoord van spreadsheets.get, naast de sheetId.
// Apart en puur, zodat de vorm van dat antwoord te testen is zonder netwerk — en zodat een blad
// zónder gridProperties niet als breedte `undefined` de structuurcheck in glipt: die zou dan
// melden dat het blad te smal is terwijl er niets gemeten is.
function _sheetBreedtes(d){
  const uit={};
  ((d&&d.sheets)||[]).forEach(s=>{
    const n=s?.properties?.gridProperties?.columnCount;
    if(typeof n==='number') uit[s.properties.title]=n;
  });
  return uit;
}

async function getSheetIds(){
  if(state._sheetIds) return state._sheetIds;
  const r=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}`,{headers:{Authorization:`Bearer ${state.oauthToken}`}});
  // `err.status` erbij, net als elke andere schrijfweg in dit bestand. Zonder die eigenschap ziet
  // `_isTransient` een 429 of 5xx hier niet (die toetst op e.status of op een tekstpatroon dat
  // 'getSheetIds 429' niet matcht) en doet `_withRetry` geen herkansing — terwijl dezelfde 429 op
  // de batchUpdate erna wél netjes opnieuw geprobeerd wordt. Dit is de EERSTE aanroep van elke
  // schrijfweg, dus juist bij een vol leesquotum sneuvelde de hele actie zonder tweede poging.
  if(!r.ok){ if(r.status===401){state.oauthToken=null;state.oauthExpiry=0}
             const err=new Error('getSheetIds '+r.status); err.status=r.status; throw err; }
  const d=await r.json();
  state._sheetIds={};
  (d.sheets||[]).forEach(s=>{state._sheetIds[s.properties.title]=s.properties.sheetId});
  // Meeliften op deze ene lezing: de structuurcheck heeft de rasterbreedte nodig en de langste
  // rij uit fetchSheets is daar géén maat voor (lege staartcellen komen niet mee). Een eigen
  // verzoek zou de leeslast weer opdrijven die net met 64% is teruggebracht.
  state._sheetKolommen=_sheetBreedtes(d);
  return state._sheetIds;
}


function getInsertRow(sec){
  const entries=D.ntd[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.ntdSecInfo[sec];
  if(!info?.colHeaderRow){
    // Bewust een harde fout en geen stille terugval: een taak die ongemerkt in een
    // ándere sectie belandt is veel duurder dan een mislukte toevoeging.
    throw new Error(`De sectie ${SECS[sec]?.label||sec} bestaat nog niet in het tabblad 'Nog Te Doen'. Voeg daar eerst het blok toe (een regel met ${sec} in kolom A, met daaronder een kolomkoprij).`);
  }
  return info.colHeaderRow;
}

// ── Klopt de invoegplek NOG? ────────────────────────────────────────────────────────────────
// `getInsertRow` rekent puur uit het GEHEUGEN: het rijnummer van de laatste taak in het blok, of
// de kolomkoprij bij een leeg blok. Dat geheugen staat stil zolang er een venster openstaat (de
// 8s-ronde slaat over, main.js), en intussen kan een collega een taak afronden — dan schuift alles
// eronder één omhoog en wijst het onthouden rijnummer naar iets anders.
//
// De bestaande rij-guard (`assertRowsMatch`) bewaakt alléén het OVERSCHRIJVEN van een bestaande
// rij, niet de KEUZE van de invoegplek. Zonder deze controle kon een nieuwe taak precies op de
// plek van de kolomkoppen van de vólgende sectie belanden. `parseSections` gooit de eerste regel
// ná een sectiekop altijd weg als kolomkoprij — wát er ook in staat — dus die taak is daarna
// nergens meer te zien: niet in de lijst, niet in het dossier. Opslaan lijkt gewoon gelukt.
//
// Eén extra leesverzoek per toevoeging (naast ~7,5 per minuut: verwaarloosbaar).
async function bevestigInvoegPlek(sec, afterRow, tabblad){
  tabblad = tabblad || 'Nog Te Doen';
  const bron = (tabblad==='Afgerond') ? D.af : D.ntd;
  const info = (tabblad==='Afgerond') ? D.afSecInfo : D.ntdSecInfo;
  const entries = bron[sec] || [];
  const laatste = entries.length ? entries[entries.length-1] : null;
  // Rekende de aanroeper zelf een offset op het anker (de bulk-undo doet dat per sectie), dan valt
  // over die rij niets te beweren en zwijgen we liever dan vals alarm te slaan.
  if(laatste && laatste._row !== afterRow) return;
  if(!laatste && info?.[sec]?.colHeaderRow !== afterRow) return;

  // Zolang onze EIGEN schrijfacties nog in de wachtrij staan bewijst een lezing niets: het
  // geheugen loopt dan bewust vóór op de Sheet (`submitTask` en `verplaatsTaak` muteren
  // optimistisch, de echte invoeging gaat serieel via `state._writeChain`). De ankerrij draagt dan
  // nog de vórige taak en de guard zou zijn eigen werk als 'de lijst is verschoven' lezen — met een
  // melding die bovendien liegt, want `loadAll` keert bij pendingWrites>0 óók meteen terug zonder
  // iets te laden. Dezelfde regel die loadAll zelf hanteert.
  if(state.pendingWrites>0) return;

  // De lezing MAG mislukken zonder dat het aanmaken stukloopt. Een herkansing bij 429/5xx eerst
  // (lezen is idempotent), maar komt er daarna nog niets, dan gaan we gewoon door: dan is de stand
  // precies zoals hij vóór deze controle altijd al was, en een nieuwe taak die weigert met 'de
  // lijst was net gewijzigd' terwijl er in werkelijkheid een netwerkprobleem is, is een slechtere
  // ruil. Deze controle is een EXTRA slot, geen nieuwe voorwaarde.
  let rij;
  try { rij = (await _withRetry(()=>fetchSheet(_a1Bereik(tabblad, afterRow, afterRow))))[0] || []; }
  catch(e){ console.warn('[invoegplek] anker niet te lezen, toevoegen gaat door:', e && e.message); return; }

  const mismatch = () => {
    const err = new Error('De lijst was net gewijzigd — opnieuw geladen, probeer nog eens.');
    err.rowMismatch = true;
    err.melding = 'De lijst was net gewijzigd — opnieuw geladen, probeer nog eens.';
    return err;
  };

  if(laatste){
    // IDENTITEIT, niet inhoud. Het vaste taaknummer in kolom Q beantwoordt precies de vraag die
    // hier telt: 'is rij N nog dezelfde taak?'. De volle vingerafdruk zou óók aanslaan als een
    // collega de tekst van díe laatste taak heeft bijgewerkt — en dan is de invoegplek nog gewoon
    // goed. Het aanmaken van een ongerelateerde taak weigeren om een bewerking elders is vals alarm.
    const nr = ((rij[16] ?? '')+'').trim();
    if(laatste.taakId){
      if(nr !== String(laatste.taakId).trim()) throw mismatch();
      return;
    }
    // Geen taaknummer (een rij van vóór fase 4). Dan is het beste bewijs dat we niet op een
    // structuurrij staan en dat kolom A nog dezelfde VvE-code draagt.
    if(isSectieKop(rij) || isKolomKop(rij)) throw mismatch();
    if(((rij[0] ?? '')+'').trim() !== ((laatste.code ?? '')+'').trim()) throw mismatch();
    return;
  }

  // Leeg blok → het anker is de kolomkoprij. Toetsen met dezelfde SOEPELE herkenning als de
  // structuurcheck: op PROD staat boven OPPAKKEN 'VvE-Code' mét streepje en boven de andere
  // secties 'VvE Code' met spatie. Een exacte vergelijking zou daar vals alarm geven.
  if(!isKolomKop(rij)) throw mismatch();
}

// Celwaarde voor een veld waar het GETAL 0 een echte waarde is. `x||''` maakt van 0 een lege
// cel, en de hoofdtaak van een verse bundel draagt volgnummer 0. Vandaag levert parseSections
// altijd strings ('0' is truthy), maar het herordenen zet bundelVolg optimistisch op het
// rij-object; zet dat ooit een getal neer, dan zou die taak bij afronden of undo stil zijn
// plek in de bundel verliezen — precies de soort schade die dit traject wil voorkomen.
const nulVeilig = v => (v === 0 || v) ? String(v) : '';

// De RAUWE celwaarde van een veld — dus wat er in de Sheet hoort te staan, niet wat het scherm
// toont. Er is precies één veld waar die twee verschillen: `offertes` (kolom D). Bij elke render
// vervangt `_verrijkOfferteRij` (render-offerte.js) dat veld door de gereconcilieerde teller
// (lijst in kolom P aanwezig → de lijst wint; zonder lijst blijft kolom D) en bewaart de echte
// D-waarde in `_offertesManual`. Schrijf je die afgeleide waarde terug, dan belandt er een
// teller in kolom D die daar nooit is ingevuld — en rijen van vóór de aannemerslijst horen hun
// oude getal juist ongemoeid te houden.
// `fillModalFields` deed dit al goed; de undo-serialisatie en de archiefrij niet. Eén helper,
// zodat een vierde plek er niet opnieuw langs kan lopen.
export const celWaarde = (r, k) =>
  (k === 'offertes' && r._offertesManual !== undefined) ? (r._offertesManual || '') : (r[k] || '');

// Gedeelde undo-serialisatie van een NTD-taakrij → kolomwaarden A..S.
// N (placeholder), O (offerte-fase) en P (aannemerslijst) horen erbij: zo verliest een
// undo van een afgerond/verwijderd OFFERTE-traject niet stil de opgebouwde aannemerslijst
// + de expliciete fase. Voor niet-offerte secties zijn r.fase/r.aannemers leeg (harmloos).
// Eén bron voor de drie callsites (deleteTaskRow, doCompleteTask, bulk-afronden/-verwijderen),
// zodat de kolombreedte nooit meer per plek uit elkaar loopt.
export function serializeNtdUndo(r){
  const v=SECS[r._sec].keys.map(k=>celWaarde(r,k));
  while(v.length<8) v.push('');                  // OFFERTE heeft 7 velden → vul tot H
  v.push('', '', r.subcategorie||'', r.opvolgdatum||'', r.herhaalId||'', '', r.fase||'', r.aannemers||''); // I, J, K=sub, L, M, N, O=fase, P=aannemers
  v.push(r.taakId||'');   // Q — het vaste taaknummer moet de undo overleven, anders krijgt de
                          // teruggezette taak een nieuwe identiteit en is de oude een wees.
  v.push(r.bundelId||''); // R — om dezelfde reden: zonder dit valt de taak na een undo uit zijn bundel.
  v.push(nulVeilig(r.bundelVolg)); // S — via nulVeilig, want 0 is een echt volgnummer (zo begint
                                   // een verse bundel), geen lege cel
  return v;
}

// Kolommen L..S achter de sectievelden van een NIEUWE taakrij. `values` loopt tot en met K,
// L..O blijven leeg, P = aannemerslijst, en Q/R/S krijgen taaknummer, bundelnummer en volgnummer
// — dezelfde vaste posities als serializeNtdUndo en afrondWaarden hierboven.
// Apart en puur om dezelfde reden als die twee: zo is te toetsen dat de bundel op R en S landt
// zonder in te loggen. Eén lege string te weinig schuift het bundelnummer een kolom op en de rij
// wordt gewoon geschreven — geen fout, alleen een taak die stil uit zijn bundel valt.
// Het rij-object en niet drie losse strings, want `bundelId` en `bundelVolg` zijn allebei korte
// tekst: verwisseld zou geen enkele toets erop aanslaan.
export function toevoegWaarden(values, r){
  return values.concat([
    '', '', '', '', r.aannemers||'',                         // L..O leeg, P = aannemerslijst
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),   // Q, R, S
  ]);
}

// De laatste kolomletter van het bereik dat `insertAndWriteRow` beschrijft. Puur en geëxporteerd,
// zodat RASTER_MIN (structuurcheck.js) hier écht aan vast te pinnen is in plaats van op papier:
// die tabel belooft de BREEDSTE SCHRIJFACTIE per tabblad te volgen, en voor 'Logboek' is dat niet
// het aantal waarden (acht) maar deze ONDERGRENS van negen. Zonder die koppeling zei de
// structuurcheck 'in orde' op een acht kolommen breed Logboek, terwijl juist daar het ongedaan
// maken van een verwijderde logregel stil zou mislukken — het scenario waarvoor die bewaking
// bestaat. De ondergrens zelf blijft staan: hem weghalen is een gedragswijziging aan een levende
// schrijfweg, en de bewaking gelijktrekken kost niets.
export function _eindKolom(values){ return String.fromCharCode(64+Math.max((values||[]).length,9)); }

// N rijen ineens invoegen en vullen. Eén `insertDimension` voor het hele blok en één PUT voor alle
// rijen samen — dus twee verzoeken, ongeacht of het er één is of twaalf.
//
// WAAROM ALS BLOK EN NIET N KEER ACHTER ELKAAR. Bij twaalf losse invoegingen zijn er twaalf
// momenten waarop het halverwege kan stukgaan, en erger: elke volgende invoeging rekent op de
// rijnummers die de vórige heeft opgeschoven. Mislukt nummer drie en wordt die teruggedraaid, dan
// wijzen de ankers van vier tot en met twaalf één rij te laag — en dan belandt een taak in het
// verkeerde sectieblok. Als blok kan dat niet: het lukt voor alle rijen of voor geen enkele.
async function insertAndWriteRows(sheetName,afterRow,rijen){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const lijst=(rijen||[]).filter(Boolean);
  if(!lijst.length) return;
  const ids=await getSheetIds();
  const sheetId=ids[sheetName];
  if(sheetId==null) throw new Error('Sheet niet gevonden: '+sheetName);
  const n=lijst.length;
  const insResp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
    method:'POST',
    headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({requests:[{insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+n},inheritFromBefore:true}}]})
  });
  if(!insResp.ok){const e=await insResp.json();if(insResp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Invoegfout');err.status=insResp.status;throw err}
  // De breedste rij bepaalt het bereik: alle rijen komen uit dezelfde `toevoegWaarden` en zijn dus
  // even breed, maar één bron voor de eindkolom voorkomt dat een smallere rij het bereik verkleint.
  const endCol=_eindKolom(lijst.reduce((a,b)=>b.length>a.length?b:a, lijst[0]));
  try{
    await writeRows(`'${sheetName}'!A${afterRow+1}:${endCol}${afterRow+n}`,lijst);
  }catch(e){
    // De rijen zijn wél ingevoegd maar niet gevuld → ruim ze weer op zodat de Sheet niet vervuilt
    // met ghost-rijen. Schrijfacties zijn geserialiseerd, dus deze delete is veilig.
    try{
      await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:afterRow,endIndex:afterRow+n}}}]})
      });
    }catch(_){ /* opruimen mislukte; de stille resync (loadAll) negeert de lege rijen toch */ }
    throw e;
  }
}

// De bestaande één-rij-weg, ongewijzigd van buiten gezien: hij loopt nu door dezelfde poort, zodat
// er niet twee invoegwegen naast elkaar staan die uit de pas kunnen lopen.
async function insertAndWriteRow(sheetName,afterRow,values){
  return insertAndWriteRows(sheetName,afterRow,[values]);
}

async function deleteCurrentEditTask(){
  const r=_bewerkRijVers();
  if(!r) return;
  // Het scherm sluit pas als de verwijdering écht doorgaat. Zie `bijDoorgaan` in deleteTaskRow.
  await deleteTaskRow(r, closeModal);
}

// `bijDoorgaan` (optioneel) draait zodra vaststaat dát er verwijderd wordt — dus ná de vraag over
// openstaande subtaken. Het bewerkscherm hangt daaraan: dat sloot vóór deze fase onvoorwaardelijk
// vóór de aanroep, en met een afbreekbare vraag erbij betekende dat een 'nee' op een al gesloten
// scherm — inclusief de getypte wijzigingen die de gebruiker nog niet had opgeslagen.
// Bewust niet ná `blokkeerOffline`/`ensureToken`: die twee konden het scherm ook vóór dit traject
// al onder de gebruiker vandaan sluiten (de aanroeper deed dat toen zélf, nog vóór deze functie
// begon), dus dáár verandert dit traject niets aan. De vraag is de enige nieuwe afbreekweg.
async function deleteTaskRow(r, bijDoorgaan){
  // Her-ankeren als VANGNET. Vandaag komt hier maar één ingang binnen — `deleteCurrentEditTask`,
  // en die heeft zijn rij al door `_bewerkRijVers` gehaald — dus in de praktijk slaat dit blok
  // nooit aan. Het staat er voor de tweede ingang: tot v8.9 zat er een verwijderknop in de rij
  // zelf (zie de toelichting bij `taakUitCache`), en zo'n knop levert een object uit
  // `state._rowCache`. Die cache loopt uit de pas met D — `loadAll` zet élke ronde verse
  // rij-objecten in D, terwijl `renderAll` (en dus de cache) alleen draait bij een gewijzigde
  // datahash. Wijst het object nergens meer naar in D.ntd, dan geeft `arr.indexOf(r)` -1: de rij
  // blijft ná het verwijderen in de lijst staan en de rollback zet hem er bij een fout als TWEEDE
  // exemplaar bij. Dat is te duur om aan de aanroeper over te laten.
  if(r && SECS[r._sec] && _verseRijIdx(r, D.ntd[r._sec])<0){
    const vers=_herankerRij(r, D.ntd);
    if(!vers){
      showToast('Taak niet gevonden','De lijst is intussen ververst. Probeer het opnieuw.',
                'var(--rd)','waarschuwing',{geenDedup:true, geenSysteemmelding:true});
      return;
    }
    r=vers;
  }
  // Via de centrale `taakTitel` en niet via een eigen terugvalketen: die keten kende
  // `opmerkingen` (Offerte-trajecten) en `agendapunten` (Vergaderverzoeken) niet en viel daar
  // terug op de VvE-code. Twee offerte-trajecten van dezelfde VvE gaven dan letterlijk dezelfde
  // melding — '311212 — 311212' — en met dezelfde ontdubbelsleutel erbovenop verdween de tweede
  // undo-knop volledig. `taakTitel` volgt OMSCHRIJVING_SLEUTEL en loopt dus niet opnieuw uit de pas.
  const omschrijving=taakTitel(r, r._sec)||r.code||'deze taak';
  // Er is bewust GEEN cascade: verwijderen raakt nooit meer dan één taak (§6.6). De subtaken blijven
  // dus staan, en dat is precies wat je hier moet weten — je verwijdert de taak waar ze onder
  // hangen. Bewust niet 'de bundel blijft bestaan': houdt er één subtaak over, dan is het na afloop
  // géén bundel meer (`isBundel` vraagt om twee leden) en zou die belofte niet uitkomen.
  // De vraag staat vóór `blokkeerOffline`: een 'nee' kost dan niets, en andersom zou je eerst een
  // vraag over subtaken beantwoorden om dán pas te horen dat er geen verbinding is. Zelfde volgorde
  // als bij het wegleggen: `snoozeOpslaan` vraagt, en pas `schrijfOpvolgdatum` remt op offline.
  // De staart van de vraag ('Toch verwijderen?') zit in het knoplabel en niet in de tekst: het
  // venster stelt zijn vraag mét knoppen, en dan zou hij er twee keer staan.
  const nSub=openSubtaken(bouwBundelIndex(D.ntd, D.af), r);
  if(nSub && !await vraagBevestiging({
      titel:'Taak verwijderen?',
      tekst:`Deze taak heeft nog ${nSub} ${nSub===1?'subtaak':'subtaken'}. `+
            `${nSub===1?'Die wordt':'Die worden'} niet mee verwijderd.`,
      bevestigTekst:'Toch verwijderen', gevaarlijk:true })) return;
  if(bijDoorgaan) bijDoorgaan();
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const sec=r._sec;
  // undo-data vastleggen vóór de mutatie (zelfde serialisatie als afronden)
  const ntdValues=serializeNtdUndo(r);
  // `gelukt` blijft false tot de schrijfactie écht geland is. Zonder deze haak voegde de
  // undo-knop de rij onvoorwaardelijk opnieuw in — óók als er niets verwijderd wás (rij-guard,
  // 401, 5xx). Dat leverde een TWEEDE rij op met hetzelfde vaste taaknummer in kolom Q: precies
  // de dubbele identiteit waar het hele taaknummer-mechanisme op stukgaat. Zelfde idioom als
  // `deleteLogboek` in render-overig.js, die de undo al een kijkgaatje op zijn vlag meegeeft.
  const undoData={sec,code:r.code,ntdValues,gelukt:false};
  const oudeRow=r._row;
  // Dezelfde manier van zoeken als bij afronden: eerst de rij in de takentabel op de ZICHTBARE
  // pagina, anders de taakregel op de dossierpagina. Zonder die tweede helft vond dit niets als je
  // vanuit het dossier verwijderde: de rode puls speelde onzichtbaar in een verborgen tabel en de
  // rij bleef daar ruim een seconde staan alsof er niets gebeurde.
  const _rid=state._rowCache.indexOf(r);   // vorm-ok: zoekt een RID voor de puls-animatie, muteert niets
  const tr=document.querySelector(`.page.active #ntd-tbody tr[data-row="${oudeRow}"]`)
        || (_rid>=0 ? document.querySelector(`.page.active .tk[data-rid="${_rid}"]`) : null);
  // optimistisch: meteen lokaal weg + indexen meeschuiven
  const arr=D.ntd[sec]||[];
  const pos=rijIndex(arr, r);   // identiteit, niet object — zie src/rij.js
  if(pos>-1) arr.splice(pos,1);
  _shiftNtdRows(oudeRow,-1);
  // Ontdubbelen op het vaste TAAKNUMMER en niet op de tekst. Twee offerte-trajecten van dezelfde
  // VvE leveren letterlijk dezelfde titel+tekst op (`omschrijving` valt daar terug op de code), en
  // dan slikte de ontdubbeling de tweede undo-toast volledig in — terwijl die knop de enige
  // beveiliging is bij een handeling die bewust geen bevestigingsvraag heeft.
  showUndoToast('Taak verwijderd',`${r.code} — ${omschrijving}`,()=>undoDelete(undoData),'prullenbak',
                // Bij een rij ZONDER vast taaknummer (van vóór de backfill) niet op het kale rijnummer:
                // dat schuift op bij elke insert/delete en wordt binnen dezelfde 30 seconden opnieuw
                // uitgedeeld. Dan zou de undo-toast van een ándere taak ingeslikt worden. Code en
                // omschrijving erbij maken de sleutel weer onderscheidend.
                {sleutel:`verwijder|${r.taakId||`${r._row}|${r.code}|${omschrijving}`}`});
  // Idempotentie-vlag: een deleteDimension is positie-gebaseerd en NIET idempotent. Zonder
  // deze vlag zou een _withRetry-herkansing (na een transient 429/5xx) de rij eronder — die
  // door de eerste delete naar boven schoof — kunnen verwijderen. (patroon: offerte-aannemers.js)
  let verwijderd=false;
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Nog Te Doen'];
      if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
      if(!verwijderd){
        await assertRowMatch(oudeRow, r); // bescherming: rij nog dezelfde TAAK vóór verwijderen
        const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',
          headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
        });
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
        verwijderd=true;
        undoData.gelukt=true;      // pas nu mag de undo-knop iets terugzetten
      }
      // Voor de LOGREGEL de rauwe omschrijving, niet `taakTitel`: die snijdt op de eerste regel en
      // kapt op 90 tekens af — prima voor een melding op het scherm, maar het logboek is het enige
      // spoor dat na het verwijderen overblijft. Wel via OMSCHRIJVING_SLEUTEL, want dáár ging de
      // oude vaste veldketen de mist in (bij offerte en vergaderverzoek stond er iets anders).
      await logEvent(r.code, sec, 'Verwijderd', '', r[OMSCHRIJVING_SLEUTEL[sec]]||taakTitel(r,sec)||'', '');
    },
    // De lijst hier OPNIEUW uit D lezen en niet de `arr`-verwijzing van hierboven gebruiken.
    // `loadAll` zet `D.ntd=p.data` — een compleet nieuw object met nieuwe arrays — en een
    // geslaagde schrijfactie start die verversing zonder erop te wachten. Deze rollback draait
    // seconden later; `arr` kan dan een array zijn waar niemand meer naar kijkt. Het terugzetten
    // gebeurde dan onzichtbaar, terwijl `_herstelShift` de rijnummers van de LEVENDE lijst wél
    // ophoogde. Zelfde vorm als de rij-val in src/rij.js: een verwijzing vasthouden over een
    // await heen. Zo doen doCompleteTask en bulk.js het ook.
    ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]);
          if(rijIndex(a, r)===-1){ _herstelShift(_shiftNtdRows,oudeRow); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
    'Verwijderen mislukt'
  );
  // rode puls + fade op de oude rij; daarná pas hertekenen
  animateRowOut(tr,'rij-puls-rood',renderAll);
}

function getAfInsertRow(sec){
  const entries=D.af[sec]||[];
  if(entries.length>0) return entries[entries.length-1]._row;
  const info=D.afSecInfo[sec];
  if(info?.colHeaderRow) return info.colHeaderRow;
  // Vroeger liep hier een terugval die het blok van een ÁNDERE sectie opzocht, en anders rij 2.
  // Dat is precies de verwisseling die `getInsertRow` (hierboven, voor 'Nog Te Doen') bewust
  // weigert: een afgeronde taak zou stil onder de verkeerde kop belanden en daar ook zo gelezen
  // worden. Vandaag hebben beide tabbladen alle vijf de blokken, dus dit pad is onbereikbaar —
  // maar het was een landmijn voor de zesde sectie. Dezelfde harde fout, zelfde bewoording.
  throw new Error(`De sectie ${SECS[sec]?.label||sec} bestaat nog niet in het tabblad 'Afgerond'. Voeg daar eerst het blok toe (een regel met ${sec} in kolom A, met daaronder een kolomkoprij).`);
}

// Afronden vanuit de bewerk-modal: zelfde flow als de ✓-knop op een rij, maar met de RIJ in plaats
// van een _rowCache-index — zie `_bewerkRijVers`. Dit leunde op `_rowCache.indexOf`, en die cache
// houdt de rijen die de laatste render als eigen, KLIKBARE regel tekende: `renderTbody` snijdt eerst op
// PAGINA (`rows.slice((p-1)*PG,p*PG)`) en van die slice duwt `rowNtd` de rijen erin. Een taak die
// daar niet tussen staat, stond dus niet in de cache en liep hier vast op de melding. Dat is breder
// dan alleen een taak uit een ánder tabblad (Ctrl+K): net zo goed een taak op pagina 2 of verder, een
// taak die door zoekterm/filter buiten de lijst valt, of een subtaak in een DICHTE bundel — die
// haalt `absorbeer` uit de lijst, en binnen dít tabblad duwt alleen een ópen paneel zijn subtaken
// alsnog in de cache (zie subRegel in render-bundel.js). Verwijderen kon dat alles al wél: dat toetst op D.ntd.
// Andersom is de cache óók niet tót de getekende sectie beperkt — de 'Ook hier'-crosslist
// (render-lijsten.js) en de taakrijen op de VvE-dossierpagina (render-vve.js) vullen dezelfde cache
// met rijen uit álle secties.
// De index gaat nog wél mee als `rid`, puur om straks de groene puls te plaatsen; -1 is daar prima.
// In de NTD-tabel wordt die rij toch op `_row` gezocht — het rid is de weg naar een dossierrij
// (`.tk[data-rid]`, zie doCompleteTask), en dát is dus het geval waarin hij écht iets doet.
// Hij wordt vóór de aanroep bepaald, want `closeModal` (dat als `bijDoorgaan` meegaat) kan de
// NTD-lijst hertekenen en daarmee `state._rowCache` herbouwen.
// Het sluiten gaat als `bijDoorgaan` mee naar completeTaskRow: die stelt eerst de vraag over
// openstaande subtaken, en bij een 'nee' hoort het bewerkscherm er nog te staan (zie daar).
async function completeCurrentEditTask(){
  const r=_bewerkRijVers();
  if(!r) return;
  await completeTaskRow(r, state._rowCache.indexOf(r), closeModal);   // vorm-ok: rid voor de puls-animatie
}

// Pure (testbaar): zoek het bewaarde rij-object vers op in de huidige _rowCache.
// Bewust op identiteit (indexOf), geen veld-vergelijking: na een verse parse zijn het
// nieuwe objecten en is -1 het veilige antwoord — niet gokken welke rij 'dezelfde' is.
// LET OP — dit is een ANDERE vraag dan `rijIndex` uit src/rij.js, en ze door elkaar halen kost
// precies de bescherming waar het om gaat. Hier: "staat dit EXACTE object er nog in?" — een
// inhoudelijk gelijke kloon telt bewust NIET, want juist dat verschil ('D is vervangen door een
// verse parse') is het signaal om te her-ankeren. `rijIndex` beantwoordt de vraag daarná: "en waar
// staat die taak dan nu?", en mag wél op inhoud terugvallen.
function _verseRijIdx(row, lijst){ return row ? (lijst||[]).indexOf(row) : -1; }   // vorm-ok: dit ÍS de strenge vraag

// Pure (testbaar): her-anker een wees-rij op INHOUD nadat een verse parse alle
// D.ntd-objecten verving (stille resync na een andere schrijfactie). Alleen bij exact
// één inhoudelijk identieke rij in dezelfde sectie is her-ankeren veilig; bij nul of
// meerdere kandidaten liever de gebruiker opnieuw laten klikken dan gokken.
function _herankerRij(r, ntd){
  if(!r||!SECS[r._sec]) return null;
  return verseRij(r, (ntd&&ntd[r._sec])||[]);
}

// De taak van het OPEN bewerkscherm, vers opgezocht op het KLIKMOMENT. Gedeelde ingang voor de drie
// knoppen in dat scherm (Verwijderen, Afronden, Opslaan), zodat ze niet meer uiteen kunnen lopen.
//
// Leunen op wat `openModal` in `state.editRowData` legde is niet genoeg: dat scherm is niet
// beschermd tegen een tussentijdse verse parse. De 8s-poll slaat een open modal over (main.js), maar
// `backgroundWrite` doet in zijn finally een `loadAll(true)` zónder die controle (zie de toelichting
// in closeModal). Loopt er dus nog een schrijfactie van een eerdere handeling, dan zijn álle
// rij-objecten in D intussen vervangen door verse met dezelfde inhoud, en wijst het bewaarde object
// nergens meer naar. Wat er dan misgaat verschilt per knop:
//   • Verwijderen haalt de rij optimistisch uit D.ntd met `arr.indexOf(r)`. Een oud object staat
//     daar niet meer in, dus dat doet niets: de rij blijft op het scherm staan terwijl hij uit de
//     Sheet verdwijnt, en de rollback (`if(arr.indexOf(r)===-1)`) zou hem er bij een fout als
//     duplicaat bíj zetten.
//   • Afronden legt de rij in `state._completeRow` en het afrond-scherm haalt hem daar seconden
//     later weer uit. `doCompleteTask` her-ankert dan zelf nog een keer, maar op INHOUD, en
//     `_herankerRij` geeft het op zodra er twee inhoudelijk gelijke rijen in dezelfde sectie
//     staan — dan krijgt de gebruiker 'Taak niet gevonden' nadat hij datum en toelichting al
//     had ingevuld.
//   • Opslaan schreef naar het `_row` van het oude object. Dat rijnummer kan intussen een andere
//     taak zijn — `assertRowMatch` vangt dat af, maar dan als mislukte schrijfactie in plaats van
//     als een die gewoon op de juiste rij landt.
// Wat hier NIET aan hangt: het aantal in de vraag over openstaande subtaken. Die telling loopt via
// `openSubtaken`, en dat filtert de taak zélf met `zelfdeTaak` — dus op TAAKNUMMER, niet op
// object-identiteit. Een verouderd rij-object met hetzelfde nummer valt daar gewoon uit de telling.
//
// Getoetst op D.ntd en niet op state._rowCache: dát is de bron waaruit de bundelindex gebouwd wordt,
// en het Ctrl+K-palet opent dit scherm met een rij die wél in D staat maar niet per se in de cache
// van de laatste render (daarin staat alleen wat die render als eigen regel tekende — zie de
// toelichting bij `completeCurrentEditTask`). In `state.editRowData` komen
// uitsluitend openstaande NTD-rijen — de wegen ernaartoe zijn nagelopen in bundel-acties.js.
// Vinden we hem daar niet meer, dan her-ankeren op inhoud; lukt ook dat niet, dan één melding voor
// alle drie de knoppen. Het scherm blijft in dat geval staan (alle drie de aanroepers keren
// gewoon terug), zodat getypte tekst niet verloren gaat.
function _bewerkRijVers(){
  const bewaard=state.editRowData;
  if(!bewaard) return null;
  // `verseRij` doet allebei de stappen in één: staat dit object er nog, dan krijg je het terug;
  // is D vervangen, dan het verse exemplaar met dezelfde identiteit; en anders null.
  const r=verseRij(bewaard);
  if(!r){alert('Taak niet gevonden. De lijst is intussen ververst — probeer opnieuw.');return null}
  // Wél de juiste rij, maar met andere INHOUD dan toen dit scherm openging. Dat betekent dat een
  // collega (of een eigen handeling in een ander scherm) de taak intussen heeft aangepast. Vóór
  // `verseRij` bestond deze bescherming per ongeluk: her-ankeren lukte alleen bij een letterlijk
  // identieke rij, dus een gewijzigde taak gaf 'niet gevonden'. `verseRij` vindt hem nu wél — op
  // taaknummer — en dan zou Opslaan de wijziging van die ander overschrijven zonder dat iemand
  // het merkt (`assertRowMatch` vergelijkt met de rij die we meesturen, en die is dan al vers).
  // Daarom hier expliciet, met een melding die zegt wat er aan de hand is. Het scherm blijft open
  // staan, dus getypte tekst gaat niet verloren.
  if(state.editFoto && _inhoudsFoto(r)!==state.editFoto){
    alert('Deze taak is intussen gewijzigd — door een collega of vanuit een ander scherm.\n\nSluit dit scherm en open de taak opnieuw, dan zie je de nieuwe stand. Wat je hier getypt hebt blijft tot die tijd staan.');
    return null;
  }
  // Meteen vastzetten, zoals doCompleteTask dat met `state._completeRow` doet: het scherm kan open
  // blijven staan (een 'nee' op de vraag, of een afgebroken opslag), en dan hoort iedereen die er
  // dáárna uit leest — de volgende knop, of de 'Hoort bij'-kiezer die `state.editRowData` bij elke
  // toetsaanslag opnieuw uitleest (main.js) — de rij te krijgen die er nú is.
  state.editRowData=r;
  return r;
}

// `bijDoorgaan` (optioneel) draait zodra vaststaat dat het afrond-scherm opengaat — dus ná de vraag
// over openstaande subtaken. Zie de toelichting bij deleteTaskRow: het bewerkscherm sluit hierop,
// en zou zonder deze plek al dicht zijn vóórdat de gebruiker 'nee' kon antwoorden.
// Eén antwoord op 'de rij die je aanklikte bestaat niet meer'. Dat gebeurt als de lijst opnieuw
// getekend is tussen het tekenen van de knop en de klik erop. Deze situatie werd op vijf plekken
// verschillend afgehandeld: twee keer een blokkerende alert, drie keer helemaal niets. En 'er
// gebeurt niets' leest als een kapotte app — juist bij een knop die een venster hoort te openen.
// Een toast en geen alert(): de rest van het dashboard meldt fouten ook zo, en een alert legt de
// hele pagina stil voor iets waar je niets aan hoeft te doen behalve opnieuw klikken.
function taakUitCache(rid){
  const bewaard = state._rowCache[+rid];
  const kwijt = () => showToast('Taak niet gevonden', 'De lijst is intussen ververst. Probeer het opnieuw.',
                                'var(--rd)', 'waarschuwing', {geenDedup:true, geenSysteemmelding:true});
  if(!bewaard){ kwijt(); return null; }
  // Geen NTD-taak? Dan is er niets her-ankeren. De Ontwikkeling-lijst zet hier bewust een KOPIE
  // neer met `_sec:'ONTW'` (render-overig.js) — die weg heeft zijn eigen identiteit (`_row` op dat
  // tabblad) en gaat niet door D.ntd.
  if(!SECS[bewaard._sec]) return bewaard;
  // DE ENE PLEK waar een aangeklikte rij vers wordt gemaakt. Élke rij-actie in ACTIONS komt hier
  // langs — bewerken, afronden, wegleggen, in behandeling, subtaak koppelen — en krijgt daarmee
  // gratis het object dat NU in D.ntd staat. Zonder dit werkte elke actie op het object van de
  // laatste RENDER, en die cache loopt uit de pas met D zodra `loadAll` verse objecten zet zonder
  // dat de datahash wijzigde. Zie de kop van src/rij.js voor het volledige verhaal; dit was daar
  // de vierde verschijningsvorm van.
  const vers = verseRij(bewaard);
  if(!vers){ kwijt(); return null; }
  return vers;
}

async function completeTask(idx, bijDoorgaan){
  const r=taakUitCache(idx);
  if(!r) return;
  await completeTaskRow(r, idx, bijDoorgaan);
}

// Twee ingangen op één kern, net als bij verwijderen (de knop in de rij en die in het bewerkscherm
// komen allebei op `deleteTaskRow` uit): een klik op
// een getekende rij komt met een _rowCache-index binnen, het bewerkscherm met de rij zelf.
// `rid` dient alléén om straks de groene puls op de aangeklikte DOM-rij terug te vinden; is de taak
// niet getekend (-1), dan vindt die selector niets en blijft de puls stil — `animateRowOut` valt bij
// een lege <tr> gewoon door naar zijn callback.
async function completeTaskRow(r, rid, bijDoorgaan){
  // Sluit je een taak af waar nog subtaken onder hangen? Dan is dat een waarschuwing en géén
  // blokkade (§5: de volgorde is een leidraad). De vraag staat hier en niet in doCompleteTask,
  // zodat je hem krijgt vóórdat je een datum en toelichting invult. Alleen de hoofdtaak stelt hem —
  // een subtaak afvinken is de dagelijkse handeling en moet stil blijven (zie `openSubtaken`).
  // Net als bij verwijderen: `bundelWaarschuwing` levert alleen de constatering, de vraag zelf
  // staat op de knop. Niet 'gevaarlijk' (de rode knop): een 'ja' rondt hier nog niets af, hij opent
  // het afrond-scherm — daar staat pas de knop die het echt doet, mét datum en toelichting.
  const waarschuwing=bundelWaarschuwing(bouwBundelIndex(D.ntd, D.af), r);
  if(waarschuwing && !await vraagBevestiging({
      titel:'Taak afronden?', tekst:waarschuwing, bevestigTekst:'Toch afronden' })) return;
  if(bijDoorgaan) bijDoorgaan();
  // Rij-OBJECT bewaren, geen index: terwijl de modal open staat kan een vertraagde
  // renderAll (animateRowOut, ~1,2s) of de stille resync _rowCache herbouwen — een
  // bewaarde index wijst dan naar een ándere taak. Zelfde patroon als completeCurrentEditTask.
  // Het geklikte rid gaat apart mee, alléén voor de groene puls op de juiste DOM-rij.
  state._completeRow=r;
  state._completeRid=rid;
  const d=new Date();
  document.getElementById('complete-date').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('complete-comment').value='';
  // Wissen bij het OPENEN. Sluit iemand af met het kruisje en opent hij daarna een andere taak,
  // dan zou een bewaarde keuze stil op die verkeerde taak belanden.
  wisDuurKeuze();
  // Zelfde bron als de meldingen: bij een offerte-traject of vergaderverzoek stond hier anders
  // alleen de VvE-code (resp. de periode), en dan is op dit scherm niet te zien wélke taak je
  // afrondt als een VvE er twee heeft.
  document.getElementById('complete-title').textContent=`Taak afhandelen — ${taakTitel(r, r._sec)||r.code||''}`;
  document.getElementById('complete-bg').classList.add('open');
}

// Rijwaarden voor een afgeronde taak. Puur, dus los testbaar — en één bron voor zowel de
// modal-flow (doCompleteTask) als bulk-afronden, zodat die twee niet uiteen kunnen lopen.
// Vaste kolomposities: A..H sectievelden, I afronddatum, J toelichting, K subcategorie,
// L herhaalId (cd_hr_verwerkAfrondingen in Opvolging.gs leest afData[i][11] — NIET verplaatsen), M duur in minuten,
// N..P leeg, Q taakId, R bundelId, S bundelVolg. Q/R/S liggen op dezelfde index als in
// 'Nog Te Doen', omdat parseSections beide tabbladen met dezelfde vaste posities leest.
//
// A..H komt uit SECS.keys en niet uit een eigen lijstje per sectie: die kolomvolgorde is NIET
// de volgorde waarin de velden in het rij-object staan ('actiepunt' is kolom C, niet index 1),
// en parseSections leest hem met precies dezelfde bron terug. Een handgeschreven kopie zou
// stilletjes uiteen kunnen lopen — dezelfde afweging als in serializeNtdUndo en _rijNaarCellen.
export function afrondWaarden(r, sec, datum, toelichting, duurMin){
  // Harde fout i.p.v. terugvallen op een 'default'-sectie: een taak die in het verkeerde
  // kolomstramien in 'Afgerond' belandt is duurder dan een mislukte afronding.
  if(!SECS[sec]) throw new Error('Onbekende sectie: '+sec);
  // BEWUST `r[k]` en NIET `celWaarde` — anders dan serializeNtdUndo hierboven. Het verschil zit in
  // wat er méégaat: de undo-rij gaat terug naar 'Nog Te Doen' mét de aannemerslijst in kolom P, dus
  // daar kan `reconcileOffertes` de teller opnieuw opbouwen uit de rauwe kolom D. De ARCHIEFrij
  // krijgt M..P leeg (zie hieronder): daar is de afgeleide teller het enige wat er nog van over is.
  // Schreven we hier de rauwe waarde, dan toonde een afgerond offerte-traject '0 van 3 binnen'
  // terwijl er drie offertes lagen — en kolom P is dan weg, dus dat is nergens meer terug te halen.
  const v=SECS[sec].keys.map(k=>
    // De offerteteller wordt hier AFGELEID en niet uit het rij-object overgenomen. Kolom P
    // (de aannemerslijst) gaat niet mee naar het archief — daar blijven M..P leeg — dus de
    // afgeleide teller is het enige wat er van die lijst overblijft. Leunen op `r.offertes`
    // ging mis zodra de rij nog niet door een render was gegaan: `_verrijkOfferteRij` draait
    // alleen binnen `filterNtd`, en `renderAll` slaat over zolang de datahash gelijk blijft.
    // Dan stond er de RAUWE kolom D in — '0/3' terwijl er drie offertes binnen waren, en na
    // het archiveren nergens meer terug te halen. `reconcileOffertes` geeft verrijkt of
    // onverrijkt dezelfde uitkomst: lijst aanwezig → de lijst wint (wat er ook als eerste
    // parameter staat); zonder lijst blijft de meegegeven kolom-D-waarde staan.
    k==='offertes' ? reconcileOffertes(r.offertes||'', parseAannemers(r.aannemers)) : (r[k]||'')
  );
  while(v.length<8) v.push('');               // OFFERTE heeft 7 velden → vul tot H
  return v.concat([
    datum, toelichting, r.subcategorie||'',   // I, J, K
    r.herhaalId||'',                          // L
    // M — hoe lang de taak kostte, in minuten. Leeg als er niets is aangeklikt: overslaan mag,
    // en een lege cel telt nergens in mee. `bulkAfronden` roept deze functie met vier argumenten
    // aan en laat M dus altijd leeg — bulk is opruimwerk en hoort niet in de meting.
    duurNaarCel(duurMin), '', '', '',         // M, N, O, P
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),  // Q, R, S
  ]);
}

async function doCompleteTask(){
  let r=state._completeRow;
  // Toetsen op D.ntd en NIET op state._rowCache — dezelfde regel als in `_bewerkRijVers`, en om
  // dezelfde reden: wat hieronder telt is of dit object nog ÍN D.ntd staat, want daar wordt hij
  // straks met `arr.indexOf(r)` uit gehaald. `_rowCache` en D lopen uiteen: `renderAll` (en
  // daarmee de cache) draait alleen bij een gewijzigde datahash, terwijl `loadAll` élke ronde
  // verse rij-objecten in D zet. Stond de taak nog in de cache maar niet meer in D, dan sloeg de
  // her-ankering over, deed de splice niets — de afgeronde taak bleef in de lijst staan — en zette
  // de rollback bij een fout een TWEEDE exemplaar terug (`if(a.indexOf(r)===-1)`).
  if(r && _verseRijIdx(r, D.ntd[r._sec])<0){
    // De cache is herbouwd met verse parse-objecten (stille resync) terwijl de modal
    // open stond. Her-anker op inhoud: staat de taak er ongewijzigd in, dan mag de
    // afronding gewoon doorgaan en is de getypte toelichting niet voor niets geweest.
    r=_herankerRij(r, D.ntd);
    if(r) state._completeRow=r;
  }
  if(!r){alert('Taak niet gevonden. De lijst is intussen ververst — probeer opnieuw.');closeCompleteModal();return}
  const dateVal=document.getElementById('complete-date').value;
  const comment=document.getElementById('complete-comment').value.trim();
  if(!dateVal){alert('Datum is verplicht.');return}
  const dp=dateVal.split('-');
  const today=`${dp[2]}-${dp[1]}-${dp[0]}`;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  // Dubbelklik-rem NÁ ensureToken: het gevaarlijke gat is tussen de token en de
  // batch-write (getSheetIds is nog een await), waar een tweede klik de taak dubbel
  // zou afronden. Bewust niet vóór ensureToken: een hangende/geblokkeerde OAuth-popup
  // zou de vlag dan eeuwig op true laten staan; een tweede klik is daar juist een
  // legitieme herkansing.
  if(state._completeBusy) return;
  state._completeBusy=true;
  try{
    const sec=r._sec;
    const values = afrondWaarden(r, sec, today, comment, gekozenDuur());
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'];
    const ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null) throw new Error('Sheet "Afgerond" niet gevonden');
    if(ntdSheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    const afAfterRow=getAfInsertRow(sec);
    // Vers narekenen of die archiefplek NOG klopt — dezelfde controle die `submitTask` op 'Nog Te
    // Doen' al doet, nu op 'Afgerond'. `bevestigInvoegPlek` kende het tabblad al, maar werd er
    // nooit mee aangeroepen. Dit venster is een `.modal-bg`, dus de 8s-poll staat stil zolang de
    // gebruiker een toelichting typt; rondt een collega intussen iets af, dan wijst het onthouden
    // rijnummer naar de sectiekop eronder en gooit `parseSections` de archiefregel altijd weg als
    // kolomkoprij — de taak staat dan in geen van beide tabbladen meer.
    try{ await bevestigInvoegPlek(sec, afAfterRow, 'Afgerond'); }
    catch(e){
      // Eerst herladen, dán melden: de tekst zegt 'opnieuw geladen', en dat hoort waar te zijn
      // op het moment dat de gebruiker hem leest. (Zelfde volgorde als in submitTask.)
      await loadAll();
      // Venster bewust NIET sluiten: de getypte toelichting moet blijven staan.
      alert(e.melding || e.message);
      return;
    }
    // Deze controle doet een ECHT leesverzoek (met herkansing bij 429/5xx), en al die tijd blijft
    // het venster open met werkende knoppen 'Annuleren' en '×'. Sluit de gebruiker het in dat gat,
    // dan zette `closeCompleteModal` alleen `state._completeRow` op null — deze functie liep
    // gewoon door en rondde de taak alsnog af, mét een groene bevestiging. Vóór deze wijziging was
    // er geen meetbaar gat (getSheetIds komt uit de cache), dus deze rem hoort bij die await.
    if(state._completeRow!==r){ closeCompleteModal(); return; }
    // De batch wordt PAS IN DE WRITEFN gebouwd, met een dan vers berekende archiefplek. Zetten we
    // het rijnummer hier al vast, dan draagt een tweede afronding die binnen hetzelfde
    // schrijfvenster start een ABSOLUUT anker in zijn batch dat door een rollback van de eerste
    // niet meer gecorrigeerd wordt — en dan landt de archiefregel tien rijen te laag, mogelijk pal
    // onder de sectiekop van het volgende blok (waar parseSections hem altijd weggooit).
    // In de writeFn kan dat niet: `backgroundWrite` voert de wachtrij SERIEEL uit, dus op dat
    // moment zijn alle eerdere schrijfacties én hun eventuele rollbacks al geweest.
    const bouwBatch=(afRij)=>({requests:[
      {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afRij,endIndex:afRij+1},inheritFromBefore:true}},
      {updateCells:{range:{sheetId:afSheetId,startRowIndex:afRij,endRowIndex:afRij+1,startColumnIndex:0,endColumnIndex:values.length},
        rows:[{values:values.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
      {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}
    ]});
    // undo-data vastleggen vóór de mutatie
    const ntdValues=serializeNtdUndo(r);
    const undoData={sec,code:r.code,ntdValues,ntdRow:r._row,gelukt:false};
    // 1) optimistisch: meteen uit de lokale lijst + indexen meeschuiven;
    //    de oude DOM-rij pulst groen en pas daarná hertekenen we (anim.js)
    // Rij voor de groene puls: NTD-tabel, of anders de GEKLIKTE taakrij (bewaard rid)
    // op de zichtbare pagina — niet een indexOf-treffer die op een verborgen kopie
    // (dossier-DOM van een eerder bezocht dossier) kan landen.
    // Beide clauses op de zichtbare pagina: bij afronden vanuit het dossier zou de
    // eerste clause anders de verbórgen NTD-tabelrij matchen en de puls onzichtbaar spelen.
    const tr=document.querySelector(`.page.active #ntd-tbody tr[data-row="${r._row}"]`)||document.querySelector(`.page.active .tk[data-rid="${state._completeRid}"]`);
    const arr=D.ntd[sec]||[];
    const pos=rijIndex(arr, r);   // identiteit, niet object — zie src/rij.js
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(r._row,-1);
    closeCompleteModal();
    showUndoToast('Taak afgerond',`${r.code} — ${taakTitel(r, sec)||r.naam||''}`,()=>undoComplete(undoData),'vinkCirkel',
                  {sleutel:`afrond|${r.taakId||`${r._row}|${r.code}|${taakTitel(r,sec)}`}`});
    // 2) op de achtergrond wegschrijven; bij fout de taak terugzetten
    // Idempotentie-vlag: de batch (insert+update+delete) is positie-gebaseerd en NIET
    // idempotent — een retry na een transient fout zou dubbel kunnen afronden / de verkeerde
    // rij verwijderen. De vlag zorgt dat de batch maar één keer echt uitgevoerd wordt.
    let afgerond=false;
    backgroundWrite(
      async ()=>{
        if(!afgerond){
          await assertRowMatch(r._row, r); // bescherming: rij nog dezelfde TAAK vóór afronden
          // Archiefplek NU berekenen — zie de toelichting bij bouwBatch.
          const afRij=getAfInsertRow(sec);
          const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
            method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
            body:JSON.stringify(bouwBatch(afRij))});
          if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Fout bij afhandelen taak');err.status=resp.status;throw err}
          afgerond=true;
          undoData.gelukt=true;    // pas nu mag de undo-knop iets terugzetten
          // Pas NA een geslaagde invoeging de rijnummers van 'Afgerond' meeschuiven, zodat de
          // vólgende schrijfactie in de wachtrij op het juiste anker uitkomt. Bij een mislukking
          // gebeurt er niets en hoeft de rollback dus ook niets terug te draaien.
          _shiftAfRows(afRij,+1);
        }
        await logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ const a=(D.ntd[sec]=D.ntd[sec]||[]); if(rijIndex(a, r)===-1){ _herstelShift(_shiftNtdRows,r._row); a.splice(Math.min(pos<0?a.length:pos,a.length),0,r); } },
      'Afronden mislukt'
    );
    // 3) groene puls + fade op de oude rij; daarná pas hertekenen
    animateRowOut(tr,'rij-puls-groen',renderAll);
  }catch(e){alert('Fout bij afhandelen: '+e.message)}
  finally{ state._completeBusy=false; }
}

// ── De duurkeuze in het afrondvenster ────────────────────────────────────────────────────────
// Er is bewust GEEN aparte state voor de gekozen duur. Het venster is de bron, net als bij de
// datum en de opmerking eronder: `doCompleteTask` leest die twee ook rechtstreeks uit de DOM.
// Een schaduwvariabele zou uit de pas kunnen lopen met wat de gebruiker ziet — precies het soort
// fout dat `_rowCache` versus `D` in dit project al eerder heeft opgeleverd.

// Toggle, geen radiogroep: nogmaals klikken op dezelfde knop trekt de keuze weer in. Zonder dat
// kun je een per ongeluk aangeklikte duur niet meer weghalen zonder het venster te sluiten, en
// dan wordt er een verkeerde meting opgeslagen omdat annuleren te veel gedoe is.
export function kiesDuur(knop){
  if(!knop) return;
  const aan = knop.getAttribute('aria-pressed')==='true';
  knop.parentElement.querySelectorAll('.duur-knop').forEach(b=>b.removeAttribute('aria-pressed'));
  if(!aan) knop.setAttribute('aria-pressed','true');
}

// De gekozen duur in minuten, of null als er niets aanstaat. `wortel` is er voor de zelftest;
// in de app leest hij gewoon het echte venster.
export function gekozenDuur(wortel){
  const bron = wortel || document.getElementById('complete-duur');
  const el = bron && bron.querySelector('.duur-knop[aria-pressed="true"]');
  return el ? duurUitCel(el.dataset.min) : null;
}

// Bij het ÓPENEN van het venster wissen, niet bij het sluiten: sluit iemand af met een kruisje
// en opent hij daarna een andere taak, dan zou een bewaarde keuze stil op de verkeerde taak
// belanden.
export function wisDuurKeuze(wortel){
  const bron = wortel || document.getElementById('complete-duur');
  if(bron) bron.querySelectorAll('.duur-knop').forEach(b=>b.removeAttribute('aria-pressed'));
}

function closeCompleteModal(){document.getElementById('complete-bg').classList.remove('open');state._completeRow=null;state._completeRid=null}

// ══════════════════════════════════════
//  SUBMIT TASK (Add + Edit)
// ══════════════════════════════════════
async function submitTask(){
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const code=document.getElementById('m-code').value.trim();
  const _naamEl=document.getElementById('m-naam');
  // De naam alleen overnemen als hij ook ECHT bij deze code hoort. Het naamveld is readonly en
  // wordt gevuld door de suggestielijst; typt of plakt iemand daarna de code met de hand — bij een
  // correctie in het bewerkscherm is dat de gewone weg — dan blijft de naam van de vórige VvE
  // staan en belandt die zo in kolom B. Klopt de stempel niet, dan zoeken we de naam zelf op; is
  // de code onbekend, dan liever leeg dan onwaar.
  const naam=((_naamEl.dataset.code||'').trim()===code ? _naamEl.value.trim() : _naamBijCode(code));
  if(!code){alert('VvE Code is verplicht.');return}

  const sec=state.editSec||state.activeNtd;
  let values;

  // DUBBELKLIK-REM. Zelfde idioom als `doCompleteTask` en `doeReset`. Tot v10.30 was die hier niet
  // nodig: de enige await vóór de mutatie was `ensureToken`, en die keert bij een geldig token in
  // een microtask terug — klik 2 kwam altijd op een al gesloten venster. Sinds `bevestigInvoegPlek`
  // hieronder staat er een ECHTE lezing tussen de klik en de mutatie (200-800 ms, bij een 429 tot
  // ~2,5 s), en al die tijd staat het venster open en is de knop live. Zonder rem levert een tweede
  // klik in dat gat twee identieke taken op: de dubbelcheck ziet niets (de eerste staat nog niet in
  // D.ntd) en de guard leest dezelfde ongewijzigde ankerrij. Precies het duplicaat dat de
  // dubbelcheck moest voorkomen.
  if(state._submitBezig) return;
  state._submitBezig=true;

  try{
    const subId={OPPAKKEN:'m-sub-opp',VERGADERVERZOEKEN:'m-sub-verg','OFFERTE-TRAJECTEN':'m-sub-off',LOD:'m-sub-lod','SUBSIDIE-TRAJECTEN':'m-sub-sub'}[sec];
    const sub=gv(subId);
    // Kolomvolgorde 'Nog Te Doen': … H=InBeh, I=Afgerond, J=(leeg), K=Subcategorie, L=Opvolg, …
    // De subcategorie moet dus op kolom K (index 10) staan — gelijk aan parseSections en de
    // Apps Script-backend. Daarom twee lege kolommen (I + J) vóór `sub`.
    switch(sec){
      case'OPPAKKEN':{
        const _dlOpp = uitVeld('m-dl', toDutchDate(gv('m-dl')));
        const _berekend = berekenPrioriteit(_dlOpp, 'OPPAKKEN').prioriteit;
        values=[code,naam,gv('m-actie'),_dlOpp,gv('m-beh'),_berekend,gv('m-opm'),
          document.getElementById('tog-ib').classList.contains('on'),'','',sub];break;}
      case'VERGADERVERZOEKEN':
        values=[code,naam,gv('m-per'),gv('m-agenda'),gv('m-beh-v'),uitVeld('m-dl-v',toDutchDate(gv('m-dl-v'))),gv('m-opm-v'),
          document.getElementById('tog-ib-v').classList.contains('on'),'','',sub];break;
      case'OFFERTE-TRAJECTEN':
        // Kolom D wordt niet meer bewerkt: het onvertaalbaar-mechanisme geeft de bestaande
        // waarde ongewijzigd door (nieuwe taak: leeg — de aannemerslijst ís de teller).
        values=[code,naam,uitVeld('m-daang',toDutchDate(gv('m-daang'))),uitVeld('m-off',''),gv('m-beh-o'),uitVeld('m-dl-o',toDutchDate(gv('m-dl-o'))),gv('m-opm-o'),'','','',sub];break;
      case'LOD':
        values=[code,naam,gv('m-actie-l'),gv('m-stat-l'),gv('m-beh-l'),uitVeld('m-dl-l',toDutchDate(gv('m-dl-l'))),gv('m-opm-l'),
          document.getElementById('tog-ib-l').classList.contains('on'),'','',sub];break;
      case'SUBSIDIE-TRAJECTEN':
        values=[code,naam,gv('m-subsidie'),(!_faseGekozen && _onvertaalbaar['m-fase']) ? _onvertaalbaar['m-fase'] : faseWoord(_modalFase),gv('m-beh-s'),uitVeld('m-dl-s',toDutchDate(gv('m-dl-s'))),gv('m-opm-s'),
          document.getElementById('tog-ib-s').classList.contains('on'),'','',sub];break;
    }

    const endCol=String.fromCharCode(64+Math.max(values.length,9));
    const keys=SECS[sec].keys;
    const norm=v=>v===true?'TRUE':v===false?'FALSE':v; // boolean → Sheets-stringvorm
    const newBeh=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):sec==='SUBSIDIE-TRAJECTEN'?gv('m-beh-s'):gv('m-beh-l'));

    // ── Lijkt deze nieuwe taak al te bestaan? ──
    // Alleen bij TOEVOEGEN, en alleen als vraag: twee taken die op elkaar lijken zijn soms écht
    // twee taken. Zie dubbelcheck.js voor de maatstaf en waarom hij uitlegbaar moet zijn.
    //
    // Deze vraag staat hier, ná `values` en vóór élke mutatie: op dit punt is er nog niets
    // veranderd, dus een 'nee' laat het venster staan mét alles wat de gebruiker net intypte.
    // Zou hij later staan (ná `_shiftNtdRows` of de optimistische push in D.ntd), dan zou 'nee'
    // een half aangemaakte taak achterlaten.
    // Een SUBTAAK die aan een bestaande bundel wordt gehangen ('+ Voeg een subtaak toe') slaat deze
    // vraag over. Die hoort per definitie bij een taak die er al staat — dat is precies wat de
    // gebruiker net aanwees — en hij lijkt er dus vaak sterk op. De vraag zou daar altijd komen en
    // altijd weggeklikt worden, en een waarschuwing die je leert wegklikken is erger dan geen.
    // `state._dubbelcheckUit` is een TESTHAAK, zelfde soort als `_fetchTimeoutMs` en `_uitCache`.
    // De zelftest maakt in tientallen oudere blokken taken aan die op elkaar lijken en beantwoordt
    // die vraag niet; zonder deze schakelaar blijft de hele suite hangen op een venster dat niemand
    // wegklikt. Het blok dat de dubbelcheck zélf toetst zet hem tijdelijk uit. In de app staat hij
    // nooit aan.
    if(!state.editMode && !state._nieuwBundel && !state._dubbelcheckUit){
      const kandidaat={ _sec:sec };
      keys.forEach((k,i)=>{ kandidaat[k]=norm(values[i]); });
      // De omschrijving uit het EIGEN veld van deze categorie en niet via `taakTitel`: die valt bij
      // een lege omschrijving terug op de categorienaam, en dan lijkt elke lege taak op elke andere.
      const dubbels=zoekDubbels(code, kandidaat[OMSCHRIJVING_SLEUTEL[sec]] || '', D.ntd);
      if(dubbels.length && !await vraagBevestiging({
          titel:'Bestaat deze taak al?',
          tekst:dubbelVraagTekst(dubbels),
          bevestigTekst:'Toch aanmaken' })) return;
    }

    if(state.editMode&&state.editRowData?._row){
      // ── Bewerken: lokale rij meteen bijwerken, dan op de achtergrond opslaan ──
      // Op het KLIKMOMENT vers opzoeken, net als de twee andere knoppen in dit scherm (zie
      // `_bewerkRijVers`): anders schrijft dit naar het `_row` van een object dat een verse parse
      // allang vervangen heeft. Vindt de helper hem niet, dan hier meteen terug.
      //
      // Niet omdat het anders naar de toevoeg-tak zou doorvallen — dat kán niet, die is de `else`
      // van de `if` waar we in staan, en `_bewerkRijVers` laat `state.editRowData` staan als hij
      // null teruggeeft. De reden is prozaïscher: `keys.forEach` een paar regels lager crasht op
      // `doelRow[k]=`, de catch onderaan submitTask vangt dat en zet er een tweede melding
      // ('Fout: Cannot set properties of null…') bovenop de melding die `_bewerkRijVers` net gaf.
      // Eén verdwenen taak leest dan als twee losse problemen. Gemeten door de `return` weg te
      // halen: geen tweede taak, wél die tweede melding.
      const doelRow=_bewerkRijVers();
      if(!doelRow) return;
      const oudeWaarden={...doelRow};   // snapshot vóór de optimistische mutatie hieronder
      // De in 'Hoort bij' aangewezen doeltaak NU vastpakken: het closeModal/clearModal hieronder
      // wist die keuze (een leeg formulier hoort bij geen bundel), en dan is hij weg.
      const hbDoel=state._hbDoel;
      // De aannemerslijst NU uitlezen, om dezelfde reden als hbDoel: clearModal wist de werkkopie.
      const aannCel = sec==='OFFERTE-TRAJECTEN' ? modalAannemersCel() : null;
      keys.forEach((k,i)=>{ doelRow[k]=norm(values[i]); });
      doelRow.subcategorie=values[values.length-1];
      // Offerte: gooi de gecachete handmatige X/N weg zodat de net-bewerkte kolom-D-waarde
      // meteen wordt herkend (anders pas zichtbaar ná de stille resync). Harmloos elders.
      delete doelRow._offertesManual;
      renderAll();
      flashRow('ntd-tbody', doelRow._row);
      closeModal();clearModal();
      // Vlaggen per stap, zoals doCompleteTask ze al had. `backgroundWrite` draait deze functie
      // opnieuw bij een tijdelijke fout (429/5xx), en dan is de rij-controle níet meer wat hij
      // was: de write is dan al geslaagd, dus de Sheet bevat de NIEUWE waarden terwijl de guard
      // nog met de oude vergelijkt. Dat gaf een valse 'Iemand heeft deze taak net gewijzigd',
      // een teruggerolde bewerking op het scherm — en de schuld bij een collega die niets deed.
      // De logregels dragen om dezelfde reden hun eigen vlag: een append is niet idempotent.
      let geschreven=false, behGelogd=false, faseGelogd=false;
      backgroundWrite(
        async ()=>{
          if(!geschreven){
            await assertRowMatch(doelRow._row, oudeWaarden); // bescherming: rij nog dezelfde TAAK vóór overschrijven
            // oudeWaarden is de snapshot VÓÓR de optimistische mutatie van doelRow — precies wat
            // er op dit moment nog in de Sheet hoort te staan.
            await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
            geschreven=true;
          }
          if(newBeh && newBeh!==(oudeWaarden.behandelaar||'') && !behGelogd){
            fireNotifEvent('assigned',{sec,code,naam,behandelaar:newBeh});
            await logEvent(code,sec,'Behandelaar gewijzigd','behandelaar',oudeWaarden.behandelaar,newBeh);
            behGelogd=true;
          }
          // Fase-wijziging vanuit het bewerkscherm ook vastleggen. Klikken op een
          // bolletje in de tabelrij logt al via zetSubsidieFase; zonder dit blok bleef
          // dezelfde wijziging via Opslaan onzichtbaar in het logboek, en juist het
          // verloop van een subsidietraject wil je later kunnen terugzien.
          if(sec==='SUBSIDIE-TRAJECTEN' && !faseGelogd){
            const w=faseWijziging(oudeWaarden.subsidieFase, doelRow.subsidieFase);
            if(w) await logEvent(code,sec,'Fase gewijzigd','fase',w.van,w.naar);
            faseGelogd=true;
          }
          // Bevestiging pas hier: vóór de write was 'Opgeslagen' een belofte, geen feit.
          // Helemaal onderaan de writeFn, zodat een _withRetry-herkansing er geen tweede
          // kan opleveren. geenDedup: twee keer dezelfde taak opslaan binnen 15 s moet
          // twee bevestigingen geven, anders leest de tweede als 'mislukt'.
          showToast('Opgeslagen',`${code} — ${naam||''}`,null,'opslaan',{geenDedup:true,geenSysteemmelding:true});
        },
        ()=>{ keys.forEach(k=>{ doelRow[k]=oudeWaarden[k]; }); doelRow.subcategorie=oudeWaarden.subcategorie; delete doelRow._offertesManual; },
        'Opslaan mislukt'
      );
      // De bundelkoppeling is een APARTE schrijfweg (kolom Q, R en S) en loopt bewust niet mee in
      // de write hierboven: die schrijft A..K en raakt de bundelkolommen dus sowieso niet — maar
      // belangrijker is dat de twee los van elkaar mogen mislukken zonder elkaar mee te trekken.
      // Beide gaan door dezelfde seriële wachtrij (state._writeChain), en de koppeling komt daarin
      // als tweede: backgroundWrite verlengt die wachtrij nog synchroon op de aanroepregel
      // hierboven, terwijl koppelTaak zijn eigen backgroundWrite pas ná `await ensureToken()`
      // bereikt. Die volgorde is nodig — koppelTaak doet zijn eigen rij-controle en die moet de
      // zojuist opgeslagen tekst teruglezen, niet de tekst van ervóór. Verplaats deze regel dus
      // niet naar vóór de backgroundWrite hierboven: het gaat daar vandaag ook goed, maar dan
      // hangt de volgorde aan die ene await in koppelTaak in plaats van aan de plek in de wachtrij.
      if(hbDoel) koppelTaak(doelRow, hbDoel);
      // De aannemerslijst is net als de bundelkoppeling een APARTE schrijfweg (kolom P): de
      // hoofd-write blijft strikt A..K. Zelfde plek in de wachtrij, om dezelfde reden.
      if(aannCel!==null && aannCel!==(oudeWaarden.aannemers||'')) schrijfAannemers(doelRow, aannCel);
    } else {
      // ── Toevoegen: rij meteen lokaal tonen, dan op de achtergrond opslaan ──
      const afterRow=getInsertRow(sec);
      // Vers narekenen vlak vóór de mutatie. Juist hier is het geheugen het oudst: dit venster
      // heeft de verversing stilgezet zolang de gebruiker zat te typen.
      try{ await bevestigInvoegPlek(sec, afterRow); }
      catch(e){
        alert(e.melding || e.message);
        loadAll();          // de lijst is verschoven: verse stand halen, dan kan de gebruiker opnieuw
        return;
      }
      const nieuw={_sec:sec,_row:afterRow+1};
      keys.forEach((k,i)=>{ nieuw[k]=norm(values[i]); });
      nieuw.subcategorie=values[values.length-1];
      // Vast taaknummer (kolom Q) meteen bij het aanmaken, en meteen ook de bundelkolommen R en S,
      // zodat insertAndWriteRow A..S in één keer schrijft. Bewust NIET in de bewerk-tak hierboven:
      // die schrijft A..K en zou L..S leegvegen.
      nieuw.taakId=nieuwTaakId();
      // Komt de taak uit een bundel ('+ Voeg een subtaak toe'), dan draagt hij het bundelnummer al
      // bij het aanmaken. Zo is er geen tweede schrijfactie nodig en kan er geen half-gekoppelde
      // taak ontstaan als die tweede zou mislukken.
      const bdl=state._nieuwBundel;
      nieuw.bundelId  = bdl ? bdl.bundelId : '';
      nieuw.bundelVolg= bdl ? bdl.volg     : '';
      // De aannemerslijst gaat bij een nieuwe taak mee in de rij zelf (kolom P) — één
      // atomaire A..S-write, geen tweede actie.
      nieuw.aannemers = sec==='OFFERTE-TRAJECTEN' ? modalAannemersCel() : '';
      // Een nieuw offerte-traject wordt meteen bundelkop: R = eigen taaknummer, S = '0'.
      // Niet wanneer dit zélf een subtaak is (state._nieuwBundel) — bundels blijven één laag diep.
      const autoVoorleg = sec==='OFFERTE-TRAJECTEN' && !bdl;
      if(autoVoorleg){ nieuw.bundelId=nieuw.taakId; nieuw.bundelVolg='0'; }
      // De vlag wordt hier bewust NIET gewist. Het `closeModal` een paar regels verderop doet dat
      // al — net als élke andere sluitweg — en tussen dit punt en dat closeModal staat `renderAll()`.
      // Gooit die, dan blijft dit venster open via de catch onderaan submitTask, en met een al
      // gewiste vlag zou een tweede klik op Opslaan stil een LOSSE taak opleveren: precies de
      // dataschade die deze vlag moet voorkomen. Wissen mag dus pas als de taak er echt is, en dat
      // is precies wat closeModal doet.
      const addValues=toevoegWaarden(values,nieuw);
      _shiftNtdRows(afterRow,+1); // bestaande rijen eronder schuiven mee
      (D.ntd[sec]=D.ntd[sec]||[]).push(nieuw);
      // Vanaf hier bestaat de taak lokaal, dus het tabblad van DEZE sectie moet blijven staan —
      // ook als het scherm via prefillNieuweTaak op een ander tabblad begon of de gebruiker in de
      // categorie-kiezer iets anders koos. Zonder deze stap tekent de renderAll hieronder de lijst
      // van een ánder tabblad, en dat leest als 'er is niets gebeurd'.
      //
      // Alleen als de NTD-lijst ook echt in beeld is. '+ Nieuwe taak' op de VvE-dossierpagina maakt
      // ook een OPPAKKEN-taak (actions.js), en die weg raakt geen bundel en gaat niet naar Nog Te
      // Doen: daar zou dit het tabblad achter het dossier stilletjes verzetten, merkbaar pas als de
      // gebruiker terugloopt. Dezelfde toets als in goTo (ui.js), want `_pagina` daar is privé.
      //
      // En via `setNtd`, niet via `state.activeNtd=` alleen: een sectiewissel hoort óók de
      // paginateller op 1 te zetten en de bulk-selectie te wissen. Die selectie is een set
      // rij-OBJECTEN zonder sectiefilter (bulk.js), dus na een wissel blijft de bulk-balk staan met
      // een selectie die niet meer op het scherm staat. Alleen bij een échte wissel, zodat
      // toevoegen aan de lijst waar je al staat niet ineens terugbladert naar pagina 1.
      //
      // Daarna moet de teller naar de pagina waarop de nieuwe rij écht staat. Waar dat is valt niet
      // vooraf te zeggen: zónder kolomsortering hangt `sorteerNtd` de rij achteraan (`getInsertRow`
      // zet hem achteraan het sectieblok), dus in een sectie van meer dan PG (25) rijen staat hij
      // niet op de pagina die in beeld is; mét een actieve sortering bepaalt de sorteersleutel de
      // plek en kan hij overal landen, óók op pagina 1 terwijl de gebruiker op pagina 3 stond. Na
      // een sectiewissel is de teller sowieso op 1 gezet door `setNtd`. Daarom leest `ntdPagina` de
      // écht getekende lijst en rekenen we hier niets na. Zonder deze stap komt de belofte hierboven
      // maar half uit: je landt op een lijst zónder je nieuwe taak, en ook de groene flits blijft
      // weg omdat `flashRow` stil terugkeert als de <tr> niet in de DOM zit. `pg===0` laat de teller
      // met rust: de rij staat dan niet als eigen regel in de getekende lijst (weggefilterd, of als
      // verse subtaak opgeslokt door het paneel van zijn bundel), en bladeren naar een pagina die
      // hem toch niet toont heeft geen zin.
      const opNtd = document.querySelector('.page.active')?.id==='page-ntd';
      // Bij een sectiewissel tekent `setNtd` de lijst toch al en geeft hem terug: de pagina is dan
      // vóór de `renderAll` hieronder bekend en die tekent hem meteen goed. Blijven we op hetzelfde
      // tabblad, dan valt er niets te wisselen en zou een eigen `renderNtd()` — puur om aan die
      // lijst te komen — een tweede volledige NTD-render kosten bovenop die van `renderAll`. Daar
      // wachten we dus op de teruggave van `renderAll` zelf en hertekenen we alleen als de pagina
      // écht verspringt; dezelfde vorm als in `springNaarBundel` (render-lijsten.js).
      //
      // Die correctie-render VULT `state._rowCache` AAN in plaats van hem te legen — alleen
      // `renderAll` zet die op leeg — dus in dat ene geval staat er een NTD-pagina dubbel in. Dat
      // is onschadelijk: `renderTbody` schrijft de `data-rid`'s in dezelfde pas, dus elke getekende
      // rij wijst naar zijn eigen plek, en elke andere lezer haalt de rij óf via zo'n rid op óf
      // vraagt alleen 'zit hij erin?' (`_verseRijIdx`). De enige `indexOf` die een dubbele treffer
      // kan krijgen is die van completeCurrentEditTask hierboven, en die levert alleen het rid voor
      // de puls — waarvoor de NTD-tabel toch al op `_row` wordt gezocht en niet op rid. Dat het
      // meegegeven rid ook bij een dubbele cache nog naar de juiste taak wijst ligt vast in een
      // assert (tests.js, bij de knoppen van het bewerkscherm), niet alleen in dit comment.
      let naWissel = null;
      if(opNtd){
        state._ntdVoorModal=null;
        if(sec!==state.activeNtd){
          naWissel = setNtd(sec);
          const pg = ntdPagina(naWissel, nieuw);
          if(pg) pgs.ntd = pg;
        }
      }
      const getekend = renderAll();
      if(opNtd && !naWissel){
        const pg = ntdPagina(getekend, nieuw);
        if(pg && pg!==pgs.ntd){ pgs.ntd = pg; renderNtd(); }
      }
      flashRow('ntd-tbody', nieuw._row, 'rij-flits-groen');
      // De extra VvE's NU uitlezen: het `clearModal` hieronder wist ze, net als de bundelkeuze en
      // de 'Hoort bij'-doeltaak. Dezelfde afweging, dezelfde plek.
      // De extra's nog één keer langs de HOOFD-VvE halen. `voegExtraVveToe` vergelijkt op het moment
      // van kiezen, en die code kan daarna nog wijzigen: kies eerst de extra's, zet dán het
      // VvE-veld op diezelfde code, en je krijgt twee identieke taken voor dezelfde VvE — precies
      // wat meervve.js belooft tegen te houden. Gemeten in de draaiende app; ook bereikbaar vanaf
      // de dossierpagina, waar de code al ingevuld staat en daarna te wijzigen is.
      const extra = extraVves().filter(v => v.code !== code);
      closeModal();clearModal();
      // De extra's krijgen ieder een EIGEN rij en een EIGEN taaknummer, en géén bundel: het zijn
      // losse dossiers die ieder hun eigen gang gaan (zie meervve.js). Ze worden hier direct ACHTER
      // de eerste rij gezet, als één aaneengesloten blok — dat is precies wat `insertAndWriteRows`
      // straks in één keer invoegt.
      //
      // Taaknummers binnen dit blok gegarandeerd uniek. `nieuwTaakId` is tijd + zes willekeurige
      // tekens, en in een lus is die tijd identiek: alle bescherming zit dus in dat toevalsdeel.
      // Sinds v12.1 zijn dat er zes in plaats van drie (2,2 miljard i.p.v. 46.656 waarden), maar
      // deze lus blijft staan: 'klein' is niet 'nul', en het gevolg is stil en naar — twee rijen
      // met hetzelfde nummer in kolom Q laten de rij-controle naar de verkéérde rij schrijven.
      const gebruikteIds = new Set([nieuw.taakId]);
      const uniekTaakId = () => { let id=nieuwTaakId();
                                  while(gebruikteIds.has(id)) id=nieuwTaakId();
                                  gebruikteIds.add(id); return id; };
      const rijen = [nieuw], blokValues = [addValues];
      extra.forEach(v=>{
        const vals = values.slice();
        vals[0] = v.code;                       // kolom A = VvE-code
        vals[1] = v.naam;                       // kolom B = VvE-naam
        const extraRij = { _sec:sec, _row:rijen[rijen.length-1]._row + 1 };
        keys.forEach((k,j)=>{ extraRij[k]=norm(vals[j]); });
        extraRij.subcategorie = vals[vals.length-1];
        extraRij.taakId = uniekTaakId();
        extraRij.bundelId  = autoVoorleg ? extraRij.taakId : '';   // elk traject zijn eigen bundel
        extraRij.bundelVolg= autoVoorleg ? '0' : '';
        extraRij.aannemers = nieuw.aannemers;   // zelfde aanvraag, zelfde aannemers per VvE
        blokValues.push(toevoegWaarden(vals, extraRij));
        rijen.push(extraRij);
      });
      if(extra.length){
        // De rijen ná het blok schuiven één keer op met het TOTAAL — niet één keer per rij. De
        // eerste rij is hierboven al met +1 verwerkt; hier komt alleen de rest bij.
        _shiftNtdRows(afterRow+1, +extra.length);
        rijen.slice(1).forEach(r=>{ (D.ntd[sec]=D.ntd[sec]||[]).push(r); });
        renderAll();     // pas nu hertekenen, anders flitst de lijst twaalf keer
      }
      const totaal = rijen.length;
      // Idempotent: `backgroundWrite` draait deze functie opnieuw bij een tijdelijke fout (429/5xx),
      // en zonder deze vlag zou één quota-hik het blok twee of drie keer invoegen. Zelfde idioom
      // als de bewerk-tak hierboven.
      // Het invoeg-anker VERS afleiden uit de rij-objecten zelf, niet uit het getal dat bij de klik
      // is uitgerekend. `afterRow` is een los getal en schuift nergens in mee; de rij-objecten
      // staan in D.ntd en worden door élke `_shiftNtdRows` gecorrigeerd — óók door de rollback van
      // een schrijfactie die vóór deze in de wachtrij stond. `backgroundWrite` voert die wachtrij
      // serieel uit, dus tussen de klik en dít moment kan er een invoeging zijn teruggedraaid.
      // Bleef het bevroren getal staan, dan landde de nieuwe rij één plek te laag: bij een sectie
      // die direct tegen de volgende sectiekop aanligt (PROD-koprijen 2/22/42/81/99 sluiten op
      // elkaar aan) belandt hij dan pal ónder die kop, en `parseSections` gooit de eerste regel na
      // een sectiekop altijd weg als kolomkoprij. De taak was daarna nergens meer te zien, mét
      // 'Taak toegevoegd' op het scherm. Zelfde reparatie als bij `doCompleteTask` en
      // `bulkAfronden`, die hun archiefplek al ín de writeFn berekenen.
      // Alleen rijen die er NOG staan tellen mee: is er intussen één afgerond of verwijderd, dan
      // heeft die zijn eigen shift al gedaan en zou zijn oude nummer het anker omlaag trekken.
      const versAnker=()=>{
        // Het VERSE exemplaar pakken dat `rijIndex` aanwijst, en niet het aangeklikte object:
        // sinds die op taaknummer terugvalt slaagt de lidmaatschapstoets óók voor een verouderd
        // object — en juist dát object wordt door `_shiftNtdRows` niet meer meegecorrigeerd, dus
        // zijn `_row` is precies het bevroren getal waar dit anker vanaf wilde.
        const a2=D.ntd[sec]||[];
        const levend=rijen.map(r=>{ const i=rijIndex(a2, r); return i>-1 ? a2[i] : null; }).filter(Boolean);
        return levend.length ? Math.min(...levend.map(r=>r._row))-1 : afterRow;
      };
      // De voorleg-subtaken EERST in de wachtrij — zie maakVoorlegSubtaken over de
      // ankervolgorde (OPPAKKEN ligt boven het offerteblok).
      if(autoVoorleg) maakVoorlegSubtaken(rijen, gebruikteIds);
      let ingevoegd=false;
      backgroundWrite(
        async ()=>{
          if(!ingevoegd){
            await insertAndWriteRows('Nog Te Doen',versAnker(),blokValues);
            ingevoegd=true;
          }
          // Eén push, ook bij twaalf VvE's. Elke taak apart melden zou bij een subsidieronde
          // twaalf pushmeldingen op de telefoon van elke collega opleveren; dat leert mensen de
          // meldingen uit te zetten. Het logboek krijgt wél een regel per taak — dat is een
          // journaal en hoort volledig te zijn.
          fireNotifEvent('newtask',{sec,code,naam,behandelaar:newBeh});
          await logEvents(rijen.map(r=>({ code:r.code, sec, actie:'Aangemaakt', veld:'',
                                          oudeWaarde:'', nieuweWaarde:newBeh||'' })));
          showToast(totaal===1 ? 'Taak toegevoegd' : `${totaal} taken toegevoegd`,
                    totaal===1 ? `${code} — ${naam||''}` : `Dezelfde taak voor ${totaal} VvE's`,
                    null,'plus',{geenDedup:true,geenSysteemmelding:true});
        },
        ()=>{ const a=D.ntd[sec]||[];
              // Tellen wat er ÉCHT nog stond. Onvoorwaardelijk met `totaal` terugschuiven is een
              // regressie ten opzichte van de één-rij-versie: is een van de nieuwe taken intussen
              // afgerond of verwijderd, dan heeft die weg zijn eigen `_shiftNtdRows(-1)` al gedaan
              // en schuift deze rollback één rij te ver. Vanaf dat moment wijst élk rijnummer
              // eronder te laag en schrijft de vólgende actie naar een verkeerde rij — en dáár
              // beschermt de rij-controle niet tegen: die bewaakt overschrijven, niet een
              // verkeerde rij-KEUZE.
              let weg=0;
              // Het anker VÓÓR het verwijderen aflezen: daarna staan de objecten niet meer in D en
              // schuift `_shiftNtdRows` ze ook niet meer mee. Zelfde verse afleiding als in de
              // writeFn hierboven, en om dezelfde reden.
              const ankerNu=versAnker();
              rijen.forEach(r=>{ const p=rijIndex(a, r); if(p>-1){ a.splice(p,1); weg++; } });
              // Eén keer terugschuiven, ná het verwijderen. Per rij schuiven of schuiven vóór het
              // verwijderen laat de rijnummers van de hele sectie scheef achter.
              if(weg) _shiftNtdRows(ankerNu,-weg); },
        'Toevoegen mislukt'
      );
    }
  }catch(e){
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('invalid authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
      state.oauthToken=null;state.oauthExpiry=0;
      alert('Je sessie is verlopen. Klik nogmaals op Opslaan om opnieuw in te loggen.');
    }else{alert('Fout: '+e.message)}
  }finally{
    // Alle vroege returns (dubbelcheck 'nee', een niet-teruggevonden rij, de mismatch-tak) zitten
    // binnen deze try en komen dus vanzelf hierlangs.
    state._submitBezig=false;
  }
}
function gv(id){const el=document.getElementById(id);return el?el.value.trim():''}

// ══════════════════════════════════════

// Fase wegschrijven naar kolom D vanaf een bolletje in de tabelrij.
// Zelfde vorm als _bewaar in offerte-aannemers.js: eerst lokaal muteren zodat het
// scherm meteen klopt, dan pas de Sheet — met assertRowMatch ertussen, zodat we
// nooit een ándere taak overschrijven als er intussen rijen zijn verschoven.
async function zetSubsidieFase(rid, stap){
  const r = taakUitCache(rid);
  if(!r || r._sec !== 'SUBSIDIE-TRAJECTEN') return;
  const nieuw = faseWoord(stap), oud = r.subsidieFase || '';
  if(nieuw === oud) return;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  r.subsidieFase = nieuw;
  renderAll();
  backgroundWrite(
    async ()=>{
      // De snapshot moet de stand VÓÓR de optimistische mutatie zijn — dat is wat
      // er op dit moment nog in de Sheet hoort te staan.
      await assertRowMatch(r._row, {...r, subsidieFase: oud});
      await writeRange(`'Nog Te Doen'!D${r._row}`, [nieuw]);
      const w=faseWijziging(oud, nieuw);
      if(w) await logEvent(r.code, 'SUBSIDIE-TRAJECTEN', 'Fase gewijzigd', 'fase', w.van, w.naar);
      showToast('Fase bijgewerkt', `${r.code} — ${nieuw}`, null, 'opslaan', {geenSysteemmelding:true});
    },
    ()=>{ r.subsidieFase = oud; },
    'Fase opslaan mislukt'
  );
}

export {
  openModal, editRow, closeModal, fillModalFields, setv, clearModal, kiesSectie,
  getSheetIds, _sheetBreedtes, getInsertRow, bevestigInvoegPlek, insertAndWriteRow, insertAndWriteRows, deleteCurrentEditTask, deleteTaskRow,
  _naamBijCode, _zetNaamVeld,
  getAfInsertRow, completeTask, completeCurrentEditTask, doCompleteTask, closeCompleteModal, submitTask, gv,
  OMSCHRIJVING_VELD, zetOmschrijving, taakUitCache,
  _verseRijIdx, _herankerRij, zetSubsidieFase, kiesModalFase, _modalFaseWoord,
  zetDeadlineVoorstel, DEADLINE_VELD, DEADLINE_HINT_VELD, renderExtraVves, toonMeerVve, herzieAlsSubtaak,
  offerteAanvraagGewijzigd,
  _bewerkRijVers,
};
