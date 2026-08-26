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
//
// Diezelfde blindheid is óók een gat, en dat is niet met een vingerafdruk te dichten: wat de
// guard niet ziet, kan hij ook niet beschermen. Kolom R van de DOELrij mag deze module wél
// overschrijven (dat is de hele handeling), maar alleen als hij weet wat er staat — en dat weet
// hij niet uit `doel.bundelId`, want dat geheugen kan minuten oud zijn. `assertRowsMatch` leest
// daarom t/m S en geeft de rijen terug; `koppelTaak` toetst kolom Q en R daarop vóór hij schrijft.
// Eén lezing, geen extra verzoek.
import { SID, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { _veiligeRij, assertRowsMatch, fetchSheet, sheetsFetch } from "./api.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { ensureToken } from "./auth.js";
import { showUndoToast, showToast } from "./notifications.js";
import { nieuwTaakId, taakTitel, taakVerwijzing, leegBijErfenis } from "./util.js";
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

// Zet R en S terug op een EERDERE stand. Dit is de tegenhanger van `ontkoppelBereiken` voor het
// geval dat de gesleepte taak vóór de handeling al in een ándere bundel zat: dan is 'ongedaan
// maken' niet leegmaken maar terugzetten. Zelfde reden om kolom Q buiten het bereik te houden.
export function herstelBundelBereiken(rij, oud){
  return [{ range:`'Nog Te Doen'!R${rij}:S${rij}`,
            values:[_veiligeRij([oud.bundelId||'', oud.bundelVolg==null?'':String(oud.bundelVolg)])] }];
}

// Herordenen raakt alleen kolom S, en alleen de leden die daadwerkelijk een ander nummer krijgen.
export function herordenBereiken(regels){
  return (regels||[]).map(x => ({ range:`'Nog Te Doen'!S${x.rij}`,
                                  values:[_veiligeRij([String(x.volg)])] }));
}

// ── De schrijfweg zelf ────────────────────────────────────────────────────────
async function schrijfBereiken(data){
  const resp = await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`, {
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
// Ook bij het herordenen is dit vandaag een vangnet en geen bestaande route (nagemeten
// 2026-08-18). Uit de DOM komt alleen de VOLGORDE: `paneelTaaknummers` leest `data-taak`, en
// `sleepUitslag` haalt daarmee de LEDEN uit de lijst die `bouwBundelIndex` net heeft opgeleverd
// (`voorraad.splice`) — het index-object gaat ongewijzigd door, dus de `af`-vlag komt van daar en
// is per definitie waarheidsgetrouw. Afgeronde leden staan wel degelijk in die lijst: ze zijn bij
// het hernummeren VASTE ANKERS en dragen daarom `data-taak` in het paneel (zie `hernummerLeden` en
// `subRegel`). Bouwt een latere aanroeper de vlag tóch zelf, dan laat `hernummerLeden` zo'n lid
// niet weg en wordt zijn regelnummer als 'Nog Te Doen'-rij beschreven — daarvóór staat deze guard.
//
// Bij koppelen en ontkoppelen is het om een andere reden een vangnet (nagelopen 2026-08-15):
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
  // De undo moet de OUDE stand terugzetten en niet blind ontkoppelen. `magKoppelen` staat namelijk
  // uitdrukkelijk toe dat een taak van bundel A naar bundel B verhuist; 'ongedaan maken' betekende
  // dan 'in HELEMAAL geen bundel meer' — en had bundel A maar twee leden, dan bestond A daarna
  // niet eens meer (isBundel eist er twee) zonder tweede weg terug.
  // En `stand.gelukt` is de tweede helft: mislukt de koppel-write (rij-guard, netwerk), dan rolt
  // backgroundWrite het scherm terug maar blijft de toast nog seconden staan mét een werkende
  // knop — één klik daarop maakte van een geslaagde rollback alsnog dataverlies.
  const stand = { gelukt:false };
  showUndoToast('Gestapeld', `${taakTitel(sub)} onder ${taakVerwijzing(doel)}`,
    async () => {
      await state._writeChain;
      if (!stand.gelukt){
        showToast('Niets ongedaan te maken', 'Het stapelen is niet gelukt — er is niets gewijzigd.',
                  'var(--am)', 'label', { geenDedup:true, geenSysteemmelding:true });
        return;
      }
      if ((oudSub.bundelId||'').trim()) await herstelBundel(sub, oudSub);
      else await ontkoppelTaak(sub);
    }, 'plus', { geenDedup:true });
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
      const rijen = await assertRowsMatch([
        { row: opdracht.subRij, r: { ...sub,  taakId: oudSubNr } },
        { row: opdracht.kopRij, r: { ...doel, taakId: oudKopNr } },
      ]);
      // Wat er NÚ in kolom Q en R van de twee rijen staat. Dezelfde normalisatie als
      // `parseSections` (leegBijErfenis voor Q en R, dat wist een geërfde TRUE/FALSE), want anders
      // vergelijken geheugen en verse lezing niet hetzelfde.
      const cel = (rij, i) => leegBijErfenis((rijen.get(rij) || [])[i]);
      const kopQnu = cel(opdracht.kopRij, 16), subQnu = cel(opdracht.subRij, 16);
      const kopRnu = cel(opdracht.kopRij, 17);

      // ── Kolom Q mag NOOIT overschreven worden met een ander nummer ──
      // Kent ons geheugen geen taaknummer, dan is er hierboven een vers nummer toegekend — en
      // precies in dat geval zet `assertRowsMatch` de Q-vergelijking uit (`heeftNr`), want 'ik
      // weet het niet' is geen bewijs van een verkeerde rij. Staat er in de Sheet intussen wél
      // een nummer (de backfill, een collega, handmatig), dan zou dat hier stil vervangen worden.
      // Het vaste taaknummer is de identiteit waar de rij-guard én het hele bundelmechanisme op
      // leunen: elke rij die er via bundelId naar wees — ook rijen in 'Afgerond' — werd dan een
      // wees. Daarom telt het nummer uit de Sheet, en niet dat van ons.
      // `ontkoppelBereiken` dicht ditzelfde gat door kolom Q buiten zijn bereik te houden; hier
      // kan dat niet, want voor een rij van vóór de backfill is dit juist de plek waar het verse
      // nummer moet landen.
      const kopNr = kopQnu || opdracht.kopNr;
      const subNr = subQnu || opdracht.subNr;
      // Nieuwe bundel? Dan is het bundelnummer het taaknummer van de kop, dus dat schuift mee.
      const echtBundelId = opdracht.schrijfKop ? bundelSleutel(kopNr) : opdracht.bundelId;

      // ── En de bundelstand van de DOELrij komt uit de Sheet, niet uit ons geheugen ──
      // `kopHadBundel` is hierboven uit `doel.bundelId` afgeleid, en dat geheugen kan minuten oud
      // zijn: main.js slaat de 8s-poll over zolang er een modal openstaat, en via 'Hoort bij'
      // wijst `state._hbDoel` naar een rij-object uit die oude ronde. Zegt ons geheugen 'geen
      // bundel' terwijl de doeltaak intussen zélf subtaak is geworden, dan schreef `koppelBereiken`
      // een volledig bereik Q:S over die rij heen en rukte de doeltaak stil uit haar bundel — de
      // aangeboden undo (`ontkoppelTaak(sub)`) raakt alleen de subtaak en herstelt dat niet.
      // De rij-guard kan dit niet zien: R en S vallen bewust buiten de vingerafdruk.
      // Niet stil aansluiten bij die andere bundel maar wéigeren: het volgnummer is hierboven
      // berekend op een bundel die we niet kennen, dus we zouden een botsing uitdelen. Na de
      // rollback leest `backgroundWrite` alles opnieuw in en werkt dezelfde handeling gewoon.
      // Toegestaan is óók het bundelnummer dat we zelf aan het schrijven zijn: bij een herkansing
      // binnen `_withRetry` (429/5xx nadat de POST tóch geland was) staat het er dan al.
      if (kopRnu !== echtBundelId && !(opdracht.schrijfKop && !kopRnu)){
        const err = new Error('De bundel van de doeltaak is net gewijzigd.');
        err.rowMismatch = true;   // zelfde afhandeling als de rij-guard: rollback + eigen melding
        err.melding = 'Deze taak zit intussen zelf in een bundel. Je scherm is bijgewerkt — probeer opnieuw.';
        throw err;
      }
      // Het scherm meeschuiven naar wat er écht geschreven gaat worden. Week het hierboven af van
      // ons geheugen, dan draagt het rij-object anders een taaknummer of bundelnummer dat in de
      // Sheet niet bestaat, en ketst élke volgende schrijfactie op die rij af op de rij-guard.
      // Geen renderAll: in het gewone geval verandert er niets, en in het zeldzame geval waarin
      // dat wél zo is tekent de stille resync van `backgroundWrite` het scherm zo meteen opnieuw.
      // De rollback hieronder zet ook deze waarden terug — die leest de OUDE waarden, niet deze.
      // ── En is de BRON intussen zélf hoofdtaak geworden? ──
      // `magKoppelen` beantwoordt die vraag uit `bouwBundelIndex`, en die index komt uit de laatste
      // leesronde. Dat geheugen kan minuten oud zijn: main.js slaat de 8s-poll over zolang er een
      // modal openstaat — precies de situatie bij 'Hoort bij'. Hing er in die tijd elders een
      // subtaak onder de bron, dan zou hier alsnog twee lagen diep gestapeld worden (§6.2).
      // Wat er dan kapot gaat is niet de volgorde maar het lidmaatschap: `bouwBundelIndex` groepeert
      // strikt op bundelnummer, dus zodra de bron het nummer van de KOP gaat dragen, blijft haar
      // eigen subtaak alleen achter in een groep van één — en `isBundel` eist er twee. Die subtaak
      // valt dus stil uit haar bundel en wordt weer als losse taak getekend.
      // Eén smalle lezing van kolom R beantwoordt het exact: draagt een ándere rij het taaknummer
      // van de bron als bundelnummer? Dat is dezelfde vraag die `subtakenVan` op het geheugen
      // stelt, nu op de Sheet. Bewust op IDENTITEIT en niet op positie — zie de toelichting daar.
      // Kosten: één extra leesverzoek per stapelactie. Stapelen is een bewust sleepgebaar en geen
      // achtergrondwerk; naast de 8s-poll valt dit weg.
      // Niet gedekt: subtaken die op 'Afgerond' staan. Die zouden een tweede lezing van dat blad
      // vragen (1200+ rijen), en om er één te krijgen moet iemand in datzelfde venster een subtaak
      // koppelen én afvinken. Het geheugen dekt dat geval wel; alleen de verse controle niet.
      if (subNr){
        const bronSleutel = bundelSleutel(subNr);
        const kolomR = await fetchSheet("'Nog Te Doen'!R:R");
        const heeftSub = (kolomR||[]).some((rij, i) =>
          (i + 1) !== opdracht.subRij && leegBijErfenis((rij||[])[0]) === bronSleutel);
        if (heeftSub){
          const err = new Error('De gesleepte taak heeft intussen zelf subtaken.');
          err.rowMismatch = true;   // zelfde afhandeling als de rij-guard: rollback + eigen melding
          err.melding = 'Deze taak heeft intussen zelf subtaken gekregen. Je scherm is bijgewerkt — ontkoppel die eerst.';
          throw err;
        }
      }

      sub.taakId = subNr; doel.taakId = kopNr;
      sub.bundelId = echtBundelId;
      if (opdracht.schrijfKop) doel.bundelId = echtBundelId;
      state.bundelOpen.add(echtBundelId);
      await schrijfBereiken(koppelBereiken({ ...opdracht, kopNr, subNr, bundelId: echtBundelId }));
      stand.gelukt = true;      // pas nu mag de undo-knop iets terugzetten
    },
    () => { sub.bundelId = oudSub.bundelId; sub.bundelVolg = oudSub.bundelVolg; sub.taakId = oudSubNr;
            doel.bundelId = oudKop.bundelId; doel.bundelVolg = oudKop.bundelVolg; doel.taakId = oudKopNr; },
    'Stapelen mislukt'
  );
}

// Zet een taak terug in de bundel waar hij vóór het stapelen in zat. Zelfde vorm als
// `ontkoppelTaak`, met dezelfde rij-guard; alleen de waarden verschillen.
export async function herstelBundel(r, oud){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  if (!heeftRij(r)) return;
  if (blokkeerAfgerond(r)) return;
  const huidig = { bundelId: r.bundelId, bundelVolg: r.bundelVolg };
  r.bundelId = oud.bundelId || ''; r.bundelVolg = oud.bundelVolg || '';
  if (r.bundelId) state.bundelOpen.add(bundelSleutel(r.bundelId));
  renderAll();
  backgroundWrite(
    async () => {
      const rij = r._row;                 // één keer lezen, vóór de lezing — zie koppelTaak
      await assertRowsMatch([{ row: rij, r }]);
      await schrijfBereiken(herstelBundelBereiken(rij, oud));
    },
    () => { r.bundelId = huidig.bundelId; r.bundelVolg = huidig.bundelVolg; },
    'Terugzetten mislukt'
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
  // BIJ ELKE AFBREKING EERST TERUGTEKENEN. De gesleepte regel staat op dit moment door
  // `insertBefore` al op zijn nieuwe plek in het paneel, terwijl er nog niets geschreven is en de
  // volgnummers in het geheugen ongewijzigd zijn. Breken we hier af zonder `renderAll()`, dan
  // blijft die verkeerde volgorde staan tot er toevallig ergens anders iets verandert — `loadAll`
  // hertekent alleen bij een gewijzigde datahash, dus offline kan dat de hele reis duren. De tak
  // 'Deze volgorde kan niet' hieronder doet dit al goed; deze vier deden het niet.
  if (blokkeerOffline()){ renderAll(); return; }
  if (!await ensureToken()){ renderAll(); alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
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
  if (!heeftRij(...wijzigingen.map(w => w.r))){ renderAll(); return; }
  // Vangnet op de af-vlag: `hernummerLeden` laat afgeronde leden weg op grond van de `af` die de
  // AANROEPER meegeeft. Bij het slepen komt die vlag NIET uit de DOM — daar komt alleen de volgorde
  // vandaan (`data-taak`), waarna `sleepUitslag` de leden ongewijzigd uit de verse `bouwBundelIndex`
  // haalt. Voor die weg is dit dus een vangnet. Bouwt een latere aanroeper de lijst zelf op en zet
  // hij de vlag verkeerd, dan zou hier een rij uit 'Afgerond' in de lijst staan en zijn regelnummer
  // als 'Nog Te Doen'-rij beschreven worden.
  if (blokkeerAfgerond(...wijzigingen.map(w => w.r))){ renderAll(); return; }
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
  // GEEN aantal in de tekst. `wijzigingen.length` telt de leden waarvan het VOLGNUMMER wijzigt,
  // en omdat de reeks per positie opnieuw wordt uitgedeeld (10, 20, 30 …) schuift één sleepgebaar
  // bijna altijd alles eronder mee — inclusief de hoofdtaak, die niet eens in het paneel staat.
  // '4 taken verplaatst' na het verslepen van één regel is dus onwaar.
  showUndoToast('Volgorde gewijzigd', 'De nieuwe volgorde is opgeslagen', async () => {
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
    // Alleen knop 0. Een rechtermuisklik op het handvat zou de sleepstand zetten waarna het
    // contextmenu opengaat, en daarna komt er op de meeste platforms géén pointerup meer: de stand
    // bleef staan en de eerstvolgende muisbeweging verplaatste een regel die niemand vasthield.
    // Zonder toets op pointerType, want `button` is invoer-onafhankelijk: de Pointer Events-spec
    // legt 0 vast voor de linker muisknop, voor aanraak-contact én voor pen-contact, en geeft de
    // pen-zijknop 2 en de pen-gum 5. Een `pointerType === 'mouse'`-voorwaarde ervoor liet die
    // pen-zijknop dus wél door — inclusief hetzelfde contextmenu dat voor de muis juist is
    // afgevangen. Kaal is dus zowel korter als breder: aanraking en pen-tip blijven gewoon werken.
    if (e.button !== 0) return;
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
  //
  // Paneel én regel worden getoetst. Vandaag zou het paneel alleen al genoeg zijn, want beide
  // verdwijnen samen met de `innerHTML`-reset van `renderTbody` — maar dat is een aanname over een
  // ándere module en hij staat nergens vastgelegd. Zet iemand later één paneel op zijn plek
  // opnieuw, dan blijft dit paneel-object verbonden terwijl de opgepakte regel al vervangen is, en
  // dekt de guard de regel stil niet meer. Eén term erbij maakt hem daar onafhankelijk van.
  const losgeraakt = () => {
    if (_sleep.paneel.isConnected && _sleep.rij.isConnected) return false;
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
  // `pointercancel` betekent per specificatie dat het gebaar is AFGEBROKEN — de gebruiker heeft
  // niet losgelaten. De browser stuurt hem bij een systeemvenster, een binnenkomend gesprek, een
  // aanraking die als scroll wordt overgenomen of een verdwijnend element. Aan `stop` gekoppeld
  // sloeg zo'n afbreking de halve volgorde alsnog op — de stand waarin de regel toevallig hing.
  // `initStapelSlepen` verderop maakt dezelfde keuze al bewust andersom.
  window.addEventListener('pointercancel', () => {
    if (!_sleep || losgeraakt()) return;
    const rij = _sleep.rij;
    _sleep = null;
    rij.classList.remove('sleep');
    renderAll();   // de half-versleepte regel terug naar de opgeslagen volgorde
  });
}

// ── Slepen om te stapelen ─────────────────────────────────────────────────────
// Een rij aan zijn handvat op een andere rij slepen maakt van de gesleepte taak een subtaak van de
// rij waar hij landt. Er is hier geen tweede betekenis van slepen: noch de takentabel noch de
// dossierpagina kent een handmatige volgorde, dus élke drop op een ándere rij betekent 'stapelen'.
// Dit gebaar en het paneel-slepen hierboven kunnen elkaar niet in de weg zitten: ze toetsen op
// verschillende attributen (`[data-stapel-grip]` tegen `[data-bdl-grip]`), en bovendien staat een
// `.bdl-sub` in een `<tr class="bdl-tr">` zónder `data-row` (render-tabel.js) en valt hij dus ook
// buiten de rijselector van de takentabel.
//
// Vier dingen komen van de aanroeper, omdat ze per lijst verschillen: de container (die een
// hertekening overleeft), de selector van één rij, de weg van rij-element naar taak-object, en of er
// in deze lijst überhaupt gesleept mag worden. Dat laatste bewust als functie van de aanroeper en
// niet als één vlag op `state`: de takentabel mag alleen slepen zolang de gestapelde weergave
// aanstaat (§4.2 — zoeken, filteren, sorteren of bulk zet die uit), terwijl de dossierpagina die
// weergave helemaal niet kent en dus altijd mag. Eén gedeelde vlag zou het stapelen op het dossier
// stilleggen zodra er in de takentabel een filter aanstond. Diezelfde vlag bepaalt of de rij het
// handvat überhaupt tékent (zie `bdlGreep` in rowNtd), zodat het zichtbare handvat en het
// toegestane gebaar één antwoord delen.
//
// HET GEBAAR BEGINT ALLEEN OP HET HANDVAT, niet ergens op de rij. Dat is de kern van deze opzet en
// lost twee dingen tegelijk op:
//   - Tekst selecteren in een rij en daarbij een rijgrens passeren kan geen stapelactie meer zijn,
//     en stapelen is een SCHRIJFACTIE naar de Sheet. Toen de hele rij het handvat was moest die
//     botsing met remmen onwaarschijnlijk gemaakt worden (drempel, opgelichte doelrij, ongedaan
//     maken); nu bestaat ze niet meer. Selecteren en kopiëren van een VvE-naam of actiepunt is
//     gewoon weer een doodgewone leeshandeling, óók dwars over rijen heen.
//   - `touch-action:none` hoeft alleen op het handvat (`.stapel-h`, styles.css) en niet op de rij.
//     Zonder die regel leest de browser een vingerbeweging als scroll-gebaar en stuurt hij een
//     pointercancel in plaats van pointermove; mét die regel op de hele rij zou juist élke
//     aanraking op een taakrij doodgaan voor de verticale paginascroll én voor de horizontale pan
//     van .tbl-wrap, precies waar de takentabel op een smal scherm van leeft. Op een 16px-handvat
//     kost hij niets. Stapelen werkt daardoor óók met een vinger — in de tabel én op de
//     dossierpagina. Zie `doelOnder` voor het tweede stuk dat daarvoor nodig was.
//
// Op pointer-events om dezelfde reden als het paneel-slepen.

// Eén sleepstand voor de hele pagina, net als bij het paneel-slepen: er is maar één muis.
let _stapel = null;
let _stapelGlobaal = false;

export function initStapelSlepen(container, rijSelector, taakVanEl, magSlepen){
  if (!container || container._bdlStapel) return;
  container._bdlStapel = true;
  container.addEventListener('pointerdown', e => {
    // Alleen knop 0, om precies dezelfde reden als bij initBundelSlepen: een rechtermuisklik zou de
    // sleepstand zetten waarna het contextmenu opengaat, en daarna komt er op de meeste platforms
    // géén pointerup meer — die stand bleef dan staan en de eerstvolgende beweging verplaatste een
    // rij die niemand vasthield. Kaal en zonder toets op pointerType, ook net als daar: `button` is
    // invoer-onafhankelijk (de Pointer Events-spec legt 0 vast voor de linker muisknop, voor
    // aanraak-contact én voor pen-contact, en geeft de pen-zijknop 2 en de pen-gum 5), dus een
    // `pointerType === 'mouse'`-voorwaarde ervoor liet die pen-zijknop wél door — inclusief hetzelfde
    // contextmenu dat voor de muis juist was afgevangen.
    if (e.button !== 0) return;
    // Alleen vanaf het handvat, net als `initBundelSlepen` met `[data-bdl-grip]` doet. Een eigen
    // attribuut, zodat de twee sleepsoorten elkaar niet kunnen kapen: een subtaakregel in een
    // bundelpaneel draagt het handvat van het herordenen, een taakrij dat van het stapelen.
    if (!e.target.closest('[data-stapel-grip]')) return;
    // Tweede slot op dezelfde vlag die het handvat tekent (`stapel` uit bundelWeergave, zie rowNtd).
    // Vangnet en geen bestaande route (nagelopen 2026-08-17): `state._bundelWeergave` wordt gezet in
    // renderNtd zélf (render-lijsten.js) en verderop in diezelfde doorloop synchroon gevolgd door
    // `renderTbody('ntd-tbody', …)`, zonder tussenliggende return — er valt dus geen event tussen.
    // Bovendien ís die vlag de momentopname van de laatste render, dus hij kan alleen mét de DOM
    // achterlopen, nooit erop vooruit. En elke ingang van de platte weergave hertekent meteen:
    // 'ntd-sorteer' en 'ntd-stat' roepen renderNtd() direct aan (actions.js), toggleBulkMode en
    // bulkVink doen dat ook en _eindBulk doet renderAll() (bulk.js), en setupSearch koppelt renderNtd
    // aan de zoek- en codevelden (main.js). De behandelaar- en prioriteitsfilters lopen NIET via
    // setupSearch maar via eigen onchange-handlers (main.js) — die doen hetzelfde (pgs.ntd=1 +
    // renderNtd()). Vier van de vier filtervelden die isPlatteWeergave leest zijn daarmee gedekt.
    // De guard staat er voor de lijst die er straks bijkomt.
    if (magSlepen && !magSlepen()) return;
    const el = e.target.closest(rijSelector);
    if (!el) return;
    // De taak meteen erbij zoeken. Levert dat niets op, dan valt er niets te stapelen en hoort de
    // rij niet te gaan dimmen alsof er wél iets gaat gebeuren.
    // Vangnet en geen bestaande route (nagelopen 2026-08-15): beide aanroepers geven élke rij die
    // hun selector raakt onvoorwaardelijk een `data-rid` — `rowNtd` in render-tabel.js en `taakRij`
    // in render-vve.js. De afgerond-regels van de dossierpagina komen hier niet eens langs: die
    // dragen alleen `.tk` en de selector is `.tk-taak`. De guard staat er dus voor de lijst die er
    // straks bijkomt met een bredere selector, niet voor iets wat vandaag gebeurt.
    const r = taakVanEl(el);
    if (!r) return;
    _stapel = { container, el, rijSelector, taakVanEl, r, x:e.clientX, y:e.clientY, actief:false };
    // Net als bij initBundelSlepen. Zonder dit begint de muis vanaf het handvat alsnog een
    // tekstselectie en trekt die onderweg over elke rij die hij passeert — precies wat het handvat
    // moest voorkomen. `preventDefault` op pointerdown onderdrukt de muis-compatibiliteitsevents
    // (waaronder mousedown, dat de selectie start); de `click` erna blijft wél komen, en dáárvoor
    // draagt het handvat een eigen lege `data-action` (zie STAPEL_GREEP in render-bundel.js).
    // Vroeger kon dit hier niet: toen was de hele rij het handvat en moest selecteren bínnen een rij
    // juist mogelijk blijven. Nu kost het niets — op het handvat zelf valt met `user-select:none`
    // (styles.css) toch al niets te selecteren.
    e.preventDefault();
  });
  if (_stapelGlobaal) return;
  _stapelGlobaal = true;

  const opruimen = () => {
    const s = _stapel;
    if (!s) return null;
    _stapel = null;
    s.el.classList.remove('sleep');
    s.container.querySelectorAll('.stapel-doel').forEach(x => x.classList.remove('stapel-doel'));
    return s;
  };

  // Hangt de opgepakte rij nog in het document? Zo niet, dan is er tussentijds opnieuw getekend:
  // renderTbody en renderVve zetten allebei de hele innerHTML van hun container opnieuw, en dat
  // gebeurt zodra een leesronde iets nieuws oplevert — de 8s-poll, maar ook de stille resync die
  // `backgroundWrite` ná élke eigen schrijfactie doet. Doorgaan mag dan niet: `renderAll` leegt
  // state._rowCache en vult hem opnieuw, dus het `data-rid` van de losgeraakte rij wijst daarna naar
  // de zoveelste taak van de níeuwe ronde. De gebruiker kijkt intussen naar een verse lijst waarin
  // hij niets heeft zien bewegen, en zou zomaar twee wildvreemde taken aan elkaar geknoopt zien.
  const losgeraakt = () => {
    if (_stapel.el.isConnected) return false;
    opruimen();
    return true;
  };

  // De rij onder de aanwijzer, of null. Bewust via `document.elementFromPoint` en NIET via
  // `e.target`. Voor de muis geven die twee hetzelfde antwoord — zonder pointer-capture komt een
  // pointer-event binnen op het element waar de muis op staat, en dat is precies het element dat
  // elementFromPoint teruggeeft — maar voor aanraking en pen niet: voor die 'direct
  // manipulation'-invoer zet de browser bij pointerdown zélf een IMPLICIETE pointer-capture op het
  // aangeraakte element, waarna élke pointermove/pointerup bij de BRON-rij binnenkomt. `e.target`
  // levert daar dus altijd de eigen rij op en deze functie per definitie null: het gebaar zou met
  // een vinger zichtbaar meebewegen en bij het loslaten stil niets doen.
  //
  // Dat dit géén hit-test op de rechthoeken van de rijen is, is het punt. Zo'n eigen berekening zou
  // een rij aanwijzen die de gebruiker niet kan zien zodra er iets vóór de tabel ligt: een toast
  // staat met z-index 700 over de tabel en vangt zelf pointer-events (`#toast-container>*` heeft
  // `pointer-events:all`, styles.css). elementFromPoint geeft dan de toast, `closest` levert niets
  // op en er gebeurt niets — dezelfde uitkomst als voorheen met `e.target`. Buiten het venster
  // loslaten geeft om dezelfde reden null, en dus ook geen koppeling.
  const doelOnder = e => {
    const onder = document.elementFromPoint(e.clientX, e.clientY);
    const doelEl = onder && onder.closest ? onder.closest(_stapel.rijSelector) : null;
    // Op jezelf laten vallen betekent niets — anders levert een klik met een trillende muis
    // `koppelTaak(r, r)` op en dus een melding 'Een taak kan niet onder zichzelf hangen'.
    // En de rij moet uit dezelfde lijst komen: selector én rij-cache-vertaling horen bij de
    // container waar dit gebaar begon. Die tweede toets is vandaag een vangnet en geen bestaande
    // route (nagelopen 2026-08-15): er ís een tweede tabel met `tr[data-row]` in dit document
    // (#ontw-tbody, render-overig.js), maar die staat op een andere pagina en zijn rijen dragen
    // geen `data-rid`, dus de vertaling zou daar toch al niets opleveren. Hij staat er voor de
    // lijst die er straks bijkomt: `taakVanEl` hoort bij de container waar het gebaar begon, dus op
    // een vreemde rij losgelaten vertaalt hij een vreemd rij-nummer naar een wildvreemde taak.
    return (doelEl && doelEl !== _stapel.el && _stapel.container.contains(doelEl)) ? doelEl : null;
  };

  window.addEventListener('pointermove', e => {
    if (!_stapel || losgeraakt()) return;
    // Pas na 6px echt slepen. Een trillende hand op het handvat mag geen sleepactie worden: zonder
    // drempel gaat de rij bij de kleinste beweging tijdens een gewone klik al dimmen en licht de rij
    // eronder op als doel, terwijl er niets verschuift. Dat de rem óók een onbedoelde koppeling
    // tegenhoudt telt mee maar is niet meer de hoofdreden — daarvoor zorgt het handvat zelf al.
    if (!_stapel.actief && Math.abs(e.clientY - _stapel.y) + Math.abs(e.clientX - _stapel.x) < 6) return;
    _stapel.actief = true;
    _stapel.el.classList.add('sleep');
    const doelEl = doelOnder(e);
    _stapel.container.querySelectorAll('.stapel-doel').forEach(x => x.classList.remove('stapel-doel'));
    if (doelEl) doelEl.classList.add('stapel-doel');
  });

  // Bewegen en loslaten op `window` en niet op de container, om dezelfde reden als bij het
  // paneel-slepen: laat de gebruiker naast de lijst los, dan zou een listener op de container dat
  // loslaten mislopen en bleef de sleepstand staan.
  const stop = e => {
    if (!_stapel || losgeraakt()) return;
    const doelEl = _stapel.actief ? doelOnder(e) : null;   // niet actief = gewone klik, geen sleep
    const s = opruimen();
    if (!doelEl) return;
    const doel = s.taakVanEl(doelEl);
    // Beide rijen hangen aantoonbaar nog in de laatst getekende lijst (`losgeraakt` hierboven, en
    // het doel komt zojuist uit het document). Dat is NIET hetzelfde als 'uit dezelfde leesronde
    // als D.ntd': `loadAll` vervangt die rij-objecten bij elke geslaagde poll, terwijl er alleen
    // hertekend wordt als de datahash wijzigde — na acht stille seconden wijst `state._rowCache`
    // dus naar objecten van de vorige ronde terwijl de tabel gewoon nog staat. Hier stond ooit de
    // aanname dat die twee samenvielen; `magKoppelen` leunde daarop en weigerde daardoor élke
    // koppeling van een taak waarvan kolom R naar haar eigen taaknummer wees. `magKoppelen` stelt
    // die voorwaarde sinds 26-08-2026 niet meer (zie `subtakenVan` in bundel.js), en deze plek
    // hoeft er dus ook niet meer voor te zorgen. Alle verdere bewaking (offline, token, rij-guard,
    // afgerond, één laag diep) staat in `koppelTaak`.
    if (doel) koppelTaak(s.r, doel);
  };
  window.addEventListener('pointerup', stop);
  // Een afgebroken gebaar laat géén pointerup achter: de browser stuurt dan pointercancel. Dat het
  // handvat `touch-action:none` draagt haalt één oorzaak weg (hij neemt een vingerbeweging die dáár
  // begint niet meer over als scroll-gebaar), maar niet alle: de Pointer Events-spec noemt onder meer
  // een draaiend scherm en een aanwijzer waarvan de browser besluit dat er geen events meer van
  // komen. Zonder deze opruiming bleef de rij gedimd staan en hield de volgende beweging een rij
  // vast die niemand meer oppakte.
  window.addEventListener('pointercancel', () => opruimen());
}
