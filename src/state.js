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

// ── Groep 2: hertoegekende waarden (state.X) ────────────────────────────
export const state = {
  // grafieken
  charts: {},
  // notificaties
  oneSignalReady: false,
  isSubscribed: false,
  _lastNotifTs: null,      // basislijn wordt op de eerste ronde op de echte sheet-timestamp gezet (niet op de browserklok)
  _meldStart: 0,           // eerste rij van het meldingen-venster; 0 = nog niet gekalibreerd → volledig lezen
  _meldUit: false,         // tabblad 'Meldingen' onleesbaar (verse Sheet-kopie) → deze sessie niet meer opvragen
  _notifVisibilityHandler: null, // visibilitychange-listener; logout() koppelt 'm los
  _resyncTimer: null,      // 8s live-resync-interval (stopbaar bij logout)
  _heartbeatTimer: null,   // token-refresh heartbeat-interval (stopbaar bij logout)
  // actieve secties / tabs
  activeOntw: 'Alles',
  activeNtd: 'OPPAKKEN',
  activeAf: 'OPPAKKEN',
  // OAuth / sessie
  oauthToken: null,
  oauthExpiry: 0,
  currentUserEmail: null,
  _gsiTokenClient: null,
  _authBezig: 0,           // teller: >0 = inlog/tokenvernieuwing loopt → sw-update stelt auto-herladen uit
  _gsiErrorCb: null,       // per-aanvraag gebonden GIS error_callback (popup gesloten/geblokkeerd)
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
  _writeStart: null,       // tijdstip waarop de LOPENDE write echt begon (null = niets onderweg).
                           // Bewust niet gezet bij het in de wachtrij zetten: de wachtrij is serieel,
                           // dus een wachtende bulk-write zou anders meteen als 'vastgelopen' gelden.
  _lastDHash: null,
  _logHoogwater: 0,        // hoogste Sheet-rijnummer van het Logboek dat we gelezen hebben
                           // (0 = nog niets → volgende ronde volledig lezen)
  _logAnkerTs: '',         // kolom A van díe rij. Komt die niet terug bij de staartlezing, dan
                           // heeft iemand een logregel verwijderd en zijn de rijnummers
                           // opgeschoven → volledig herlezen i.p.v. stil bevriezen.
  _logVolledigMs: 0,       // wanneer het Logboek voor het laatst VOLLEDIG gelezen is. Een staart-
                           // lezing ziet geen bewerkte bestaande regels, dus af en toe volledig —
                           // maar alleen als er logboektekst in beeld staat (zie _logVolledigNodig).
  _alfaMs: 0,              // wanneer "ALV's afgerond" voor het laatst is gelezen. Dat archief
                           // verandert alleen bij de jaarlijkse reset en het dashboard schrijft er
                           // NOOIT naartoe, dus het hoeft niet elke 8 seconden mee (zie _alfaNodig).
  _uitCache: false,        // staat het scherm op de leescache en is de eerste verse ronde nog
                           // onderweg? Dan zijn de rijnummers mogelijk verschoven → schrijven
                           // kort geblokkeerd (zie blokkeerOffline).
  _loadInFlight: false,
  _loadAgain: false,
  _loadAgainLoud: false,   // werd de onderdrukte aanroep door een NIET-stille (handmatige) verversing getriggerd? → herstart luid, zodat de fout-banner/spinner zichtbaar blijft
  _syncFails: 0,           // opeenvolgende mislukte sync-rondes; 'Fout' pas na 2 (transient-tolerantie)
  _netwerkFouten: 0,       // opeenvolgende ECHTE netwerkfouten (een fetch die rejectet, dus zónder
                           // .status). Bewust los van _syncFails: die telt ook 401/403, quota en
                           // mislukte inlogpogingen mee, en dan zou een quotum-incident het
                           // dashboard op slot zetten precies wanneer het zich herstelt.
  _animBusy: 0,            // teller van lopende rij-animaties (>0 = poll pauzeren)
  _undoInFlight: false,    // een undo-actie (afronden/verwijderen/bulk) loopt → poll pauzeren (undo doet eigen loadAll)
  // diversen
  _sheetIds: null,
  _completeRow: null,      // rij-OBJECT waarvoor de afhandel-modal open staat (identiteit, geen index)
  _completeRid: null,      // geklikte data-rid, alléén voor de groene puls op de juiste DOM-rij
  _completeBusy: false,    // afhandelen loopt (dubbelklik-rem over het async-gat)
  _alvoFlagBezig: null,    // Set van 'idx:veld' met lopende ALV-vinkjes (dubbelklik-rem)
  _snoozeRow: null,        // taak waarvoor de wegleggen-modal open staat (Fase 4)
  offerteAannOpen: new Set(),   // sleutels (aannSleutel) van trajecten met uitgeklapt aannemers-paneel
  vveCode: null,           // VvE op de per-VvE-pagina (Fase 5)
  vveTerug: null,          // pagina waar de gebruiker vandaan kwam vóór het dossier (terug-pijltje)
  _vveAfAlles: false,      // per-VvE: alle afgeronde taken uitgeklapt
  bulkMode: false,         // bulk-selecteerstand op de NTD-lijst (Fase 5)
  expandedRows: new Set(), // _row-id's van NTD-rijen die de gebruiker uitklapte (Operator: 1-regel → volledige tekst)
  ntdSort: {key:null, asc:true}, // kolomkop-sortering NTD: key 'code'|'deadline'|null (null = standaardvolgorde)
  ntdStatus: '',                 // statusfilter uit de kop-pillen: '' | 'telaat' | 'weggelegd'
  // VvE-dossier (logboek + kenmerken)
  kenmerkenEdit: false,    // kenmerken-paneel in bewerkmodus
  vveLogFilter: 'alles',   // 'alles' | 'contact'
  _vveLogAlles: false,     // dossier-feed volledig uitgeklapt
  dosComposerOpen: false,  // composer uitgeklapt (blijft open tot een ander dossier opent)
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
  // logboek bewerken
  logEdit: null,        // _row van de logregel die nu inline bewerkt wordt (of null)
  logEditSoort: null,   // gekozen contactsoort tijdens bewerken
};
