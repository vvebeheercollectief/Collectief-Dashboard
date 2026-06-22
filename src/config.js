// ══════════════════════════════════════
//  CONFIG — constanten (omgeving, ids, secties)
// ══════════════════════════════════════
import { ALLOWED_EMAILS } from '../allowed-emails.js';

// ── Versie (zichtbaar in de UI) ────────────────────────────────────────
// Ophogen bij ELKE wijziging: 4.1, 4.2, … 5.0 voor grote sprongen.
export const APP_VERSION = '5.3';

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

export const SECS = {
  OPPAKKEN:{label:'Oppakken',css:'--sec:var(--ac);--sec-l:var(--ac-l);--sec-b:var(--ac-b)',color:'#0D7377',
    cols:['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Prioriteit','Opmerkingen'],
    keys:['code','naam','actiepunt','deadline','behandelaar','prioriteit','opmerkingen','inBehandeling']},
  VERGADERVERZOEKEN:{label:'Vergaderverzoeken',css:'--sec:var(--am);--sec-l:var(--am-l);--sec-b:var(--am-b)',color:'#B45309',
    cols:['VvE Code','VvE','Periode','Agendapunten','Behandelaar','Deadline uitschr.','Prioriteit','Opmerkingen'],
    keys:['code','naam','periode','agendapunten','behandelaar','deadline','opmerkingen','inBehandeling']},
  'OFFERTE-TRAJECTEN':{label:'Offerte-trajecten',css:'--sec:var(--pu);--sec-l:var(--pu-l);--sec-b:var(--pu-b)',color:'#6D5BD0',
    cols:['VvE Code','VvE','Datum aangevr.','Ontvangen/Aangevr.','Behandelaar','Deadline','Prioriteit','Opmerkingen'],
    keys:['code','naam','datumAangevraagd','offertes','behandelaar','deadline','opmerkingen']},
  LOD:{label:'LOD',css:'--sec:var(--rd);--sec-l:var(--rd-l);--sec-b:var(--rd-b)',color:'#B91C1C',
    cols:['VvE Code','VvE','Actiepunt','Status','Behandelaar','Deadline LOD','Prioriteit','Opmerkingen'],
    keys:['code','naam','actiepunt','status','behandelaar','deadline','opmerkingen','inBehandeling']},
};
export const SKEYS = Object.keys(SECS);

// Opvolg-termijnen voor de offerte-motor (Fase: offerte-opvolgsysteem).
// aannemer = werkdagen; delen/eigenaren = kalenderdagen.
export const OFFERTE_TERMIJNEN = { aannemer: 5, delen: 7, eigenaren: 7 };
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
  vandaag:['Vandaag','Jouw persoonlijke dagstart'],
};
