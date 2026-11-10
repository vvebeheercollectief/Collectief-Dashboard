// ══════════════════════════════════════
//  STATE — gedeelde gegevens en toestand
// ══════════════════════════════════════
// `D` is wat er uit de Sheet komt; `state` is alles wat over de sessie gaat. Beide zijn één object
// dat iedereen importeert en muteert, nooit vervangt.

export const D = {
  taken: [],            // 'Mijn taken'  — {id, eigenaar, taak, code, vve, notitie, aangemaakt, afgevinkt, _row}
  dossiers: { LOD: [], 'SUBSIDIE-TRAJECTEN': [] },   // 'Nog Te Doen' — alleen de twee blokken die we tonen
  alvo: [],             // "ALV's overzicht"
  alfa: [],             // "ALV's afgerond"
};

export const state = {
  // inloggen
  oauthToken: null,
  oauthExpiry: 0,
  currentUserEmail: null,
  _authBezig: 0,
  _authFails: 0,
  // laden en opslaan
  _loadInFlight: false,
  _loadAgain: false,
  pendingWrites: 0,
  _writeChain: Promise.resolve(),
  _schrijfGen: 0,
  _netwerkFouten: 0,
  _syncFails: 0,
  _uitCache: false,
  _laatsteSyncMs: 0,
  _lastHash: '',
  _sheetIds: null,
  takenTabOntbreekt: false,
  // scherm
  pagina: 'taken',
  lijstVan: null,       // naam wiens takenlijst je bekijkt; null = je eigen
  bewerkt: null,        // id van de taak die nu inline bewerkt wordt
  filters: { lod: { wie:'', q:'' }, subsidie: { wie:'', q:'' }, alvo: { status:'', q:'' }, alfa: { q:'' }, taken: { q:'' } },
  // minimumversie
  _versieTeOud: false,
};
