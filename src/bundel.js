// ══════════════════════════════════════
//  BUNDEL — pure logica voor de Takenbundel
// ══════════════════════════════════════
// Kernregel: élk lid van een bundel draagt hetzelfde `bundelId` (kolom R), óók de hoofdtaak —
// die draagt zijn eigen taaknummer, bij het aanmaken met volgnummer 0. Een bundel is dus "alle
// taken met hetzelfde nummer", en dat blijft waar of een lid nu open staat, afgerond is of
// verwijderd wordt.
//
// Die 0 is een startwaarde, geen kenmerk. Bij het slepen hernummert `hernummerLeden` álle open
// leden — ook het anker (het lid waarvan het taaknummer het bundelnummer ís), want dat mag net zo
// goed verplaatst worden. Wie de kop is volgt daarom altijd uit `zichtbareKop` (het
// laagste OPEN volgnummer), nooit uit de waarde 0; en of een taak subtaken heeft volgt uit wie
// naar zijn taaknummer wijst (`magKoppelen`), nooit uit een volgnummer.
//
// Deze module schrijft niets, raakt de DOM niet en doet geen netwerkverkeer en is volledig los
// testbaar. Let op: dat maakt hem onschadelijk, maar niet vanzelf zijn uitvoer — `hernummerLeden`
// deelt schrijfopdrachten uit die een aanroeper straks omzet in een cel-bereik, en die lijst moet
// dus zelf al veilig zijn (zie daar).
import { SKEYS } from "./config.js";

// De sleutel waaronder een bundel bekend staat: `bundelId`, en het taaknummer waar dat naar
// verwijst. Die twee leven in dezelfde ruimte — het bundelnummer ís het taaknummer van de
// hoofdtaak — dus ze worden ook op dezelfde manier genormaliseerd.
//
// Waarom er genormaliseerd wordt: velden uit de Sheet komen vandaag altijd als string binnen, maar
// het herordenen zet bundelId en bundelVolg optimistisch op het rij-object (zie `nulVeilig` in
// crud.js). Eén getal zou hier een `.trim is not a function` geven, en omdat `bouwBundelIndex` bij
// élke render draait, zou dat de hele takenlijst wegnemen.
//
// Waarom geëxporteerd: de open-stand van een bundel (state.bundelOpen) wordt op deze sleutel
// bewaard, en die Set wordt op meerdere plekken gelezen én geschreven. Normaliseerde de schrijfkant
// anders dan de leeskant, dan gaat de getrimde sleutel de Set in terwijl `has()` naar de ongetrimde
// zoekt: de bundel opent dan wel, maar sluit nooit meer. Met één functie voor álle aanraakpunten
// kan dat verschil niet meer ontstaan.
export const bundelSleutel = v => String(v ?? '').trim();
const tekst = bundelSleutel;

// Volgnummer als getal. Ontbrekend of onleesbaar → achteraan, nooit een crash: een handmatig
// leeggemaakte cel in de Sheet mag de bundel niet laten omvallen.
const volgVan = r => {
  const n = parseInt(r && r.bundelVolg, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

// De volgorde binnen een bundel: volgnummer, en bij gelijkspel het taaknummer. Die tiebreak houdt
// de volgorde voorspelbaar (twee leden met hetzelfde nummer wisselen niet op sorteertoeval van
// plek) en wordt bewust gedeeld met `zichtbareKop`, zodat "de eerste" en "de laagste" nooit uit
// elkaar kunnen lopen.
const opVolgorde = (a, b) =>
  (volgVan(a.r) - volgVan(b.r)) || tekst(a.r.taakId).localeCompare(tekst(b.r.taakId));

// Dezelfde volgorde, maar over kale rijen in plaats van indexleden. Het dossier groepeert rijen
// die het uit zijn eigen deadline-sortering haalt; die moeten binnen de bundel weer op
// bundelVolg komen te staan, en wel volgens exact dezelfde regel als het paneel in de tabel.
export const opBundelVolg = (a, b) => opVolgorde({ r:a }, { r:b });

// Alle bundels uit de huidige gegevens. Geeft Map<bundelId, Array<{r, af}>>, per bundel
// gesorteerd op volgnummer. `af` = dit lid komt uit 'Afgerond'.
// Leden uit 'Afgerond' tellen volwaardig mee: zonder hen zou een bundel leeglopen zodra er
// iets wordt afgevinkt, en zou de kop niet kunnen doorschuiven.
export function bouwBundelIndex(ntd, af){
  const m = new Map();
  const voegToe = (r, isAf) => {
    const id = tekst(r && r.bundelId);
    if (!id) return;
    // Vangrail voor 'Afgerond': een rij daar telt alleen mee als hij een taaknummer heeft.
    // Kolom Q van dat blad wordt alleen door de nieuwe afrondcode geschreven, dus élke rij van
    // vóór deze functie is daar leeg. Wat er in M..S van 'Afgerond' staat is nergens vastgelegd
    // (het dashboard schreef er nooit verder dan L) en was hier niet te controleren. Zonder deze
    // regel zou historische rommel in kolom R afgeronde rijen stil aan een niet-bestaande bundel
    // knopen. Volgt bovendien uit de logica: lidmaatschap is een verwijzing tussen taken met een
    // identiteit, en een rij zonder taaknummer heeft die niet.
    if (isAf && !tekst(r.taakId)) return;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push({ r, af: isAf });
  };
  SKEYS.forEach(s => ((ntd && ntd[s]) || []).forEach(r => voegToe(r, false)));
  SKEYS.forEach(s => ((af  && af[s])  || []).forEach(r => voegToe(r, true)));
  m.forEach(leden => leden.sort(opVolgorde));
  return m;
}

// Wat de bundelweergave in déze render mag doen: de index plus twee vlaggen. Eén producent, zodat
// er geen render kan bestaan die de ene helft van de weergave aan- en de andere uitzet.
//
//  - `stapel` dekt álles wat de bundel als één blok toont: chevron, telpill, stapelrandjes, het
//    paneel én de absorptie van subtaken uit de vlakke lijst. Dat gaat uit zodra de lijst plat is
//    (zoeken, filteren, kolomsortering, bulk): een treffer mag niet verstopt zitten in een
//    dichtgeklapte bundel en een vaste groepering is in strijd met een gekozen sortering (§4.2).
//  - `merk` (het bundel-merkje) blijft in platte weergave juist wél staan — daar is het volgens §4.2 de
//    ENIGE aanwijzing dat een taak bij een bundel hoort. Een eerdere versie loste 'plat' op door de
//    index leeg te maken; dat zette met de stapel ook het merkje uit, en dan was een bundel vanuit
//    een gefilterde lijst helemaal niet meer te bereiken.
//  - Alleen in bulk-modus valt óók het merkje weg. Klikken op het merkje springt naar een ander
//    tabblad en `setNtd` wist daarbij de selectie; een half gemaakte bulk-selectie mag niet met één
//    misklik verdwijnen. In bulk-modus is elke rij een aanvinkbaar item en verder niets.
//
// Als eigen functie en niet als twee ternary's in `renderNtd`: dan is er één producent voor de
// twee vlaggen en kan er geen render bestaan die de ene helft van de weergave aanzet en de andere
// niet. Los ernaast staat dat de vlaggen zo zónder DOM te toetsen zijn; de bedrading naar
// `renderNtd` zelf ligt wél vast in de testronde — die roept hem echt aan (zie het `bedrading:`-blok
// in tests.js, dat na een zoekterm de platte lijst, de ontbrekende telpill en het merkje meet).
export function bundelWeergave({ plat, bulk }, ntd, af){
  return { ix: bouwBundelIndex(ntd, af), stapel: !plat, merk: !bulk };
}

// De zichtbare kop: het nog openstaande lid met het laagste volgnummer. null = alles afgerond.
// Deze ene regel dekt ook 'hoofdtaak afgerond' en 'hoofdtaak verwijderd' af.
// Bewust zoekend en niet "het eerste open lid": uit `bouwBundelIndex` komt de lijst gesorteerd,
// maar bij het slepen komt de volgorde straks uit de DOM en dan is dat niet meer gegarandeerd.
export function zichtbareKop(leden){
  let kop = null;
  (leden || []).forEach(m => { if (!m.af && (!kop || opVolgorde(m, kop) < 0)) kop = m; });
  return kop;
}

// Eén lid is geen bundel — dan tekenen we gewoon een normale taakrij.
export function isBundel(leden){ return !!leden && leden.length >= 2; }

// Stand van de bundel: alles behalve de zichtbare kop zelf — dus precies wat in het paneel staat.
// Zo blijft het getal stabiel terwijl een bundel vordert en de kop doorschuift.
export function bundelStand(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  return { klaar: rest.filter(m => m.af).length, totaal: rest.length };
}

// De bundel met dít nummer, of null. Een ontbrekende index is geen fout maar een vroege render
// (de gegevens zijn er nog niet) — dan hoort er simpelweg geen bundel te zijn.
// Gaat langs `isBundel`, dus ook een bundel die tot één lid gekrompen is levert null: tussen
// tekenen en klikken kan er een lid afgevinkt of verwijderd zijn, en dan is er niets meer om
// naartoe te springen of open te klappen.
export function bundelMetId(index, id){
  const k = tekst(id);
  if (!k || !index) return null;
  const leden = index.get(k);
  return isBundel(leden) ? leden : null;
}

// Dezelfde vraag vanuit een taakrij: in welke bundel zit deze taak?
export function bundelVan(index, r){ return bundelMetId(index, r && r.bundelId); }

// Zijn dit twee verwijzingen naar dezelfde taak? Op het vaste taaknummer, met het rijnummer als
// terugval voor rijen die er nog geen hebben (van vóór de backfill, of aangemaakt door een oude
// client). Die terugval is alleen betrouwbaar binnen één tabblad — `_row` is het regelnummer ín het
// blad, dus rij 12 van 'Nog Te Doen' en rij 12 van 'Afgerond' zijn verschillende taken. Dat is bij
// beide gebruikers gedekt: `wordtGeabsorbeerd` en `bundelMerkje` vergelijken een OPEN kop (die komt
// per definitie uit 'Nog Te Doen') met een rij uit de takenlijst van datzelfde blad.
//
// Bewust NIET op objectidentiteit — zie de voorwaarde bij `wordtGeabsorbeerd`. Twee verschillende
// rijen die hetzelfde taaknummer dragen (een dubbele rij in de Sheet, precies wat `checkNummers`
// meldt) tellen zo als dezelfde taak. Dat is de veilige kant op: het gevolg is dat er niets wordt
// opgeslokt en beide rijen blijven staan.
export const zelfdeTaak = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = tekst(a.taakId), nb = tekst(b.taakId);
  if (na || nb) return na === nb;          // één mét en één zónder nummer = verschillende taken
  return a._row != null && a._row === b._row;
};

// Wordt deze rij in dít tabblad opgeslokt door het paneel van zijn kop? Waar = de rij hoort hier
// niet in de vlakke lijst, want hij wordt onder de kop getekend.
//
// Eén predikaat voor twee beslissingen die elkaars exacte tegenpool MOETEN blijven: `absorbeer`
// (render-lijsten.js) haalt de rij uit de lijst, `bundelMerkje` (render-bundel.js) laat het
// bundel-merkje juist weg. Leidde elk dat zelf af, dan lopen ze bij de eerstvolgende wijziging stil
// uit elkaar: een merkje op een rij die nergens meer staat, of een rij die blijft staan zonder
// enige aanwijzing dat hij bij een bundel hoort. Beide gevallen geven geen fout — ze zien er
// alleen verkeerd uit.
//
// Voorwaarde aan de aanroeper: GEEN. `index` en `r` hoeven nadrukkelijk niet uit dezelfde
// momentopname te komen, en dáárom gaat 'ben ik zelf de kop' via `zelfdeTaak` en niet via
// objectidentiteit. Vandaag komen ze wél uit dezelfde synchrone renderNtd, maar deze functie is
// geëxporteerd en het gevolg van een schending is hier het ergst denkbare: een kop uit een oudere
// leesronde is een ánder object met hetzelfde taaknummer, zou `kop.r === r` missen, doorvallen
// naar de _sec-regel en zichzelf wegabsorberen — de taak verdwijnt dan uit de lijst. Vergelijken
// op identiteit is dus niet 'strenger', het is stiller kapot.
export function wordtGeabsorbeerd(r, index, sec){
  const leden = bundelVan(index, r);
  if (!leden) return false;
  const kop = zichtbareKop(leden);
  if (!kop || zelfdeTaak(kop.r, r)) return false;  // geen open lid meer, of zelf de kop → blijft staan
  return kop.r._sec === sec;                       // kop in hetzelfde tabblad → het paneel tekent hem
}

// Wat is deze rij binnen haar bundel? Eén antwoord voor de drie plekken die dat tonen: het platte
// bundelmerkje in de takenlijst, de rij op de VvE-dossierpagina en het veld 'Hoort bij' in het
// bewerkscherm. (De melding na het slepen leest alleen de zín uit `taakVerwijzing`, niet de stand.)
//
//   null                            → zit in geen bundel (of de bundel is tot één lid gekrompen)
//   { rol:'kop', klaar, totaal }    → is de zichtbare kop; telling zoals de telpill hem toont
//   { rol:'sub', kopRij }           → is een stap; `kopRij` is de RIJ van de zichtbare kop
//
// Bewust géén eigen regels: wie de kop is komt uit `zichtbareKop`, wat een bundel is uit
// `bundelVan`/`isBundel`, en de telling uit `bundelStand`. Zou deze functie dat zelf afleiden,
// dan kan het label straks iets anders zeggen dan de stapel eronder laat zien — en dat is een
// stil verschil, precies het soort fout waar deze hele wijziging op reageert.
//
// Voorwaarde aan de aanroeper: GEEN. `r` en `index` hoeven niet uit dezelfde momentopname te
// komen; de vergelijking loopt daarom via `zelfdeTaak` (taaknummer) en niet via objectidentiteit.
export function bundelVerwijzing(r, index){
  const leden = bundelVan(index, r);
  if (!leden) return null;
  const kop = zichtbareKop(leden);
  if (!kop) return null;                       // alles afgerond
  if (zelfdeTaak(kop.r, r)){
    const { klaar, totaal } = bundelStand(leden, kop);
    return { rol:'kop', klaar, totaal };
  }
  return { rol:'sub', kopRij: kop.r };
}

// De subtaken van een taak: de leden die naar zíjn taaknummer wijzen — open én afgerond.
// Eén aanroeper: `magKoppelen`, die de lijst ongefilterd als nesting-vangrail gebruikt (mag deze
// taak zelf nog ergens onder hangen?). Afgeronde subtaken tellen daar gewoon mee; ze bewijzen net
// zo goed dat deze taak een hoofdtaak is.
//
// `openSubtaken` stelde deze vraag ooit ook, maar is bij commit f9d003f omgebouwd naar
// `bundelVan` + `zichtbareKop` — zie de toelichting daar. Deze functie is dus geen gedeelde bron
// meer; hij staat apart omdat `magKoppelen` een wezenlijk andere vraag stelt dan 'wie is de kop'.
//
// Voorwaarde aan de aanroeper: GEEN — net als bij `wordtGeabsorbeerd` en `bundelVerwijzing`.
// Hier stond ooit wél een voorwaarde ('index en r uit dezelfde momentopname'), afgedwongen door de
// taak zélf op OBJECT-IDENTITEIT uit de lijst te filteren (`m.r !== r`). Die voorwaarde was in de
// praktijk onhoudbaar en is op 26-08-2026 kapotgegaan op productie:
//
//   `loadAll` (data.js) vervangt D.ntd bij ÉLKE geslaagde poll door verse rij-objecten, maar
//   `renderAll` — en daarmee state._rowCache en de DOM — draait alleen als de datahash wijzigde.
//   Verandert er acht seconden lang niets, dan wijst de cache dus per definitie naar rij-objecten
//   uit een oudere ronde dan de index die `koppelTaak` uit D.ntd bouwt. Het gevolg was dat een taak
//   ZICHZELF als subtaak telde en `magKoppelen` élke koppeling weigerde met een melding over
//   subtaken die niet bestaan. Zichtbaar zodra kolom R van een rij naar haar eigen taaknummer
//   wijst — precies wat een hoofdtaak overhoudt nadat het stapelen ongedaan is gemaakt (zie de
//   toelichting bij de undo in `koppelTaak`). Dezelfde fout maakte de kiezer van 'Hoort bij' leeg,
//   want die loopt via `koppelKandidaten` over dezelfde guard.
//
// Waarom er niet gewoon op taaknummer vergeleken wordt, zoals `zelfdeTaak` elders doet: twee
// verschillende rijen kunnen hetzelfde nummer dragen (een dubbele rij in de Sheet, precies wat
// `checkNummers` meldt), en dán is die verwijzing wél echt. Het RIJADRES (`_sec` + `_row`) houdt de
// twee gevallen uit elkaar: dezelfde taak uit een andere ronde staat op dezelfde plek in hetzelfde
// blad, een dubbele rij per definitie niet.
const zelfdeRij = (a, b) => {
  if (a === b) return true;                                   // zelfde ronde: klaar
  if (!a || !b) return false;
  if (tekst(a.taakId) !== tekst(b.taakId)) return false;      // ander nummer = andere taak
  // `_row != null` is dragend: rijen zónder rijnummer (handmatig gebouwd in een toets, of een rij
  // die nog nergens staat) mogen niet allemaal als 'dezelfde rij' op één hoop belanden.
  return a._sec === b._sec && a._row != null && a._row === b._row;
};

// Heeft deze taak zélf subtaken? Geëxporteerd zodat het BEWERKSCHERM dezelfde vraag stelt als de
// guard in `magKoppelen`. Dat scherm toetste hem eerder op `bundelVerwijzing(...).rol === 'kop'`,
// en dat is een ándere vraag: die rol volgt de ZICHTBARE kop (het laagste OPEN volgnummer), terwijl
// deze op identiteit kijkt. Twee gevolgen, allebei verwarrend: het veld 'Hoort bij' stond op slot
// bij een taak die niets onder zich had (alle subtaken afgerond → de kop is nog steeds 'kop'), en
// het stond OPEN bij een taak die wél subtaken heeft maar zelf niet de zichtbare kop is — waarna
// het opslaan alsnog afketste op `magKoppelen`. Eén bron voor één vraag.
export function heeftSubtaken(index, r){ return subtakenVan(index, r).length > 0; }

function subtakenVan(index, r){
  const nr = tekst(r && r.taakId);
  // Geen taaknummer = niets om naar te wijzen, dus per definitie geen subtaken. Deze regel kan het
  // antwoord echter niet veranderen: `bouwBundelIndex` slaat een lege sleutel nooit op, dus
  // `get('')` geeft daar altijd undefined en de `|| []` hieronder levert al een lege lijst. Hij
  // staat er als vangnet voor een index van andere makelij, niet als dragende stap — de bijbehorende
  // test blijft dan ook groen zonder hem.
  if (!nr) return [];
  // Het `index &&` ernaast is wél dragend: een ontbrekende index is geen fout maar een vroege
  // render (zelfde afweging als in `bundelMetId`).
  return ((index && index.get(nr)) || []).filter(m => !zelfdeRij(m.r, r));
}

// Mag `bron` als subtaak onder `doel` komen te hangen?
// Geeft {mag, reden, bundelId} — bundelId is de bundel waar bron in terechtkomt.
//
// Twee dingen liggen hier vast:
//  - Vallen op een lid dat al in een bundel zit voegt je toe aan DIE bundel. Zo kan er geen
//    fout ontstaan door 'op de verkeerde helft' te mikken.
//  - Een taak die zélf al subtaken heeft kan nergens onder. Dat houdt de structuur
//    gegarandeerd één laag diep, en wel bij het koppelen — niet pas bij het tekenen.
export function magKoppelen(bron, doel, index){
  if (!bron || !doel) return { mag:false, reden:'Onbekende taak.', bundelId:null };
  if (bron === doel || (tekst(bron.taakId) && tekst(bron.taakId) === tekst(doel.taakId)))
    return { mag:false, reden:'Een taak kan niet onder zichzelf hangen.', bundelId:null };

  // Heeft bron zélf subtaken? Dat is een vraag over IDENTITEIT — "draagt een andere rij mijn
  // taaknummer als bundelnummer?" — en nadrukkelijk niet over positie. Een guard die volgnummers
  // vergelijkt loopt namelijk twee kanten op mis: hij weigert een gewone subtaak die toevallig een
  // broer áchter zich heeft, én hij laat het anker van een bundel wél los zodra geen enkel ander
  // lid een hóger nummer heeft. Dat laatste ontstaat vanzelf: `hernummerLeden` schuift het anker
  // omhoog terwijl afgeronde leden hun nummer houden. Op identiteit toetsen dicht beide gaten.
  // Afgeronde subtaken tellen hier gewoon mee; zie `subtakenVan` voor de voorwaarde die deze
  // vraag aan de aanroeper stelt.
  if (subtakenVan(index, bron).length)
    return { mag:false, reden:'Deze taak heeft zelf subtaken; ontkoppel die eerst.', bundelId:null };

  const doelBundel = tekst(doel.bundelId);
  const bronBundel = tekst(bron.bundelId);
  if (doelBundel && bronBundel && doelBundel === bronBundel)
    return { mag:false, reden:'Deze taak zit al in deze bundel.', bundelId:null };

  // Nieuwe bundel: het doel wordt de hoofdtaak en draagt zijn eigen taaknummer als bundelnummer.
  // Heeft het doel nog geen taaknummer (rij van vóór de backfill), dan kent de schrijfweg er
  // eerst één toe — dat kan hier niet, want deze module is puur.
  return { mag:true, reden:'', bundelId: doelBundel || tekst(doel.taakId) || null };
}

// Hoeveel openstaande leden laat déze taak achter als je hem afvinkt? Alleen de zichtbare kop
// stelt die vraag; een subtaak afvinken is de dagelijkse handeling en moet stil blijven — §5 legt
// vast dat subtaak 3 afgerond mag worden terwijl 1 en 2 nog openstaan.
//
// Op ZICHTBARE KOP toetsen en niet op `subtakenVan` (dat opzoekt wie er naar mijn taaknummer
// wijst). Dat laatste stond hier eerst en klopte alleen voor de OORSPRONKELIJKE hoofdtaak: alleen
// díe draagt zijn eigen taaknummer als bundelnummer. Zodra de kop doorschuift — precies wat §3.3
// voorschrijft zodra de hoofdtaak is afgerond of verwijderd — vindt zo'n opzoeking niets meer en
// bleef de waarschuwing stil weg. Live gevangen op de testomgeving, met een bundel waarvan de kop
// was doorgeschoven; dat is geen randgeval maar de gewone stand ná het eerste vinkje.
//
// Afgeronde leden tellen niet mee: die laten niets liggen om voor te waarschuwen. Daarin verschilt
// deze telling van de vangrail in `magKoppelen`, die dezelfde lijst juist ongefilterd gebruikt.
// `negeer` (optioneel): een Set met rij-objecten die NIET als achterblijver tellen — bij een
// bulk-actie zijn dat de taken die in dezelfde handeling worden meegenomen. Zonder dat waarschuwde
// de vraag 'er blijven nog subtaken staan' óók als die subtaken gewoon in de selectie zaten, en dat
// is de hoofdzaak en niet het randgeval: het kopvinkje zet de lijst plat en pakt bundelkoppen en
// subtaken door elkaar. Een waarschuwing die bijna altijd vals afgaat, wordt niet meer gelezen op
// de dag dat er wél iets blijft staan.
export function openSubtaken(index, r, negeer){
  const leden = bundelVan(index, r);
  if (!leden) return 0;
  const kop = zichtbareKop(leden);
  if (!kop || !zelfdeTaak(kop.r, r)) return 0;   // geen kop = geen vraag
  return leden.filter(m => !m.af && !zelfdeTaak(m.r, r) && !(negeer && negeer.has(m.r))).length;
}

// Waarschuwingstekst bij het afronden van een taak met openstaande subtaken. Lege string = niets te
// melden. Het is een waarschuwing en geen blokkade.
//
// In de OPSLAG valt de bundel hier niet uit elkaar: hij is 'alle rijen met hetzelfde bundelnummer',
// `afrondWaarden` schrijft taaknummer én bundelnummer mee naar 'Afgerond' (Q, R, S) en
// `bouwBundelIndex` telt die rijen gewoon mee. De kop schuift dus enkel door naar het
// eerstvolgende openstaande lid (zie `zichtbareKop`).
//
// Op het SCHERM is er wél een gat, en de melding belooft daar niets over: `doCompleteTask` haalt de
// rij optimistisch uit D.ntd en zet hem niet in D.af. Bij een bundel van twee zakt de index daardoor
// naar één lid, waarmee `isBundel` false wordt — de overgebleven subtaak toont zich dan een paar
// seconden als gewone rij, zonder paneel en zonder merkje, tot de `loadAll(true)` ná de schrijfactie hem
// uit 'Afgerond' terugleest. Dat komt uit fase C en staat hier alleen genoteerd zodat een latere
// lezer het niet als storing aanziet.
//
// Alleen de constatering, zonder de vraag erachter ('… — toch afronden?'). Die staat sinds het
// eigen bevestigingsvenster op het knoplabel ('Toch afronden'), en in de tekst ernaast zou hij
// dubbel staan. Bij `window.confirm()` kon dat niet: die knoppen heten OK en Annuleren.
export function bundelWaarschuwing(index, r){
  const n = openSubtaken(index, r);
  if (!n) return '';
  return n === 1
    ? 'Er staat nog 1 subtaak open.'
    : `Er staan nog ${n} subtaken open.`;
}

// ── De taakkiezer van 'Hoort bij' ────────────────────────────────────────────
// Welke taken mogen als doel dienen? Precies wat `magKoppelen` toestaat, en niets anders — deze
// lijst heeft bewust GEEN eigen regels. Een tweede regel naast de guard gaat er bij de
// eerstvolgende wijziging stil vanaf lopen, en dan biedt de kiezer keuzes aan die bij het klikken
// alsnog met een melding afketsen (of erger: hij verbergt keuzes die wél mogen).
// Vallen op een subtaak is dus toegestaan — dat voegt je toe aan diezelfde bundel (zie
// `magKoppelen`) — en een taak die zelf subtaken heeft houdt een lege lijst over.
//
// Alleen de open taken (`ntd`), niet 'Afgerond': die rijen staan in een ander tabblad en worden
// door de schrijfweg sowieso geweigerd (`blokkeerAfgerond` in bundel-acties.js), dus ze aanbieden
// zou een keuze zijn die per definitie op een foutmelding uitloopt.
export function koppelKandidaten(ntd, index, bron){
  const uit = [];
  SKEYS.forEach(s => ((ntd && ntd[s]) || []).forEach(r => {
    if (magKoppelen(bron, r, index).mag) uit.push(r);
  }));
  return uit;
}

// De velden waarin het zoekveld naar de omschrijving zoekt. Welk veld de getóónde regel wordt
// verschilt per tabblad (zie `taakTitel` in util.js): een vergaderverzoek heeft een periode, een
// LOD-taak een status, een offerte-traject leunt op zijn opmerkingen. Ze staan hier daarom
// allemaal — zoekt het filter maar in één kolom, dan is de halve lijst met geen mogelijkheid te
// vinden en lijkt de kiezer stuk.
const TAAK_ZOEKVELDEN = ['actiepunt', 'agendapunten', 'periode', 'status', 'subsidie', 'opmerkingen'];

// Zoekfilter voor de taakkiezer: VvE-code, VvE-naam en de omschrijving. Lege zoekterm → alles,
// zelfde vorm als `filterVves` (vve-zoekveld.js), want de component wisselt ze om.
export function taakFilter(q, lijst){
  const zoek = v => String(v ?? '').toLowerCase();
  const z = zoek(q).trim();
  const alles = (lijst || []).filter(Boolean);
  if (!z) return alles;
  return alles.filter(r =>
    zoek(r.code).includes(z) ||
    zoek(r.naam).includes(z) ||
    TAAK_ZOEKVELDEN.some(k => zoek(r[k]).includes(z)));
}

// `k` strikt stijgende nummers in de open ruimte tussen `laag` en `boven` (beide zelf uitgesloten).
// Hoort bij `hernummerLeden`; daar staat waarom er een bovengrens is.
function verdeelRuimte(laag, boven, k, bezet){
  const reeks = (eerste, stap) => Array.from({ length:k }, (_, t) => eerste + t * stap);
  // 1. Het gewone geval: ronde tientallen, met gaten om later tussen te schuiven (§3.4).
  const tien = (Math.floor(laag / 10) + 1) * 10;
  if (tien + (k - 1) * 10 < boven) return reeks(tien, 10);
  // 2. Twee vaste nummers dicht op elkaar: verdeel het gat gelijk. Dat levert oneven nummers op
  //    (15, 16, 17 …), maar de volgorde die de gebruiker net met de muis maakte weegt zwaarder
  //    dan een rond getal. Ze worden pas weer rond zodra de klemmende afgeronde buur uit de
  //    bundel verdwijnt of het lid het gat uit gesleept wordt: hernummerLeden is idempotent, dus
  //    een tweede sleepactie met dezelfde buren levert exact dezelfde nummers op.
  const stap = Math.floor((boven - laag) / (k + 1));
  if (stap >= 1) return reeks(laag + stap, stap);
  // 3. Er past geen enkel getal meer tussen. Dan telt de reeks door vóórbij het vaste nummer: de
  //    leden landen er in beeld áchter in plaats van ervoor. Dat is de enige plek waar de
  //    getoonde volgorde van de gesleepte kan afwijken, en het blijft bij een verkeerde volgorde
  //    (§5) — botsen doen de nummers niet, want de reeks slaat bezette nummers over. Het aantal
  //    pogingen is begrensd op het aantal bezette nummers PLUS ÉÉN, en die +1 is precies wat de
  //    botsingsvrijheid draagt: elke poging levert een strikt oplopend, uniek veelvoud van tien,
  //    dus pas bij `bezet.size + 1` kandidaten garandeert het duivenhokprincipe dat er één vrij
  //    tussen zit. Met exact `bezet.size` pogingen kunnen ze in het slechtste geval állemaal
  //    bezet zijn en pusht de lus alsnog een bezet nummer. Een bovengrens is er wél nodig: een
  //    astronomisch getal uit een handmatig bewerkte cel schuift in drijvende komma niet meer op,
  //    en dan is een verkeerde volgorde oneindig veel beter dan een vastloper.
  const uit = [];
  let n = laag;
  for (let t = 0; t < k; t++) {
    // De + 1 hoort bij de duivenhok-redenering hierboven; hem 'opruimen' haalt de enige reden weg
    // waarom deze tak niet kan botsen.
    for (let poging = bezet.size + 1; poging > 0; poging--) {
      n = (Math.floor(n / 10) + 1) * 10;
      if (!bezet.has(n)) break;
    }
    uit.push(n);
  }
  return uit;
}

// Volgnummers opnieuw uitdelen in de gegeven (gesleepte) volgorde: 10, 20, 30 …
// Geeft [{r, volg}] terug voor precies de leden die daadwerkelijk veranderen, zodat de
// schrijfactie zo klein mogelijk blijft.
//
// Afgeronde leden krijgen bewust GEEN schrijfopdracht. Hun rij staat in het tabblad 'Afgerond' en
// niet in 'Nog Te Doen', maar een geparste rij draagt alleen `_row`/`_sec` — aan de opdracht zelf
// is straks niet meer te zien uit welk tabblad hij kwam. De aanroeper zou er dan
// `'Nog Te Doen'!S<_row>` van maken en dus in een wildvreemde taak schrijven. Hier weglaten is de
// enige plek waar dat met zekerheid dicht zit; het scheelt bovendien schrijfwerk aan rijen die
// toch niet meer verplaatst worden (§3.3: de afgeronde hoofdtaak blijft bovenin het paneel).
//
// Daardoor liggen hún nummers VAST, en moet de nieuwe reeks in de gaten ertussen passen. Puur
// omhoog tellen kan dat niet: een open lid komt dan nooit vóór een afgerond lid. Dat is geen
// randgeval maar de gewone stand na één vinkje — hoofdtaak open op 0, subtaak afgevinkt op 10 —
// en elke sleepactie elders in het paneel zou die twee dan omdraaien, zonder dat de gebruiker
// over dat paar iets sleepte. Daarom deelt `verdeelRuimte` de nummers uit binnen het gat tot het
// eerstvolgende vaste nummer. Alleen als daar écht geen getal meer in past telt de reeks door
// voorbij dat lid (zie geval 3 daar).
//
// Voorwaarde aan de aanroeper: `af` moet waarheidsgetrouw meekomen, zoals `bouwBundelIndex` hem
// zet. De sleepweg voldoet daaraan omdat hij de LEDEN uit die index hergebruikt en alleen de
// VOLGORDE uit de DOM haalt (zie `sleepUitslag`); bouw je zo'n lijst zelf op, neem de vlag dan
// over — hij is het enige onderscheid.
// Een afgerond lid met een onleesbaar volgnummer (handmatig gewiste cel) is géén vast punt: er is
// dan niets om omheen te tellen. Zo'n lid sorteert via `volgVan` achteraan en zakt dus naar de
// staart van de bundel — rommel hoort achteraan (§5), en het alternatief zou zijn dat één lege
// cel de hele reeks gijzelt.
export function hernummerLeden(leden){
  const lijst = leden || [];
  // De vaste nummers: alles wat een afgerond lid vasthoudt.
  const bezet = new Set();
  lijst.forEach(m => {
    if (!m.af) return;
    const v = volgVan(m.r);
    if (v !== Number.MAX_SAFE_INTEGER) bezet.add(v);
  });

  const uit = [];
  let laag = 0; // ondergrens: alles wat nog uitgedeeld wordt ligt hierboven
  let i = 0;
  while (i < lijst.length) {
    if (lijst[i].af) {
      // Een afgerond lid houdt zijn nummer, dus alles wat er in de sleepvolgorde áchter staat
      // moet er ook numeriek boven uitkomen — anders springt het in beeld alsnog vóór hem.
      const v = volgVan(lijst[i].r);
      if (v !== Number.MAX_SAFE_INTEGER && v > laag) laag = v;
      i++;
      continue;
    }
    // Een aaneengesloten reeks open leden krijgt in één keer een plek in het gat erboven. De
    // bovengrens is het LAAGSTE vaste nummer boven `laag`, gezocht over de hele lijst en niet
    // alleen bij het eerstvolgende afgeronde lid: zo ligt er per definitie geen vast nummer
    // binnen het gat, ook niet als de leden in een andere dan de getoonde volgorde binnenkomen.
    let j = i;
    while (j < lijst.length && !lijst[j].af) j++;
    let boven = Number.MAX_SAFE_INTEGER;
    bezet.forEach(v => { if (v > laag && v < boven) boven = v; });

    const nrs = verdeelRuimte(laag, boven, j - i, bezet);
    for (let t = i; t < j; t++) {
      const nieuw = String(nrs[t - i]);
      if (tekst(lijst[t].r.bundelVolg) !== nieuw) uit.push({ r: lijst[t].r, volg: nieuw });
    }
    laag = nrs[nrs.length - 1];
    i = j;
  }
  return uit;
}

// Volgnummer voor een lid dat achteraan wordt toegevoegd: hoogste + 10, met gaten van tien
// zodat er later tussen geschoven kan worden zonder alles te hernummeren.
// Afgeronde leden tellen hier wél mee — hun nummer blijft immers staan (zie `hernummerLeden`),
// en een nieuwe subtaak mag er niet bovenop landen.
export function volgendeVolg(leden){
  let max = 0;
  (leden || []).forEach(m => { const v = volgVan(m.r); if (v !== Number.MAX_SAFE_INTEGER && v > max) max = v; });
  return String(max + 10);
}
