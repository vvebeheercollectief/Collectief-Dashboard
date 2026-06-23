// api/memo.js — Vercel serverless proxy naar het Apps Script "memo-loket".
// WAAROM: een directe browser→Apps Script POST struikelt over CORS. Een
// application/json-body lokt een preflight (OPTIONS) uit die de Apps Script web-app
// met 405 beantwoordt; en zelfs met text/plain blokkeert (vooral iOS) Safari de
// cross-site 302→script.googleusercontent.com-redirect van het POST-antwoord.
// Oplossing (zelfde patroon als api/chat.js): de browser praat SAME-ORIGIN met
// /api/memo; deze functie forwardt server-side (geen CORS) en volgt de redirect
// netjes. Het loket (Notifications.gs doPost) doet zelf de token-auth, dus deze
// proxy is een dunne doorgeefluik — geen extra geheim, geen extra blootstelling
// (het exec-endpoint is sowieso publiek + token-beveiligd).

// Publieke, token-beveiligde exec-URL's (geen geheim). TEST staat vast; PROD komt
// uit een env-var en wordt bij de productie-uitrol ingevuld.
const MEMO_LOKET_TEST = 'https://script.google.com/macros/s/AKfycbwpsgWAPFIxx0zOGjFzC2ZJuoP6Uu3lOBNcFCrEgwM09x6yKmm4dwGkKzgqYOGBtDBykQ/exec';
const MEMO_LOKET_PROD = process.env.MEMO_LOKET_PROD || '';

// Spiegelt config.js PROD_HOSTS: alleen deze origins zijn productie; al het andere
// (staging-branch-preview, andere previews, localhost) draait op het TEST-loket.
const PROD_ORIGINS = [
  'https://vvebeheercollectief.github.io',
  'https://collectief-dashboard.vercel.app',
  'https://collectief-dashboard-vve-beheer-collectief.vercel.app',
  'https://collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app',
  'https://collectief-dashboard-git-main-vve-beheer-collectief.vercel.app',
];
// Preview-deploys van DIT project mogen cross-origin (bewust géén open *.vercel.app).
const PREVIEW_ORIGIN_RE = /^https:\/\/collectief-dashboard[a-z0-9-]*\.vercel\.app$/;

function setCors(req, res){
  const origin = req.headers.origin || '';
  const ok = PROD_ORIGINS.includes(origin) || PREVIEW_ORIGIN_RE.test(origin);
  if (ok) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res){
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const origin = req.headers.origin || '';
    const isProd = PROD_ORIGINS.includes(origin); // preview/staging/onbekend → TEST
    const loket = isProd ? MEMO_LOKET_PROD : MEMO_LOKET_TEST;
    if (!loket) { res.status(500).json({ error: 'memo-loket-URL niet ingesteld voor deze omgeving' }); return; }

    // req.body is door Vercel geparset (application/json). Doorsturen als text/plain:
    // Apps Script leest e.postData.contents tóch rauw (JSON.parse), en text/plain
    // voorkomt elke preflight-discussie. Server-side volgt fetch de 302→echo-redirect
    // schoon (zonder Content-Type op de GET), dus we krijgen de JSON terug.
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const action = (req.body && req.body.action) || '?';
    const bytes = body.length;
    const t0 = Date.now();
    const r = await fetch(loket, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });
    const text = await r.text();
    const ms = Date.now() - t0;
    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = null; }
    // Diagnostiek (geen PII — alleen actie/status/tijd/grootte): zichtbaar in de Vercel-logs
    // zodat een mislukte upload exact te herleiden is zonder de gebruiker iets te vragen.
    console.log('memo ' + action + ' loket=' + r.status + ' ' + ms + 'ms in=' + bytes + 'B ' +
      (data ? (data.error ? ('ERR:' + data.error) : (data.ok ? 'ok' : 'no-ok')) : 'NON-JSON'));
    if (!data) {
      console.error('memo-proxy: loket gaf geen JSON', r.status, text.slice(0, 200));
      res.status(502).json({ error: 'loket gaf geen geldig antwoord (status ' + r.status + ')' });
      return;
    }
    res.status(200).json(data);
  } catch (e) {
    console.error('memo-proxy: serverfout', (e && e.message) || e);
    res.status(502).json({ error: 'proxy onbereikbaar: ' + ((e && e.message) || 'onbekend') });
  }
}
