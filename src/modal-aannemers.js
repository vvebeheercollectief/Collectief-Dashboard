// ══════════════════════════════════════
//  MODAL-AANNEMERS — de aannemerslijst in het aanmaak-/bewerkscherm (v12.5)
//  Werkkopie-principe: het scherm muteert alleen deze kopie; pas bij Opslaan schrijft
//  submitTask hem weg (nieuwe rij: kolom P in de A..S-write; bewerken: aparte P-write via
//  schrijfAannemers in offerte-aannemers.js). Annuleren gooit de kopie weg (clearModal).
//  Bewust géén hernoemen hier: dat kan in het tabelpaneel, en de modal blijft zo een lijst
//  die je in één oogopslag leest.
// ══════════════════════════════════════
import { esc, parseAannemers, serializeAannemers } from "./util.js";

let _lijst = [];   // werkkopie: [{naam, binnen}]

// Vul de werkkopie uit de rauwe kolom-P-cel en teken de lijst. '' = leeg beginnen.
function zetModalAannemers(cel){
  _lijst = parseAannemers(cel);
  _renderModalAann();
}
// De werkkopie terug als kolom-P-celtekst (voor Opslaan en voor de wijzigings-check).
function modalAannemersCel(){ return serializeAannemers(_lijst); }

function _renderModalAann(){
  const host = document.getElementById('m-aann');
  if(!host) return;
  const rijen = _lijst.map((a,i)=>`<div class="of-aann-rij">
      <span class="m-aann-naam" title="${esc(a.naam)}">${esc(a.naam)}</span>
      <button type="button" class="of-aann-st ${a.binnen?'in':''}" data-action="maann-binnen" data-idx="${i}">${a.binnen?'✓ binnen':'nog niet'}</button>
      <button type="button" class="of-aann-x" data-action="maann-weg" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
    </div>`).join('');
  const teller = _lijst.length
    ? `<div class="m-aann-teller">${_lijst.filter(a=>a.binnen).length} van ${_lijst.length} binnen</div>` : '';
  host.innerHTML = `${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" id="m-aann-input" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button type="button" class="of-aann-toevoeg" data-action="maann-add">+ Toevoegen</button>
    </div>${teller}`;
}

// Mutaties — puur lokaal, geen schrijfactie. Zelfde wasstraat als offerte-aannemers.js:
// '|' en regelovergangen zijn de scheidingstekens van kolom P en mogen geen naam in.
function modalAannemerAdd(naam){
  naam = ((naam||'')+'').replace(/[|\n]/g,' ').trim();
  if(!naam) return;
  if(_lijst.some(a=>a.naam.toLowerCase()===naam.toLowerCase())) return; // dubbel: niets doen
  _lijst.push({naam, binnen:false});
  _renderModalAann();
  // Focus terug in het (net herbouwde) invoerveld: meerdere namen achter elkaar intypen.
  const inp=document.getElementById('m-aann-input'); if(inp) inp.focus();
}
function modalAannemerBinnen(idx){ if(_lijst[idx]){ _lijst[idx].binnen=!_lijst[idx].binnen; _renderModalAann(); } }
function modalAannemerWeg(idx){ if(_lijst[idx]){ _lijst.splice(idx,1); _renderModalAann(); } }

export { zetModalAannemers, modalAannemersCel, modalAannemerAdd, modalAannemerBinnen, modalAannemerWeg };
