// ══════════════════════════════════════
//  STATE — gedeelde, veranderlijke toestand
// ══════════════════════════════════════
// Twee soorten (zie plan 2026-06-10-fase2-modularisatie):
//  1. Objecten die alleen ÍN-PLAATS worden gemuteerd (nooit hertoegekend) →
//     direct exporteren; consumenten importeren ze en doen X.prop = ...
//  2. Waarden die WÉL hertoegekend worden → op het `state`-object, zodat een
//     andere module ze kan herzetten via state.X = ... (imports zijn read-only).

// ── Groep 1: ín-plaats gemuteerde objecten (direct export) ──────────────
export const D = {ntd:{},af:{},alvo:[],alfa:[],ontw:[],logboek:[],herhaal:[],kenmerken:[],ntdSecInfo:{},afSecInfo:{}};
export const pgs = {ntd:1,af:1,alvo:1,alfa:1,ontw:1,logboek:1};
export const _shownToasts = new Set();
export const _undoStack = [];

// ── Groep 2: hertoegekende waarden (state.X) ────────────────────────────
export const state = {
  // grafieken
  charts: {},
  // notificaties
  oneSignalReady: false,
  isSubscribed: false,
  _lastNotifTs: new Date().toISOString(),
  _notifPollTimer: null,
  // actieve secties / tabs
  activeOntw: 'Alles',
  activeNtd: 'OPPAKKEN',
  activeAf: 'OPPAKKEN',
  // OAuth / sessie
  oauthToken: null,
  oauthExpiry: 0,
  currentUserEmail: null,
  _gsiTokenClient: null,
  // taak-bewerkmodus
  editMode: false,
  editRowData: null,
  editSec: null,
  // analytics
  anaPeriod: 'maand',     // 'dag' | 'week' | 'maand' | 'kwartaal'
  anaMetric: 'vergader',  // 'vergader' | 'taken'
  activeHeroView: 'alv',
  // rij-cache / undo
  _rowCache: [],
  // schrijf-pijplijn
  pendingWrites: 0,
  _writeChain: Promise.resolve(),
  _lastDHash: null,
  _loadInFlight: false,
  _loadAgain: false,
  _animBusy: false,
  // diversen
  _sheetIds: null,
  _completeIdx: null,
  _snoozeRow: null,        // taak waarvoor de wegleggen-modal open staat (Fase 4)
  _offerteActieRow: null,  // offerte-rij waarvoor de opvolg-actie-modal open staat (offerte-motor)
  _offerteActieSoort: null,// soort opvolg-actie: 'nabellen' | 'doorsturen' (offerte-motor)
  offerteDoorsturenOpen: false, // Vandaag-focus: Doorsturen-blok volledig uitgeklapt?
  offerteNabellenOpen: false,   // Vandaag-focus: Nabellen-blok volledig uitgeklapt?
  offerteTabelOpen: false,      // Vandaag-focus: volledige offerte-tabel zichtbaar?
  offerteAannOpen: new Set(),   // codes van trajecten met uitgeklapt aannemers-paneel
  vveCode: null,           // VvE op de per-VvE-pagina (Fase 5)
  _vveAfAlles: false,      // per-VvE: alle afgeronde taken uitgeklapt
  bulkMode: false,         // bulk-selecteerstand op de NTD-lijst (Fase 5)
  // VvE-dossier (logboek + kenmerken)
  kenmerkenEdit: false,    // kenmerken-paneel in bewerkmodus
  vveLogFilter: 'alles',   // 'alles' | 'contact'
  _vveLogAlles: false,     // dossier-feed volledig uitgeklapt
  _contactSoort: 'Telefoon',
  herhaalEditRow: null,    // herhaalregel in de bewerkmodal (Fase 4)
  _aiLastCode: '',
  _aiLastNaam: '',
  _aiVveCode: '',
  ontwEditMode: false,
  ontwEditRow: null,
  // logboek-filters
  logWho: '',
  logAct: '',
};
