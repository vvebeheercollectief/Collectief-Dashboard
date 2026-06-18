// api/chat.js — Vercel serverless proxy naar Claude (sleutel server-side).
// Anthropic gebruikt API-data niet voor training → AVG-vriendelijk voor dossiergegevens.
// Controleert de ingelogde Google-gebruiker tegen de allowlist; proxyt dan naar Anthropic.
const ALLOWED_EMAILS = [
  'info@vvebeheercollectief.nl',
  'djiowchico@gmail.com',
  'gabrielateterycz1616@gmail.com',
  'giocan175@gmail.com',
];
const ALLOWED_ORIGINS = [
  'https://vvebeheercollectief.github.io',
  'https://collectief-dashboard.vercel.app',
];

function setCors(req, res){
  const origin = req.headers.origin || '';
  let ok = ALLOWED_ORIGINS.includes(origin);
  try { ok = ok || /\.vercel\.app$/.test(new URL(origin).hostname); } catch (e) {}
  if (ok) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

export default async function handler(req, res){
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  // TIJDELIJKE diagnose (alleen namen, nooit waarden) — verwijderen na het oplossen van de env-var.
  if (req.method === 'GET' && req.query && req.query.diag === '1') {
    const names = Object.keys(process.env).filter(k => /anthropic|gemini|api.?key/i.test(k));
    res.status(200).json({ relevanteEnvKeys: names });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) { res.status(401).json({ error: 'geen token' }); return; }

    const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ui.ok) { res.status(401).json({ error: 'token ongeldig' }); return; }
    const info = await ui.json();
    const email = (info.email || '').toLowerCase();
    if (!email || !ALLOWED_EMAILS.includes(email)) { res.status(403).json({ error: 'geen toegang' }); return; }

    const { system, messages } = req.body || {};
    if (!system || !Array.isArray(messages) || !messages.length) {
      res.status(400).json({ error: 'ongeldige invoer' }); return;
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.error('chat: ANTHROPIC_API_KEY ontbreekt in deze omgeving (env-var niet aan voor Preview/Production?)');
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
