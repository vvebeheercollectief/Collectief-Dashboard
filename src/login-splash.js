// ══════════════════════════════════════
//  LOGIN-SPLASH — fase-overgang van het beginscherm
// ══════════════════════════════════════
// Twee fasen op #login-gate: een gebrande launch-splash die na SPLASH_MS
// automatisch overgaat in de login-kaart. Een klik op de splash slaat over.
// startSplash() wordt door main.js ALLEEN aangeroepen als inloggen nodig is
// (geen geldige sessie), zodat een ingelogde terugkeerder nooit een
// splash-flits ziet. toonKaart() toont de kaart meteen (bij uitloggen /
// sessie verlopen — geen splash-herhaling).
import { state } from "./state.js";

export const SPLASH_MS = 1900;   // handoff-timing: splash → kaart

// Zet de zichtbare fase op de gate. Pure DOM-helper → los testbaar.
export function _setFase(gate, fase){
  if(!gate) return;
  gate.classList.toggle('is-splash', fase === 'splash');
  gate.classList.toggle('is-ready',  fase === 'ready');
}

// Start de gebrande splash en plan de overgang naar de login-kaart.
export function startSplash(){
  const gate = document.getElementById('login-gate');
  if(!gate) return;
  _setFase(gate, 'splash');

  let klaar = false;                       // één-malig: timer én klik mogen niet dubbel schakelen
  const naarKaart = () => {
    if(klaar) return; klaar = true;
    if(state._splashTimer){ clearTimeout(state._splashTimer); state._splashTimer = null; }
    _setFase(gate, 'ready');
    const sp = gate.querySelector('.lg-splash');
    if(sp) sp.removeEventListener('click', naarKaart);
  };

  const sp = gate.querySelector('.lg-splash');
  if(sp) sp.addEventListener('click', naarKaart);   // klik op de splash = overslaan
  state._splashTimer = setTimeout(naarKaart, SPLASH_MS);
}

// Toon direct de login-kaart (geen splash). Bij heropenen van de gate na
// uitloggen of een verlopen sessie: een splash-herhaling zou daar storen.
export function toonKaart(){
  const gate = document.getElementById('login-gate');
  if(!gate) return;
  if(state._splashTimer){ clearTimeout(state._splashTimer); state._splashTimer = null; }
  _setFase(gate, 'ready');
}
