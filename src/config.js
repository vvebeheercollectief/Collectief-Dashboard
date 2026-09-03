// ══════════════════════════════════════
//  CONFIG — constanten (omgeving, ids, secties)
// ══════════════════════════════════════
import { ALLOWED_EMAILS } from '../allowed-emails.js';

// ── Versie (zichtbaar in de UI) ────────────────────────────────────────
// Ophogen bij ELKE wijziging: 4.1, 4.2, … 5.0 voor grote sprongen.
export const APP_VERSION = '12.8';

// Snelkeuzes in het afrondvenster. Sinds v12.8 is de opmerking verplicht, en zonder deze
// knoppen zou dat betekenen dat je bij elke afronding een zin moet typen. Hier en niet in de
// HTML: het bulk-venster gebruikt dezelfde lijst plus BULK_AFROND_SNELKEUZE, en twee
// handgeschreven kopieën lopen uiteen.
export const AFROND_SNELKEUZES = ['Uitgevoerd en akkoord','Doorgezet naar aannemer','Vervallen','Bestuur geïnformeerd'];
export const BULK_AFROND_SNELKEUZE = 'Opgeruimd';

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
// rechts telt mee. Een GETAL is een gewicht (wordt een percentage en groeit mee met het venster),
// een STRING als '165px' is een vaste breedte. Gewichten hoeven niet op 100 uit te komen — ze
// delen wat er na de vaste kolommen overblijft — en een extra kolom (het bulk-vinkje) schuift er
// vanzelf tussen.
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
// Elke datumkolom heeft daarom een VASTE breedte in pixels ('165px' sinds v11.8) in plaats van een gewicht dat
// bij elke bijstelling opnieuw moest kloppen.
//
// EEN PX-BREEDTE IS EEN PLAFOND, GEEN ONDERGRENS (sinds v11.1). kolBreedtes() rekent de
// gewichten om tegen de GEMETEN tabelbreedte, dus alles telt bij élke vensterbreedte op tot
// precies 100% en een px-kolom blijft op zijn getal staan. Daarvóór werd er gerekend tegen de
// smalste tabel (1150px); wat er op een breed scherm overschoot verdeelde de browser GELIJK over
// álle kolommen, dus ook over de px-kolommen. Gemeten bij een tabel van 1650px: de deadline stond
// op 216px voor een datum van 85px en de actiekolom op 211px voor 127px aan knoppen — twee gaten
// in de rij, terwijl het actiepunt en de opmerkingen ernaast werden afgekapt.
//
// KIES px DUS ALLEEN ALS DE INHOUD EEN BEKEND MAXIMUM HEEFT, want de kolom groeit nooit meer mee:
//   VvE Code  130px — de code kan een kenmerk dragen ("121034 - G"); op 7% liep hij er 19px uit.
//                     130 en niet 105 sinds 26-08: op een BUNDELKOP staan er drie dingen in die
//                     cel (sleepgreep 16 + 9 marge, chevron 22 + 3, code 45 = 95px) en in de
//                     contentbox van 75px viel de code naar een tweede regel.
//   datums    165px — "22 september 2026" heeft 148px nodig incl. celopvulling. Sinds v11.8
//                     staat het dashboard op de standaardletter van het toestel en die is
//                     breder dan IBM Plex Mono: dezelfde datum ging van 119 naar 148px, en
//                     op de oude 155px bleef er 7px speling over. Gemeten, niet geschat.
//   acties    150px — vier knoppen van 28px plus de tussenruimte; op 9% viel het vinkje eraf.
//                     Offerte-trajecten heeft er drie en houdt het op 120px.
// De kolomKOP telt ook mee als ondergrens. Hij is `white-space:nowrap`, en tot v11.8 werd een kop
// die niet paste OVER de buurkop heen getekend. Sinds v11.8 heeft `thead th` daarom
// `overflow:hidden;text-overflow:ellipsis` — een te krappe kop kapt nu netjes af in plaats van zijn
// buur onleesbaar te maken. Dat is het VANGNET, niet de norm: de gewichten hieronder zijn zo gezet
// dat elke kop bij de smalste tabel (1150px) heel blijft. 'BEHANDELAAR' is met 111px de breedste
// (was 97px in IBM Plex Mono; de standaardletter van v11.8 is breder). In de SELECTEERSTAND komt er
// een vinkjeskolom van 48px bij en krimpen alle gewichtskolommen mee. De gewichten zijn zo gezet
// dat élke kop ook DAAR heel blijft — dat is wat de toets 'geen kop loopt over zijn kolom heen'
// in beide standen afdwingt. Het kost de opmerkingenkolom op Offerte-trajecten 20px bij de smalste
// tabel; die tekst kapt toch al af, een kolomNAAM half wegvallen is erger.
// Alle andere kolommen dragen tekst die langer kan worden en krijgen een gewicht.
//
// DE SIGNAAL-KOLOM IS WEG (v12.0). Hij stond naast de deadline en rekende daar zijn eigen
// "Te laat (76d)" uit — dezelfde dagen die uit de datum ernaast te halen zijn. Die melding staat nu
// ónder de datum in de deadline-kolom zelf, dus op één plek. Wat er verder in stond: 'Terug 31 aug'
// is een gedempt label in de opmerkingen-cel geworden (zoals Offerte-trajecten dat al deed), en
// 'Vandaag opvolgen' en 'Xd stil' zijn vervallen — het stil-signaal blijft wél bestaan als
// herinneringsmail (STIL_ESCALATIE_REGELS in util.js / Opvolging.gs), het staat alleen niet meer
// in de tabel. De vrijgekomen breedte (21,3 / 20,5 / 22,6) is verdeeld over de tekstkolommen, en bij
// Vergaderverzoeken vooral naar Periode: die cel toont sinds v12.0 'ma 7 – vr 11 sep' voluit.
export const SECS = {
  OPPAKKEN:{label:'Oppakken',css:'--sec:var(--ac);--sec-l:var(--ac-l);--sec-b:var(--ac-b)',color:'#0D7377',
    cols:['VvE Code','VvE','Actiepunt','Deadline','Wie','Opmerkingen'],
                   breedtes:['130px',27.3,38,'165px',7,27.7,'150px'],
    keys:['code','naam','actiepunt','deadline','behandelaar','prioriteit','opmerkingen','inBehandeling']},
  VERGADERVERZOEKEN:{label:'Vergaderverzoeken',css:'--sec:var(--am);--sec-l:var(--am-l);--sec-b:var(--am-b)',color:'#AE5008',
    cols:['VvE Code','VvE','Periode','Agendapunten','Wie','Deadline uitschr.','Opmerkingen'],
                   breedtes:['130px',26,19.1,23,7,'165px',21.1,'150px'],
    keys:['code','naam','periode','agendapunten','behandelaar','deadline','opmerkingen','inBehandeling']},
  'OFFERTE-TRAJECTEN':{label:'Offerte-trajecten',css:'--sec:var(--pu);--sec-l:var(--pu-l);--sec-b:var(--pu-b)',color:'#6855C9',
    // Koppen korter sinds v12.8. 'Aangevraagd' en niet 'Aangevr.': dat laatste is een deelstring
    // van de oude kop van de buurkolom ('Ontvangen/Aangevr.'), en wie de oude tabel kent mapt hem
    // dan op de verkeerde plek. 'Wie' i.p.v. 'Behandelaar' maakt alle vijf de tabbladen gelijk.
    cols:['VvE Code','VvE','Aangevraagd','Offertes','Wie','Deadline','Opmerkingen'],
    // GEWICHTEN voor 'Offertes' en 'Wie', geen vaste px. Een vaste kolom groeit niet mee, en de
    // klikzone van de aannemers-uitklapper is precies wat er ná de teller en het balkje overblijft:
    // bij een vaste 150px zakt die op een venster van 1920 van ~221 naar ~33px — exact de fout die
    // v11.3 heeft gerepareerd. 'Aangevraagd' en 'Deadline' mogen wél vast, want die tonen sinds
    // v12.8 de KORTE datum ('14 jul' i.p.v. '14 juli 2026').
    // Gemeten bij 1440: VvE 244 · Aangevraagd 130 · Offertes 167 · Wie 141 · Deadline 148 ·
    // Opmerkingen 360 (was 188). Bij 1150 houdt Opmerkingen er nog 245 over (was 124).
                   breedtes:['130px',19,'130px',13,11,'148px',28,'120px'],
    // 'Offertes' verliest de uitleg die 'Ontvangen/Aangevr.' letterlijk gaf; die staat nu in de
    // zweeftekst van de kop (renderThead gaf die alleen aan sorteerbare koppen).
    kopUitleg:{'Offertes':'Ontvangen van aangevraagd'},
    keys:['code','naam','datumAangevraagd','offertes','behandelaar','deadline','opmerkingen']},
  LOD:{label:'LOD',css:'--sec:var(--rd);--sec-l:var(--rd-l);--sec-b:var(--rd-b)',color:'#B91C1C',
    cols:['VvE Code','VvE','Actiepunt','Status','Wie','Deadline LOD','Opmerkingen'],
                   breedtes:['130px',24,29.7,20,7,'165px',25.6,'150px'],
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
    // 'Wie' i.p.v. 'Behandelaar' (v12.8): alle vijf de tabbladen dragen nu dezelfde kop.
    cols:['VvE Code','VvE','Subsidie','Fase','Wie','Deadline'],
                   breedtes:['130px',27.5,19,19,13.3,'165px','150px'],
    keys:['code','naam','subsidie','subsidieFase','behandelaar','deadline','opmerkingen','inBehandeling']},
};

// De kolomkop zoals de gebruiker hem ziet, per VELDNAAM in plaats van per kolompositie.
//
// WAAROM NIET OP INDEX. `cols` en `keys` liepen nooit echt gelijk op: Oppakken heeft zes koppen
// en acht sleutels, dus `cols[keys.indexOf('prioriteit')]` gaf al 'Opmerkingen'. Dat bleef
// onzichtbaar omdat `prioriteit` een boekhoudveld is en dus nooit in de verlies-lijst komt — de
// vijf velden die de dialoog wél kan noemen zaten toevallig allemaal vóór de eerste scheefstand.
// Zodra er een kop bijkomt die bij geen veld hoort (de Signaal-kolom was daar tot v12.0 het
// voorbeeld van) schuiven ook die vijf op
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
    code:'VvE Code', naam:'VvE', datumAangevraagd:'Aangevraagd',
    offertes:'Offertes', behandelaar:'Wie', deadline:'Deadline',
    opmerkingen:'Opmerkingen',
  },
  'LOD': {
    code:'VvE Code', naam:'VvE', actiepunt:'Actiepunt', status:'Status',
    behandelaar:'Wie', deadline:'Deadline LOD', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'SUBSIDIE-TRAJECTEN': {
    code:'VvE Code', naam:'VvE', subsidie:'Subsidie', subsidieFase:'Fase',
    behandelaar:'Wie', deadline:'Deadline', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
};

export const SKEYS = Object.keys(SECS);

// Het actiepunt van de AUTOMATISCHE stap bij een offerte-traject (v12.5). Woont hier en niet in
// offerte-stappen.js omdat de bundel-laag hem moet kennen om die stap uit de vlakke lijst te
// houden — en bundel.js mag onmogelijk offerte-stappen.js importeren (die hangt via crud.js aan
// de halve app). offerte-stappen.js exporteert hem door, zodat bestaande imports blijven werken.
export const VOORLEG_ACTIE = 'Offertes voorleggen aan eigenaren';

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
