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
// Gemeten op PROD 2026-07-28: alle negen halen dit. 'Nog Te Doen' staat op exact 16 —
// geen speling, dus een nieuwe kolom Q vraagt éérst het raster verbreden (schrijfacties
// buiten het raster mislukken zonder melding).
const RASTER_MIN = {
  'Nog Te Doen':      16,  // kolom P (offerte-aannemers)
  'Afgerond':         12,  // A:L — NIET 16
  'Herhaalregels':    12,  // A:L
  'Kenmerken':         6,  // A:F
  'Ontwikkeling':      6,  // A:F
  'Logboek':           8,  // A:H
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

// Is dit tabblad breed genoeg om naar te schrijven? null = in orde of onbekend tabblad.
// Een onbekend tabblad krijgt bewust GEEN oordeel: reset-archieven en back-uptabbladen
// horen hier niet in.
function checkRaster(tabblad, kolommen){
  const nodig=RASTER_MIN[tabblad];
  if(!nodig) return null;
  if(kolommen>=nodig) return null;
  return { tabblad, nodig, gevonden: kolommen,
           tekst: `Tabblad '${tabblad}' is ${kolommen} kolommen breed, er zijn er ${nodig} nodig. `
                + `Schrijfacties naar de laatste kolommen mislukken zonder melding.` };
}

export { checkSecties, checkRaster, RASTER_MIN, isSectieKop, isKolomKop };
