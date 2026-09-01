// ══════════════════════════════════════
//  OFFERTE-AANNEMERS — per-traject aannemerslijst (kolom P 'Nog Te Doen')
//  Bron van waarheid = de rauwe kolom-P-string r.aannemers; de render-verrijking
//  leidt daaruit r._aannemers én de "X/N binnen"-teller (r.offertes) af.
//  Optimistisch schrijven met rollback (backgroundWrite).
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { parseAannemers, serializeAannemers, aannSleutel, toDutchDate, taakTitel } from "./util.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { showToast, showUndoToast } from "./notifications.js";
import { renderNtd } from "./render-lijsten.js";
import { herstelAannemerFocus } from "./render-offerte.js";
import { verseRij } from "./rij.js";
// (kringverwijzing offerte-aannemers ⇄ render-overig, via crud: logEvent wordt pas op runtime
//  aangeroepen — live binding, veilig; zelfde patroon als data ⇄ main in data.js)
import { logEvent } from "./render-overig.js";

// Zoek het traject op zijn eigen sleutel (vast taaknummer, zie aannSleutel) en NIET op de
// VvE-code: een VvE kan meerdere offerte-trajecten tegelijk hebben, en .find op de code pakte
// dan altijd het eerste — ook als de gebruiker bij het tweede stond. assertRowMatch merkte dat
// niet, want die controleert de rij die hier gekozen is.
function _vindRij(sleutel){
  // Weigeren bij DUBBELZINNIGHEID in plaats van blind de eerste pakken. `aannSleutel` valt bij een
  // rij zonder taaknummer (van vóór de backfill) terug op de VvE-code, en dan dragen twee
  // offerte-trajecten van dezelfde VvE dezelfde sleutel — precies het geval waar deze functie
  // ooit voor gemaakt is. Met een 'nr:'-sleutel is er per definitie hoogstens één treffer, dus de
  // normale weg verandert hier niet; alleen het onduidelijke geval doet nu niets in plaats van
  // iets op de verkeerde rij.
  const t=(D.ntd['OFFERTE-TRAJECTEN']||[]).filter(r=>aannSleutel(r)===sleutel);
  return t.length===1 ? t[0] : null;
}

// Render direct (optimistisch) en schrijf de al-gemuteerde r.aannemers weg naar kolom P.
// backgroundWrite rolt terug + her-rendert bij falen (zie data.js).
async function _bewaar(r, vorige){
  renderNtd();
  if(!r._row) return; // zonder rijnummer geen schrijfdoel (zeldzaam) — alleen lokaal
  // Mislukte inlog: terugdraaien MÉT melding. Zonder die melding sprong een zojuist getypte
  // aannemersnaam (of een net gezet vinkje) stil terug naar de oude waarde, en stilte leest als
  // 'gelukt'. Elke andere ensureToken-aanroeper in de app zegt hier wél iets; dit was de enige
  // schrijfweg die het niet deed.
  if(!await ensureToken()){
    r.aannemers=vorige; renderNtd();
    showToast('Niet opgeslagen','Inloggen mislukt — de aannemerslijst staat weer zoals hij was',
              'var(--rd)',null,{geenDedup:true});
    return;
  }
  let gedaan=false;
  // Vingerafdruk-momentopname op INSCHRIJF-moment, niet pas wanneer de writeFn aan de beurt is.
  // De wachtrij is serieel, dus wat hier staat is per definitie wat de Sheet bevat als deze beurt
  // start. Las de writeFn het levende `r` pas bij de start, dan zag hij ook de optimistische
  // mutaties van beurten die ná deze zijn ingeschreven (bv. een Opgevolgd-klik die de deadline —
  // een vingerafdrukkolom — alvast verzet heeft) en sloeg de guard vals alarm: niet geschreven,
  // en de aannemerslijst onterecht teruggerold.
  const snap={...r};
  backgroundWrite(
    async()=>{ if(!gedaan){ await assertRowMatch(r._row, snap); await writeRange(`'Nog Te Doen'!P${r._row}`,[r.aannemers]); gedaan=true; } },
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
function hernoemAannemer(sleutel, idx, naam, verwacht){
  const r=_vindRij(sleutel); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  // Staat op deze plek nog de regel die de gebruiker aanklikte? Zo niet, dan is de lijst tussen
  // openen en opslaan verschoven en zou deze schrijfactie een ándere aannemer hernoemen.
  if(verwacht!=null && lijst[idx].naam!==verwacht) return;
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
  // De naam die er BIJ HET OPENEN stond gaat mee. De poll kan de lijst intussen vervangen (een
  // collega voegt een aannemer toe of haalt er een weg) en dan wijst het bewaarde INDEXNUMMER een
  // andere regel aan; zonder deze controle hernoemde de blur-afhandeling dan stil de verkeerde.
  state.offerteAannEdit={sleutel, idx, oudeNaam:lijst[idx].naam};
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
  if(bewaren) hernoemAannemer(e.sleutel, e.idx, val, e.oudeNaam);
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

// Vanuit het BEWERKSCHERM: de complete werkkopie in één keer wegschrijven (kolom P). Zelfde
// schrijfweg als de paneel-mutaties (_bewaar), zodat guard en rollback niet uit elkaar lopen.
// Komt in de seriële wachtrij ná de A..K-write van submitTask — zelfde plek als koppelTaak.
// Leunt erop dat kolom P buiten de vingerafdruk valt (zie de O,P-regel bij FP_KOLOMMEN,
// api.js): r.aannemers draagt hier al de nieuwe waarde wanneer assertRowMatch draait.
function schrijfAannemers(r, nieuweCel){
  if(blokkeerOffline()) return;
  const vorige=r.aannemers;
  r.aannemers=nieuweCel;
  _bewaar(r, vorige);
}

// 'Opgevolgd · +2 wk' (paneel): herinnering gestuurd/nagebeld → volgende opvolgdatum in
// kolom F (de deadline-kolom, die bij een aangevraagd traject de opvolgdatum draagt).
// LET OP: de deadline zit in de rij-vingerafdruk, dus de guard krijgt de OUDE waarde mee
// (zelfde vorm als zetSubsidieFase in crud.js). Mét logboekregel en undo.
const OPVOLG_TERMIJN_DAGEN = 14;
function opgevolgd(sleutel){
  _rondNaamwijzigingAf();
  const r=_vindRij(sleutel); if(!r || !r._row) return;
  if(blokkeerOffline()) return;
  const d=new Date(); d.setDate(d.getDate()+OPVOLG_TERMIJN_DAGEN);
  const nieuw=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  // Idempotentie-rem: staat de opvolgdatum al op vandaag + 2 weken, dan valt er niets te
  // verzetten — een tweede klik op dezelfde dag schreef anders opnieuw (write + logregel +
  // undo-toast). Via toDutchDate en niet als kale stringvergelijking: na een resync draagt
  // r.deadline de lange Nederlandse datumvorm van de Sheet ('15 september 2026'), en dan
  // matchte de tekst nooit met het hier gebouwde dd-mm-jjjj.
  if(toDutchDate(r.deadline||'')===nieuw) return;
  _schrijfOpvolg(r, nieuw, r.deadline||'', 'Opgevolgd', true);
}
// `metUndo` is een expliciete parameter en wordt niet uit de actienaam afgeleid: de terugweg
// van de undo is dezélfde functie en hoort geen tweede undo-toast op te leveren — en dat
// verschil mag niet stil omvallen wanneer iemand ooit de actietekst herformuleert.
async function _schrijfOpvolg(r, nieuw, oud, actie, metUndo){
  if(!await ensureToken()){
    // Richtingneutraal geformuleerd ('niet gewijzigd'): deze functie is ook de terugweg van de
    // undo, en dáár is 'staat nog zoals hij was' precies de waarde die NIET bereikt is.
    showToast('Niet opgeslagen','Inloggen mislukt — de opvolgdatum is niet gewijzigd',
              'var(--rd)',null,{geenDedup:true});
    return;
  }
  r.deadline=nieuw; renderNtd();
  const heenweg={gelukt:false};
  let geschreven=false;
  // Vingerafdruk-momentopname op INSCHRIJF-moment, niet pas wanneer de writeFn aan de beurt is:
  // de wachtrij is serieel, dus wat hier staat (mét de oude deadline — die kolom zit in de
  // vingerafdruk) is per definitie wat de Sheet bevat als deze beurt start. Las de writeFn het
  // levende `r` pas bij de start, dan zag hij ook mutaties van later ingeschreven beurten en
  // sloeg de guard vals alarm.
  const snap={...r, deadline:oud};
  backgroundWrite(
    async()=>{ if(!geschreven){
        await assertRowMatch(r._row, snap);
        await writeRange(`'Nog Te Doen'!F${r._row}`,[nieuw]);
        geschreven=true; heenweg.gelukt=true; }
      await logEvent(r.code,'OFFERTE-TRAJECTEN',actie,'opvolgdatum',oud,nieuw); },
    ()=>{ r.deadline=oud; },
    'Opvolgdatum opslaan'
  );
  // geenDedup: de ontdubbelsleutel van showUndoToast blijft 30 s staan terwijl de toast na 8 s
  // weg is — wie opvolgt, ongedaan maakt en opnieuw opvolgt, verloor anders stil precies de
  // undo-knop (gedocumenteerde val, zie de 'Gestapeld'-toast in bundel-acties.js).
  // De titel via taakTitel en niet alleen de VvE-code: één VvE kan meerdere offerte-trajecten
  // tegelijk hebben, en dan zegt de code niet wélk traject er net verzet is (zelfde keuze als
  // de wegleg-bevestiging in snooze.js).
  if(metUndo) showUndoToast('Opgevolgd',
    `${r.code} — ${taakTitel(r,'OFFERTE-TRAJECTEN')||r.naam||''} · opvolgen ${nieuw}`,
    async()=>{
      // Eerst de lopende schrijfactie afwachten en dán pas de gelukt-check. De vlag gaat pas ná
      // de write om; een klik in de eerste seconden las hem anders altijd als false en de knop
      // deed stil niets (zelfde volgorde-eis als bij de bulk-undo en herordenBundel).
      await state._writeChain;
      if(!heenweg.gelukt){
        // Niets terug te draaien, wél iets zeggen — stilte na een klik leest als een kapotte
        // knop, en de foutmelding van de heenweg kan intussen weggetikt zijn.
        showToast('Niets ongedaan te maken','Het opvolgen is niet opgeslagen — er is niets gewijzigd.',
                  'var(--am)','label',{geenDedup:true,geenSysteemmelding:true});
        return;
      }
      if(blokkeerOffline()) return;   // de heenweg had zijn poort in `opgevolgd`; de undo verdient dezelfde
      // Her-ankeren vóór het terugzetten: de finally van backgroundWrite draait loadAll(true) en
      // die vervangt élk rij-object — ruim binnen de acht seconden dat deze knop staat. `r` wees
      // daarna nergens meer naar: de Sheet kreeg de oude datum netjes terug, maar het scherm
      // bleef de nieuwe tonen tot de volgende poll (zelfde reparatie als bij de bulk-undo).
      const vers=verseRij(r, D.ntd['OFFERTE-TRAJECTEN']||[]);
      if(!vers){
        showToast('Niets ongedaan te maken','Het traject is niet meer terug te vinden in de lijst.',
                  'var(--am)','label',{geenDedup:true,geenSysteemmelding:true});
        return;
      }
      _schrijfOpvolg(vers, oud, nieuw, 'Opvolgdatum teruggezet', false);
    },'pauze',{geenDedup:true});
}

export { addAannemer, toggleAannemerBinnen, verwijderAannemer,
         hernoemAannemer, startHernoem, stopHernoem, schrijfAannemers, opgevolgd };
