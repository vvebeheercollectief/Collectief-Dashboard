// ══════════════════════════════════════
//  MEER VvE's — dezelfde taak in één keer voor meerdere VvE's aanmaken
// ══════════════════════════════════════
//
// WAAROM DIT BESTAAT. Een subsidieronde voor twaalf VvE's klaarzetten was twaalf keer hetzelfde
// intypen. Dat kost niet alleen tijd: de omschrijvingen wijken telkens nét iets af ("aanvraag
// indienen", "aanvraag verzenden", "indienen aanvraag"), en dan is er later niet meer op te zoeken
// en tellen ze in geen enkel overzicht als één actie.
//
// WAT HET WEL EN NIET DOET. Het maakt N ZELFSTANDIGE taken, één per VvE, met exact dezelfde tekst.
// Het maakt géén bundel: een bundel is bedoeld voor subtaken van één stuk werk bij één VvE, en
// twaalf VvE's zijn twaalf losse dossiers die ieder hun eigen gang gaan. Ze zijn na het aanmaken
// dus ook los te bewerken, af te ronden en weg te leggen.
//
// De lijst leeft in dit bestandje en niet in `state`, om dezelfde reden als `_sel` in bulk.js:
// er is precies één scherm dat hem vult en één dat hem leest, en zo kan er geen tweede plek
// ontstaan die hem stilletjes ook aanpast.
import { esc } from "./util.js";
import { ico } from "./icons.js";

let _extra = [];   // [{code, naam}], zonder dubbelen, in de volgorde van kiezen

function extraVves(){ return _extra.slice(); }
function wisExtraVves(){ _extra = []; }

// Toevoegen is idempotent op code: twee keer dezelfde VvE kiezen mag geen twee taken opleveren.
// Geeft terug of er echt iets bij kwam, zodat de aanroeper weet of hij moet hertekenen.
function voegExtraVveToe(code, naam, hoofdCode){
  const c = String(code == null ? '' : code).trim();
  if(!c) return false;
  // De VvE die al bovenaan in het scherm staat hoort er niet nóg een keer bij: dat zou twee
  // identieke taken voor dezelfde VvE opleveren — precies het dubbele werk dat de dubbelcheck
  // verderop probeert te voorkomen.
  if(c === String(hoofdCode == null ? '' : hoofdCode).trim()) return false;
  if(_extra.some(v => v.code === c)) return false;
  _extra.push({ code:c, naam:String(naam == null ? '' : naam).trim() });
  return true;
}

function verwijderExtraVve(code){
  const voor = _extra.length;
  _extra = _extra.filter(v => v.code !== String(code));
  return _extra.length !== voor;
}

// De gekozen VvE's als klikbare merkjes. Puur, zodat de opmaak los te toetsen is.
function extraVvesHtml(lijst){
  const rijen = (lijst || []).map(v =>
    `<span class="mv-chip">${esc(v.code)}${v.naam ? ` <span class="mv-naam">${esc(v.naam)}</span>` : ''}`
    + `<button type="button" class="mv-x" data-action="extra-vve-weg" data-code="${esc(v.code)}" `
    + `title="${esc(v.code)} weghalen" aria-label="${esc(v.code)} weghalen">${ico('kruis',11)}</button></span>`).join('');
  return rijen;
}

// Het regeltje dat vertelt wat er straks gebeurt. Zonder deze zin is 'er staan drie merkjes' niet
// hetzelfde als 'ik maak straks vier taken aan', en juist dát verschil (de hoofd-VvE telt mee)
// leidt tot verrassingen.
function extraVvesUitleg(aantal){
  if(!aantal) return '';
  const totaal = aantal + 1;
  return `Deze taak wordt ${totaal} keer aangemaakt — één per VvE. Ze staan daarna los van elkaar.`;
}

export { extraVves, wisExtraVves, voegExtraVveToe, verwijderExtraVve, extraVvesHtml, extraVvesUitleg };
