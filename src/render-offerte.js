// ══════════════════════════════════════
//  RENDER-OFFERTE — aannemerslijst per traject (kolom P)
//  Het Vandaag-paneel, de 'Nu dit'-kaart en de Nu-opvolgen-groepen zijn eruit gehaald
//  (v6.2): de offerte-tab is weer een platte tabel zoals Oppakken/LOD. Wat rest is de
//  aannemerslijst achter de X/N-teller — de enige offerte-specifieke UI die overblijft.
// ══════════════════════════════════════
import { esc, parseAannemers, reconcileOffertes, aannSleutel } from "./util.js";
import { state } from "./state.js";
import { ico } from "./icons.js";

// Klikbare samenvatting die het aannemers-paneel open/dicht klapt (staat in de teller-cel).
function offerteAannSamenvatting(r){
  const lijst=r._aannemers||[];
  // data-aann draagt de TRAJECT-sleutel, niet de VvE-code (zie aannSleutel in util.js). Een
  // eigen attribuutnaam, want data-code betekent elders in de app 'open het VvE-dossier'.
  const sl=aannSleutel(r);
  const open=state.offerteAannOpen.has(sl);
  const lbl=lijst.length
    ? `Aannemers · ${lijst.filter(a=>a.binnen).length} van ${lijst.length} binnen`
    : 'Aannemers toevoegen';
  // tabindex + role: dit is een echte bediening (het paneel eronder open/dicht) en was met alleen
  // een <span> uitsluitend met de muis te bereiken. Eén tabstop per offerte-rij; de Enter/spatie-
  // afhandeling zit centraal in actions.js. Geen <button>: deze span staat in een cel naast andere
  // tekst en een knop zou daar zijn eigen opmaak meebrengen.
  //
  // De tekst zit in een eigen `.of-aann-lbl` en de span is een flexrij die de VOLLE cel vult
  // (zie styles.css). Daarvoor was de span precies zo breed als zijn tekst en 16px hoog in een rij
  // van 47: klikte je een paar pixels ernaast, dan gebeurde er niets - de wikkel eromheen staat in
  // de uitzonderingslijst van de rij-uitklapper (main.js) en heeft zelf geen actie. Het paneel
  // leek daardoor niet in te klappen. Het label kapt nu ook netjes af in plaats van uit de wikkel
  // te lopen; die had `overflow:hidden`, dus bij een smalle kolom werd de klikzone nog kleiner.
  return `<span class="of-aann-tog" role="button" tabindex="0" aria-expanded="${open}" data-action="offerte-aann-open" data-aann="${esc(sl)}" title="${open?'Aannemerslijst inklappen':'Aannemerslijst uitklappen'}">${open?ico('chevronOnder',12):ico('chevronRechts',12)}<span class="of-aann-lbl">${lbl}</span></span>`;
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
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" data-aann="${sl}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button class="of-aann-toevoeg" data-action="offerte-aann-add" data-aann="${sl}">+ Toevoegen</button>
      <button type="button" class="of-aann-dicht" data-action="offerte-aann-open" data-aann="${sl}" title="Aannemerslijst inklappen">${ico('chevronBoven',12)}Inklappen</button>
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
  // Handmatige D-waarde = ondergrens, aannemer-vinkjes kunnen 'm alleen ophogen (reconcileOffertes).
  // Voorheen overschreef de aannemerslijst de D-waarde blind → een handmatig "1/3" werd "0/3".
  r.offertes=reconcileOffertes(r._offertesManual, r._aannemers);
  return r;
}

export { offerteAannSamenvatting, offerteAannemerPaneel, herstelAannemerFocus, _verrijkOfferteRij };
