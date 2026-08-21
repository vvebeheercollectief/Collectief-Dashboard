// ══════════════════════════════════════
//  STRUCTUURCHECK — waarnemend, nooit blokkerend
// ══════════════════════════════════════
// Doel: structurele beschadiging van de opslag vroeg zien in plaats van pas als het
// dashboard "raar doet". Deze module schrijft NIETS en raakt geen enkele schrijfweg —
// hij kan per definitie geen taak of vinkje kwijtmaken.
//
// Bewust NIET gecontroleerd:
//  - Sectie-VOLGORDE. 'Afgerond' zet OPPAKKEN, VERGADERVERZOEKEN, LOD, OFFERTE-TRAJECTEN
//    terwijl SKEYS OFFERTE-TRAJECTEN vóór LOD zet. Volgorde meenemen zou vanaf dag één
//    vals alarm geven op een verschil dat bewust bestaat.
//  - "Leeg tabblad". fetchSheets geeft [] terug voor een leeg ÉN voor een ontbrekend
//    tabblad, en vier tabbladen worden met .catch(()=>[]) afgevangen. Leeg is dus geen
//    bewijs van schade.
import { SKEYS, SECS } from "./config.js";

// Minimale rasterbreedte per tabblad, afgeleid uit de breedste schrijfactie op elk blad.
// Bij elke wijziging: eerst de callsite opzoeken, dan dit getal aanpassen.
// Gemeten op PROD 2026-07-28: alle negen haalden dit; 'Nog Te Doen' stond toen op exact 16.
// Op 2026-07-29 verbreed naar 17 voor het vaste taaknummer in kolom Q, op TEST én PROD.
// Schrijfacties buiten het raster mislukken ZONDER melding, dus dit getal is de bewaking
// daarop: zakt het raster ooit terug, dan meldt de structuurcheck dat vóórdat er stil data
// verdwijnt. Dit getal volgt de BREEDSTE SCHRIJFACTIE in de code, niet een raster dat we nog
// van plan zijn — zet het dus nooit vast vooruit op een verbreding die nog moet komen.
//
// Op 2026-08-14 naar 19 voor de Takenbundel (R=bundelId, S=bundelVolg). De schrijfcode is hier
// al: serializeNtdUndo levert 19 waarden (insertAndWriteRow schrijft dan A..S) en afrondWaarden
// evengoed (updateCells met endColumnIndex 19). 'Afgerond' ging mee naar 19 omdat het afronden
// nu Q/R/S meeschrijft; dat blad is al 26 kolommen breed, daar hoeft niets te gebeuren.
// Het raster is op 2026-08-17 daadwerkelijk verbreed naar 19 op TEST én PROD, en na de
// verbreding op beide bladen nagemeten via de API. Kolom Q, R en S staan daar verborgen — net
// als Q dat al was; het zijn interne boekhoudkolommen en geen invoervelden. Verborgen kolommen
// worden gewoon gelezen en geschreven, dus dat raakt niets.
// Let bij een volgende verbreding op twee dingen die hier tijd kostten: de laatste kolom kan
// VERBORGEN zijn (dan lijkt het blad smaller dan het is en weigert het naamvak erheen te
// springen), en 'kolom rechts invoegen' erft de opmaak van de kolom LINKS — vandaar dat R en S
// schoon binnenkwamen zonder de TRUE/FALSE-validatie van hun buren.
const RASTER_MIN = {
  'Nog Te Doen':      19,  // kolom S (bundelVolg) — verbreed en nagemeten op TEST én PROD 2026-08-17
  'Afgerond':         19,  // A:S — taakId/bundelId/bundelVolg op Q/R/S (raster is al 26 breed)
  'Herhaalregels':    12,  // A:L
  'Kenmerken':         6,  // A:F
  'Ontwikkeling':      6,  // A:F
  // 9 en niet 8, en dat komt NIET uit het aantal waarden: `undoDeleteLog` (render-overig.js) geeft
  // insertAndWriteRow acht waarden, maar `_eindKolom` (crud.js) klemt het bereik op minimaal A..I.
  // De breedste schrijfactie op dit blad reikt dus tot kolom I, ook al staat er in kolom I niets.
  // Alle andere wegen naar 'Logboek' blijven bij H (appendRange "'Logboek'!A:H", logEditWrite E:G).
  'Logboek':           9,  // A:I — zie _eindKolom; de logregel zelf is 8 breed (A:H)
  'Notif-wachtrij':    4,  // A:D
  "ALV's overzicht":   7,  // t/m Klaargezet (G)
  "ALV's afgerond":    3,
};

// Is deze rij een sectiekop? Zelfde herkenning als parseSections: kolom A bevat een
// sectienaam en de rest van de rij is leeg.
const isSectieKop = (r) => SKEYS.includes(((r&&r[0])||'').trim().toUpperCase())
                        && !((r&&r[1])||'').trim();

// Is deze rij de kolomkoprij?
// LET OP — beide spellingen zijn echt in gebruik: op PROD staat boven OPPAKKEN
// 'VvE-Code' MET STREEPJE en boven de andere drie secties 'VvE Code' met spatie
// (gemeten 2026-07-28, op zowel 'Nog Te Doen' als 'Afgerond'). parseSections in data.js
// accepteert daarom allebei; zou deze controle alleen de spatie-vorm kennen, dan sloeg
// hij bij élke poll vals alarm op OPPAKKEN. Hoofdletterongevoelig, omdat een vals alarm
// hier duurder is dan een gemist geval: een melding die vaak onterecht is, leert de
// gebruiker om hem te negeren.
const isKolomKop = (r) => ['vve code','vve-code'].includes(((r&&r[0])||'').trim().toLowerCase());

// Controleert de sectiestructuur van een 'Nog Te Doen'/'Afgerond'-achtig blad.
// Geeft een lijst bevindingen terug: [{regel, sectie, tekst}]. Lege lijst = in orde.
// Regelnummers zijn 1-gebaseerd, zoals in de Sheet.
function checkSecties(rows){
  const uit=[];
  if(!rows || !rows.length) return uit;   // leeg is geen bewijs van schade
  for(let i=0;i<rows.length;i++){
    if(!isSectieKop(rows[i])) continue;
    const sectie=((rows[i][0])||'').trim().toUpperCase();
    const volgende=rows[i+1];
    if(!volgende) continue;               // sectiekop onderaan het blad: niets te zeggen
    if(!isKolomKop(volgende)){
      uit.push({
        regel: i+2,                       // +1 voor 0-index, +1 omdat we de rij ná de kop bekijken
        sectie,
        tekst: `Regel ${i+2} staat op de plek van de kolomkoppen van ${SECS[sectie]?.label||sectie}. `
             + `Deze regel is daardoor onzichtbaar in het dashboard.`,
      });
    }
  }
  return uit;
}

// Is dit tabblad breed genoeg om naar te schrijven? null = in orde, onbekend tabblad, of
// onbekende breedte. Een onbekend tabblad krijgt bewust GEEN oordeel: reset-archieven en
// back-uptabbladen horen hier niet in.
// Een ONBEKENDE breedte evenmin, en die guard is bewust een TWEEDE slot: langs de weg die de app
// vandaag loopt komt een breedteloos blad hier niet eens binnen. Vóór de eerste schrijfactie is
// _sheetKolommen null en loopt checkRasters over nul sleutels; daarna staan er alleen bladen in
// waarvan _sheetBreedtes een échte columnCount overhield. Deze regel dekt dus wat dáárlangs zou
// komen: een blad dat wél in de map staat maar zonder bruikbare breedte, en elke latere aanroeper
// die deze functie anders voedt (een handgemaakte map, of een refactor die over RASTER_MIN loopt
// in plaats van over de meting). Zonder de guard is `undefined >= 19` false en zou zo'n blad als
// te smal gemeld worden terwijl er niets gemeten is — alarm op niets leert de gebruiker negeren.
function checkRaster(tabblad, kolommen){
  const nodig=RASTER_MIN[tabblad];
  if(!nodig) return null;
  if(typeof kolommen!=='number') return null;
  if(kolommen>=nodig) return null;
  return { tabblad, nodig, gevonden: kolommen,
           tekst: `Tabblad '${tabblad}' is ${kolommen} kolommen breed, er zijn er ${nodig} nodig. `
                + `Schrijfacties naar de laatste kolommen mislukken zonder melding.` };
}

// Alle bekende tabbladbreedtes in één keer langs checkRaster. Verwacht {tabbladnaam: aantal},
// zoals getSheetIds die uit de spreadsheets.get-respons meeneemt.
function checkRasters(kolommenPerTab){
  const uit=[];
  Object.keys(kolommenPerTab||{}).forEach(t=>{
    const bev=checkRaster(t, kolommenPerTab[t]);
    if(bev) uit.push(bev);
  });
  return uit;
}

// Staat elk vast taaknummer maar op één regel? Twee regels met hetzelfde nummer is de ergste
// storing die dit mechanisme kan krijgen: de guard herkent de rij dan als 'klopt' en schrijft
// mét overtuiging naar de verkeerde taak. Puur, dus los testbaar.
// Rijen zonder nummer tellen niet mee — die bestaan legitiem (aangemaakt door een client die
// nog oude code draait) en vallen terug op de vingerafdruk-guard.
function checkNummers(rijen){
  const gezien={}, uit=[];
  (rijen||[]).forEach(r=>{
    const nr=r&&r.taakId;
    if(!nr) return;
    if(gezien[nr]) uit.push({ nummer:nr, regels:[gezien[nr], r._row],
      tekst:`Taaknummer ${nr} staat op twee regels (${gezien[nr]} en ${r._row}). `
          + `Een schrijfactie kan daardoor de verkeerde taak raken.` });
    else gezien[nr]=r._row;
  });
  return uit;
}

// Alle controles van één leesronde bij elkaar — de enige ingang die data.js gebruikt.
// Bewust één functie in plaats van losse aanroepen op de callsite: checkRaster stond hier vanaf
// dag één klaar maar werd door niets aangeroepen, waardoor de RASTER_MIN-tabel documentatie was
// in plaats van bewaking. Met één ingang toetst een test de wég die de app loopt, en niet alleen
// de losse onderdelen die er misschien niet in zitten.
function checkAlles(ntdRows, afRows, ntdRijen, kolommenPerTab){
  return [...checkSecties(ntdRows||[]), ...checkSecties(afRows||[]),
          ...checkNummers(ntdRijen||[]), ...checkRasters(kolommenPerTab)];
}

// Welke bevindingen verdienen een MELDING op het scherm, en welke blijven console-only?
// Ernstig = de twee soorten die stille dataschade betekenen:
//   - een regel op de plek van de kolomkoppen (heeft .regel) → die taak is onzichtbaar
//   - hetzelfde taaknummer op twee regels    (heeft .nummer) → een schrijfactie kan de verkeerde raken
// De rasterbreedte (heeft .tabblad) blijft bewust buiten de melding: dat is de bevinding die
// langdurig kán blijven staan, en een melding die elke ochtend terugkomt leert de gebruiker om
// álle meldingen weg te klikken — precies waar deze module zelf voor waarschuwt.
const ernstigeBevindingen = (bev) => (bev||[]).filter(b => b && (b.regel!=null || b.nummer!=null));

export { checkSecties, checkRaster, checkRasters, checkNummers, checkAlles, ernstigeBevindingen, RASTER_MIN, isSectieKop, isKolomKop };
