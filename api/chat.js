// api/chat.js — Vercel serverless proxy naar Claude (sleutel server-side).
// Anthropic gebruikt API-data niet voor training → AVG-vriendelijk voor dossiergegevens.
// Controleert de ingelogde Google-gebruiker tegen de allowlist; proxyt dan naar Anthropic.
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

// Invoer-grenzen (kostenrem + misbruikrem): te grote payloads worden geweigerd vóór Anthropic.
const MAX_SYSTEM_CHARS = 20000;
const MAX_MESSAGES = 16;
const MAX_MSG_CHARS = 8000;

function setCors(req, res){
  const origin = req.headers.origin || '';
  const ok = ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN_RE.test(origin);
  if (ok) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export default async function handler(req, res){
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) { res.status(401).json({ error: 'geen token' }); return; }

    // tokeninfo levert in één call zowel de audience (aud) als het e-mailadres en weigert
    // (HTTP 400) een verlopen/ongeldig token. Userinfo alléén zou élke geldige Google-token
    // accepteren ongeacht welke OAuth-app hem uitgaf → audience-check is hier de echte slot.
    const ti = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
    if (!ti.ok) { res.status(401).json({ error: 'token ongeldig' }); return; }
    const info = await ti.json().catch(() => ({}));
    if (info.aud !== EXPECTED_AUD) { res.status(401).json({ error: 'verkeerde audience' }); return; }
    const email = (info.email || '').trim().toLowerCase();
    if (!email || !ALLOWED_EMAILS.includes(email)) { res.status(403).json({ error: 'geen toegang' }); return; }

    const { system, messages } = req.body || {};
    if (typeof system !== 'string' || !system.length || system.length > MAX_SYSTEM_CHARS) {
      res.status(400).json({ error: 'ongeldige invoer' }); return;
    }
    if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) {
      res.status(400).json({ error: 'ongeldige invoer' }); return;
    }
    for (const m of messages) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > MAX_MSG_CHARS) {
        res.status(400).json({ error: 'ongeldige invoer' }); return;
      }
    }

    // Vercel-env-var: accepteer zowel de conventie ANTHROPIC_API_KEY als de bij deze klant
    // ingevoerde casing Anthropic_API_KEY (env-namen zijn hoofdlettergevoelig).
    const key = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_KEY;
    if (!key) {
      console.error('chat: API-sleutel ontbreekt in deze omgeving (env-var niet aan voor Preview/Production?)');
      res.status(500).json({ error: 'sleutel niet ingesteld' }); return;
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1024, system, messages }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('chat: Anthropic-fout', r.status, (data.error && data.error.message) || '');
      res.status(502).json({ error: (data.error && data.error.message) || 'AI-fout' }); return;
    }
    const antwoord = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    res.status(200).json({ antwoord });
  } catch (e) {
    console.error('chat: serverfout', (e && e.message) || e);
    res.status(500).json({ error: 'serverfout' });
  }
}
