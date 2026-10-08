// api/offerte.js — Vercel-proxy voor de offertevergelijker (sleutel server-side).
// Drie acties: upload (één PDF of deel → Files API, terug een ondertekend bewijs), vergelijk
// (alle bewijzen → één Messages-verzoek met vast schema; daarna de bestanden altijd wissen) en
// wis (bewijzen opruimen na annuleren). De regels zelf staan in ../offerte-proxy.js, zodat de
// zelftest ze in de browser kan toetsen.
import { setCors, controleerGebruiker } from './_toegang.js';
import { bewijsSleutel, maakBewijs, leesBewijs, controleerVergelijk, bouwVerzoek, leesAntwoord,
  schemaNietOndersteund, kiesModel, MAX_UPLOAD, MAX_DELEN } from '../offerte-proxy.js';

const ANTHROPIC = 'https://api.anthropic.com/v1';
const koppen = key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' });

// Ruwe bytes van het verzoek. Vercel zet een application/octet-stream-lichaam al als Buffer klaar;
// anders zelf de stroom lezen, met dezelfde bovengrens.
async function leesRuw(req){
  if (Buffer.isBuffer(req.body)) return req.body;
  const delen = []; let n = 0;
  for await (const brok of req) {
    n += brok.length;
    if (n > MAX_UPLOAD) throw Object.assign(new Error('te groot'), { status: 413 });
    delen.push(brok);
  }
  return Buffer.concat(delen);
}

async function wis(key, ids){
  await Promise.all(ids.map(id => fetch(`${ANTHROPIC}/files/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: koppen(key) }).catch(() => {})));
}

const stuur = (key, verzoek) => fetch(`${ANTHROPIC}/messages`, {
  method: 'POST', headers: { ...koppen(key), 'content-type': 'application/json' }, body: JSON.stringify(verzoek),
});

async function upload(req, res, key, sleutel){
  const buf = await leesRuw(req);
  if (!buf.length || buf.length > MAX_UPLOAD || buf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    res.status(400).json({ error: 'Dit is geen PDF, of het deel is te groot.' }); return;
  }
  let naam = String(req.query.naam || 'offerte.pdf').replace(/[<>:"|?*\\/\x00-\x1f]/g, '-').slice(0, 120);
  if (!/\.pdf$/i.test(naam)) naam += '.pdf';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/pdf' }), naam);
  form.append('expires_in_seconds', '3600');
  const r = await fetch(`${ANTHROPIC}/files`, { method: 'POST', headers: koppen(key), body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id) {
    console.error('offerte: upload-fout', r.status, (data.error && data.error.message) || '');
    res.status(502).json({ error: 'Versturen naar Claude mislukt.' }); return;
  }
  console.log('offerte: upload', buf.length, 'bytes');
  res.status(200).json({ bewijs: await maakBewijs(data.id, sleutel) });
}

async function vergelijk(req, res, key, sleutel){
  const body = req.body || {};
  const check = controleerVergelijk(body);
  if (!check.ok) { res.status(400).json({ error: check.fout }); return; }
  const ids = [];
  try {
    const offertes = [];
    for (const o of body.offertes) {
      const delen = [];
      for (const d of o.delen) {
        const id = await leesBewijs(d.bewijs, sleutel);
        if (!id) { res.status(400).json({ error: 'onbekend bestand' }); return; }
        ids.push(id);
        delen.push({ fileId: id, van: d.van, tot: d.tot });
      }
      offertes.push({ naam: o.naam.trim(), paginas: o.paginas, delen });
    }
    const model = kiesModel(body.model, process.env.VERCEL_ENV === 'production');
    const invoer = { offertes, vve: body.vve, traject: body.traject, model };
    const begin = Date.now();
    let r = await stuur(key, bouwVerzoek(invoer));
    let data = await r.json().catch(() => ({}));
    if (!r.ok && schemaNietOndersteund(r.status, data.error && data.error.message)) {
      console.warn('offerte: vast formaat niet ondersteund door', model, '— opnieuw zonder schema');
      r = await stuur(key, bouwVerzoek({ ...invoer, metSchema: false }));
      data = await r.json().catch(() => ({}));
    }
    if (!r.ok) {
      const msg = (data.error && data.error.message) || '';
      console.error('offerte: Anthropic-fout', r.status, msg);
      res.status(502).json({ error: /credit|balance/i.test(msg) ? 'Het AI-tegoed is op.' : 'Claude gaf een fout. Probeer het opnieuw.' });
      return;
    }
    // Alleen aantallen, nooit inhoud: zo zijn de echte kosten per vergelijking na te gaan.
    const u = data.usage || {};
    const paginas = offertes.reduce((som, o) => som + o.paginas, 0);
    console.log('offerte: tokens model', data.model, 'in', u.input_tokens, 'cache-lees', u.cache_read_input_tokens || 0,
      'uit', u.output_tokens, 'paginas', paginas, 'ms', Date.now() - begin, 'stop', data.stop_reason);
    const uit = leesAntwoord(data);
    if (uit.fout) { res.status(502).json({ error: uit.fout }); return; }
    res.status(200).json({ antwoord: uit.antwoord, model: data.model || model });
  } finally { await wis(key, ids); }
}

async function wisActie(req, res, key, sleutel){
  const lijst = Array.isArray((req.body || {}).bewijzen) ? req.body.bewijzen.slice(0, MAX_DELEN) : [];
  const ids = (await Promise.all(lijst.map(b => leesBewijs(b, sleutel)))).filter(Boolean);
  await wis(key, ids);
  res.status(200).json({ ok: true });
}

export default async function handler(req, res){
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  try {
    const email = await controleerGebruiker(req, res);
    if (!email) return;
    const key = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_KEY;
    if (!key) { console.error('offerte: API-sleutel ontbreekt'); res.status(500).json({ error: 'sleutel niet ingesteld' }); return; }
    const sleutel = await bewijsSleutel(key);
    const actie = req.query.actie;
    if (actie === 'upload') { await upload(req, res, key, sleutel); return; }
    if (actie === 'vergelijk') { await vergelijk(req, res, key, sleutel); return; }
    if (actie === 'wis') { await wisActie(req, res, key, sleutel); return; }
    res.status(400).json({ error: 'onbekende actie' });
  } catch (e) {
    console.error('offerte: serverfout', (e && e.message) || e);
    const groot = e && e.status === 413;
    res.status(groot ? 413 : 500).json({ error: groot ? 'Dit deel is te groot.' : 'serverfout' });
  }
}
