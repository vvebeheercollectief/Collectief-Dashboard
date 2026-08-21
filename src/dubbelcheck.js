// ══════════════════════════════════════
//  DUBBELCHECK — waarschuwen als een nieuwe taak al lijkt te bestaan
// ══════════════════════════════════════
//
// WAAROM DIT BESTAAT. Een bewoner belt, jij legt het vast; twee uur later mailt dezelfde bewoner
// en maakt een collega dezelfde taak aan. Dan bellen er twee mensen dezelfde aannemer over
// hetzelfde lek. Met drie mensen in één lijst is dat geen randgeval.
//
// WAT DIT NADRUKKELIJK NIET IS: een blokkade. Twee taken die op elkaar lijken zijn soms écht twee
// taken ("dakgoot links" en "dakgoot rechts"), en een dashboard dat je tegenhoudt op een vermoeden
// leert je vooral om door de waarschuwing heen te klikken. Het is één vraag, met de gevonden taak
// erbij zodat je zelf kunt zien of het klopt.
//
// DE MAATSTAF IS EXPRES UITLEGBAAR EN GEEN ZWARTE DOOS. Twee omschrijvingen worden teruggebracht
// tot hun betekenisvolle woorden (kleine letters, leestekens weg, stopwoorden en woorden van twee
// letters eruit). Daarna gelden er TWEE regels, en één ervan is genoeg:
//   1. OVERLAP — twee keer het aantal gedeelde woorden gedeeld door het totaal. Twee identieke
//      zinnen geven 1, twee zinnen zonder gedeeld woord 0. Vanaf 0,6 stellen we de vraag.
//   2. VERVAT — alle woorden van de kortste zitten in de langste.
// Gemeten aan echte omschrijvingen:
//   'Lekkage dak reparatie' vs 'Lekkage dak repareren'    → 0,67  → vragen  (regel 1)
//   'Lekkage dak repareren' vs 'Lekkage dak'              → 0,80  → vragen  (regel 1 én 2)
//   'Lekkage dak' vs 'Lekkage dak spoedig laten oplossen' → 0,57 maar vervat → vragen (regel 2)
//   'Dakgoot schoonmaken'   vs 'Dakgoot vervangen'        → 0,50  → zwijgen (ander werk)
//   'Lekkage dak repareren' vs 'Lekkage dak melden bij gemeente' → 0,57, niet vervat → zwijgen
//   'Jaarrekening 2026 controleren' vs 'Jaarrekening opstellen'  → 0,40  → zwijgen
// Die laatste twee zijn de prijs van voorzichtigheid: het zijn randgevallen waar een mens het ook
// niet zeker weet, en een waarschuwing die te vaak onterecht komt leert je hem weg te klikken.
// De drempel staat als één getal in de code, niet verspreid, juist omdat hij een afweging is en
// geen natuurwet.
import { SECS, SKEYS } from "./config.js";
import { taakTitel } from "./util.js";

const DUBBEL_DREMPEL = 0.6;
const DUBBEL_MAX = 3;          // meer dan drie voorbeelden helpen niet bij een ja/nee-vraag

// Woorden die in élke taakomschrijving voorkomen en dus niets zeggen over gelijkenis. Zonder deze
// lijst haalt 'De dakgoot van het pand' een hoge score met 'De brief van de gemeente' — puur op
// 'de', 'van' en 'het'.
const STOPWOORDEN = new Set([
  'de','het','een','en','van','voor','op','in','met','te','bij','aan','naar','uit','om','over',
  'is','zijn','was','er','dat','die','deze','ook','nog','wordt','worden','moet','moeten','graag',
  'we','wij','ze','hij','hun','ons','onze','via','per','als','dan','maar','of','naar','tot',
]);

// Leestekens en dubbele spaties eruit, alles klein. `À-ſ` houdt de letters met accenten
// heel (é, ë, ü); zonder dat bereik zou 'geërfd' in tweeën vallen.
function _normaliseer(tekst){
  return String(tekst == null ? '' : tekst)
    .toLowerCase()
    .replace(/[^a-z0-9À-ſ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// De betekenisvolle woorden van een omschrijving. Woorden van twee letters of korter vallen af:
// dat zijn in de praktijk afkortingen en resten van leestekens, geen onderwerp.
function woorden(tekst){
  return _normaliseer(tekst).split(' ').filter(w => w.length > 2 && !STOPWOORDEN.has(w));
}

// 0 = niets gemeen, 1 = dezelfde woorden. Twee keer de overlap gedeeld door het totaal
// (de Dice-coëfficiënt), zodat een lange en een korte omschrijving elkaar niet automatisch
// wegdrukken. Een omschrijving zónder betekenisvolle woorden geeft 0 — dan valt er niets te
// vergelijken en is zwijgen het enige eerlijke antwoord.
function gelijkenis(a, b){
  const A = new Set(woorden(a)), B = new Set(woorden(b));
  if(!A.size || !B.size) return 0;
  let gedeeld = 0;
  A.forEach(w => { if(B.has(w)) gedeeld++; });
  return (2 * gedeeld) / (A.size + B.size);
}

// Zit de ene omschrijving hélemaal in de andere? Dat is het klassieke dubbele geval: de een noteert
// 'Lekkage dak', de ander 'Lekkage dak repareren'. Op de score alleen valt dat net buiten de boot
// (gemeten: 0,80 haalt het wel, maar 'Lekkage dak' tegen 'Lekkage dak spoedig laten repareren'
// zakt naar 0,57), terwijl er geen twijfel over bestaat dat het hetzelfde werk is.
//
// Bewust een APARTE regel en niet 'de drempel maar lager'. Verlagen naar 0,5 zou ook 'Dakgoot
// schoonmaken' en 'Dakgoot vervangen' als dubbel aanmerken — ander werk aan hetzelfde ding, en
// precies het soort valse waarschuwing dat mensen leert door de vraag heen te klikken.
function zitErinVervat(a, b){
  const A = woorden(a), B = woorden(b);
  if(!A.length || !B.length) return false;
  const [kort, lang] = A.length <= B.length ? [A, new Set(B)] : [B, new Set(A)];
  return kort.every(w => lang.has(w));
}

// De twee regels samen: genoeg woorden gemeen, óf de een zit helemaal in de ander.
function lijktOp(a, b){ return gelijkenis(a, b) >= DUBBEL_DREMPEL || zitErinVervat(a, b); }

// Alle open taken van DEZELFDE VvE die genoeg op deze omschrijving lijken, de sterkste eerst.
// Over álle secties heen: een dubbele taak belandt juist vaak in een andere categorie (de een zet
// hem onder Oppakken, de ander onder LOD) en dan zou een zoektocht binnen één sectie hem missen.
//
// `sluitUit` is een rij die niet mee mag doen — bij het bewerken van een bestaande taak zou die
// zichzelf anders als dubbel aanmerken. Vandaag draait deze controle alleen bij nieuwe taken, maar
// de parameter houdt hem bruikbaar als dat verandert.
function zoekDubbels(code, omschrijving, ntd, sluitUit){
  const doelCode = String(code == null ? '' : code).trim().toLowerCase();
  if(!doelCode || !woorden(omschrijving).length) return [];
  const treffers = [];
  SKEYS.forEach(sec => {
    ((ntd && ntd[sec]) || []).forEach(r => {
      if(r === sluitUit) return;
      if(String(r.code || '').trim().toLowerCase() !== doelCode) return;
      const titel = taakTitel(r, sec);
      if(!lijktOp(omschrijving, titel)) return;
      // De score gaat mee zodat de sterkste treffer vooraan komt te staan. Een treffer die alleen
      // via 'zit erin vervat' binnenkomt heeft een lagere score en zakt dus naar onder — dat klopt
      // ook: hoe meer woorden gedeeld, hoe waarschijnlijker het dubbel is.
      treffers.push({ r, sec, score: gelijkenis(omschrijving, titel) });
    });
  });
  return treffers.sort((a, b) => b.score - a.score).slice(0, DUBBEL_MAX);
}

// De tekst van de vraag. Apart van het zoeken zodat hij los te toetsen is, en zodat de vraag
// altijd LAAT ZIEN waar de twijfel over gaat — een waarschuwing zonder het gevonden werk erbij is
// niet te beoordelen en wordt dus weggeklikt.
function dubbelVraagTekst(treffers){
  const n = treffers.length;
  const kop = n === 1
    ? 'Er staat al een taak open die hier sterk op lijkt:'
    : `Er staan al ${n} taken open die hier sterk op lijken:`;
  const regels = treffers.map(t => `• ${SECS[t.sec] ? SECS[t.sec].label : t.sec}: ${taakTitel(t.r, t.sec)}`);
  return `${kop}\n${regels.join('\n')}`;
}

export { zoekDubbels, gelijkenis, zitErinVervat, lijktOp, woorden, dubbelVraagTekst, DUBBEL_DREMPEL, _normaliseer };
