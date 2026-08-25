// ══════════════════════════════════════
//  CONFIG — constanten (omgeving, ids, secties)
// ══════════════════════════════════════
import { ALLOWED_EMAILS } from '../allowed-emails.js';

// ── Versie (zichtbaar in de UI) ────────────────────────────────────────
// Ophogen bij ELKE wijziging: 4.1, 4.2, … 5.0 voor grote sprongen.
export const APP_VERSION = '10.34';

// ── Omgeving (productie vs. testomgeving) ──────────────────────────────
// Fail-safe: alleen deze exacte hosts zijn PRODUCTIE; al het andere
// (staging-branch, andere previews, localhost) draait op de TEST-data.
export const PROD_HOSTS = [
  'vvebeheercollectief.github.io',                            // ECHTE productie (GitHub Pages, source=main)
  'collectief-dashboard.vercel.app',                          // Vercel-spiegel van main (parallel/handmatig)
  'collectief-dashboard-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-git-main-vve-beheer-collectief.vercel.app',
];
export function _isStagingHost(hostname){ return !PROD_HOSTS.includes(hostname); }
export const IS_STAGING = _isStagingHost(location.hostname);

export const SID_PROD = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw';
export const SID_TEST = '1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4';   // test-Sheet "Collectief Dashboard - Kopie" (Taak 3)
export const SID = IS_STAGING ? SID_TEST : SID_PROD;
export const PG   = 25;
// AI-proxy: op staging same-origin (/api/chat); op productie de vaste Vercel-functie-URL.
export const PROXY_URL = IS_STAGING ? '/api/chat' : 'https://collectief-dashboard.vercel.app/api/chat';
// Meldingen lopen via de 'Notif-wachtrij'-tab (OAuth-append vanuit de ingelogde
// gebruiker) — een Apps Script-trigger verstuurt de push. Geen webhook-URL of
// secret meer nodig in deze (publieke) frontend.
export const ONESIGNAL_APP_ID_PROD = 'c0e1301b-2cee-4646-8fab-99698e10e78c';
export const ONESIGNAL_APP_ID_TEST = '11b00aea-496b-44d5-8b9f-5012fcb48fd4';   // test-OneSignal app "Collectief Dashboard TEST" (Taak 4)
export const ONESIGNAL_APP_ID      = IS_STAGING ? ONESIGNAL_APP_ID_TEST : ONESIGNAL_APP_ID_PROD;

// Google OAuth client-id (vaste constante)
export const clientId = '560046984985-1371r4bbt28umi6uslims6mlkucn1278.apps.googleusercontent.com';

export { ALLOWED_EMAILS }; // één bron: ../allowed-emails.js (ook door api/chat.js gebruikt)
export const EMAIL_NAMES = {
  'info@vvebeheercollectief.nl':'Jer',
  'djiowchico@gmail.com':'Cihad',
  'gabrielateterycz1616@gmail.com':'Gabos',
  'giocan175@gmail.com':'Cihan',
};
// Het vaste team, afgeleid uit EMAIL_NAMES — één bron. Analytics (KPI-tegels, leaderboard)
// gebruikt dit i.p.v. losse literals, zodat een nieuwe collega in EMAIL_NAMES automatisch
// meetelt. De cijfers vullen dit bovendien aan met namen die in de data voorkomen maar hier
// (nog) niet staan, zodat werk van een stagiair/variant niet stil uit de tellingen valt.
export const TEAM = [...new Set(Object.values(EMAIL_NAMES))];

// De korte code per behandelaar, zoals hij in de takentabel op de rij staat. Door de gebruiker
// vastgesteld en bewust een VASTE LIJST, geen afleidregel: Cihad en Cihan lopen pas bij de vijfde
// letter uiteen, dus geen enkele regel komt op iets korters uit dat ook nog klopt. Staat een naam
// hier niet in, dan valt korteNaam() terug op de beginletter — maar alleen als die nog vrij is.
export const KORTE_NAMEN = {
  'jer':   'J',
  'gabos': 'G',
  'cihad': 'JC',
  'cihan': 'CC',
};

// `breedtes` is de kolomverdeling, als GEWICHTEN — één meer dan `cols`, want de actiekolom
// rechts telt mee. renderThead rekent ze om naar percentages, dus ze hoeven niet op 100 uit te
// komen en een extra kolom (het bulk-vinkje) schuift er vanzelf tussen.
//
// WAAROM DIT ER IS. De tabel deelde overgebleven ruimte zelf uit, en de tekstkolommen hadden een
// klem in vaste pixels (`.cell-name>.ct{max-width:160px}` e.d.). Kolommen mét klem konden dus niet
// groeien en kolommen zonder klem slokten alles op. Gemeten op Offerte-trajecten: 'Datum aangevr.'
// was 351px breed voor "1 oktober 2025", terwijl de VvE-naam (212px) én de opmerkingen (296px)
// afgekapt werden. Op Oppakken was de VvE-kolom 309px met de tekst afgekapt op 160 — 149px dode
// ruimte in dezelfde cel waar de naam niet paste.
//
// EN DE ANDERE KANT OP. De eerste opzet maakte de datumkolommen te SMAL: "22 september 2026" is
// 128px in IBM Plex Mono, en `.s-normal` is `white-space:nowrap` in een cel met `overflow:visible`
// — de datum werd dus niet afgekapt maar óver de buurkolom heen getekend. Sheets levert lange
// Nederlandse datums (zie _parseAnyDate), dus dat is de normale vorm en niet de uitzondering.
// Elke deadline-kolom heeft daarom minstens gewicht 13: bij de smalste tabel (1150px) is dat
// 149px en past de langste datum er nog in.
export const SECS = {
  OPPAKKEN:{label:'Oppakken',css:'--sec:var(--ac);--sec-l:var(--ac-l);--sec-b:var(--ac-b)',color:'#0D7377',
    cols:['VvE Code','VvE','Signaal','Actiepunt','Deadline','Wie','Opmerkingen'],
                   breedtes:[7,19,11,21,13,5,15,9],
    keys:['code','naam','actiepunt','deadline','behandelaar','prioriteit','opmerkingen','inBehandeling']},
  VERGADERVERZOEKEN:{label:'Vergaderverzoeken',css:'--sec:var(--am);--sec-l:var(--am-l);--sec-b:var(--am-b)',color:'#B45309',
    cols:['VvE Code','VvE','Signaal','Periode','Agendapunten','Wie','Deadline uitschr.','Opmerkingen'],
                   breedtes:[7,15,11,8,18,5,13,15,8],
    keys:['code','naam','periode','agendapunten','behandelaar','deadline','opmerkingen','inBehandeling']},
  'OFFERTE-TRAJECTEN':{label:'Offerte-trajecten',css:'--sec:var(--pu);--sec-l:var(--pu-l);--sec-b:var(--pu-b)',color:'#6D5BD0',
    cols:['VvE Code','VvE','Datum aangevr.','Ontvangen/Aangevr.','Behandelaar','Deadline','Opmerkingen'],
                   breedtes:[8,17,14,14,8,13,17,9],
    keys:['code','naam','datumAangevraagd','offertes','behandelaar','deadline','opmerkingen']},
  LOD:{label:'LOD',css:'--sec:var(--rd);--sec-l:var(--rd-l);--sec-b:var(--rd-b)',color:'#B91C1C',
    cols:['VvE Code','VvE','Signaal','Actiepunt','Status','Wie','Deadline LOD','Opmerkingen'],
                   breedtes:[6,15,11,18,13,5,13,11,8],
    keys:['code','naam','actiepunt','status','behandelaar','deadline','opmerkingen','inBehandeling']},
  // Subsidie-trajecten (2026-07-29). Zelfde kolomstramien als LOD, met 'Status'
  // vervangen door 'Fase'. Twee dingen liggen hier vast en mogen niet losjes wijzigen:
  //   - de sleutel heet `subsidieFase`, NIET `fase`: parseSections overschrijft
  //     entry.fase na de keys-loop met kolom O (de offerte-fase).
  //   - `color` is een letterlijke hex, geen var(): de donut op Analytics haalt deze
  //     waarde door _lightenHex() en createLinearGradient(), en die kunnen niet met
  //     een var()-string overweg.
  // Opmerkingen (kolom G) bestaat wel als veld maar staat bewust niet in `cols`:
  // de gebruiker koos zes kolommen om de rij rustig te houden.
  'SUBSIDIE-TRAJECTEN':{label:'Subsidie-trajecten',css:'--sec:var(--tl);--sec-l:var(--tl-l);--sec-b:var(--tl-b)',color:'#0F766E',
    cols:['VvE Code','VvE','Subsidie','Fase','Behandelaar','Deadline'],
                   breedtes:[8,23,15,15,9,13,13],
    keys:['code','naam','subsidie','subsidieFase','behandelaar','deadline','opmerkingen','inBehandeling']},
};

// De kolomkop zoals de gebruiker hem ziet, per VELDNAAM in plaats van per kolompositie.
//
// WAAROM NIET OP INDEX. `cols` en `keys` liepen nooit echt gelijk op: Oppakken heeft zes koppen
// en acht sleutels, dus `cols[keys.indexOf('prioriteit')]` gaf al 'Opmerkingen'. Dat bleef
// onzichtbaar omdat `prioriteit` een boekhoudveld is en dus nooit in de verlies-lijst komt — de
// vijf velden die de dialoog wél kan noemen zaten toevallig allemaal vóór de eerste scheefstand.
// Zodra er een kop bijkomt die bij geen veld hoort ('Signaal', taak 4) schuiven ook die vijf op
// en gaat de dialoog stil de verkeerde veldnaam tonen. Deze afbeelding is expliciet; de toetsen
// bij 'veldlabel:' in tests.js bewaken drift in beide richtingen.
//
// KOP EN LABEL LOPEN GELIJK OP. Wordt een kolomkop hernoemd, dan wijzigt dezelfde tekst hier én
// in `cols` — anders zegt de tabel iets anders dan de verplaats-vraag en slaat de bewaking alarm.
export const VELD_LABELS = {
  'OPPAKKEN': {
    code:'VvE Code', naam:'VvE', actiepunt:'Actiepunt', deadline:'Deadline',
    behandelaar:'Wie', prioriteit:'Prioriteit', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'VERGADERVERZOEKEN': {
    code:'VvE Code', naam:'VvE', periode:'Periode', agendapunten:'Agendapunten',
    behandelaar:'Wie', deadline:'Deadline uitschr.', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'OFFERTE-TRAJECTEN': {
    code:'VvE Code', naam:'VvE', datumAangevraagd:'Datum aangevr.',
    offertes:'Ontvangen/Aangevr.', behandelaar:'Behandelaar', deadline:'Deadline',
    opmerkingen:'Opmerkingen',
  },
  'LOD': {
    code:'VvE Code', naam:'VvE', actiepunt:'Actiepunt', status:'Status',
    behandelaar:'Wie', deadline:'Deadline LOD', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'SUBSIDIE-TRAJECTEN': {
    code:'VvE Code', naam:'VvE', subsidie:'Subsidie', subsidieFase:'Fase',
    behandelaar:'Behandelaar', deadline:'Deadline', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
};

export const SKEYS = Object.keys(SECS);

// Waar staat de OMSCHRIJVING van een taak, per categorie — als VELDNAAM (niet als DOM-id).
// Dit is dezelfde afspraak als OMSCHRIJVING_VELD in crud.js (dat de invoervelden aanwijst) en als
// CD_OMSCHRIJVING_COL in apps-script/Notifications.gs (dat de kolomnummers aanwijst). Hier staat
// hij als sleutel, want het verplaatsen van een taak naar een andere categorie moet weten wélk
// veld de tekst draagt — die heet in elke categorie anders en zou anders stil verdwijnen.
export const OMSCHRIJVING_SLEUTEL = {
  'OPPAKKEN':           'actiepunt',
  'VERGADERVERZOEKEN':  'agendapunten',
  'OFFERTE-TRAJECTEN':  'opmerkingen',
  'LOD':                'actiepunt',
  'SUBSIDIE-TRAJECTEN': 'subsidie',
};

// Fase van een offerte-traject (kolom O). Het dashboard schrijft deze kolom sinds v6.2 niet
// meer — offerteFase() leidt 'aangevraagd'/'ontvangen' af uit de X/N-teller; 'bij_vve' en
// 'gegund' worden alleen nog gelézen als ze handmatig in de Sheet staan.
export const OFFERTE_FASES = ['aangevraagd', 'ontvangen', 'bij_vve', 'gegund'];

export const PAGE_META = {
  ntd:['Nog Te Doen','Openstaande taken en actiepunten'],
  af:['Afgerond','Afgeronde taken per categorie'],
  alvo:["ALV's Overzicht","Voortgang vergaderingen per VvE"],
  alfa:["ALV's Afgerond","Afgeronde jaarvergaderingen"],
  ontw:['Ontwikkeling','Interne notities, verbeteringen en ideeën'],
  logboek:['Logboek','Wijzigingshistorie van alle taken'],
  herhaal:['Herhaalregels','Terugkerende taken — automatisch klaargezet'],
  vve:['VvE-dossier','Alles van één VvE op één scherm'],
  analytics:['Analytics','Statistieken en grafieken'],
  dash:['Dashboard','Totaaloverzicht'],
};
