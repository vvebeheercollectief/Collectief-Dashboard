// ══════════════════════════════════════
//  BUNDEL — pure logica voor de Takenbundel
// ══════════════════════════════════════
// Kernregel: élk lid van een bundel draagt hetzelfde `bundelId` (kolom R), óók de hoofdtaak —
// die draagt zijn eigen taaknummer, met volgnummer 0. Een bundel is dus "alle taken met hetzelfde
// nummer", en dat blijft waar of een lid nu open staat, afgerond is of verwijderd wordt.
//
// Deze module schrijft niets, raakt de DOM niet en doet geen netwerkverkeer en is volledig los
// testbaar. Let op: dat maakt hem onschadelijk, maar niet vanzelf zijn uitvoer — `hernummerLeden`
// deelt schrijfopdrachten uit die een aanroeper straks omzet in een cel-bereik, en die lijst moet
// dus zelf al veilig zijn (zie daar).
import { SKEYS } from "./config.js";

// Velden uit de Sheet komen vandaag altijd als string binnen, maar het herordenen zet bundelId en
// bundelVolg optimistisch op het rij-object (zie `nulVeilig` in crud.js). Eén getal zou hier een
// `.trim is not a function` geven, en omdat `bouwBundelIndex` bij élke render draait, zou dat de
// hele takenlijst wegnemen. Daarom overal langs deze ene helper.
const tekst = v => String(v ?? '').trim();

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

// De bundel waar deze taak in zit, of null. Een ontbrekende index is geen fout maar een vroege
// render (de gegevens zijn er nog niet) — dan hoort er simpelweg geen bundel te zijn.
export function bundelVan(index, r){
  const id = tekst(r && r.bundelId);
  if (!id || !index) return null;
  const leden = index.get(id);
  return isBundel(leden) ? leden : null;
}

// Volgnummers opnieuw uitdelen als 10, 20, 30 … in de gegeven volgorde.
// Geeft [{r, volg}] terug voor precies de leden die daadwerkelijk veranderen, zodat de
// schrijfactie zo klein mogelijk blijft.
//
// Afgeronde leden krijgen bewust GEEN schrijfopdracht. Hun rij staat in het tabblad 'Afgerond' en
// niet in 'Nog Te Doen', maar een geparste rij draagt alleen `_row`/`_sec` — aan de opdracht zelf
// is straks niet meer te zien uit welk tabblad hij kwam. De aanroeper zou er dan
// `'Nog Te Doen'!S<_row>` van maken en dus in een wildvreemde taak schrijven. Hier weglaten is de
// enige plek waar dat met zekerheid dicht zit; het scheelt bovendien schrijfwerk aan rijen die
// toch niet meer verplaatst worden (§3.3: de afgeronde hoofdtaak blijft bovenin het paneel).
// Gevolg: een afgerond lid houdt zijn oude nummer en kan dus met een nieuw nummer botsen — dan
// beslist de tiebreak op taaknummer, dus de volgorde blijft voorspelbaar (en §5: de ergste
// uitkomst van herordenen is een verkeerde vólgorde, nooit verloren werk).
// Voorwaarde aan de aanroeper: `af` moet waarheidsgetrouw meekomen, zoals `bouwBundelIndex` hem
// zet. Bouw je de sleepvolgorde uit de DOM, neem die vlag dan mee — hij is het enige onderscheid.
export function hernummerLeden(leden){
  const uit = [];
  (leden || []).forEach((m, i) => {
    if (m.af) return;
    const nieuw = String((i + 1) * 10);
    if (tekst(m.r.bundelVolg) !== nieuw) uit.push({ r: m.r, volg: nieuw });
  });
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
