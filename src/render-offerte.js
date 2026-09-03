// ══════════════════════════════════════
//  RENDER-OFFERTE — aannemerslijst per traject (kolom P)
//  Het Vandaag-paneel, de 'Nu dit'-kaart en de Nu-opvolgen-groepen zijn eruit gehaald
//  (v6.2): de offerte-tab is weer een platte tabel zoals Oppakken/LOD. Wat rest is de
//  aannemerslijst achter de X/N-teller — de enige offerte-specifieke UI die overblijft.
// ══════════════════════════════════════
import { esc, parseAannemers, reconcileOffertes, aannSleutel, offerteAangevraagd, offProg } from "./util.js";
import { state } from "./state.js";
import { ico } from "./icons.js";

// De klikbare cel van een offerte-traject: chevron + teller + balkje, alles ÍN de knop.
//
// HET ZICHTBARE LABEL IS ERUIT (v12.8, op verzoek). Bij een gevulde lijst zei 'Aannemers · 1 van
// 2 binnen' letterlijk hetzelfde als de teller ernaast, en bij een lege lijst kostte de zin
// 'Aannemers toevoegen' ruimte op élke rij, altijd. De volle zin blijft in `aria-label` en
// `title`.
//
// LET OP — DE KLIKZONE. Alléén de tekst weghalen zou een knop van een paar pixels overhouden:
// `.of-aann-tbl-tog` is `flex:1` en dus precies wat er ná de teller overblijft. Daarom omvat de
// knop nu de HELE celinhoud. Dat is geen achteruitgang maar een verbetering op v11.3, die de
// klikzone van 46% naar 100% van de RESTruimte bracht; nu is het 100% van de cel.
//
// Bewust nog steeds géén <button>: deze span staat in een tabelcel en een knop zou daar zijn
// eigen opmaak meebrengen. De Enter/spatie-afhandeling zit centraal in actions.js.
function offerteAannSamenvatting(r){
  const lijst=r._aannemers||[];
  // data-aann draagt de TRAJECT-sleutel, niet de VvE-code (zie aannSleutel in util.js). Een
  // eigen attribuutnaam, want data-code betekent elders in de app 'open het VvE-dossier'.
  const sl=aannSleutel(r);
  const open=state.offerteAannOpen.has(sl);
  const zin=lijst.length
    ? `Aannemers · ${lijst.filter(a=>a.binnen).length} van ${lijst.length} binnen`
    : 'Aannemers toevoegen';
  // `offProg('')` geeft een lege string terug (util.js): een traject zónder aannemerslijst én
  // zónder waarde in kolom D zou dan uit één chevron van 12px bestaan. Vandaar de plaatshouder.
  const teller=offProg(r.offertes)||'<span class="of-aann-leeg">–</span>';
  return `<span class="of-aann-tog" role="button" tabindex="0" aria-expanded="${open}" data-action="offerte-aann-open" data-aann="${esc(sl)}" aria-label="${esc(zin)} — klik om de lijst te ${open?'sluiten':'openen'}" title="${esc(zin)}">${open?ico('chevronOnder',12):ico('chevronRechts',12)}${teller}</span>`;
}

// Staat de naam op regel `i` van dit traject op dit moment in de bewerkstand?
// Eén plek die die vraag beantwoordt, zodat de render en het focusherstel niet uit elkaar lopen.
function _inBewerking(sl, i){
  const e=state.offerteAannEdit;
  return !!(e && e.sleutel===sl && e.idx===i);
}

// Uitklapbaar aannemers-lijstje voor één traject (gemount als extra <tr> onder de rij).
function offerteAannemerPaneel(r){
  // Twee vormen van dezelfde sleutel: `sl` gaat de HTML in, `slRuw` is waarmee vergeleken wordt.
  // De browser geeft `dataset.aann` gedecodeerd terug, dus een sleutel met een &, < of " zou als
  // geëscapete tekst nooit gelijk zijn aan wat er uit de DOM komt.
  const slRuw=aannSleutel(r);
  const sl=esc(slRuw);
  const rijen=(r._aannemers||[]).map((a,i)=>{
    // De naam is een KNOP die bij een klik plaatsmaakt voor een invoerveld. Bewust geen potlood
    // ernaast: dat is een vierde bediening op een regel die er al drie heeft, en een naam die je
    // alleen via een apart knopje kunt herstellen leest als 'vaststaand'. En bewust geen
    // altijd-zichtbaar invoerveld: dan wordt de regel een formulier en zie je niet meer in één
    // oogopslag wie er in de lijst staat.
    const naamHtml = _inBewerking(slRuw, i)
      ? `<input class="of-aann-naam-inp" data-aann="${sl}" data-idx="${i}" value="${esc(state.offerteAannEditVal)}" autocomplete="off" aria-label="Naam van de aannemer">`
      // De volledige naam blijft in de title staan: hij kapt in de regel af met een …, en dat
      // zweeftekstje was de enige plek waar je 'm helemaal kon lezen. De uitleg staat erachter.
      : `<button type="button" class="of-aann-naam" data-action="offerte-aann-hernoem" data-aann="${sl}" data-idx="${i}" title="${esc(a.naam)} — klik om aan te passen">${esc(a.naam)}</button>`;
    return `<div class="of-aann-rij">
      ${naamHtml}
      <button class="of-aann-st ${a.binnen?'in':''}" data-action="offerte-aann-binnen" data-aann="${sl}" data-idx="${i}">${a.binnen?'✓ binnen':'nog niet'}</button>
      <button class="of-aann-x" data-action="offerte-aann-verwijder" data-aann="${sl}" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
    </div>`;
  }).join('');
  // De inklap-knop staat in de toevoeg-regel en niet op een eigen kopbalk: het paneel neemt al
  // ruimte in het overzicht in, en een kopregel erbij zou dat probleem groter maken in plaats van
  // kleiner. Dezelfde actie en dezelfde sleutel als de samenvatting in de rij, dus open en dicht
  // lopen langs precies één weg.
  //
  // 'Opgevolgd · +2 wk' alleen bij een AANGEVRAAGD traject: pas dan draagt kolom F een
  // opvolgdatum (zie offerteAangevraagd in util.js) die je 2 weken verder kunt zetten.
  const opvolgKnop = offerteAangevraagd(r)
    ? `<button type="button" class="of-aann-opvolg" data-action="offerte-opgevolgd" data-aann="${sl}" title="Herinnering gestuurd — zet de opvolgdatum 2 weken verder">Opgevolgd · +2 wk</button>`
    : '';
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" data-aann="${sl}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button class="of-aann-toevoeg" data-action="offerte-aann-add" data-aann="${sl}">+ Toevoegen</button>
      ${opvolgKnop}<button type="button" class="of-aann-dicht" data-action="offerte-aann-open" data-aann="${sl}" title="Aannemerslijst inklappen">${ico('chevronBoven',12)}Inklappen</button>
    </div>
  </div>`;
}

// Zet de cursor terug in het naam-veld ná een hertekening. renderNtd vervangt de hele tabel zodra
// er verse data binnenkomt, en dan is het veld dat de gebruiker net aan het typen was een ANDER
// element geworden. Zonder dit sprong de cursor eruit; mét dit merkt de gebruiker er niets van, en
// de blur-afhandeling in actions.js herkent aan de teruggekeerde focus dat het om een hertekening
// ging en niet om wegklikken.
function herstelAannemerFocus(){
  const e=state.offerteAannEdit; if(!e) return;
  const inp=document.querySelector(
    `.of-aann-naam-inp[data-aann="${CSS.escape(e.sleutel)}"][data-idx="${e.idx}"]`);
  if(!inp || document.activeElement===inp) return;
  inp.focus();
  // Cursor achteraan: bij het openen is dat de plek waar je verder wilt typen, en na een
  // hertekening halverwege het typen is het de minst storende plek om weer uit te komen.
  const n=inp.value.length; try{ inp.setSelectionRange(n,n); }catch(_){}
}

// Zet de aannemerslijst (kolom P) op de rij en laat die de X/N-teller bijstellen.
// Moet vóór elke render van de offerte-tab draaien, anders blijft het paneel leeg en
// valt de teller terug op de rauwe kolom D.
function _verrijkOfferteRij(r){
  // Leg de echte D-waarde éénmalig vast, override alleen in het geheugen wanneer er
  // aannemers zijn. Kolom D in de Sheet blijft ongewijzigd.
  if(r._offertesManual===undefined) r._offertesManual=r.offertes;
  r._aannemers=parseAannemers(r.aannemers);
  // Sinds v12.5: staat er een aannemerslijst, dan ís die de teller (reconcileOffertes) — de
  // handmatige D-waarde blijft alleen staan voor rijen ZONDER lijst (van vóór de aannemerslijst).
  r.offertes=reconcileOffertes(r._offertesManual, r._aannemers);
  return r;
}

export { offerteAannSamenvatting, offerteAannemerPaneel, herstelAannemerFocus, _verrijkOfferteRij };
