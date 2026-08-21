// ══════════════════════════════════════
//  IN BEHANDELING — de vlag rechtstreeks vanaf de taakrij omzetten
//  Schrijft kolom H in 'Nog Te Doen'. Zelfde stramien als snooze.js (kolom L).
// ══════════════════════════════════════
//
// WAAROM DIT BESTAAT. De vlag was alleen in het bewerkscherm te zetten: openen, scrollen,
// aanvinken, opslaan, sluiten, wachten — zes handelingen voor één vinkje. Het gevolg was niet dat
// het langer duurde maar dat het NIET gebeurde: de groep 'In behandeling' bleef leeg, en daarmee
// ging ook het stil-signaal nooit af (dat kijkt alleen naar taken mét deze vlag, zie bepaalStil in
// render-tabel.js). Eén klik op de rij haalt die drempel weg.
//
// Bewust een eigen bestandje en geen regel erbij in crud.js: dit is één schrijfweg naar één kolom,
// precies zoals snooze.js dat voor de opvolgdatum is. Zo staan de twee rij-acties die één cel
// schrijven naast elkaar in plaats van verspreid door het grootste bestand van de app.
import { SECS } from "./config.js";
import { writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { renderAll } from "./main.js";
import { showToast } from "./notifications.js";
import { taakUitCache } from "./crud.js";
import { logEvent } from "./render-overig.js";
import { taakTitel } from "./util.js";

// De kolomletter uit de sectiedefinitie halen en niet als 'H' opschrijven. De volgorde in
// SECS[sec].keys ís de kolomvolgorde van het tabblad (zie parseSections en submitTask); wie daar
// ooit een veld tussen zet, verschuift deze kolom mee. Een hardgecodeerde letter zou dan stil naar
// de verkeerde cel schrijven — en 'stil' is hier het gevaarlijke woord, want de vlag is niet iets
// wat je de volgende dag mist.
function inBehandelingKolom(sec){
  const i = (SECS[sec] && SECS[sec].keys || []).indexOf('inBehandeling');
  return i < 0 ? null : String.fromCharCode(65 + i);
}

// Heeft deze sectie de vlag überhaupt? Offerte-trajecten niet: die hebben 'inBehandeling' niet in
// hun keys en hun bewerkscherm heeft er dan ook geen schakelaar voor. Daar hoort dus ook geen knop
// op de rij te staan — een knop die een veld zet dat de sectie niet kent, is erger dan geen knop.
function heeftInBehandeling(sec){ return inBehandelingKolom(sec) !== null; }

// Pure omzetting van de stand, los testbaar. De Sheet kent alleen de strings 'TRUE'/'FALSE';
// alles wat leeg of anders is telt als 'niet in behandeling' — precies zoals elke lezer in de app
// het al doet (`r.inBehandeling === 'TRUE'`).
function volgendeStand(huidig){ return huidig === 'TRUE' ? 'FALSE' : 'TRUE'; }

async function zetInBehandeling(rid){
  // Zelfde antwoord als elders wanneer de aangeklikte rij niet meer bestaat: taakUitCache geeft
  // één melding en null. Zonder dat gebeurde er niets en is een kapotte knop niet te onderscheiden
  // van een knop die zijn werk deed.
  const r = taakUitCache(rid);
  if(!r) return;
  const kolom = inBehandelingKolom(r._sec);
  if(!kolom) return;                       // sectie zonder de vlag (offerte-trajecten)
  if(blokkeerOffline()) return;            // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }

  const oud = r.inBehandeling === 'TRUE' ? 'TRUE' : 'FALSE';
  const nieuw = volgendeStand(r.inBehandeling);
  r.inBehandeling = nieuw;
  // Hertekenen en niet alleen de knop omzetten: de rij VERHUIST. 'In behandeling' is een eigen
  // groep in de tabel (zie renderTbody), dus de rij springt naar dat blok — dat is meteen de
  // bevestiging dat er iets gebeurd is.
  renderAll();

  backgroundWrite(
    async ()=>{
      // Kolom H zit NIET in de vingerafdruk (FP_KOLOMMEN: A, C en de deadlinekolom), dus deze
      // controle slaat geen alarm om onze eigen wijziging — hij bewaakt alleen dat we nog naar
      // dezelfde TAAK schrijven. Zelfde afweging als bij de opvolgdatum in snooze.js.
      await assertRowMatch(r._row, r);
      await writeRange(`'Nog Te Doen'!${kolom}${r._row}:${kolom}${r._row}`, [nieuw]);
      // De logregel is hier geen boekhouding maar functioneel: het stil-signaal rekent vanaf de
      // LAATSTE logregel van een taak (bepaalStil). Zonder deze regel zou een taak die je zojuist
      // oppakt meteen als 'Stil 40d' in beeld komen, op grond van activiteit van vóór vandaag.
      // 'Aangevinkt'/'Uitgevinkt' zijn bestaande actienamen: het Logboek heeft er al een zin én
      // een kleur voor (LOG_KLEUR en logZin in render-overig.js). Een eigen naam als 'Opgepakt'
      // zou daar als kale tekst zonder kleur belanden — een nieuw woord in een lijst die al een
      // woordenschat heeft.
      await logEvent(r.code, r._sec, nieuw==='TRUE' ? 'Aangevinkt' : 'Uitgevinkt',
                     'In behandeling', oud, nieuw);
      showToast(nieuw==='TRUE' ? 'In behandeling' : 'Niet meer in behandeling',
                `${r.code} — ${taakTitel(r, r._sec)}`, null,
                nieuw==='TRUE' ? 'afspelen' : 'pauze',
                { geenDedup:true, geenSysteemmelding:true });
    },
    ()=>{ r.inBehandeling = oud === 'TRUE' ? 'TRUE' : ''; },
    'Wijzigen mislukt'
  );
}

export { zetInBehandeling, inBehandelingKolom, heeftInBehandeling, volgendeStand };
