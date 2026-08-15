// ══════════════════════════════════════
//  BUNDEL-ACTIES — schrijfwegen voor de Takenbundel
// ══════════════════════════════════════
// Drie acties die kolom Q, R en S van 'Nog Te Doen' aanraken: koppelen, ontkoppelen en
// herordenen. Alle drie volgen exact de weg die de rest van het dashboard ook loopt —
// blokkeerOffline() vóór de mutatie, ensureToken(), optimistisch muteren + renderAll(),
// dan backgroundWrite() met een assertRowsMatch() binnen de writeFn.
//
// Wat de rij-guard hier wél en niet ziet (nagezocht in api.js, 2026-08-14):
// FP_KOLOMMEN['Nog Te Doen'] is { tekst:[0,2] } plus de deadline-kolom van de sectie, en
// `vingerafdruk` plakt daar kolom Q (index 16) voor. R en S vallen daar bewust buiten — ze staan
// niet in FP_KOLOMMEN en `_rijNaarCellen` vult ze niet. Twee gevolgen, allebei belangrijk:
//   - Voor bundelId/bundelVolg is er GEEN richting-omkering nodig zoals in bulkVeld. Wat wij
//     wijzigen ziet de guard niet, dus een rij-object dat al optimistisch is bijgewerkt levert
//     dezelfde vingerafdruk op als de rij in de Sheet.
//   - Voor het taaknummer (Q) is die omkering wél nodig, want dat zit er juist wél in en
//     `koppelTaak` kent hem soms pas net toe. Zie daar.
// Wordt FP_KOLOMMEN ooit tot R/S uitgebreid, dan gaan de checks hieronder vals alarm slaan
// (zichtbaar als 'De lijst was net gewijzigd' bij élke stapelactie) en moeten ze meeveranderen.
import { SID, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { _veiligeRij, assertRowsMatch } from "./api.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { ensureToken } from "./auth.js";
import { showUndoToast } from "./notifications.js";
import { nieuwTaakId, taakTitel } from "./util.js";
import { bouwBundelIndex, volgendeVolg, hernummerLeden, magKoppelen, bundelSleutel } from "./bundel.js";
import { renderAll } from "./main.js";

// ── Opbouw van de schrijfopdrachten (puur, los testbaar) ──────────────────────
// Alles gaat via values:batchUpdate met meerdere bereiken: één atomaire POST, alles-of-niets.
// Zo kan een halve herordening niet bestaan.
//
// GEEN van deze drie functies leest `_row` van een rij-object; ze krijgen kále rijnummers mee.
// Dat is de kern van de bescherming, niet een stijlkeuze: `_shiftNtdRows` (api.js) muteert `_row`
// IN-PLACE op de levende rij-objecten en draait optimistisch bij de klik van een ándere actie
// (afronden, verwijderen, bulk). Zou een bereik-opbouw zelf `_row` lezen, dan kon dat nummer
// tussen de rij-controle en de POST opschuiven en rapporteert de guard groen over een rij die de
// POST helemaal niet beschrijft. Nu leest de aanroeper elk rijnummer één keer — synchroon, vlak
// vóór assertRowsMatch — en gaat datzelfde nummer zowel de controle als het bereik in.

// Q:S op de rij van de subtaak, plus — als de kop nog geen bundel had — Q:S op de rij van de kop.
// Kolom Q gaat mee met het taaknummer dat de rij nú draagt: één aaneengesloten bereik per rij in
// plaats van twee losse. Voor een rij die zijn nummer al had is dat een overschrijving met dezelfde
// waarde; voor een rij van vóór de backfill is het precies de plek waar `koppelTaak` het zojuist
// toegekende nummer kwijt kan.
//
// `schrijfKop` komt als vlag binnen en wordt hier NIET uit een bundelnummer afgeleid: deze functie
// draait pas op het moment van schrijven, en dan staat het bundelnummer optimistisch al op de kop.
// Zelf afleiden zou de kop-rij dus overslaan in precies het enige geval waarin hij geschreven
// móet worden.
//
// Eén object en geen zes losse argumenten: rijnummers, taaknummers en het bundelnummer zijn hier
// allemaal korte waarden van dezelfde vorm — verwisseld zou geen enkele toets erop aanslaan
// (zelfde reden als bij `toevoegWaarden` in crud.js).
export function koppelBereiken({ subRij, subNr, kopRij, kopNr, bundelId, volg, schrijfKop }){
  const uit = [];
  if (schrijfKop)
    uit.push({ range:`'Nog Te Doen'!Q${kopRij}:S${kopRij}`,
               values:[_veiligeRij([kopNr||'', bundelId, '0'])] });
  uit.push({ range:`'Nog Te Doen'!Q${subRij}:S${subRij}`,
             values:[_veiligeRij([subNr||'', bundelId, String(volg)])] });
  return uit;
}

// Ontkoppelen wist R en S. Het bereik begint bewust bij R en niet bij Q: het taaknummer is de
// identiteit van de taak en mag nooit verdwijnen, anders wordt de rij een wees voor de
// schrijf-guard. Q buiten het bereik houden is de enige manier om die belofte af te DWINGEN.
// Staat `taakId` in ons geheugen leeg terwijl een collega of de backfill kolom Q intussen wél
// heeft gevuld, dan zet `assertRowsMatch` het nummer juist buiten de vergelijking (`heeftNr` in
// api.js) — een meegeschreven lege Q zou dat verse nummer dus wissen in precies het geval dat de
// guard niet kan zien.
export function ontkoppelBereiken(rij){
  return [{ range:`'Nog Te Doen'!R${rij}:S${rij}`, values:[_veiligeRij(['',''])] }];
}

// Herordenen raakt alleen kolom S, en alleen de leden die daadwerkelijk een ander nummer krijgen.
export function herordenBereiken(regels){
  return (regels||[]).map(x => ({ range:`'Nog Te Doen'!S${x.rij}`,
                                  values:[_veiligeRij([String(x.volg)])] }));
}

// ── De schrijfweg zelf ────────────────────────────────────────────────────────
async function schrijfBereiken(data){
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${state.oauthToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ valueInputOption:'USER_ENTERED', data }),
  });
  if (!resp.ok){
    // .catch op het foutlichaam: een 502 van een tussenliggende proxy stuurt HTML, en dan zou
    // resp.json() een SyntaxError zónder .status gooien — die telt als netwerkfout en zet het
    // dashboard onterecht op offline (zelfde reden als in writeRange, api.js).
    const e = await resp.json().catch(() => ({}));
    if (resp.status === 401){ state.oauthToken = null; state.oauthExpiry = 0; }
    const err = new Error(e.error?.message || 'Bundel-actie mislukt'); err.status = resp.status; throw err;
  }
}

// Rijnummer aanwezig? assertRowsMatch filtert een check ZONDER rijnummer er stil uit en keert dan
// zonder één lezing terug — de schrijfactie zou daarna ongecontroleerd naar een bereik als
// 'Nog Te Doen'!Qundefined gaan. Liever hier stoppen met een melding die de gebruiker kan volgen.
function heeftRij(...rijen){
  if (rijen.every(r => r && r._row)) return true;
  alert('Deze taak is niet meer op zijn plek te vinden. Vernieuw de pagina en probeer het opnieuw.');
  return false;
}

// Komt een van deze rijen uit het tabblad 'Afgerond'? Dan mag geen van deze schrijfwegen hem
// aanraken: ze bouwen allemaal een bereik `'Nog Te Doen'!…{_row}`, en `_row` is het regelnummer ín
// het blad waar de rij vandaan komt — rij 12 van 'Afgerond' is dus een wildvreemde taak in
// 'Nog Te Doen'.
//
// De route die hier vandaag écht langs kán komen is het herordenen: `herordenBundel` krijgt de
// gesleepte volgorde van de aanroeper mét een `af`-vlag per lid, en die vlag komt uit de DOM.
// Afgeronde leden staan wel degelijk in die lijst — ze zijn bij het hernummeren VASTE ANKERS en
// dragen daarom `data-taak` in het paneel (zie `hernummerLeden` en `subRegel`) — alleen hóórt er
// `af:true` bij. Klopt dat niet, dan laat `hernummerLeden` zo'n lid niet weg en wordt zijn
// regelnummer als 'Nog Te Doen'-rij beschreven. Dat staat twintig regels lager bij `herordenBundel`
// verder uitgewerkt.
//
// Bij koppelen en ontkoppelen is dit een vangnet en geen bestaande route (nagelopen 2026-08-15):
// de `m.af`-tak van `subRegel` (render-bundel.js) geeft een afgerond lid géén actieknoppen, géén
// `data-action` en géén sleep-handvat, en beide wegen beginnen bij een rij uit `state._rowCache`
// of `state.editRowData` — daar komen alleen openstaande rijen in (rowNtd, de open tak van
// `subRegel`, de cross-list, de dossierpagina en Ctrl+K; `rowAf`, `afRij` en de Afgerond-groep van
// het commandopalet leiden geen van drieën naar het bewerkscherm). De guard staat er dus voor de
// aanroeper die er straks bij komt: die krijgt een melding in plaats van een stille schrijfactie in
// een wildvreemde rij. Niet op de rij-guard vertrouwen: die vangt het meestal (de vingerafdruk van
// een andere taak matcht niet), maar dat is toeval en geen ontwerp.
// Vergelijkt op OBJECT-identiteit: D.af bevat exact de rij-objecten die uit 'Afgerond' geparst
// zijn, dus een openstaande taak kan hier niet vals op aanslaan.
function blokkeerAfgerond(...rijen){
  const uitAfgerond = r => SKEYS.some(s => ((D.af && D.af[s]) || []).includes(r));
  if (!rijen.some(uitAfgerond)) return false;
  alert('Deze taak is al afgerond. Zet hem eerst terug voordat je de bundel wijzigt.');
  return true;
}

// Hang `sub` als subtaak onder `doel`.
export async function koppelTaak(sub, doel){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  if (!heeftRij(sub, doel)) return;
  if (blokkeerAfgerond(sub, doel)) return;
  const ix = bouwBundelIndex(D.ntd, D.af);
  const check = magKoppelen(sub, doel, ix);
  if (!check.mag){ alert(check.reden); return; }

  // Had de kop al een bundel? Die vraag hoort hier beantwoord te worden en niet straks in de
  // writeFn: tegen die tijd staat het bundelnummer er optimistisch allang op. Het antwoord stuurt
  // drie dingen aan die het onderling niet oneens mogen worden — of de kop-rij geschreven wordt,
  // of hij een vers taaknummer krijgt, en of het scherm hem bijwerkt.
  const kopHadBundel = !!(doel.bundelId||'').trim();

  // Rij van vóór de backfill (kolom Q leeg): eerst een taaknummer toekennen. Voor de kop van een
  // NIEUWE bundel moet dat wel — zonder nummer is er niets om als bundelnummer naar te wijzen.
  // Voor de subtaak moet het óók: lidmaatschap is een verwijzing tussen taken mét identiteit, en
  // `bouwBundelIndex` laat een rij zonder taaknummer in 'Afgerond' bewust buiten de bundel vallen.
  // Een subtaak zonder nummer zou dus stil uit zijn eigen bundel verdwijnen zodra hij wordt
  // afgevinkt. De cel wordt hier toch al beschreven (Q, R en S in één bereik), dus dit kost geen
  // extra schrijfverkeer.
  // Hangt de subtaak aan een BESTAANDE bundel, dan blijft de kop-rij buiten de batch en krijgt hij
  // hier dus ook géén nummer: dat zou op het scherm staan zonder ooit in de Sheet te landen, en
  // vanaf dat moment ketst élke schrijfactie op die rij af op de rij-guard ('de lijst was net
  // gewijzigd'). Nodig is het daar ook niet — het bundelnummer komt dan uit check.bundelId.
  const oudSubNr = sub.taakId, oudKopNr = doel.taakId;
  if (!kopHadBundel && !(doel.taakId||'').trim()) doel.taakId = nieuwTaakId();
  if (!(sub.taakId||'').trim())  sub.taakId  = nieuwTaakId();
  const bundelId = bundelSleutel(check.bundelId || doel.taakId);

  // Alle rijen met dít bundelnummer, ook als het er maar één is. Bewust rechtstreeks uit de index
  // en niet via `bundelVan`: die gaat langs `isBundel` en geeft null zodra een bundel tot één lid
  // gekrompen is (kop ontkoppeld of verwijderd). Het volgnummer viel dan terug op '10' terwijl het
  // achtergebleven lid dat nummer al draagt — en bij gelijke volgnummers beslist de tiebreak op
  // taaknummer wie de kop is, dus de zojuist gesleepte taak kan zomaar bovenaan komen te staan.
  // Voor een verse bundel is de lijst leeg en geeft `volgendeVolg` gewoon '10', naast de '0' die
  // de kop hieronder krijgt.
  const volg = volgendeVolg(ix.get(bundelId) || []);

  const oudSub = { bundelId: sub.bundelId, bundelVolg: sub.bundelVolg };
  const oudKop = { bundelId: doel.bundelId, bundelVolg: doel.bundelVolg };

  // Optimistisch: meteen zichtbaar, daarna pas wegschrijven — zelfde patroon als afronden.
  if (!kopHadBundel){ doel.bundelId = bundelId; doel.bundelVolg = '0'; }
  sub.bundelId = bundelId; sub.bundelVolg = volg;
  // Via bundelSleutel, want state.bundelOpen wordt op precies die sleutel gelezen; een ongetrimde
  // sleutel erin zou een bundel opleveren die wel opengaat maar nooit meer dicht.
  state.bundelOpen.add(bundelId);
  renderAll();

  // Ongedaan maken = gewoon weer ontkoppelen, maar pas nádat de koppel-write klaar is: die twee
  // schrijven naar dezelfde cellen, en de wachtrij van backgroundWrite zou de ontkoppeling er
  // anders vóór kunnen zetten (zelfde volgorde-eis als bij de bulk-undo).
  // De kop houdt zijn bundelnummer; die is met één lid geen bundel meer (isBundel eist er twee)
  // en wordt dus weer als gewone taakrij getekend.
  // geenDedup: showUndoToast houdt zijn sleutel (titel + melding) 30 seconden vast terwijl de
  // toast zelf na 8 seconden weg is. Stapelen is juist een handeling die iemand kort achter elkaar
  // herhaalt — ook via deze undo zelf — en dan bleef de tweede toast stil. De gebruiker zag dan
  // niets dubbels; hij zag niets, en had geen weg terug. Zelfde afweging als bij blokkeerOffline
  // (data.js): stilte leest als 'er valt niets te doen'.
  showUndoToast('Gestapeld', `${taakTitel(sub)} onder ${doel.naam||doel.code}`,
    async () => { await state._writeChain; await ontkoppelTaak(sub); }, 'plus', { geenDedup:true });
  backgroundWrite(
    async () => {
      // De hele schrijfopdracht in één synchrone momentopname, vóór de eerste await. Zie de
      // toelichting bij de bereik-opbouw: `assertRowsMatch` doet een lezing over het net, en
      // tijdens die lezing kan een klik elders `_row` in-place opschuiven. Door de guard en het
      // bereik uit dezelfde `opdracht` te voeden kan de gecontroleerde rij per definitie niet meer
      // afwijken van de beschreven rij.
      const opdracht = { subRij: sub._row, subNr: sub.taakId, kopRij: doel._row, kopNr: doel.taakId,
                         bundelId, volg, schrijfKop: !kopHadBundel };
      // Bescherming: beide rijen moeten nog dezelfde TAAK zijn. Het taaknummer gaat als OUDE
      // waarde mee, want dat is wat er nu in de Sheet staat — hierboven kan er net een vers nummer
      // aan het rij-object gehangen zijn dat er nog niet is weggeschreven. Zonder die omkering
      // vergelijkt de guard 'T:<nieuw>' met een rij zónder nummer en zou élke koppeling op een
      // rij van vóór de backfill gegarandeerd afketsen. (Voor bundelId/bundelVolg is dezelfde
      // omkering niet nodig — zie de kop van dit bestand.)
      await assertRowsMatch([
        { row: opdracht.subRij, r: { ...sub,  taakId: oudSubNr } },
        { row: opdracht.kopRij, r: { ...doel, taakId: oudKopNr } },
      ]);
      await schrijfBereiken(koppelBereiken(opdracht));
    },
    () => { sub.bundelId = oudSub.bundelId; sub.bundelVolg = oudSub.bundelVolg; sub.taakId = oudSubNr;
            doel.bundelId = oudKop.bundelId; doel.bundelVolg = oudKop.bundelVolg; doel.taakId = oudKopNr; },
    'Stapelen mislukt'
  );
}

// Maak van een subtaak weer een losse taak.
export async function ontkoppelTaak(r){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  if (!heeftRij(r)) return;
  if (blokkeerAfgerond(r)) return;
  const oud = { bundelId: r.bundelId, bundelVolg: r.bundelVolg };
  r.bundelId = ''; r.bundelVolg = '';
  renderAll();
  backgroundWrite(
    async () => {
      const rij = r._row;                 // één keer lezen, vóór de lezing — zie koppelTaak
      await assertRowsMatch([{ row: rij, r }]);
      await schrijfBereiken(ontkoppelBereiken(rij));
    },
    () => { r.bundelId = oud.bundelId; r.bundelVolg = oud.bundelVolg; },
    'Ontkoppelen mislukt'
  );
}

// Eén schrijfronde volgnummers: de rij-controle en de schrijfactie in één closure, gedeeld door de
// sleepactie en zijn undo. Bewust gedeeld: de undo schrijft naar dezelfde rijnummers, maar pas
// seconden later — juist dán is de kans het grootst dat er intussen een rij is bijgekomen of weg
// is, en dus juist dáár mag de guard niet ontbreken.
const schrijfVolg = wijzigingen => async () => {
  // Rijnummers één keer, vóór de lezing (zie koppelTaak): daarna gaan exact dezelfde nummers de
  // controle én het bereik in.
  const regels = wijzigingen.map(w => ({ rij: w.r._row, r: w.r, volg: w.volg }));
  await assertRowsMatch(regels.map(x => ({ row: x.rij, r: x.r })));
  await schrijfBereiken(herordenBereiken(regels));
};

// Nieuwe volgorde vastleggen na slepen. `nieuweVolgorde` is de lijst leden in de gewenste
// volgorde ({r, af}-objecten uit de index).
export async function herordenBundel(nieuweVolgorde){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const wijzigingen = hernummerLeden(nieuweVolgorde);
  if (!wijzigingen.length) return;                      // niets veranderd → geen verzoek
  if (!heeftRij(...wijzigingen.map(w => w.r))) return;
  // Vangnet op de af-vlag: `hernummerLeden` laat afgeronde leden weg op grond van de `af` die de
  // AANROEPER meegeeft, en die komt bij het slepen uit de DOM. Klopt hij niet, dan zou hier een rij
  // uit 'Afgerond' in de lijst staan en zijn regelnummer als 'Nog Te Doen'-rij beschreven worden.
  if (blokkeerAfgerond(...wijzigingen.map(w => w.r))) return;
  // De oude nummers in dezelfde vorm als `wijzigingen`, zodat de undo exact dezelfde weg loopt.
  // `?? ''` en niet `|| ''`: alleen het GETAL 0 maakt hier verschil, en 0 is een echt volgnummer —
  // zo begint een verse bundel. Vandaag levert parseSections altijd strings ('0' overleeft `||`
  // gewoon), dus dit is dezelfde voorzorg als `nulVeilig` in crud.js: het verschil ontstaat pas
  // zodra er ergens een getal op het rij-object belandt.
  const oud = wijzigingen.map(w => ({ r: w.r, volg: w.r.bundelVolg ?? '' }));
  wijzigingen.forEach(w => { w.r.bundelVolg = w.volg; });
  renderAll();

  // geenDedup om dezelfde reden als bij het stapelen: slepen is bij uitstek de handeling die
  // iemand een paar keer achter elkaar doet, en met de ontdubbeling kreeg elke tweede sleepactie
  // binnen 30 seconden géén toast en dus geen weg terug.
  showUndoToast('Volgorde gewijzigd',
    `${wijzigingen.length} ${wijzigingen.length===1?'taak':'taken'} verplaatst`, async () => {
    // Eerst de lopende schrijfactie afwachten en dán pas terugzetten: draaide de undo ervoorheen,
    // dan zou de heenweg de teruggezette nummers alsnog overschrijven (zelfde volgorde-eis als bij
    // de bulk-undo). En blokkeerOffline erná, want anders staat het scherm op 'oud' terwijl de
    // Sheet de nieuwe volgorde houdt.
    await state._writeChain;
    if (blokkeerOffline()) return;
    oud.forEach(o => { o.r.bundelVolg = o.volg; });
    renderAll();
    backgroundWrite(schrijfVolg(oud), () => { wijzigingen.forEach(w => { w.r.bundelVolg = w.volg; }); }, 'Undo mislukt');
  }, 'herhaal', { geenDedup:true });

  backgroundWrite(
    schrijfVolg(wijzigingen),
    () => { oud.forEach(o => { o.r.bundelVolg = o.volg; }); },
    'Volgorde opslaan mislukt'
  );
}
