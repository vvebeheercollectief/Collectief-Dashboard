// ══════════════════════════════════════
//  RENDER-OFFERTE — aannemerslijst per traject (kolom P)
//  Het Vandaag-paneel, de 'Nu dit'-kaart en de Nu-opvolgen-groepen zijn eruit gehaald
//  (v6.2): de offerte-tab is weer een platte tabel zoals Oppakken/LOD. Wat rest is de
//  aannemerslijst achter de X/N-teller — de enige offerte-specifieke UI die overblijft.
// ══════════════════════════════════════
import { esc, parseAannemers, reconcileOffertes } from "./util.js";
import { state } from "./state.js";

// Klikbare samenvatting die het aannemers-paneel open/dicht klapt (staat in de teller-cel).
function offerteAannSamenvatting(r){
  const lijst=r._aannemers||[];
  const open=state.offerteAannOpen.has(r.code);
  const lbl=lijst.length
    ? `Aannemers · ${lijst.filter(a=>a.binnen).length} van ${lijst.length} binnen`
    : 'Aannemers toevoegen';
  return `<span class="of-aann-tog" data-action="offerte-aann-open" data-code="${esc(r.code)}">${open?'▾':'▸'} ${lbl}</span>`;
}

// Uitklapbaar aannemers-lijstje voor één traject (gemount als extra <tr> onder de rij).
function offerteAannemerPaneel(r){
  const code=esc(r.code);
  const rijen=(r._aannemers||[]).map((a,i)=>`<div class="of-aann-rij">
      <span class="of-aann-naam">${esc(a.naam)}</span>
      <button class="of-aann-st ${a.binnen?'in':''}" data-action="offerte-aann-binnen" data-code="${code}" data-idx="${i}">${a.binnen?'✓ binnen':'nog niet'}</button>
      <button class="of-aann-x" data-action="offerte-aann-verwijder" data-code="${code}" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
    </div>`).join('');
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" data-code="${code}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button class="of-aann-toevoeg" data-action="offerte-aann-add" data-code="${code}">+ Toevoegen</button>
    </div>
  </div>`;
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

export { offerteAannSamenvatting, offerteAannemerPaneel, _verrijkOfferteRij };
