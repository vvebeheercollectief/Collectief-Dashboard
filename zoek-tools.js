// zoek-tools.js — de zes zoekfilters van de dashboard-chat, als tool-definities voor Claude.
// Eén bron, gedeeld door de proxy (api/chat.js, die ze VAST meestuurt zodat een browser er niets
// aan kan veranderen) en de frontend (src/dashboard-zoek.js, die ze uitvoert op de al geladen
// gegevens). Zelfde opzet als allowed-emails.js.
//
// LET OP — de volgorde en de tekst hier zijn deel van de cache-sleutel bij Anthropic: elke wijziging
// maakt de tijdelijk onthouden prefix ongeldig. Dat is geen probleem, maar verander ze niet per
// verzoek (bijv. niet sorteren of een datum invoegen).

const TABBLADEN = ['Oppakken', 'Vergaderverzoeken', 'Offerte-trajecten', 'LOD', 'Subsidie-trajecten', 'CRM'];
const DATUM = { type: 'string', description: 'Datum als jjjj-mm-dd.' };
const VVE = { type: 'string', description: 'VvE-code, bijv. 311212. Leeg laten = alle VvE\'s.' };
const BEHANDELAAR = { type: 'string', description: 'Voornaam van de medewerker, bijv. Cihad of Jer.' };
const ZOEKWOORD = { type: 'string', description: 'Woord of woordgroep die in de tekst moet voorkomen (hoofdletterongevoelig).' };

export const ZOEK_TOOLS = [
  {
    name: 'zoek_taken',
    description: 'Zoekt in de OPEN taken van alle tabbladen. Geeft het exacte aantal treffers en hoogstens 25 regels. '
      + 'Gebruik groepeer_op om te tellen per behandelaar, tabblad of VvE.',
    input_schema: {
      type: 'object',
      properties: {
        tabblad: { type: 'string', enum: TABBLADEN },
        behandelaar: BEHANDELAAR,
        vve_code: VVE,
        te_laat: { type: 'boolean', description: 'true = alleen taken waarvan de deadline verstreken is.' },
        weggelegd: { type: 'boolean', description: 'true = alleen weggelegde taken, false = weggelegde taken uitsluiten.' },
        deadline_van: DATUM,
        deadline_tot: DATUM,
        zoekwoord: ZOEKWOORD,
        groepeer_op: { type: 'string', enum: ['behandelaar', 'tabblad', 'vve'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'zoek_afgerond',
    description: 'Zoekt in AFGERONDE taken. Geeft het exacte aantal en hoogstens 25 regels (nieuwste eerst). '
      + 'Gebruik groepeer_op om te tellen per behandelaar, tabblad, VvE of maand.',
    input_schema: {
      type: 'object',
      properties: {
        tabblad: { type: 'string', enum: TABBLADEN },
        behandelaar: BEHANDELAAR,
        vve_code: VVE,
        van: DATUM,
        tot: DATUM,
        zoekwoord: ZOEKWOORD,
        groepeer_op: { type: 'string', enum: ['behandelaar', 'tabblad', 'vve', 'maand'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'zoek_alvs',
    description: 'Zoekt in het ALV-overzicht (de komende ALV per VvE) en in de afgeronde ALV\'s. '
      + 'Status: Open = agenda nog niet uitgeschreven, Klaargezet = agenda klaar maar uitnodiging nog niet verstuurd, '
      + 'Gepland = uitnodiging verstuurd, Afgerond = notulen verstuurd. Met afgerond_van/afgerond_tot zoek je in de afgeronde ALV\'s.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Open', 'Klaargezet', 'Gepland', 'Afgerond'] },
        vve_code: VVE,
        budget: { type: 'boolean', description: 'true = alleen VvE\'s met het budgetpakket.' },
        afgerond_van: DATUM,
        afgerond_tot: DATUM,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'zoek_offertes',
    description: 'Zoekt in de lopende offerte-trajecten. Geeft per traject de aanvraagdatum, hoeveel dagen het openstaat '
      + 'en hoeveel offertes er binnen zijn (bijv. 1/3).',
    input_schema: {
      type: 'object',
      properties: {
        vve_code: VVE,
        behandelaar: BEHANDELAAR,
        min_dagen_open: { type: 'integer', description: 'Alleen trajecten die minstens zoveel dagen geleden zijn aangevraagd.' },
        binnen: { type: 'string', enum: ['geen', 'deels', 'alle'], description: 'Hoeveel van de aangevraagde offertes er binnen zijn.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'zoek_logboek',
    description: 'Zoekt in het logboek: notities, contactmomenten (telefoon, mail, gesprek) en afgeronde of aangemaakte taken. '
      + 'Geeft het exacte aantal en hoogstens 25 regels, nieuwste eerst.',
    input_schema: {
      type: 'object',
      properties: {
        zoekwoord: ZOEKWOORD,
        vve_code: VVE,
        van: DATUM,
        tot: DATUM,
        soort: { type: 'string', enum: ['contact', 'notitie', 'alles'] },
        medewerker: BEHANDELAAR,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'vve_dossier',
    description: 'Het volledige dossier van één VvE: lopende en weggelegde taken, recent afgerond, ALV-stand en de laatste logboekregels.',
    input_schema: {
      type: 'object',
      properties: { vve_code: { type: 'string', description: 'VvE-code, bijv. 311212.' } },
      required: ['vve_code'],
      additionalProperties: false,
    },
  },
];

export const ZOEK_TOOL_NAMEN = ZOEK_TOOLS.map(t => t.name);
