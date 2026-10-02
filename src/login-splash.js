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

// De letters van het inlogscherm, pas als dat scherm ook echt in beeld komt. Stond als
// <link rel="stylesheet"> in index.html, en een stylesheet in de kop houdt het uitvoeren van de
// modules op tot hij binnen is — ook voor een ingelogde terugkeerder die het inlogscherm nooit
// ziet (meting 2026-10-02). Eén keer; daarna staat hij er gewoon. Via JS en niet met de
// media="print"-onload-truc: die heeft een inline handler nodig, en de CSP staat dat niet toe.
// Tot het bestand er is staat het inlogscherm in de terugvalletter (system-ui / monospace).
export const LOGIN_LETTERS_URL = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
export function laadLoginLetters(){
  if(document.getElementById('login-letters')) return;
  const l = document.createElement('link');
  l.id = 'login-letters';
  l.rel = 'stylesheet';
  l.href = LOGIN_LETTERS_URL;
  document.head.appendChild(l);
}

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
  laadLoginLetters();
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
  laadLoginLetters();
  if(state._splashTimer){ clearTimeout(state._splashTimer); state._splashTimer = null; }
  _setFase(gate, 'ready');
}
