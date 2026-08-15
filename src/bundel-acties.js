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
import { showUndoToast, showToast } from "./notifications.js";
import { nieuwTaakId, taakTitel } from "./util.js";
import { bouwBundelIndex, volgendeVolg, hernummerLeden, magKoppelen, bundelSleutel, zichtbareKop } from "./bundel.js";
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
// volgorde ({r, af}-objecten uit de index). `volgordeGewijzigd` zegt of de GEBRUIKER er iets aan
// veranderd heeft; dat is een andere vraag dan of er nummers wijzigen, en alleen de aanroeper kan
// hem beantwoorden (zie de melding hieronder).
export async function herordenBundel(nieuweVolgorde, volgordeGewijzigd){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const wijzigingen = hernummerLeden(nieuweVolgorde);
  if (!wijzigingen.length){                             // niets te schrijven → geen verzoek
    // Nul wijzigingen is normaal zolang de gebruiker niets verschoven heeft. Maar sleepte hij wél
    // iets, dan botst die volgorde op een afgerond lid: dat houdt zijn volgnummer (zie
    // `hernummerLeden`) en er is geen ruimte om een open lid ervóór te krijgen. In de praktijk is
    // dat het lid op volgnummer 0 — het enige nummer dat nooit uitgedeeld wordt (`verdeelRuimte`
    // telt vanaf de ondergrens 0 omhoog en `volgendeVolg` begint bij 10), dus alleen de hoofdtaak
    // van een verse bundel draagt het en onder de 0 past niets meer.
    // Zonder melding lijkt het dashboard kapot: je sleept, je laat los, en er gebeurt zichtbaar
    // niets.
    if (volgordeGewijzigd){
      // Eerst terugtekenen. De regel staat nu in het paneel op een plek waar hij niet komt te
      // staan, en die leugen zou blijven tot een poll toevallig iets te melden heeft: de melding
      // hieronder zegt dat het niet kan, dus het scherm moet dat ook laten zien.
      renderAll();
      // geenDedup is hier essentieel: showToast ontdubbelt standaard 15 seconden op titel+tekst,
      // en juist dit scenario nodigt uit tot meteen nog een poging. Zonder deze vlag krijgt die
      // tweede poging weer stilte — precies het probleem dat de melding moest oplossen.
      // geenSysteemmelding om dezelfde reden als bij `springNaarBundel`: dit is uitleg bij een
      // handeling die de gebruiker net zelf deed, geen gebeurtenis om hem voor uit een ander
      // venster te halen.
      // 'taak' en niet 'subtaak': het lid dat op volgnummer 0 klemt is per definitie de hoofdtaak.
      showToast('Deze volgorde kan niet', 'Er staat een afgeronde taak in de weg die zijn plek houdt.',
                null, 'pauze', { geenDedup:true, geenSysteemmelding:true });
    }
    return;
  }
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

// ── Slepen om de volgorde te wijzigen ─────────────────────────────────────────
// Op pointer-events en niet op de HTML5-sleepfunctie (draggable/dragstart): die kent geen
// touch-invoer, en dit dashboard wordt ook op de telefoon gebruikt. `touch-action:none` op .bdl-h
// (styles.css) houdt de pagina stil terwijl er met een vinger gesleept wordt — zonder die regel
// neemt de browser de beweging als scroll-gebaar en komt er geen pointermove meer. Alléén op het
// handvat en niet op de hele regel: het gebaar begint hier altijd op `[data-bdl-grip]`, en de
// browser leidt het scrollgedrag af uit het element waar de aanraking landt sámen met zijn
// voorouders — die kunnen het verder beperken, nooit terugzetten. Op .bdl-sub zou de regel dus
// niets extra's opleveren en wél elke aanraking op een subtaakregel doodmaken voor pannen,
// inclusief de horizontale pan van .tbl-wrap waar de takentabel op een smal scherm van leeft.

// Waar komt het gesleepte element terecht? Puur, dus los testbaar zonder DOM.
// `rects` = [[top,bottom], …] van de zichtbare regels, `y` = de muis-/vingerpositie.
export function sleepDoel(rects, y){
  if (!rects || !rects.length) return null;
  for (let i = 0; i < rects.length; i++){
    const [top, bot] = rects[i];
    if (y >= top && y <= bot) return { index:i, ervoor: y < top + (bot - top)/2 };
  }
  // Buiten alle regels: boven het eerste blok vooraan, anders achteraan.
  return y < rects[0][0] ? { index:0, ervoor:true } : { index:rects.length-1, ervoor:false };
}

// De taaknummers van de regels in het paneel, in schermvolgorde. `data-taak` is hier de identiteit
// van een regel: de POSITIE kan het niet zijn (die verschuift juist tijdens het slepen), en
// `data-rid` staat alleen op open leden terwijl de afgeronde regels hieronder wél mee moeten.
export function paneelTaaknummers(paneel){
  return [...(paneel ? paneel.querySelectorAll('.bdl-sub') : [])].map(el => bundelSleutel(el.dataset.taak));
}

// De gesleepte volgorde als ledenlijst voor `hernummerLeden`, plus of de gebruiker er iets aan
// veranderd heeft. null = paneel en gegevens beschrijven niet meer dezelfde bundel.
//
// Élk lid doet mee, ook de afgeronde: `hernummerLeden` gebruikt die als VASTE ANKERS en deelt de
// nieuwe nummers uit in de gaten ertussen. Valt er één weg, dan telt de reeks over dat anker heen
// en verspringen open leden ten opzichte van een lid dat de functie niet ziet. Vandaar ook
// `data-taak` op een afgeronde regel (zie `subRegel`), die verder geen enkele actie draagt.
//
// Elke regel pakt zijn lid ÚIT de voorraad in plaats van het op te zoeken. Dragen twee rijen in de
// Sheet hetzelfde taaknummer — precies wat `checkNummers` aan de gebruiker meldt — dan houdt elke
// regel zo nog steeds zijn eigen lid; bij opzoeken stond één lid twee keer in de lijst, met twee
// verschillende volgnummers voor dezelfde cel, en het andere er helemaal niet in.
//
// Blijft er een lid over, of hoort een regel bij geen enkel lid, dan is het paneel van vóór een
// wijziging die de gegevens al wél hebben (een collega voegde een subtaak toe, iemand vinkte er
// een af). Hernummeren op een onvolledige lijst zou nummers uitdelen rond ankers die er niet meer
// zijn, dus dan liever niets: de eerstvolgende render zet het paneel weer goed.
export function sleepUitslag(paneel, leden, beginNummers){
  const nu = paneelTaaknummers(paneel);
  const kop = zichtbareKop(leden);
  const voorraad = (leden || []).filter(m => m !== kop);
  const uit = [];
  for (const nr of nu){
    const i = voorraad.findIndex(m => bundelSleutel(m.r.taakId) === nr);
    if (i < 0) return null;
    uit.push(voorraad.splice(i, 1)[0]);
  }
  if (voorraad.length) return null;
  // De kop staat niet in het paneel maar in de tabel erboven, en hoort in de volgorde die
  // `hernummerLeden` krijgt wél vooraan: hij is het lid met het laagste open volgnummer.
  const begin = beginNummers || [];
  return {
    volgorde: kop ? [kop, ...uit] : uit,
    gewijzigd: nu.length !== begin.length || nu.some((v, i) => v !== begin[i]),
  };
}

// Eén sleepstand voor de hele pagina: er is maar één muis en er wordt maar één regel tegelijk
// verplaatst.
let _sleep = null;
let _sleepGlobaal = false;

export function initBundelSlepen(container){
  if (!container || container._bdlSleep) return;
  container._bdlSleep = true;
  container.addEventListener('pointerdown', e => {
    // Alleen de linkerknop. Een rechtermuisklik op het handvat zou de sleepstand zetten waarna het
    // contextmenu opengaat, en daarna komt er op de meeste platforms géén pointerup meer: de stand
    // bleef staan en de eerstvolgende muisbeweging verplaatste een regel die niemand vasthield.
    // De toets op pointerType erbij omdat `button` bij een gewone aanraking of pen-contact 0 is —
    // die blijven dus gewoon werken.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const grip = e.target.closest('[data-bdl-grip]');
    if (!grip) return;
    const rij = grip.closest('.bdl-sub');
    const paneel = rij && rij.closest('.bdl-paneel');
    if (!rij || !paneel) return;
    // De beginvolgorde NU vastleggen. Alleen zo is bij het loslaten te zien of deze sleepactie
    // iets veranderd heeft, en dat is een andere vraag dan of er nummers wijzigen — zie `stop`.
    _sleep = { rij, paneel, begin: paneelTaaknummers(paneel) };
    rij.classList.add('sleep');
    e.preventDefault();     // anders selecteert de muis onderweg de tekst van de regels
  });
  if (_sleepGlobaal) return;
  _sleepGlobaal = true;

  // Hangt het paneel dat we vasthouden nog in het document? Zo niet, dan is er tussentijds opnieuw
  // getekend, en `renderTbody` zet de hele innerHTML van #ntd-tbody opnieuw. Dat gebeurt zodra een
  // leesronde een andere datahash oplevert (data.js): de 8s-poll, maar ook de stille resync die
  // `backgroundWrite` ná élke eigen schrijfactie doet — die hash omvat D.logboek, dus hij slaat al
  // om van een logregel over een wildvreemde taak.
  // Vanaf dat moment is élke meting aan dit paneel onbruikbaar:
  //   - `getBoundingClientRect()` geeft op losgekoppelde regels louter nullen, dus `sleepDoel` valt
  //     bij elke y>0 in zijn buiten-de-lijst-tak en schuift de regel naar de staart;
  //   - `sleepUitslag` kan op datzelfde spookpaneel gewoon een geldige uitslag geven (de poll ging
  //     over een ándere taak), en dan zou `herordenBundel` een volgorde wegschrijven die de
  //     gebruiker nooit gemaakt heeft — hij kijkt intussen naar het verse paneel en heeft zijn
  //     regel niet eens zien bewegen.
  // Niets doen is hier precies goed: de render die het paneel losmaakte heeft het beeld al
  // bijgewerkt. De 'sleep'-klasse hoeft ook niet weg — die zit op een regel bínnen dit paneel
  // (pointermove verplaatst hem er nooit uit), dus die is met het paneel mee verdwenen.
  const losgeraakt = () => {
    if (_sleep.paneel.isConnected) return false;
    _sleep = null;
    return true;
  };

  // Bewegen en loslaten op `window` en niet op de tabel. Het loslaten MOET aankomen: tekent de
  // 8s-poll de tabel intussen opnieuw (data.js doet dat zodra er iets gewijzigd is), dan hangt de
  // gesleepte regel niet meer in de tabel en zou een listener dáár het loslaten mislopen — de
  // sleepstand bleef staan en de eerstvolgende muisbeweging verplaatste een regel die niemand
  // vasthield. Bewegen hoort om dezelfde reden op window: zonder pointer-capture gaat een
  // pointermove naar wat er ónder de muis ligt, en dat is buiten de tabel niets van ons.
  window.addEventListener('pointermove', e => {
    if (!_sleep || losgeraakt()) return;
    const regels = [..._sleep.paneel.querySelectorAll('.bdl-sub')];
    const doel = sleepDoel(regels.map(el => {
      const r = el.getBoundingClientRect(); return [r.top, r.bottom];
    }), e.clientY);
    if (!doel) return;
    const ref = regels[doel.index];
    // De gesleepte regel telt zélf mee in de reeks rechthoeken. Zou hij eruit gefilterd worden,
    // dan zit er een gat precies waar hij staat, valt elke beweging bínnen zijn eigen regel buiten
    // álle rechthoeken en schuift `sleepDoel` hem via zijn buiten-de-lijst-regel naar de staart van
    // het paneel: één pixel bewegen zou de regel dan naar onderen laten schieten. Nu betekent
    // 'ik zweef boven mezelf' gewoon dat er niets verandert.
    if (ref === _sleep.rij) return;
    _sleep.paneel.insertBefore(_sleep.rij, doel.ervoor ? ref : ref.nextSibling);
  });

  const stop = () => {
    if (!_sleep || losgeraakt()) return;
    const { rij, paneel, begin } = _sleep;
    _sleep = null;
    rij.classList.remove('sleep');
    const leden = bouwBundelIndex(D.ntd, D.af).get(bundelSleutel(paneel.dataset.bundel)) || [];
    const uitslag = sleepUitslag(paneel, leden, begin);
    if (!uitslag){
      // Paneel en gegevens beschrijven niet meer dezelfde bundel (een collega voegde een subtaak
      // toe, iemand vinkte er een af). Er wordt niets geschreven — maar de gesleepte regel staat
      // wél nog op zijn nieuwe plek, en die leugen zou blijven staan tot een poll toevallig iets
      // te melden heeft. Terugtekenen dus, om precies dezelfde reden als de
      // 'deze volgorde kan niet'-tak in `herordenBundel`.
      renderAll();
      return;
    }
    // Niets verschoven → niets schrijven. Die rem is geen optimalisatie maar een noodzaak:
    // `hernummerLeden` deelt ook zónder sleepbeweging nieuwe nummers uit zodra de bundel nog op
    // zijn startwaarden staat (0 en 10 worden 10 en 20), dus een kale klik op het handvat zou
    // anders een schrijfronde én een undo-toast opleveren voor een verplaatsing die niemand deed.
    // Terugtekenen hoeft hier niet: `gewijzigd:false` zegt letterlijk dat de regels nog in de
    // volgorde van de laatste render staan.
    if (!uitslag.gewijzigd) return;
    herordenBundel(uitslag.volgorde, true);
  };
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}
