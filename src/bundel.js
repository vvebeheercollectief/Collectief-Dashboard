// ══════════════════════════════════════
//  BUNDEL — pure logica voor de Takenbundel
// ══════════════════════════════════════
// Kernregel: élk lid van een bundel draagt hetzelfde `bundelId` (kolom R), óók de hoofdtaak —
// die draagt zijn eigen taaknummer, met volgnummer 0. Een bundel is dus "alle taken met hetzelfde
// nummer", en dat blijft waar of een lid nu open staat, afgerond is of verwijderd wordt.
//
// Deze module schrijft niets, raakt de DOM niet en doet geen netwerkverkeer — hij kan per
// definitie geen taak kwijtmaken en is volledig los testbaar.
import { SKEYS } from "./config.js";

// Volgnummer als getal. Ontbrekend of onleesbaar → achteraan, nooit een crash: een handmatig
// leeggemaakte cel in de Sheet mag de bundel niet laten omvallen.
const volgVan = r => {
  const n = parseInt(r && r.bundelVolg, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

// Alle bundels uit de huidige gegevens. Geeft Map<bundelId, Array<{r, af}>>, per bundel
// gesorteerd op volgnummer. `af` = dit lid komt uit 'Afgerond'.
// Leden uit 'Afgerond' tellen volwaardig mee: zonder hen zou een bundel leeglopen zodra er
// iets wordt afgevinkt, en zou de kop niet kunnen doorschuiven.
export function bouwBundelIndex(ntd, af){
  const m = new Map();
  const voegToe = (r, isAf) => {
    const id = ((r && r.bundelId) || '').trim();
    if (!id) return;
    // Vangrail voor 'Afgerond': een rij daar telt alleen mee als hij een taaknummer heeft.
    // Kolom Q van dat blad wordt alleen door de nieuwe afrondcode geschreven, dus élke rij van
    // vóór deze functie is daar leeg. Wat er in M..S van 'Afgerond' staat is nergens vastgelegd
    // (het dashboard schreef er nooit verder dan L) en was hier niet te controleren. Zonder deze
    // regel zou historische rommel in kolom R afgeronde rijen stil aan een niet-bestaande bundel
    // knopen. Volgt bovendien uit de logica: lidmaatschap is een verwijzing tussen taken met een
    // identiteit, en een rij zonder taaknummer heeft die niet.
    if (isAf && !((r.taakId || '').trim())) return;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push({ r, af: isAf });
  };
  SKEYS.forEach(s => ((ntd && ntd[s]) || []).forEach(r => voegToe(r, false)));
  SKEYS.forEach(s => ((af  && af[s])  || []).forEach(r => voegToe(r, true)));
  // Tiebreak op taaknummer, zodat de volgorde bij gelijke volgnummers voorspelbaar is
  // (en de tests niet op sorteertoeval leunen).
  m.forEach(leden => leden.sort((a, b) =>
    (volgVan(a.r) - volgVan(b.r)) || String(a.r.taakId||'').localeCompare(String(b.r.taakId||''))));
  return m;
}

// De zichtbare kop: het nog openstaande lid met het laagste volgnummer. null = alles afgerond.
// Deze ene regel dekt ook 'hoofdtaak afgerond' en 'hoofdtaak verwijderd' af.
export function zichtbareKop(leden){
  return (leden || []).find(m => !m.af) || null;
}

// Eén lid is geen bundel — dan tekenen we gewoon een normale taakrij.
export function isBundel(leden){ return !!leden && leden.length >= 2; }

// De bundel waar deze taak in zit, of null.
export function bundelVan(index, r){
  const id = ((r && r.bundelId) || '').trim();
  if (!id) return null;
  const leden = index.get(id);
  return isBundel(leden) ? leden : null;
}

// Volgnummers opnieuw uitdelen als 10, 20, 30 … in de gegeven volgorde.
// Geeft [{r, volg}] terug voor precies de leden die daadwerkelijk veranderen, zodat de
// schrijfactie zo klein mogelijk blijft.
export function hernummerLeden(leden){
  const uit = [];
  (leden || []).forEach((m, i) => {
    const nieuw = String((i + 1) * 10);
    if (String(m.r.bundelVolg || '') !== nieuw) uit.push({ r: m.r, volg: nieuw });
  });
  return uit;
}

// Volgnummer voor een lid dat achteraan wordt toegevoegd: hoogste + 10, met gaten van tien
// zodat er later tussen geschoven kan worden zonder alles te hernummeren.
export function volgendeVolg(leden){
  let max = 0;
  (leden || []).forEach(m => { const v = volgVan(m.r); if (v !== Number.MAX_SAFE_INTEGER && v > max) max = v; });
  return String(max + 10);
}
