// offerte-schema.js — het vaste antwoordformaat van de offertevergelijker.
// Gedeeld: api/offerte.js stuurt het mee naar Claude (structured outputs) en src/vergelijk-model.js
// leest het antwoord ermee uit. Eén bron, zodat proxy en dashboard niet uit elkaar lopen.
// Structured outputs eist dat élk object additionalProperties:false heeft en alle velden verplicht
// zijn. 'Mag leeg' loopt via vaste waarden — lege tekst, pagina 0, vermeld:false — en NIET via null:
// Anthropic weigert een schema met meer dan 16 velden met een unie ('string of null'), en dit schema
// had er 28 (staging, 8 oktober 2026). De toets 'geen velden met een unie' bewaakt dat.

function obj(properties){
  return { type:'object', additionalProperties:false, required:Object.keys(properties), properties };
}
const TEKST = { type:'string' };    // '' = niet vermeld
const PAGINA = { type:'integer' };  // 0 = geen pagina

export const ONDERDEEL_STATUS = ['inbegrepen', 'uitgesloten', 'niet_genoemd'];
export const BEDRAGEN = [
  ['exclBtw', 'Exclusief btw'], ['btw', 'Btw'], ['inclBtw', 'Inclusief btw'], ['subsidie', 'Subsidie volgens offerte'],
];
export const VOORWAARDEN = [
  ['offertedatum', 'Datum offerte'], ['offertenummer', 'Offertenummer'], ['betaling', 'Betaling'],
  ['garantie', 'Garantie'], ['planning', 'Planning'], ['geldigheid', 'Geldig tot'], ['stelposten', 'Stelposten en meerwerk'],
];

const VELD = obj({ tekst:TEKST, pagina:PAGINA });
const POST = obj({ omschrijving:{ type:'string' }, bedrag:{ type:'number' }, pagina:PAGINA });
// bedrag = letterlijk uit de offerte, in euro's (1605.00), alleen geldig bij vermeld:true. Geen
// totaal maar wel losse posten: vermeld:false en de posten in `posten`; de browser telt op.
const BEDRAG = obj({ vermeld:{ type:'boolean' }, bedrag:{ type:'number' }, pagina:PAGINA, posten:{ type:'array', items:POST } });

export const OFFERTE_SCHEMA = obj({
  aannemers: { type:'array', items: obj({
    index: { type:'integer' },
    naam: { type:'string' },
    bedragen: obj(Object.fromEntries(BEDRAGEN.map(([k]) => [k, BEDRAG]))),
    btwPercentages: { type:'array', items:{ type:'number' } },
    voorwaarden: obj(Object.fromEntries(VOORWAARDEN.map(([k]) => [k, VELD]))),
  }) },
  onderdelen: { type:'array', items: obj({
    naam: { type:'string' },
    perAannemer: { type:'array', items: obj({
      index: { type:'integer' },
      status: { type:'string', enum:ONDERDEEL_STATUS },
      toelichting: { type:'string' },
      pagina: PAGINA,
    }) },
  }) },
  opvallend: { type:'array', items: obj({ index:{ type:'integer' }, tekst:{ type:'string' }, pagina:PAGINA }) },
});
