// ══════════════════════════════════════
//  MINIMUMVERSIE-REM — een te oud tabblad mag niet meer SCHRIJVEN (lezen blijft gewoon werken)
// ══════════════════════════════════════
// WAAROM. Sinds v13.3 komt de eigen code cache-first uit de service worker (sw-strategie.js). Een
// tabblad dat dagen openstaat en niet op de 'nieuwe versie'-balk klikt, draait dus oude code — en
// blijft daarmee naar de Google Sheet schrijven, met de kolomindeling en regels van toen.
//
// HOE. In de root staat `versie.json` met {"minimaal":"X.Y"}. Dat bestand komt NOOIT uit een cache:
// de service worker laat het live door (sw-strategie.js), en we vragen het op met
// cache:'no-store' plus een cache-buster in de query (GitHub Pages geeft max-age=600). Is
// APP_VERSION lager dan `minimaal`, dan gaat `state._versieTeOud` aan: `blokkeerVersie` (data.js,
// via `blokkeerOffline` vóór élke optimistische wijziging) weigert dan elke schrijfactie, en
// `_fetchGeteld` (api.js) weigert als vangnet elk niet-GET-verzoek naar Google.
//
// FAIL-OPEN. Lukt het ophalen niet (offline, 404, kapotte JSON, onzinnige versie), dan wordt er
// NIETS geblokkeerd: deze rem mag het dashboard nooit platleggen. Een eerder vastgestelde 'te oud'
// blijft wél staan — de code van dit tabblad wordt er niet nieuwer van; alleen een geslaagde lezing
// met een lager minimum heft hem op.
//
// WANNEER `minimaal` OPHOGEN: zie README.md. Kort: alleen bij een release die het SCHRIJFGEDRAG of
// de KOLOMINDELING van de Sheet verandert — en dan pas nadat die release live staat.
import { state } from "./state.js";
import { APP_VERSION } from "./config.js";
import { herlaadNaarNieuweVersie } from "./sw-update.js";

// Een geldige versie: getallen gescheiden door punten ('13', '13.4', '13.10.2').
export function isGeldigeVersie(v){
  return typeof v === 'string' && /^\d+(\.\d+)*$/.test(v.trim());
}

// Numeriek per deel vergelijken: '13.10' > '13.9' (als tekst zou '13.10' < '13.9' zijn).
// Ontbrekende delen tellen als 0: '13' === '13.0'. Geeft -1, 0 of 1; null bij een ongeldige versie.
export function vergelijkVersie(a, b){
  if(!isGeldigeVersie(a) || !isGeldigeVersie(b)) return null;
  const pa = a.trim().split('.').map(Number), pb = b.trim().split('.').map(Number);
  for(let i = 0; i < Math.max(pa.length, pb.length); i++){
    const x = pa[i] || 0, y = pb[i] || 0;
    if(x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// Is `app` ouder dan `minimaal`? Alleen bij twee geldige versies kan het antwoord 'ja' zijn
// (fail-open): een onleesbaar minimum blokkeert nooit.
export function versieTeOud(app, minimaal){
  return vergelijkVersie(app, minimaal) === -1;
}

// Haalt `minimaal` op uit versie.json. Geeft de versie-tekst terug, of null bij ELKE fout.
// `haal` is injecteerbaar voor de toetsen (standaard window.fetch).
export async function haalMinimum(haal){
  try{
    const f = haal || ((u, o) => fetch(u, o));
    const url = new URL('versie.json', document.baseURI);
    url.searchParams.set('t', String(Date.now()));          // cache-buster (CDN en HTTP-cache)
    const r = await f(url.href, { cache:'no-store' });
    if(!r || !r.ok) return null;
    const j = await r.json();
    const m = j && typeof j.minimaal === 'string' ? j.minimaal.trim() : null;
    return isGeldigeVersie(m) ? m : null;
  }catch(_){ return null; }
}

// Eén controle. Zet de vlag en toont de balk; geeft de nieuwe stand terug.
// Bij een mislukte lezing blijft de vlag zoals hij was (zie FAIL-OPEN bovenaan).
export async function controleerVersie(deps = {}){
  const app = deps.app || APP_VERSION;
  const min = await haalMinimum(deps.haal);
  if(min === null) return !!state._versieTeOud;
  const teOud = versieTeOud(app, min);
  state._versieTeOud = teOud;
  if(teOud) toonVersieBalk(); else verbergVersieBalk();
  return teOud;
}

const VERSIE_INTERVAL_MS = 5 * 60 * 1000;
let _bewaakt = false;

// Na het inloggen aanroepen (auth.js en het sessieherstel in main.js). Eén keer meteen, daarna
// elke vijf minuten en bij terugkeer naar het tabblad. Meerdere aanroepen zetten maar één timer.
// Niet tijdens de zelftest (die zet de vlag zelf) en niet zonder ingelogde gebruiker.
export function startVersieBewaking(){
  const mag = () => !state._zelftestLoopt && !!state.currentUserEmail;
  const check = () => { if(mag()) controleerVersie().catch(() => {}); };
  check();
  if(_bewaakt) return;
  _bewaakt = true;
  setInterval(check, VERSIE_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) check(); });
}

// De vaste balk: zelfde stijl als de 'nieuwe versie'-balk van sw-update.js, maar zonder kruisje —
// zolang hij geldt, kan er niets opgeslagen worden, en dat moet zichtbaar blijven.
// Hij vervangt de gewone update-balk (die zegt hetzelfde met minder nadruk).
export function toonVersieBalk(){
  if(document.getElementById('versie-rem-bar')) return;
  document.getElementById('sw-update-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'versie-rem-bar';
  bar.className = 'sw-update-bar versie-rem-bar';
  bar.setAttribute('role', 'alert');
  bar.innerHTML =
    '<span class="sw-update-txt">Er is een nieuwe versie van het dashboard. Herlaad om weer te kunnen opslaan.</span>'
    + '<button type="button" class="sw-update-btn" id="versie-rem-herlaad">Herladen</button>';
  document.body.appendChild(bar);
  const knop = bar.querySelector('#versie-rem-herlaad');
  knop.addEventListener('click', () => {
    knop.disabled = true;
    knop.textContent = 'Bezig…';
    // Komt het herladen niet door (bijv. een lopende schrijfactie), dan de knop na 35 s weer aanbieden.
    setTimeout(() => { if(document.body.contains(knop)){ knop.disabled = false; knop.textContent = 'Herladen'; } }, 35_000);
    herlaadNaarNieuweVersie();
  });
}
export function verbergVersieBalk(){ document.getElementById('versie-rem-bar')?.remove(); }
