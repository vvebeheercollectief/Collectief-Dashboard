// api/chat.js — Vercel serverless proxy naar Claude (sleutel server-side).
// Anthropic gebruikt API-data niet voor training → AVG-vriendelijk voor dossiergegevens.
// Controleert de ingelogde Google-gebruiker tegen de allowlist; proxyt dan naar Anthropic.
import { ALLOWED_EMAILS } from '../allowed-emails.js'; // één bron, gedeeld met src/config.js
import { ZOEK_TOOLS, ZOEK_TOOL_NAMEN } from '../zoek-tools.js'; // idem, gedeeld met src/dashboard-zoek.js

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

const MODEL = 'claude-haiku-5-5';

// ── Zoekmodus (dashboard-chat) ──
// Hier bestaat een bericht niet alleen uit tekst maar ook uit blokken: Claude vraagt een filter aan
// (tool_use), de browser geeft het resultaat terug (tool_result). Die blokken worden streng
// nagelopen, want wat hier doorkomt gaat op onze sleutel naar Anthropic.
// Ruimer dan de dossiermodus: tien vragen met elk tot vier zoekrondes (= 2 berichten per ronde).
const ZOEK_MAX_MESSAGES = 60;
const ZOEK_MAX_BLOKKEN = 24;          // per bericht; Claude mag een paar filters tegelijk vragen
const ZOEK_MAX_RESULTAAT = 20000;      // één filterresultaat; de browser kapt al af op 25 regels
const ZOEK_MAX_TOTAAL = 300000;       // het hele verzoek, als JSON — ruwweg 100k tokens
const ASSISTENT_BLOKKEN = new Set(['text', 'tool_use', 'thinking', 'redacted_thinking']);

function dossierBerichtenOk(messages){
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return false;
  return messages.every(m => m && (m.role === 'user' || m.role === 'assistant')
    && typeof m.content === 'string' && m.content.length <= MAX_MSG_CHARS);
}

function zoekBlokOk(rol, b){
  if (!b || typeof b !== 'object') return false;
  if (b.type === 'text') return typeof b.text === 'string' && b.text.length <= MAX_MSG_CHARS;
  if (rol === 'user') {
    return b.type === 'tool_result' && typeof b.tool_use_id === 'string'
      && typeof b.content === 'string' && b.content.length <= ZOEK_MAX_RESULTAAT;
  }
  if (b.type === 'tool_use') return ZOEK_TOOL_NAMEN.includes(b.name) && typeof b.id === 'string';
  return b.type === 'thinking' || b.type === 'redacted_thinking';
}

function zoekBerichtenOk(messages){
  if (!Array.isArray(messages) || !messages.length || messages.length > ZOEK_MAX_MESSAGES) return false;
  if (messages[messages.length - 1].role !== 'user') return false;
  if (JSON.stringify(messages).length > ZOEK_MAX_TOTAAL) return false;
  return messages.every(m => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false;
    if (typeof m.content === 'string') return m.content.length > 0 && m.content.length <= MAX_MSG_CHARS;
    return Array.isArray(m.content) && m.content.length > 0 && m.content.length <= ZOEK_MAX_BLOKKEN
      && m.content.every(b => zoekBlokOk(m.role, b));
  });
}

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
    // Alleen een door Google GEVERIFIEERD adres telt. tokeninfo geeft dit veld als STRING ('true'),
    // vandaar String(): zo werkt de controle ook als Google ooit een echte boolean teruggeeft.
    if (String(info.email_verified) !== 'true') { res.status(403).json({ error: 'e-mailadres niet geverifieerd' }); return; }
    const email = (info.email || '').trim().toLowerCase();
    if (!email || !ALLOWED_EMAILS.includes(email)) { res.status(403).json({ error: 'geen toegang' }); return; }

    const { system, messages, modus, laatste } = req.body || {};
    const zoek = modus === 'zoek';
    if (typeof system !== 'string' || !system.length || system.length > MAX_SYSTEM_CHARS) {
      res.status(400).json({ error: 'ongeldige invoer' }); return;
    }
    if (!(zoek ? zoekBerichtenOk(messages) : dossierBerichtenOk(messages))) {
      res.status(400).json({ error: 'ongeldige invoer' }); return;
    }

    // Vercel-env-var: accepteer zowel de conventie ANTHROPIC_API_KEY als de bij deze klant
    // ingevoerde casing Anthropic_API_KEY (env-namen zijn hoofdlettergevoelig).
    const key = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_KEY;
    if (!key) {
      console.error('chat: API-sleutel ontbreekt in deze omgeving (env-var niet aan voor Preview/Production?)');
      res.status(500).json({ error: 'sleutel niet ingesteld' }); return;
    }

    // Haiku 5.5 denkt standaard eerst na, en dat denkwerk telt mee in max_tokens. Daarom ruimer
    // dan de 1024 van Haiku 4.5 (anders kan het denken het hele budget opeten vóór er tekst komt),
    // en effort 'low': dossiervragen zijn opzoekwerk, geen puzzel — sneller en goedkoper.
    const verzoek = { model: MODEL, max_tokens: 4096, output_config: { effort: 'low' }, system, messages };
    if (zoek) {
      // De filters liggen HIER vast en komen nooit uit de browser: wie met de pagina knoeit, kan
      // Claude geen ander gereedschap geven. `laatste` = de zoekrondes zijn op; de tools blijven
      // staan (anders breekt de cache) maar Claude mag ze niet meer gebruiken.
      verzoek.tools = ZOEK_TOOLS;
      if (laatste === true) verzoek.tool_choice = { type: 'none' };
      // Automatische cache: Anthropic onthoudt tools + systeem + het gesprek tot nu toe vijf
      // minuten. De volgende zoekronde van dezelfde vraag (en een vervolgvraag) leest dat deel dan
      // voor 10% van de prijs. Onder de minimumlengte van het model gebeurt er stil niets.
      verzoek.cache_control = { type: 'ephemeral' };
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(verzoek),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('chat: Anthropic-fout', r.status, (data.error && data.error.message) || '');
      res.status(502).json({ error: (data.error && data.error.message) || 'AI-fout' }); return;
    }
    // Alleen aantallen, nooit inhoud: zo zijn de kosten per vraag in de Vercel-logs na te gaan.
    if (data.usage) {
      const u = data.usage;
      console.log('chat: tokens', zoek ? 'zoek' : 'dossier', 'in', u.input_tokens, 'cache-lees', u.cache_read_input_tokens || 0,
        'cache-schrijf', u.cache_creation_input_tokens || 0, 'uit', u.output_tokens, 'stop', data.stop_reason);
    }
    const WEIGERING = 'Deze vraag kan ik niet beantwoorden. Probeer het anders te formuleren.';

    if (zoek) {
      // De ruwe blokken gaan terug: de browser stuurt ze in de volgende ronde ONVERANDERD weer mee
      // (thinking-blokken zijn alleen geldig als ze letterlijk terugkomen). Alleen de soorten die
      // we kennen; iets onbekends zou de browser toch niet kunnen terugsturen.
      if (data.stop_reason === 'refusal') {
        res.status(200).json({ content: [{ type: 'text', text: WEIGERING }], stop_reason: 'refusal' }); return;
      }
      const content = (data.content || []).filter(b => b && ASSISTENT_BLOKKEN.has(b.type));
      res.status(200).json({ content, stop_reason: data.stop_reason || '' }); return;
    }

    // Haiku 5.5 kan een vraag weigeren (veiligheidsfilter); dan komt er geen tekst. Zeg dat, in
    // plaats van een lege bubbel te tonen.
    if (data.stop_reason === 'refusal') {
      res.status(200).json({ antwoord: WEIGERING }); return;
    }
    const antwoord = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    // Liep het antwoord tegen max_tokens aan, dan is het middenin een zin afgebroken. Zonder deze
    // staart leest dat als een volledig antwoord — en juist bij een dossiervraag ('welke offertes
    // staan er open?') is een half opgesomde lijst gevaarlijker dan geen lijst: wat er niet staat
    // lijkt er niet te zijn.
    const afgekapt = data.stop_reason === 'max_tokens';
    res.status(200).json({ antwoord: afgekapt
      ? antwoord + '\n\n… (antwoord afgekapt — stel een gerichtere vraag)'
      : antwoord });
  } catch (e) {
    console.error('chat: serverfout', (e && e.message) || e);
    res.status(500).json({ error: 'serverfout' });
  }
}
