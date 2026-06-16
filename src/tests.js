// ══════════════════════════════════════
//  TESTS — zelftest (lazy-geladen, alleen met ?test=1)
// ══════════════════════════════════════
import { berekenPrioriteit, _parseAnyDate, displayName, opvolgStatus, volgendeDeadline, STIL_ESCALATIE_REGELS, offerteFase, offerteBalBij, _verschilInWerkdagen, offerteNuOpvolgen, offerteSorteerScore, offerteBriefingFeiten, offerteNabelTeller, parseOff, parseAannemers, serializeAannemers, deriveOffertes } from "./util.js";
import { logZin } from "./render-overig.js";
import { _isStagingHost } from "./config.js";
import { ACTIONS } from "./actions.js";
import { filterVves } from "./vve-zoekveld.js";
import { filterNtd, offerteGroepen, _offerteActiviteitMap, offerteBalBijTekst, setNtd, offerteAannemerPaneel, offerteAannSamenvatting } from "./render-lijsten.js";
import { state, D } from "./state.js";
import { vveOverzicht, filterDossierLog } from "./render-vve.js";
import { parseKenmerken, vveKenmerken } from "./kenmerken.js";
import { zoekAlles } from "./palette.js";
import { _bulkVolgorde, BULK_DEADLINE_KOLOM } from "./bulk.js";

  console.log('%c[TESTS] Auto-prioriteit', 'background:#0D7377;color:white;padding:2px 6px;border-radius:3px');
  // ── mini-assert helper (Fase 1 testnet) ──
  let _tOk = 0, _tFail = 0;
  const eq = (label, got, exp) => {
    const g = JSON.stringify(got), e = JSON.stringify(exp);
    if (g === e) { _tOk++; }
    else { _tFail++; console.error(`FAIL: ${label} → verwacht ${e}, kreeg ${g}`); }
  };
  const truthy = (label, got) => { if (got) { _tOk++; } else { _tFail++; console.error(`FAIL: ${label} → verwacht waar, kreeg ${JSON.stringify(got)}`); } };
  const T = new Date(2026, 5, 2); // 2 juni 2026
  const fmt = d => `${d.getDate()} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]} ${d.getFullYear()}`;
  const plus = n => fmt(new Date(T.getFullYear(), T.getMonth(), T.getDate() + n));

  const cases = [
    [  7, 'OPPAKKEN',          'Hoog',   false],
    [  8, 'OPPAKKEN',          'Midden', false],
    [ 14, 'OPPAKKEN',          'Midden', false],
    [ 15, 'OPPAKKEN',          'Laag',   false],
    [ 14, 'VERGADERVERZOEKEN', 'Hoog',   false],
    [ 15, 'VERGADERVERZOEKEN', 'Midden', false],
    [ 21, 'VERGADERVERZOEKEN', 'Midden', false],
    [ 22, 'VERGADERVERZOEKEN', 'Laag',   false],
    [ 21, 'OFFERTE-TRAJECTEN', 'Hoog',   false],
    [ 42, 'OFFERTE-TRAJECTEN', 'Midden', false],
    [ 43, 'OFFERTE-TRAJECTEN', 'Laag',   false],
    [ 90, 'LOD',               'Hoog',   false],
    [240, 'LOD',               'Midden', false],
    [241, 'LOD',               'Laag',   false],
    [ -3, 'OPPAKKEN',          'Hoog',   true ],
    [  0, 'OPPAKKEN',          'Hoog',   false],
  ];
  let ok = 0, fail = 0;
  cases.forEach(([off, cat, prio, teLaat]) => {
    const got = berekenPrioriteit(plus(off), cat, T);
    const pass = got.prioriteit === prio && got.teLaat === teLaat;
    if (pass) ok++; else { fail++; console.error(`FAIL: ${cat} +${off}d → expected ${prio}/teLaat=${teLaat}, got ${got.prioriteit}/teLaat=${got.teLaat}`); }
  });
  const leeg = berekenPrioriteit('', 'OPPAKKEN', T);
  if (leeg.prioriteit === '' && leeg.teLaat === false) ok++; else { fail++; console.error('FAIL: lege deadline →', leeg); }

  // ── _parseAnyDate ──
  eq('ISO yyyy-mm-dd',  _parseAnyDate('2026-05-21'),  {y:2026,m:5,d:21});
  eq('dd-mm-yyyy',      _parseAnyDate('21-05-2026'),  {y:2026,m:5,d:21});
  eq('dd/mm/yyyy',      _parseAnyDate('21/05/2026'),  {y:2026,m:5,d:21});
  eq('NL long "21 mei 2026"', _parseAnyDate('21 mei 2026'), {y:2026,m:5,d:21});
  eq('NL afk "3 jan. 2025"',  _parseAnyDate('3 jan. 2025'),  {y:2025,m:1,d:3});
  eq('NL "1 sept 2026"',      _parseAnyDate('1 sept 2026'),  {y:2026,m:9,d:1});
  eq('2-cijfer jaar "21 mei \'26"', _parseAnyDate("21 mei '26"), {y:2026,m:5,d:21});
  eq('leeg → null',     _parseAnyDate(''),            null);
  eq('onzin → null',    _parseAnyDate('geen datum'),  null);

  // ── displayName ── (EMAIL_NAMES-lookup, anders ruwe invoer terug)
  eq('displayName leeg', displayName(''), '');
  truthy('displayName onbekend e-mail geeft input terug', displayName('xyz@example.com') === 'xyz@example.com');

  // ── logZin ── (natuurlijke zin per logboek-actie; bevat juiste werkwoord)
  truthy('logZin Afgerond bevat "rondde"',  logZin({actie:'Afgerond', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('rondde'));
  truthy('logZin Verwijderd bevat "verwijderde"', logZin({actie:'Verwijderd', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('verwijderde'));
  truthy('logZin Contact bevat "sprak"', logZin({actie:'Contact', code:'TEST01', veld:'Telefoon', oudeWaarde:'Bewoner/eigenaar', gebruiker:'info@vvebeheercollectief.nl'}).includes('sprak'));
  truthy('logZin Contact toont soort', logZin({actie:'Contact', code:'TEST01', veld:'Telefoon', oudeWaarde:'Bestuur', gebruiker:'info@vvebeheercollectief.nl'}).includes('Telefoon'));
  truthy('logZin Kenmerk bevat "kenmerk"', logZin({actie:'Kenmerk', code:'TEST01', veld:'Balkons', gebruiker:'info@vvebeheercollectief.nl'}).includes('kenmerk'));

  // ── _isStagingHost ── (fail-safe: alleen bekende productie-hosts = productie)
  truthy('prod host = geen staging',     _isStagingHost('collectief-dashboard.vercel.app') === false);
  truthy('prod team-alias = geen staging', _isStagingHost('collectief-dashboard-vve-beheer-collectief.vercel.app') === false);
  truthy('main-branch alias = geen staging', _isStagingHost('collectief-dashboard-git-main-vve-beheer-collectief.vercel.app') === false);
  truthy('staging host = staging',       _isStagingHost('collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app') === true);
  truthy('andere preview = staging (veilig)', _isStagingHost('collectief-dashboard-git-experiment-vve-beheer-collectief.vercel.app') === true);
  truthy('localhost = staging',          _isStagingHost('localhost') === true);
  truthy('github.io = echte productie (geen staging)', _isStagingHost('vvebeheercollectief.github.io') === false);

  // ── filterVves ── (VvE-zoekveld: zoekt op code én naam, case-insensitief)
  const _vves=[{code:'VVE-001',naam:'Parkzicht'},{code:'VVE-002',naam:'De Boog'},{code:'B-100',naam:'Vveldzicht'}];
  eq('filterVves op code',        filterVves('vve-001',_vves).map(r=>r.code), ['VVE-001']);
  eq('filterVves op naam',        filterVves('boog',_vves).map(r=>r.code),    ['VVE-002']);
  eq('filterVves hoofdletters',   filterVves('PARK',_vves).length, 1);
  eq('filterVves leeg → alles',   filterVves('',_vves).length, 3);
  eq('filterVves geen match',     filterVves('xyz',_vves).length, 0);
  eq('filterVves deelstring',     filterVves('vve',_vves).length, 3);

  // ── actions-registry ── (dekkings-test: elke verwachte data-action bestaat)
  const VERWACHTE_ACTIES = ['toggle','notif-toggle','off','notitie-toevoegen','taak-verwijder-modal','ai-kopieer','login','ntd-sectie','af-sectie','alvo-flag','taak-bewerken','taak-afronden','pagineer','ai-overnemen','ai-actie-taak','ai-kopieer-concept','ontw-cat','ontw-bewerken','toast-sluiten','taak-wegleggen','snooze-kies','herhaal-bewerken','herhaal-status','herhaal-verwijderen',
'vve-open','vve-af-alles','pal-kies','bulk-toggle','bulk-vink','bulk-menu','bulk-doe',
'kenmerken-bewerken','kenmerken-opslaan','kenmerken-annuleren',
'contact-soort','contact-vastleggen','vve-log-filter','vve-log-alles'];
  VERWACHTE_ACTIES.forEach(a => truthy(`actie '${a}' bestaat`, typeof ACTIONS[a] === 'function'));

  // ── volgendeDeadline ── (herhaalregels; maandgrens-clamp)
  eq('vd maand',            volgendeDeadline('15-01-2026','maand'),            '15-02-2026');
  eq('vd maandgrens 31jan', volgendeDeadline('31-01-2026','maand'),            '28-02-2026');
  eq('vd kwartaal clamp',   volgendeDeadline('30-11-2026','kwartaal'),         '28-02-2027');
  eq('vd jaar schrikkel',   volgendeDeadline('29-02-2028','jaar'),             '28-02-2029');
  eq('vd week',             volgendeDeadline('28-02-2026','week'),             '07-03-2026');
  eq('vd na-afronden 6m',   volgendeDeadline('15-06-2026','na-afronden',6),    '15-12-2026');
  eq('vd onbekend type',    volgendeDeadline('15-06-2026','dagelijks'),        '');
  eq('vd lege datum',       volgendeDeadline('','maand'),                      '');

  // ── opvolgStatus ── (weggelegd vs. opvolgen-vandaag)
  const TV = new Date(2026, 5, 11); // 11 juni 2026
  eq('opvolg leeg',     opvolgStatus({opvolgdatum:''}, TV),           {weggelegd:false, vandaag:false});
  eq('opvolg toekomst', opvolgStatus({opvolgdatum:'16-06-2026'}, TV), {weggelegd:true,  vandaag:false});
  eq('opvolg vandaag',  opvolgStatus({opvolgdatum:'11-06-2026'}, TV), {weggelegd:false, vandaag:true});
  eq('opvolg verleden', opvolgStatus({opvolgdatum:'01-06-2026'}, TV), {weggelegd:false, vandaag:true});

  // ── filterNtd ── volgorde: te laat → opvolgen-vandaag → prio/deadline → in behandeling → weggelegd
  const _vd=new Date();
  const _f=n=>{const d=new Date(_vd.getFullYear(),_vd.getMonth(),_vd.getDate()+n);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`};
  const _rows=[
    {code:'NORM', deadline:_f(3),  inBehandeling:'FALSE', opvolgdatum:''},
    {code:'WEG',  deadline:_f(2),  inBehandeling:'FALSE', opvolgdatum:_f(5)},
    {code:'IB',   deadline:_f(1),  inBehandeling:'TRUE',  opvolgdatum:''},
    {code:'OPV',  deadline:_f(9),  inBehandeling:'FALSE', opvolgdatum:_f(0)},
    {code:'LAAT', deadline:_f(-2), inBehandeling:'FALSE', opvolgdatum:''},
  ];
  eq('ntd-sortering fase4', filterNtd(_rows,'','','','','OPPAKKEN').map(r=>r.code),
     ['LAAT','OPV','NORM','IB','WEG']);

  // ── STIL_ESCALATIE_REGELS ── (per categorie, trap1 < trap2)
  truthy('esc-regels compleet', ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD']
    .every(s => STIL_ESCALATIE_REGELS[s] && STIL_ESCALATIE_REGELS[s].trap1 < STIL_ESCALATIE_REGELS[s].trap2));

  // ── vveOverzicht ── (Fase 5: per-VvE-pagina — kerncijfers & verzameling)
  const TF = new Date(2026, 5, 11); // 11 juni 2026
  const _D5 = {
    ntd:{OPPAKKEN:[
      {code:'X1',naam:'Testhof',actiepunt:'Dak nakijken',deadline:'01-06-2026',behandelaar:'Jer',inBehandeling:'FALSE',opvolgdatum:'',_sec:'OPPAKKEN',_row:3},
      {code:'X1',naam:'Testhof',actiepunt:'Brief sturen',deadline:'20-06-2026',behandelaar:'Cihad',inBehandeling:'FALSE',opvolgdatum:'20-07-2026',_sec:'OPPAKKEN',_row:4},
      {code:'X2',naam:'Ander',actiepunt:'Niets',deadline:'',behandelaar:'',inBehandeling:'FALSE',opvolgdatum:'',_sec:'OPPAKKEN',_row:5}],
      VERGADERVERZOEKEN:[],'OFFERTE-TRAJECTEN':[],LOD:[]},
    af:{OPPAKKEN:[{code:'X1',naam:'Testhof',actiepunt:'Oud klusje',datum:'01-05-2026',_sec:'OPPAKKEN',_row:2}],
      VERGADERVERZOEKEN:[],'OFFERTE-TRAJECTEN':[],LOD:[]},
    alvo:[{code:'X1',naam:'Testhof',uitnodiging:true,notulen:false,begroting:false,status:'Gepland'}],
    alfa:[],
    logboek:[{timestamp:'2026-06-09T10:00:00',code:'X1',actie:'Bewerkt',gebruiker:'info@vvebeheercollectief.nl'}],
  };
  const _o5 = vveOverzicht('X1', _D5, TF);
  eq('vve open',          _o5.cijfers.open, 1);
  eq('vve te laat',       _o5.cijfers.teLaat, 1);
  eq('vve weggelegd',     _o5.cijfers.weggelegd, 1);
  eq('vve naam',          _o5.naam, 'Testhof');
  eq('vve behandelaars',  _o5.behandelaars, ['Jer','Cihad']);
  eq('vve laatste act.',  _o5.cijfers.laatsteDagen, 2);
  eq('vve afgerond',      _o5.afgerond.length, 1);
  eq('vve onbekende code',vveOverzicht('ZZZ', _D5, TF).cijfers.open, 0);

  // ── filterDossierLog ── (dossier-feed: 'contact' toont alleen handmatige contactmomenten)
  const _dosLog=[{actie:'Contact'},{actie:'Afgerond'},{actie:'Contact'},{actie:'Kenmerk'}];
  eq('dossierfilter alles',   filterDossierLog(_dosLog,'alles').length, 4);
  eq('dossierfilter contact', filterDossierLog(_dosLog,'contact').length, 2);

  // ── kenmerken ── (VvE-dossier: tab 'Kenmerken' A:F, laatste rij per code wint)
  const _kmkRows=[
    ['Code','Balkons','Kozijnen','Bron','GewijzigdDoor','GewijzigdOp'],
    ['X1','Ja','Nee','akte art. 17','info@vvebeheercollectief.nl','2026-06-12T10:00:00.000Z'],
    ['X2','','Deels','','',''],
    ['',  'Ja','','','',''],                 // lege code → genegeerd
    ['X1','Deels','Nee','akte art. 18','info@vvebeheercollectief.nl','2026-06-12T11:00:00.000Z'], // dubbel → laatste wint
  ];
  const _kmk=parseKenmerken(_kmkRows);
  eq('kenmerken aantal (dedupe)', _kmk.length, 2);
  eq('kenmerken laatste wint', _kmk.find(k=>k.code==='X1').balkons, 'Deels');
  eq('kenmerken _row laatste', _kmk.find(k=>k.code==='X1')._row, 5);
  eq('kenmerken leeg blad', parseKenmerken([]), []);
  eq('kenmerken alleen kop', parseKenmerken([_kmkRows[0]]), []);
  eq('vveKenmerken gevonden', vveKenmerken('X2',{kenmerken:_kmk}).kozijnen, 'Deels');
  eq('vveKenmerken default', vveKenmerken('ZZZ',{kenmerken:_kmk}).balkons, '');
  eq('vveKenmerken default row', vveKenmerken('ZZZ',{kenmerken:_kmk})._row, 0);

  // ── zoekAlles ── (Fase 5: commandocentrum — groepering & limieten)
  eq('zoek taak op woord',   zoekAlles('dak',_D5).taken.map(r=>r.actiepunt), ['Dak nakijken']);
  eq('zoek vve op naam',     zoekAlles('testhof',_D5).vves.map(r=>r.code), ['X1']);
  eq('zoek vve op code',     zoekAlles('x1',_D5).vves.length, 1);
  eq('zoek hoofdletters',    zoekAlles('DAK',_D5).taken.length, 1);
  eq('zoek leeg → niets',    zoekAlles('',_D5).taken.length, 0);
  eq('zoek afgerond',        zoekAlles('klusje',_D5).afgerond.length, 1);
  eq('zoek logboek',         zoekAlles('bewerkt',_D5).logboek.length, 1);
  eq('zoek logboek op naam', zoekAlles('jer',_D5).logboek.length, 1);
  eq('zoek max vves (3)',    zoekAlles('x',Object.assign({},_D5,{alvo:[1,2,3,4,5].map(i=>({code:'X'+i,naam:''}))})).vves.length, 3);

  // ── Fase 5 rooktests: nieuwe DOM-ankers bestaan ──
  truthy('page-vve bestaat', !!document.getElementById('page-vve'));
  truthy('pal-bg bestaat', !!document.getElementById('pal-bg'));
  truthy('zoek-btn bestaat', !!document.getElementById('zoek-btn'));

  // ── bulk-helpers ── (Fase 5: verwerk-volgorde hoog→laag)
  eq('bulk volgorde hoog→laag', _bulkVolgorde([{_row:3},{_row:9},{_row:5}]).map(r=>r._row), [9,5,3]);
  eq('bulk volgorde leeg', _bulkVolgorde([]), []);
  truthy('bulk-balk bestaat', !!document.getElementById('bulk-balk'));

  // ── bulk kolom-mapping ── (behandelaar=E overal; deadline D/F per sectie)
  eq('bulk deadline-kolom OPPAKKEN', BULK_DEADLINE_KOLOM['OPPAKKEN'], 'D');
  eq('bulk deadline-kolom VERG',     BULK_DEADLINE_KOLOM['VERGADERVERZOEKEN'], 'F');
  eq('bulk deadline-kolom OFF',      BULK_DEADLINE_KOLOM['OFFERTE-TRAJECTEN'], 'F');
  eq('bulk deadline-kolom LOD',      BULK_DEADLINE_KOLOM['LOD'], 'F');

  // ── chart.js lazy-load ── (Fase 5: niet meer vooraf geladen)
  truthy('chart.js niet vooraf geladen', typeof window.Chart === 'undefined');

  // ── offerte-motor: fase-afleiding ──
  eq('fase leeg → aangevraagd', offerteFase({offertes:'0/3'}), 'aangevraagd');
  eq('fase X>0 → ontvangen',    offerteFase({offertes:'2/3'}), 'ontvangen');
  eq('fase expliciet bij_vve',  offerteFase({offertes:'3/3', fase:'bij_vve'}), 'bij_vve');
  eq('fase expliciet "Bij VvE"',offerteFase({fase:'Bij VvE'}), 'bij_vve');
  eq('fase gegund',             offerteFase({fase:'gegund'}), 'gegund');

  // ── offerte-motor: nu-opvolgen ──
  const VANDAAG_OFF = new Date(2026, 5, 12); // vr 12 juni 2026
  // aannemer 10 werkdagen stil (aangevraagd 29 mei) → nodig
  eq('nu-opvolgen aannemer te lang stil',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'29 mei 2026'}, VANDAAG_OFF).nodig, true);
  // aannemer pas 2 dagen geleden aangevraagd → niet nodig
  eq('nu-opvolgen aannemer nog vers',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'10 juni 2026'}, VANDAAG_OFF).nodig, false);
  // ontvangen, 9 dagen niet gedeeld → nodig, bal bij ons, actie Doorsturen
  truthy('nu-opvolgen ontvangen → doorsturen',
     (()=>{const s=offerteNuOpvolgen({offertes:'2/2', datumAangevraagd:'3 juni 2026'}, VANDAAG_OFF);
           return s.nodig && s.balBij==='ons' && s.actie==='Doorsturen';})());
  // gegund → nooit nodig
  eq('nu-opvolgen gegund nooit',
     offerteNuOpvolgen({fase:'gegund', datumAangevraagd:'1 jan 2026'}, VANDAAG_OFF).nodig, false);
  // weggelegd (opvolgdatum in toekomst) → niet nodig
  eq('nu-opvolgen weggelegd',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'1 mei 2026', opvolgdatum:'1 juli 2026'}, VANDAAG_OFF).nodig, false);
  // deadline overschreden → altijd nodig
  eq('nu-opvolgen deadline te laat',
     offerteNuOpvolgen({offertes:'2/2', datumAangevraagd:'11 juni 2026', deadline:'1 juni 2026'}, VANDAAG_OFF).nodig, true);

  // ── offerte-motor: briefing-feiten (regel-gebaseerde kern) ──
  const RIJEN_OFF = [
    {code:'A', naam:'VvA Lekstraat 15', offertes:'0/2', datumAangevraagd:'1 mei 2026'},   // aannemer, lang stil
    {code:'B', naam:'VvE Hoofdstraat 22', offertes:'2/2', datumAangevraagd:'3 juni 2026'},// ons (doorsturen)
    {code:'C', naam:'VvE Parkweg 8', offertes:'1/1', fase:'bij_vve', datumAangevraagd:'1 juni 2026'}, // bij vve
    {code:'D', naam:'VvE Verswijk', offertes:'0/1', datumAangevraagd:'11 juni 2026'},      // vers → niet nodig
  ];
  const FEITEN = offerteBriefingFeiten(RIJEN_OFF, VANDAAG_OFF);
  eq('briefing nuOpvolgen telt 3', FEITEN.nuOpvolgen, 3);
  eq('briefing balBijOns telt 1',  FEITEN.balBijOns, 1);
  eq('briefing klaarTeGunnen telt 1', FEITEN.klaarTeGunnen, 1);
  truthy('briefing urgentste is A (langst stil)', FEITEN.urgentste && FEITEN.urgentste.code === 'A');

  // ── offerte-motor: sorteerscore (hoger = urgenter) ──
  truthy('score: deadline-te-laat > gewoon',
     offerteSorteerScore({offertes:'2/2', datumAangevraagd:'11 juni 2026', deadline:'1 juni 2026', prioriteit:'Laag'}, VANDAAG_OFF)
     > offerteSorteerScore({offertes:'0/2', datumAangevraagd:'1 juni 2026', prioriteit:'Hoog'}, VANDAAG_OFF));
  truthy('score: langer stil > korter stil',
     offerteSorteerScore({offertes:'0/2', datumAangevraagd:'1 mei 2026', prioriteit:'Midden'}, VANDAAG_OFF)
     > offerteSorteerScore({offertes:'0/2', datumAangevraagd:'10 juni 2026', prioriteit:'Midden'}, VANDAAG_OFF));

  // ── offerte-motor: werkdagen-verschil (vr→ma = 1, weekend telt niet) ──
  eq('werkdagen vr→ma', _verschilInWerkdagen(new Date(2026,5,5), new Date(2026,5,8)), 1);
  eq('werkdagen vr→di', _verschilInWerkdagen(new Date(2026,5,5), new Date(2026,5,9)), 2);
  eq('werkdagen ma→do', _verschilInWerkdagen(new Date(2026,5,1), new Date(2026,5,4)), 3);
  eq('werkdagen zelfde dag', _verschilInWerkdagen(new Date(2026,5,8), new Date(2026,5,8)), 0);

  // ── offerte-motor: bal bij wie ──
  eq('balBij aangevraagd → aannemer', offerteBalBij({offertes:'0/2'}), 'aannemer');
  eq('balBij ontvangen → ons',        offerteBalBij({offertes:'2/2'}), 'ons');
  eq('balBij bij_vve → vve',          offerteBalBij({fase:'bij_vve'}), 'vve');
  eq('balBij gegund → null',          offerteBalBij({fase:'gegund'}), null);

  // ── offerte-motor: review-aanvullingen ──
  eq('weggelegd wint van deadline',
     offerteNuOpvolgen({offertes:'2/2', datumAangevraagd:'1 mei 2026', deadline:'1 juni 2026', opvolgdatum:'1 juli 2026'}, VANDAAG_OFF).nodig, false);
  eq('recente activiteit reset stil-teller',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'1 mei 2026', laatsteActiviteit:'2026-06-11T10:00:00.000Z'}, VANDAAG_OFF).nodig, false);
  eq('briefing langStil telt 1', offerteBriefingFeiten([
     {code:'A', naam:'VvA Lekstraat 15', offertes:'0/2', datumAangevraagd:'1 mei 2026'},
  ], VANDAAG_OFF).langStil, 1);
  // ── offerte-motor: groepen (render-laag) ──
  const GRP = offerteGroepen([
    {code:'X1', offertes:'0/2', datumAangevraagd:'1 mei 2026', prioriteit:'Midden'},
    {code:'X2', offertes:'0/2', datumAangevraagd:'10 juni 2026'},
    {code:'X3', offertes:'2/2', datumAangevraagd:'3 juni 2026', prioriteit:'Hoog'},
  ], new Date(2026,5,12));
  eq('groepen: nu telt 2', GRP.nu.length, 2);
  eq('groepen: lopend telt 1', GRP.lopend.length, 1);
  eq('groepen: langst stil eerst', GRP.nu[0].code, 'X1');

  eq('parseOff normaal', parseOff('2/3'), [2,3]);
  eq('parseOff half',    parseOff('3/'),  [3,0]);
  eq('parseOff rommel',  parseOff('abc'), [0,0]);
  eq('parseOff leeg',    parseOff(null),  [0,0]);

  // ── offerte-motor: groepen randgevallen + activiteit-map ──
  eq('groepen: leeg → beide leeg',
     (()=>{const g=offerteGroepen([], new Date(2026,5,12));return [g.nu.length,g.lopend.length];})(), [0,0]);
  eq('groepen: alles in nu',
     (()=>{const g=offerteGroepen([{code:'Y1', offertes:'0/2', datumAangevraagd:'1 mei 2026'}], new Date(2026,5,12));return [g.nu.length,g.lopend.length];})(), [1,0]);
  truthy('activiteit-map pakt jongste offerte-entry',
     (()=>{const m=_offerteActiviteitMap([
       {code:'A',sectie:'OFFERTE-TRAJECTEN',timestamp:'2026-06-01T10:00:00.000Z'},
       {code:'A',sectie:'OFFERTE-TRAJECTEN',timestamp:'2026-06-10T10:00:00.000Z'},
       {code:'A',sectie:'OPPAKKEN',timestamp:'2026-06-11T10:00:00.000Z'},
     ]);const t=m.get('A');return t && t.getTime()===new Date('2026-06-10T10:00:00.000Z').getTime();})());

  // ── offerte-acties: modal aanwezig ──
  truthy('offerte-actie-modal bestaat', !!document.getElementById('off-actie-bg'));

  // ── offerte-briefing: balBij → NL-tekst ──
  eq('balBijTekst aannemer', offerteBalBijTekst('aannemer'), 'bal bij de aannemer');
  eq('balBijTekst ons',      offerteBalBijTekst('ons'),      'bal bij ons');
  eq('balBijTekst vve',      offerteBalBijTekst('vve'),      'bal bij de eigenaren');
  // ── offerte: vastgelopen-teller (Nabellen-logregels per code) ──
  eq('nabelteller telt 2 nabel-acties', offerteNabelTeller('A', [
    {sectie:'OFFERTE-TRAJECTEN',code:'A',veld:'Telefoon'},
    {sectie:'OFFERTE-TRAJECTEN',code:'A',veld:'E-mail'},
    {sectie:'OFFERTE-TRAJECTEN',code:'A',veld:'Telefoon'},
    {sectie:'OFFERTE-TRAJECTEN',code:'B',veld:'Telefoon'},
  ]), 2);
  // ── offerte-aannemers: parse / serialize / derive ──
  eq('parseAannemers leeg', parseAannemers(''), []);
  eq('parseAannemers naam zonder vlag', parseAannemers('Klusbouw Meesters'),
     [{naam:'Klusbouw Meesters', binnen:false}]);
  eq('parseAannemers met binnen-vlag', parseAannemers('Zegwaard en Motec|1'),
     [{naam:'Zegwaard en Motec', binnen:true}]);
  eq('parseAannemers meerdere regels + lege regel', parseAannemers('A|1\n\nB|0\nC'),
     [{naam:'A',binnen:true},{naam:'B',binnen:false},{naam:'C',binnen:false}]);
  eq('serialize ↔ parse round-trip',
     parseAannemers(serializeAannemers([{naam:'Heijstek en Klus',binnen:true},{naam:'Alvin Lin',binnen:false}])),
     [{naam:'Heijstek en Klus',binnen:true},{naam:'Alvin Lin',binnen:false}]);
  eq('serialize stript pipe/newline uit naam',
     serializeAannemers([{naam:'A|B\nC',binnen:false}]), 'A B C|0');
  eq('deriveOffertes leeg', deriveOffertes([]), '');
  eq('deriveOffertes 1 van 3',
     deriveOffertes([{naam:'a',binnen:true},{naam:'b',binnen:false},{naam:'c',binnen:false}]), '1/3');

  // ── offerte: aannemerslijst stuurt de X/N-teller (via filterNtd-verrijking) ──
  truthy('verrijking leidt X/N af uit aannemerslijst', (()=>{
    const row={code:'ZZ-TEST',naam:'Test',offertes:'5/5',aannemers:'A|1\nB|0',_row:9999};
    filterNtd([row],'','','','','OFFERTE-TRAJECTEN');
    return row.offertes==='1/2';
  })());
  truthy('lege aannemerslijst laat handmatige X/N staan', (()=>{
    const row={code:'ZZ-LEEG',naam:'Test',offertes:'2/4',aannemers:'',_row:9998};
    filterNtd([row],'','','','','OFFERTE-TRAJECTEN');
    return row.offertes==='2/4';
  })());
  truthy('2/2 uit lijst → bal bij ons', (()=>{
    const row={code:'ZZ-ONS',naam:'Test',offertes:'',aannemers:'A|1\nB|1',_row:9997};
    filterNtd([row],'','','','','OFFERTE-TRAJECTEN');
    return offerteBalBij(row)==='ons';
  })());

  // ── offerte: sorteer-tiebreak — bal bij ons (snel af te ronden) wint bij gelijke dagen ──
  truthy('sorteer-tiebreak: bal bij ons > bal bij aannemer bij gelijke dagen', (()=>{
    const vandaag=new Date(2026,5,15);
    const basis={ datumAangevraagd:'1 mei 2026', opvolgdatum:'', laatsteActiviteit:'', aannemers:'' };
    const rOns ={ ...basis, code:'TIE-ONS', offertes:'1/1' }; // recv>0 → ontvangen → ons
    const rAann={ ...basis, code:'TIE-AAN', offertes:'0/1' }; // recv=0 → aangevraagd → aannemer
    return offerteSorteerScore(rOns,vandaag) > offerteSorteerScore(rAann,vandaag);
  })());

  // ── offerte-aannemers: paneel- en samenvatting-component ──
  truthy('aannemer-paneel heeft toevoeg-veld',
    offerteAannemerPaneel({code:'Q',_aannemers:[{naam:'X',binnen:true}]}).includes('of-aann-add'));
  truthy('aannemer-paneel toont binnen-actie',
    offerteAannemerPaneel({code:'Q',_aannemers:[{naam:'X',binnen:true}]}).includes('offerte-aann-binnen'));
  truthy('aannemer-paneel toont verwijder-actie',
    offerteAannemerPaneel({code:'Q',_aannemers:[{naam:'X',binnen:false}]}).includes('offerte-aann-verwijder'));
  truthy('aannemer-samenvatting heeft open-actie',
    offerteAannSamenvatting({code:'Q',_aannemers:[]}).includes('offerte-aann-open'));

  // ── offerte-aannemers: actie-handlers bedraad ──
  truthy('actie offerte-aann-open bestaat', typeof ACTIONS['offerte-aann-open']==='function');
  truthy('actie offerte-aann-binnen bestaat', typeof ACTIONS['offerte-aann-binnen']==='function');
  truthy('actie offerte-aann-verwijder bestaat', typeof ACTIONS['offerte-aann-verwijder']==='function');

  // ── offerte-aannemers: zichtbare Toevoegen-knop + actie ──
  truthy('aannemer-paneel heeft Toevoegen-knop',
    offerteAannemerPaneel({code:'Q',_aannemers:[]}).includes('offerte-aann-add'));
  truthy('actie offerte-aann-add bestaat', typeof ACTIONS['offerte-aann-add']==='function');

  // ── offerte-briefing: DOM-rooktest (C2-markup, geen emoji; setNtd-pad crasht niet) ──
  truthy('off-briefing-slot bestaat', !!document.getElementById('off-briefing-slot'));
  truthy('Vandaag-paneel rendert strip + beide blokken', (()=>{
    try{
      const vorige=state.activeNtd;
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      setNtd(vorige);
      return html.includes('of-strip')&&html.includes('Doorsturen')&&html.includes('Nabellen')
        &&html.includes('Volledige tabel')&&!html.includes('✦');
    }catch(e){ console.error('vandaag-paneel-test:',e); return false; }
  })());

  // ── offerte-briefing: 'Nu dit'-kaart + gepinde bewerk-rij (regressie wegspringen) ──
  truthy('Nu-dit-kaart toont de urgentste taak', (()=>{
    try{
      const vA=state.activeNtd, vR=D.ntd['OFFERTE-TRAJECTEN'], vO=new Set(state.offerteAannOpen);
      state.offerteAannOpen.clear();
      D.ntd['OFFERTE-TRAJECTEN']=[
        {code:'HERO-1',naam:'VvE Urgentst',offertes:'0/1',aannemers:'',fase:'',datumAangevraagd:'1 mei 2026',_row:9101},
        {code:'HERO-2',naam:'VvE Tweede', offertes:'0/1',aannemers:'',fase:'',datumAangevraagd:'20 mei 2026',_row:9102},
      ];
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      D.ntd['OFFERTE-TRAJECTEN']=vR; state.offerteAannOpen=vO; setNtd(vA);
      return html.includes('of-hero')&&html.includes('VvE Urgentst')&&html.includes('Begin hier');
    }catch(e){ console.error('nu-dit-test:',e); return false; }
  })());

  truthy('bewerkte rij blijft in z\'n sectie zichtbaar (geen pin-zone, geen sprong omhoog)', (()=>{
    try{
      const vA=state.activeNtd, vR=D.ntd['OFFERTE-TRAJECTEN'], vO=new Set(state.offerteAannOpen), vS={...state.offerteAannSnap};
      const rows=[];
      for(let i=0;i<8;i++) rows.push({code:'NB-'+i,naam:'VvE Na '+i,offertes:'0/1',aannemers:'',fase:'',datumAangevraagd:'1 mei 2026',_row:9200+i});
      D.ntd['OFFERTE-TRAJECTEN']=rows;
      state.offerteAannOpen.clear(); state.offerteAannOpen.add('NB-7'); // minst urgente, zou onder de cap vallen
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      D.ntd['OFFERTE-TRAJECTEN']=vR; state.offerteAannOpen=vO; state.offerteAannSnap=vS; setNtd(vA);
      // open rij blijft zichtbaar (cap-exempt) én er is géén losse 'Aan het bijwerken'-pin-zone meer
      return html.includes('NB-7') && !html.includes('of-pin') && !html.includes('Aan het bijwerken');
    }catch(e){ console.error('inplace-test:',e); return false; }
  })());

  truthy('lege nu-lijst → rustige leeg-staat', (()=>{
    try{
      const vA=state.activeNtd, vR=D.ntd['OFFERTE-TRAJECTEN'];
      D.ntd['OFFERTE-TRAJECTEN']=[];
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      D.ntd['OFFERTE-TRAJECTEN']=vR; setNtd(vA);
      return html.includes('Niets dringends');
    }catch(e){ console.error('leeg-test:',e); return false; }
  })());

  const totOk = ok + _tOk, totFail = fail + _tFail;
  console.log(`%c[TESTS] ${totOk} OK, ${totFail} FAIL`, totFail ? 'background:#dc2626;color:white;padding:2px 6px' : 'background:#16a34a;color:white;padding:2px 6px');
  window._testResult = `${totOk} OK, ${totFail} FAIL`; // uitleesbaar voor test-automatisering
