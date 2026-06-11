// ══════════════════════════════════════
//  TESTS — zelftest (lazy-geladen, alleen met ?test=1)
// ══════════════════════════════════════
import { berekenPrioriteit, _parseAnyDate, displayName, opvolgStatus, volgendeDeadline, STIL_ESCALATIE_REGELS } from "./util.js";
import { logZin } from "./render-overig.js";
import { _isStagingHost } from "./config.js";
import { ACTIONS } from "./actions.js";
import { filterVves } from "./vve-zoekveld.js";
import { filterNtd } from "./render-lijsten.js";

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
  const VERWACHTE_ACTIES = ['toggle','notif-toggle','off','notitie-toevoegen','taak-verwijder-modal','ai-kopieer','login','ntd-sectie','af-sectie','alvo-flag','taak-bewerken','taak-afronden','pagineer','ai-overnemen','ai-actie-taak','ai-kopieer-concept','ontw-cat','ontw-bewerken','toast-sluiten','taak-wegleggen','snooze-kies','herhaal-bewerken','herhaal-status','herhaal-verwijderen'];
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

  const totOk = ok + _tOk, totFail = fail + _tFail;
  console.log(`%c[TESTS] ${totOk} OK, ${totFail} FAIL`, totFail ? 'background:#dc2626;color:white;padding:2px 6px' : 'background:#16a34a;color:white;padding:2px 6px');
