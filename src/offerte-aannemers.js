// ══════════════════════════════════════
//  OFFERTE-AANNEMERS — per-traject aannemerslijst (kolom P 'Nog Te Doen')
//  Bron van waarheid = de rauwe kolom-P-string r.aannemers; de render-verrijking
//  leidt daaruit r._aannemers én de "X/N binnen"-teller (r.offertes) af.
//  Optimistisch schrijven met rollback (backgroundWrite).
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { parseAannemers, serializeAannemers, aannSleutel } from "./util.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { renderNtd } from "./render-lijsten.js";
import { herstelAannemerFocus } from "./render-offerte.js";

// Zoek het traject op zijn eigen sleutel (vast taaknummer, zie aannSleutel) en NIET op de
// VvE-code: een VvE kan meerdere offerte-trajecten tegelijk hebben, en .find op de code pakte
// dan altijd het eerste — ook als de gebruiker bij het tweede stond. assertRowMatch merkte dat
// niet, want die controleert de rij die hier gekozen is.
function _vindRij(sleutel){
  return (D.ntd['OFFERTE-TRAJECTEN']||[]).find(r=>aannSleutel(r)===sleutel) || null;
}

// Render direct (optimistisch) en schrijf de al-gemuteerde r.aannemers weg naar kolom P.
// backgroundWrite rolt terug + her-rendert bij falen (zie data.js).
async function _bewaar(r, vorige){
  renderNtd();
  if(!r._row) return; // zonder rijnummer geen schrijfdoel (zeldzaam) — alleen lokaal
  if(!await ensureToken()){ r.aannemers=vorige; renderNtd(); return; }
  let gedaan=false;
  backgroundWrite(
    async()=>{ if(!gedaan){ await assertRowMatch(r._row, r); await writeRange(`'Nog Te Doen'!P${r._row}`,[r.aannemers]); gedaan=true; } },
    ()=>{ r.aannemers=vorige; },
    'Aannemers opslaan'
  );
}

// Elke andere handeling op de lijst maakt eerst een openstaande naamwijziging af. Twee redenen,
// en de tweede is de zwaarste:
//   1. Wat je hebt getypt raak je niet kwijt doordat je iets anders aanklikt.
//   2. `state.offerteAannEdit` bewaart een INDEX in de lijst. Verwijder je een regel terwijl er
//      nog een wijziging openstaat, dan schuift die index op en zou de blur-afhandeling daarna de
//      VERKEERDE regel hernoemen — bij [A,B,C] met een wijziging op B en een kruisje op B werd C
//      stil hernoemd. Door hier af te ronden staat de stand altijd op null vóór de lijst verschuift.
// Bewust géén poging om de index mee te verschuiven: 'af is af' heeft één uitkomst, meeschuiven
// heeft er per handeling weer een andere.
function _rondNaamwijzigingAf(){
  if(state.offerteAannEdit) stopHernoem(true);
}

// De offline-poort staat in deze drie aanroepers en niet in _bewaar: daar is r.aannemers al
// gemuteerd en de lijst al opnieuw getekend, dus dan was de wijziging op het scherm al gebeurd.
function addAannemer(sleutel, naam){
  _rondNaamwijzigingAf();
  const r=_vindRij(sleutel); if(!r) return;
  naam=((naam||'')+'').replace(/[|\n]/g,' ').trim();
  if(!naam) return;
  if(blokkeerOffline()) return;
  const lijst=parseAannemers(r.aannemers);
  if(lijst.some(a=>a.naam.toLowerCase()===naam.toLowerCase())) return; // dubbel: niets doen
  const vorige=r.aannemers;
  lijst.push({naam, binnen:false});
  r.aannemers=serializeAannemers(lijst);
  state.offerteAannOpen.add(sleutel); // paneel open houden
  _bewaar(r, vorige);
}

function toggleAannemerBinnen(sleutel, idx){
  _rondNaamwijzigingAf();
  const r=_vindRij(sleutel); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  if(blokkeerOffline()) return;
  const vorige=r.aannemers;
  lijst[idx].binnen=!lijst[idx].binnen;
  r.aannemers=serializeAannemers(lijst);
  _bewaar(r, vorige);
}

// Naam van een bestaande aannemer wijzigen. Zelfde poort en zelfde schrijfweg als toevoegen:
// de hele lijst gaat als één kolom-P-tekst terug naar de Sheet.
function hernoemAannemer(sleutel, idx, naam){
  const r=_vindRij(sleutel); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  // Dezelfde schoonmaak als bij toevoegen: '|' en regelovergangen zijn de scheidingstekens van
  // kolom P, dus die mogen niet in een naam terechtkomen — één geplakte regelovergang zou van
  // één aannemer er stil twee maken.
  naam=((naam||'')+'').replace(/[|\n]/g,' ').trim();
  // Leeg laten staan is geen hernoeming maar een verwijdering, en daar is het kruisje voor. Zo kan
  // een per ongeluk leeggemaakt veld (of een Enter op een leeg veld) nooit een regel wissen.
  if(!naam) return;
  if(naam===lijst[idx].naam) return;                       // niets veranderd: geen schrijfactie
  // Dubbel: net als bij toevoegen niets doen. De oude naam blijft dan staan.
  if(lijst.some((a,i)=>i!==idx && a.naam.toLowerCase()===naam.toLowerCase())) return;
  if(blokkeerOffline()) return;
  const vorige=r.aannemers;
  lijst[idx].naam=naam;
  r.aannemers=serializeAannemers(lijst);
  state.offerteAannOpen.add(sleutel); // paneel open houden
  _bewaar(r, vorige);
}

// ── Bewerkstand van één naam ───────────────────────────────────────────────
// Welke naam er open staat, staat op `state` en niet in de DOM (zie state.js). Deze twee functies
// zijn de enige plek waar die stand aan- en uitgaat, zodat 'wat staat er open' en 'wat wordt er
// opgeslagen' niet uit elkaar kunnen lopen.
function startHernoem(sleutel, idx){
  // Stond er al een andere naam open, dan die eerst afmaken. Zonder dit raakte je bij het direct
  // doorklikken naar een tweede naam de eerste wijziging stil kwijt: de blur-afhandeling ziet dan
  // een naam-veld met de focus en houdt dat voor een hertekening.
  _rondNaamwijzigingAf();
  const r=_vindRij(sleutel); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  state.offerteAannEdit={sleutel, idx};
  state.offerteAannEditVal=lijst[idx].naam;
  state.offerteAannOpen.add(sleutel);
  renderNtd();
  herstelAannemerFocus();
}

function stopHernoem(bewaren){
  const e=state.offerteAannEdit; if(!e) return;
  const val=state.offerteAannEditVal;
  // Stand EERST wissen, dan pas schrijven: `hernoemAannemer` tekent via `_bewaar` opnieuw, en dat
  // moet de knop terugzetten in plaats van het invoerveld nog eens.
  state.offerteAannEdit=null; state.offerteAannEditVal='';
  if(bewaren) hernoemAannemer(e.sleutel, e.idx, val);
  renderNtd();
}

function verwijderAannemer(sleutel, idx){
  _rondNaamwijzigingAf();
  const r=_vindRij(sleutel); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  if(blokkeerOffline()) return;
  const vorige=r.aannemers;
  lijst.splice(idx,1);
  r.aannemers=serializeAannemers(lijst);
  _bewaar(r, vorige);
}

export { addAannemer, toggleAannemerBinnen, verwijderAannemer,
         hernoemAannemer, startHernoem, stopHernoem };
