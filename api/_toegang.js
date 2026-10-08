// api/_toegang.js — wie mag de proxy's gebruiken. Gedeeld door api/chat.js en api/offerte.js.
// Het underscore-voorvoegsel zorgt dat Vercel hier geen eigen route van maakt.
import { ALLOWED_EMAILS } from '../allowed-emails.js'; // één bron, gedeeld met src/config.js

// Alleen de eigen frontends mogen cross-origin de proxy aanroepen. Dit zijn de
// productie-origins die de proxy ABSOLUUT (cross-origin) aanroepen — moet gelijk
// blijven aan PROD_HOSTS in src/config.js (previews callen same-origin en hebben
// geen CORS nodig). Bare vorm zonder tussensegment staat er expliciet bij omdat
// de preview-regex hieronder een niet-leeg segment eist.
const ALLOWED_ORIGINS = [
  'https://vvebeheercollectief.github.io',
  'https://collectief-dashboard.vercel.app',
  'https://collectief-dashboard-vve-beheer-collectief.vercel.app',
  'https://collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app',
  'https://collectief-dashboard-git-main-vve-beheer-collectief.vercel.app',
];
// Preview-deploys van DIT project, verankerd op het echte Vercel-previewformaat
// mét team-suffix: collectief-dashboard-<branch|hash>-vve-beheer-collectief.vercel.app.
// Bewust niet het ruimere collectief-dashboard-*.vercel.app: dat is door derden
// claimbaar als projectnaam; het team-suffix -vve-beheer-collectief niet.
const PREVIEW_ORIGIN_RE = /^https:\/\/collectief-dashboard-[a-z0-9-]+-vve-beheer-collectief\.vercel\.app$/;

// De Google OAuth-client van DIT dashboard. De access-token MOET voor deze client zijn
// uitgegeven (audience-check), anders kan een token van een andere/kwaadwillende OAuth-app
// met hetzelfde e-mailadres de proxy misbruiken (confused-deputy). Env-var wint zodat de
// id niet hoeft te worden gehardcodeerd, met de bekende waarde als fallback.
const EXPECTED_AUD = process.env.GOOGLE_CLIENT_ID
  || '560046984985-1371r4bbt28umi6uslims6mlkucn1278.apps.googleusercontent.com';

export function setCors(req, res){
  const origin = req.headers.origin || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN_RE.test(origin);
  if (ok) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

// Geeft het e-mailadres van een toegestane, ingelogde gebruiker terug. Anders stuurt hij zelf
// het antwoord (401/403) en geeft null: de aanroeper stopt dan direct.
export async function controleerGebruiker(req, res){
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'geen token' }); return null; }

  // tokeninfo levert in één call zowel de audience (aud) als het e-mailadres en weigert
  // (HTTP 400) een verlopen/ongeldig token. Userinfo alléén zou élke geldige Google-token
  // accepteren ongeacht welke OAuth-app hem uitgaf → audience-check is hier de echte slot.
  const ti = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
  if (!ti.ok) { res.status(401).json({ error: 'token ongeldig' }); return null; }
  const info = await ti.json().catch(() => ({}));
  if (info.aud !== EXPECTED_AUD) { res.status(401).json({ error: 'verkeerde audience' }); return null; }
  // Alleen een door Google GEVERIFIEERD adres telt. tokeninfo geeft dit veld als STRING ('true'),
  // vandaar String(): zo werkt de controle ook als Google ooit een echte boolean teruggeeft.
  if (String(info.email_verified) !== 'true') { res.status(403).json({ error: 'e-mailadres niet geverifieerd' }); return null; }
  const email = (info.email || '').trim().toLowerCase();
  if (!email || !ALLOWED_EMAILS.includes(email)) { res.status(403).json({ error: 'geen toegang' }); return null; }
  return email;
}
