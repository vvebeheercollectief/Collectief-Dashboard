// ══════════════════════════════════════
//  CONFIG — constanten (omgeving, ids, tabbladen, team)
// ══════════════════════════════════════
// v16.0: het dashboard is teruggebracht tot vijf schermen — Mijn taken, LOD, Subsidies, ALV's en
// het ALV-archief. Alles wat weg is (Oppakken, Vergaderverzoeken, Offerte-trajecten, CRM, Logboek,
// Herhaalregels, Analytics, AI, meldingen …) staat nog in de geschiedenis van de repository.
import { ALLOWED_EMAIL_HASHES } from '../allowed-emails.js';
import { emailHash } from './hash.js';

// ── Versie (zichtbaar in de UI) ────────────────────────────────────────
// Ophogen bij ELKE wijziging. Zie README voor versie.json (de minimumversie-rem).
export const APP_VERSION = '16.2';

// ── Omgeving (productie vs. testomgeving) ──────────────────────────────
// Fail-safe: alleen deze exacte hosts zijn PRODUCTIE; al het andere (previews, localhost) draait
// op de TEST-Sheet.
export const PROD_HOSTS = [
  'dashboard.vvebeheercollectief.nl',                         // eigen domein (Vercel, main)
  'vvebeheercollectief.github.io',                            // oude productie (GitHub Pages) — tot de verhuizing
  'collectief-dashboard.vercel.app',                          // Vercel-spiegel van main
  'collectief-dashboard-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-git-main-vve-beheer-collectief.vercel.app',
];
export function _isStagingHost(hostname){ return !PROD_HOSTS.includes(hostname); }
export const IS_STAGING = _isStagingHost(location.hostname);

export const SID_PROD = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw';
export const SID_TEST = '1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4';   // test-Sheet "Collectief Dashboard - Kopie"
export const SID = IS_STAGING ? SID_TEST : SID_PROD;

// ── Verhuizing naar een eigen origin ────────────────────────────────────
// Blijft LEEG tot het nieuwe adres volledig werkt (DNS, Vercel-domein, Google OAuth-origin).
// Daarna: 'https://dashboard.vvebeheercollectief.nl/' en elke start op github.io stuurt door.
export const VERHUISD_NAAR = '';
export const OUDE_HOST = 'vvebeheercollectief.github.io';
export function _verhuisDoel(doel, hostname, search, hash){
  if(!doel || hostname !== OUDE_HOST) return '';
  return doel.replace(/\/?$/, '/') + (search || '') + (hash || '');
}

// Google OAuth client-id (vaste constante)
export const clientId = '560046984985-1371r4bbt28umi6uslims6mlkucn1278.apps.googleusercontent.com';

// ── Wie mag erin, en hoe heet die persoon ───────────────────────────────
// Eén bron: ../allowed-emails.js (SHA-256-hashes). Een nieuwe collega komt daar én hieronder bij.
export const emailToegestaan = email => !!email && ALLOWED_EMAIL_HASHES.includes(emailHash(email));
export const EMAIL_NAMES = {
  '33f0fe21146283058710f1a0fde19dc5f940453cd0e7e76fb5dfb00a9a8dc644':'Jer',
  'cb884483e517829a56da8206f35f2c80f82629338a279573e4dac6a5909814a3':'Cihad',
  '2091b21099f4297a28f9a49f5507aebb6bfb25ed57cfd49ac46f055ebb2d6498':'Gabos',
  'ca55c1b1d601ac26a500d0827d5f7986f1f285f5ed2a037fad32dd67ce39029e':'Cihan',
};
export const naamBijEmail = email => (email && EMAIL_NAMES[emailHash(email)]) || '';
export const TEAM = [...new Set(Object.values(EMAIL_NAMES))];

// Initialen in het rondje naast een naam. Een vaste lijst: Cihad en Cihan lopen pas bij de vijfde
// letter uiteen, dus een afleidregel komt niet op iets korters uit dat ook nog klopt.
export const INITIALEN = { Jer:'J', Gabos:'G', Cihad:'JC', Cihan:'CC' };
export const initialen = naam => INITIALEN[naam] || (naam||'?').charAt(0).toUpperCase();

// ── Tabbladen in de Sheet ───────────────────────────────────────────────
export const TAB = {
  NTD:   'Nog Te Doen',
  AF:    'Afgerond',
  ALVO:  "ALV's overzicht",
  ALFA:  "ALV's afgerond",
  TAKEN: 'Mijn taken',
};

// 'Nog Te Doen' en 'Afgerond' zijn in BLOKKEN verdeeld: een regel met de bloknaam in kolom A, een
// kolomkoprij, dan de taken. Alle zes de oude bloknamen blijven hier staan, ook al toont het
// dashboard er nog maar twee: zonder de andere namen zou een regel uit bijvoorbeeld 'CRM' (dat
// ná Subsidie staat) als Subsidie-taak gelezen worden. De oude blokken blijven als archief staan.
export const ALLE_SECTIES = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD','SUBSIDIE-TRAJECTEN','CRM'];

// De twee blokken die het dashboard nog toont. `keys` is de kolomvolgorde A..H en moet gelijk
// blijven aan wat er in de Sheet staat (en wat Apps Script verwacht). Kolom Q is het vaste
// taaknummer. De sleutel heet `subsidieFase` en niet `fase`: zo heette hij altijd.
export const SECS = {
  LOD: {
    label:'LOD', pagina:'lod', omschrijving:'actiepunt', omschrijvingLabel:'Actiepunt',
    keys:['code','naam','actiepunt','status','behandelaar','deadline','opmerkingen','inBehandeling'],
  },
  'SUBSIDIE-TRAJECTEN': {
    label:'Subsidie-trajecten', pagina:'subsidie', omschrijving:'subsidie', omschrijvingLabel:'Subsidie',
    keys:['code','naam','subsidie','subsidieFase','behandelaar','deadline','opmerkingen','inBehandeling'],
  },
};
export const DOSSIER_SECTIES = Object.keys(SECS);

// Vastgesteld op 2026-07-30; 'In behandeling' is hier een FASE (kolom D), los van kolom H.
export const SUBSIDIE_FASES = ['Voorbereiden','Aangevraagd','In behandeling','Verleend','Afgerond'];

// 'Mijn taken' — één regel per taak. Het dashboard maakt dit tabblad zelf aan als het ontbreekt.
// Afvinken wist niets: kolom H krijgt de datum en de taak verdwijnt uit beeld.
export const TAKEN_KOP = ['ID','Eigenaar','Taak','VvE-code','VvE','Notitie','Aangemaakt','Afgevinkt'];

// ALV's overzicht: A=code B=naam C=uitnodiging D=notulen E=begroting F=opmerkingen G=klaargezet.
// De gegevens beginnen op rij 3 (rij 1 en 2 zijn kop en tellers).
export const ALVO_KOLOM = { uitnodiging:2, notulen:3, begroting:4, klaargezet:6 };
export const ALVO_EERSTE_RIJ = 3;

// Hoe vaak het dashboard de Sheet opnieuw leest, in ms (alleen als het venster in beeld is).
export const POLL_MS = 10_000;
