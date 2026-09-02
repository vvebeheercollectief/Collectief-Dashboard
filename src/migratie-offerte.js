// ══════════════════════════════════════
//  MIGRATIE-OFFERTE — eenmalige omzetting bij de livegang van v12.5 (ontwerp 2026-09-01).
//  Handmatig starten vanuit de console, ingelogd en met een verse lijst:
//      await window.migreerOfferteStappen()
//  Idempotent: al-omgezette trajecten worden overgeslagen; twee keer draaien is onschadelijk.
//   A) elk open, al-aangevraagd traject met een VERSTREKEN datum: kolom F → vandaag + 14 dagen
//      (een toekomstige F is al een opvolgdatum en blijft staan);
//   B) elk open traject zonder open 'voorleggen'-subtaak: kop wordt bundel (Q/R/S) + subtaak.
//      Een traject dat zélf subtaak is in andermans bundel (R wijst naar een andere kop) wordt
//      overgeslagen en apart geteld — zelfde regel als submitTask: bundels blijven één laag diep.
//  Draai hem NIET terwijl er nog schrijfacties lopen (statusbalk moet 'Live' tonen).
//
//  WAAROM RUN 2 LEEG IS (de idempotentie, expliciet):
//   · A leunt op `berekenPrioriteit(...).teLaat`. Na run 1 staat F op vandaag+14 — een datum in
//     de toekomst is per definitie niet te laat, dus de rij valt bij run 2 buiten de selectie.
//     Eerlijk erbij: dit is idempotent binnen die veertien dagen, niet voor eeuwig. Staat een
//     traject over drie weken opnieuw op 'te laat', dan verzet een tweede run hem opnieuw — wat
//     precies is wat een opvolgdatum hoort te doen, maar het is géén "hij doet nooit meer iets".
//   · B leunt op de BUNDELINDEX, niet op een vlag in de rij. Run 1 zet bundelId op de kop én zet
//     via `maakVoorlegSubtaken` een open rij met actiepunt VOORLEG_ACTIE en dezelfde bundelId in
//     OPPAKKEN. Bij run 2 (index vers uit D.ntd/D.af, of na een herlaad vers uit de Sheet) vindt
//     de selectie die subtaak en slaat het traject over. Een AFGERONDE voorleg-subtaak telt
//     bewust niet mee: dan is de stap gedaan en zou een nieuwe subtaak juist werk teruggeven.
// ══════════════════════════════════════
import { D, state } from "./state.js";
import { offerteAangevraagd, berekenPrioriteit, nieuwTaakId } from "./util.js";
import { nulVeilig } from "./crud.js";
import { bouwBundelIndex, bundelSleutel } from "./bundel.js";
import { serieleWrite, metWriteMarkering, blokkeerOffline, loadAll } from "./data.js";
import { ensureToken } from "./auth.js";
import { sheetsFetch, assertRowsMatch } from "./api.js";
import { SID } from "./config.js";
import { maakVoorlegSubtaken, VOORLEG_ACTIE } from "./offerte-stappen.js";
import { renderAll } from "./main.js";

// Zelfde termijn als de knop 'Opgevolgd · +2 wk' (OPVOLG_TERMIJN_DAGEN in offerte-aannemers.js).
// Bewust hier herhaald en niet geïmporteerd: die constante is moduleprivé, en deze migratie is
// eenmalig — hem exporteren zou een blijvende koppeling maken voor een bestand dat na de uitrol
// weer weg mag. Lopen ze ooit uiteen, dan is dat zichtbaar in één van beide bestanden.
const OPVOLG_DAGEN = 14;

// De KERN van de routine, puur: welke trajecten komen in aanmerking? Los van netwerk, DOM en klok
// (vandaag is injecteerbaar, zoals bij de andere deadline-toetsen), zodat de selectie — en dus de
// idempotentie — toetsbaar is zonder de schrijfweg te draaien.
// `ix` = de uitkomst van `bouwBundelIndex(D.ntd, D.af)`.
export function migratieSelectie(rows, ix, vandaag){
  // Rijen zonder rijnummer eruit: hun celbereik zou 'Nog Te Doen'!Qundefined worden en dat schrijft
  // de API zonder morren ergens weg (zelfde reden als `heeftRij` in bundel-acties.js). Kan in
  // D.ntd niet voorkomen — parseSections zet altijd een _row — maar de selectie is publiek.
  const lijst = (rows||[]).filter(r => r && r._row);
  // A — verstreken deadlines van AANGEVRAAGDE trajecten worden opvolgdatums. Een traject dat nog
  // niet is aangevraagd houdt zijn F als échte aanvraag-deadline (zie offerteAangevraagd).
  const naarOpvolg = lijst.filter(r => offerteAangevraagd(r)
    && berekenPrioriteit(r.deadline, 'OFFERTE-TRAJECTEN', vandaag).teLaat);
  // Een traject dat zélf subtaak is in andermans bundel (via 'Hoort bij' of '+ Voeg een subtaak
  // toe' onder bv. een vergaderverzoek) krijgt GEEN eigen voorleg-subtaak — precies de regel van
  // submitTask (`autoVoorleg = … && !bdl`): bundels blijven één laag diep. Zonder deze uitzondering
  // ging de subtaak met de VREEMDE bundelId mee (maakVoorlegSubtaken neemt t.bundelId over) en
  // stond 'Offertes voorleggen' als broer/zus naast het traject in andermans bundel, niet eronder.
  // Bijkomend: de dekking hieronder wordt per BUNDEL gemeten — twee trajecten in dezelfde vreemde
  // bundel deelden anders één dekking. (Tegenlezing 2026-09-02.)
  const zitInAndereBundel = r => !!r.bundelId && bundelSleutel(r.bundelId) !== bundelSleutel(r.taakId);
  const inAndereBundel = lijst.filter(zitInAndereBundel);
  // B — trajecten zonder OPEN 'voorleggen'-subtaak. Via `bundelSleutel` en niet via een eigen
  // String().trim(): dat is de enige normalisatie waar `bouwBundelIndex` zijn sleutels mee maakt,
  // en twee verschillende normalisaties betekent een index die nooit een treffer geeft.
  const zonderSub = lijst.filter(r => {
    if(zitInAndereBundel(r)) return false;
    const leden = r.bundelId ? ix.get(bundelSleutel(r.bundelId)) : null;
    return !(leden||[]).some(l => !l.af && l.r.actiepunt === VOORLEG_ACTIE);
  });
  return { naarOpvolg, zonderSub, inAndereBundel };
}

export async function migreerOfferteStappen(){
  // Guards eerst, mutatie daarna — er wordt hieronder optimistisch op de rij-objecten geschreven.
  if(blokkeerOffline()) return 'offline — niets gedaan';
  if(state.pendingWrites>0) return 'er lopen nog schrijfacties — wacht op Live en probeer opnieuw';
  if(!await ensureToken()) return 'niet ingelogd';
  const rows = (D.ntd['OFFERTE-TRAJECTEN']||[]);

  const d=new Date(); d.setDate(d.getDate()+OPVOLG_DAGEN);
  const nieuw=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const { naarOpvolg, zonderSub, inAndereBundel } = migratieSelectie(rows, bouwBundelIndex(D.ntd, D.af));
  const overgeslagen = inAndereBundel.length
    ? ` · overgeslagen (zit zelf in een andere bundel): ${inAndereBundel.length}` : '';

  // Momentopname VÓÓR de optimistische mutatie, per rij-object (een rij kan in beide lijsten
  // staan). Twee doelen: (1) de rij-guard hieronder vergelijkt tegen wat de Sheet NU bevat — de
  // vingerafdruk bevat kolom F en Q, en die worden hieronder juist gewijzigd; (2) de terugweg als
  // de write niet doorgaat. Zelfde idioom als `snap` in _schrijfOpvolg (offerte-aannemers.js).
  const snaps = new Map();
  naarOpvolg.concat(zonderSub).forEach(r => { if(!snaps.has(r)) snaps.set(r, { ...r }); });

  // De taaknummers die deze run al heeft uitgedeeld (uniekTaakId-idioom): dezelfde Set gaat
  // straks mee naar `maakVoorlegSubtaken`, zodat traject en subtaak nooit hetzelfde nummer krijgen.
  const gebruikt=new Set(); Object.values(D.ntd).forEach(a=>(a||[]).forEach(r=>{ if(r.taakId) gebruikt.add(r.taakId); }));
  const data=[];
  zonderSub.forEach(r=>{
    // Een BESTAAND taaknummer nooit overschrijven: er kunnen al logregels, meldingen en
    // bundelleden naar wijzen. Alleen wie er geen heeft krijgt er een.
    if(!r.taakId){ let id=nieuwTaakId(); while(gebruikt.has(id)) id=nieuwTaakId(); gebruikt.add(id); r.taakId=id; }
    if(!r.bundelId){ r.bundelId=r.taakId; if(!nulVeilig(r.bundelVolg)) r.bundelVolg='0'; }
    data.push({range:`'Nog Te Doen'!Q${r._row}:S${r._row}`, values:[[r.taakId, r.bundelId, nulVeilig(r.bundelVolg)||'0']]});
  });
  naarOpvolg.forEach(r=>{ r.deadline=nieuw; data.push({range:`'Nog Te Doen'!F${r._row}`, values:[[nieuw]]}); });
  renderAll();

  if(data.length){
    // `serieleWrite` + `metWriteMarkering` en niet `backgroundWrite`: die laatste eist een
    // rollback-functie en levert toasts, en dit is een handmatige eenmalige routine waarvan de
    // uitslag in de console hoort. De markering maakt de beurt wél zichtbaar voor de poll-rem, de
    // statusbalk en de sluit-waarschuwing — anders kon een pollronde midden in de batch de
    // optimistische stand overtekenen.
    //
    // RIJ-GUARD EERST (tegenlezing 2026-09-02): de bereiken hieronder staan op VASTE rijnummers uit
    // D.ntd, en die zijn hooguit zo vers als de laatste poll — die stilstaat bij een open venster
    // of een verborgen tabblad. Schuift het blad intussen (Apps Script voegt om 06:30 rijen in
    // bóven het offerteblok; een vinkje in de Sheet verwijdert een rij; een collega rondt af), dan
    // landden 31× Q/R/S en de opvolgdatums op andermans rijen — zónder rollback en zónder dat run 2
    // het nog kon zien. `assertRowsMatch` leest de doelrijen in één GET terug en gooit vóór er
    // iets geschreven is; dezelfde guard als élke andere schrijfweg op dit tabblad.
    //
    // De beurt staat vóór die van `maakVoorlegSubtaken` hieronder (beide op state._writeChain):
    // deze schrijft op vaste rijnummers (Q/R/S en F), en de subtaken-insert schuift het offerteblok
    // straks omlaag. Andersom landden deze waarden n rijen te hoog, op andermans taken.
    //
    // Bewust NIET langs `veiligeCel`/`_veiligeRij`: die bestaat om gebruikersinvoer te ontdoen van
    // een leidend '=' (formule-injectie). Hier gaan alleen zelfgemaakte taaknummers en een
    // zelfgebouwde datum de deur uit; er is geen invoerveld bij betrokken.
    try{
      await serieleWrite(() => metWriteMarkering(async () => {
        await assertRowsMatch([...snaps.values()].map(s => ({ row: s._row, r: s })));
        const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({valueInputOption:'USER_ENTERED', data})});
        if(!resp.ok){
          // .catch op het foutlichaam: een 502 van een tussenliggende proxy stuurt HTML terug, en
          // dan zou resp.json() een SyntaxError gooien die als netwerkfout telt (zelfde reden als
          // in writeRange en schrijfBereiken). Bij een 401 het token wissen, anders blijft elke
          // volgende poging op hetzelfde verlopen token stuklopen.
          const e=await resp.json().catch(()=>({}));
          if(resp.status===401){ state.oauthToken=null; state.oauthExpiry=0; }
          throw new Error(e.error?.message||'Migratie-write mislukt');
        }
      }));
    }catch(e){
      // Niets geschreven (één atomaire values:batchUpdate, alles-of-niets, of de guard ging al af
      // vóór de write). De optimistische stand terug naar de momentopname, en bij een verschoven
      // blad meteen een verse ronde — buiten de markering, anders gooit loadAll zijn data weg.
      snaps.forEach((s, r) => { r.deadline=s.deadline; r.taakId=s.taakId; r.bundelId=s.bundelId; r.bundelVolg=s.bundelVolg; });
      renderAll();
      if(e && e.rowMismatch) loadAll(true);
      return `niet geschreven — ${(e && (e.melding||e.message)) || 'onbekende fout'}. Wacht op Live en draai opnieuw.`;
    }
  }
  maakVoorlegSubtaken(zonderSub, gebruikt);
  return `opvolgdatum → ${nieuw}: ${naarOpvolg.length} trajecten · nieuwe subtaken: ${zonderSub.length}${overgeslagen}`;
}
