// ══════════════════════════════════════
//  ALV-RESET — een nieuwe vergaderronde starten
//  Archiveert het tabblad "ALV's overzicht" en wist daarna de vier vinkjes
//  (C=Uitnodiging, D=Notulen, E=Begroting, G=Klaargezet).
//  Het papieren ritueel — elk jaar een nieuwe lijst uitprinten — als knop.
// ══════════════════════════════════════
import { D } from "./state.js";

// Welke rijen mag de reset raken? Onderaan het tabblad staan samenvattingsregels
// ('Totaal …', 'Uitnodigingen …') die parseAlvo overslaat; die mogen niet gewist worden.
// Daarom rekenen we het bereik uit de geparseerde VvE-rijen, nooit uit de laatste rij.
function _resetBereik(alvo){
  if(!alvo||!alvo.length) return {start:0,eind:0,aaneengesloten:false,aantal:0};
  const rijen=alvo.map(r=>r._row).sort((a,b)=>a-b);
  const start=rijen[0], eind=rijen[rijen.length-1];
  return {start,eind,aaneengesloten:(eind-start+1)===rijen.length,aantal:rijen.length};
}

// Wijkt uit naar '(2)', '(3)', … als er in hetzelfde jaar al een archief staat.
function _archiefNaam(jaar,bestaandeNamen){
  const basis=`ALV-archief ${jaar}`;
  if(!bestaandeNamen.includes(basis)) return basis;
  let n=2;
  while(bestaandeNamen.includes(`${basis} (${n})`)) n++;
  return `${basis} (${n})`;
}

function openResetModal(){
  const b=_resetBereik(D.alvo||[]);
  if(!b.aantal){ alert('Er staan geen VvE-rijen in het overzicht om te resetten.'); return; }
  document.getElementById('alvoreset-tekst').textContent =
    `Alle vier de vinkjes gaan uit bij ${b.aantal} ${b.aantal===1?'VvE':"VvE's"}. `+
    `Elke VvE staat daarna weer op Open. De huidige ronde wordt eerst weggeschreven naar een `+
    `archieftabblad, dus er gaat niets verloren.`;
  document.getElementById('alvoreset-bg').classList.add('open');
}
function closeResetModal(){
  document.getElementById('alvoreset-bg').classList.remove('open');
}

export { _resetBereik, _archiefNaam, openResetModal, closeResetModal };
