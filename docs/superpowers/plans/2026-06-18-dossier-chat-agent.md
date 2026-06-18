# VvE-dossier AI-agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een chat-venster (zwevend knopje rechtsonder met het logo) waarin de beheerder vrije vragen stelt over één VvE-dossier; Claude Haiku 4.5 antwoordt op basis van de dashboard-data van die VvE, read-only.

**Architecture:** Pure frontend-helpers bouwen de VvE-context + systeem-instructie uit het bestaande `vveOverzicht`. Een Vercel serverless function (`api/chat.js`) houdt de Anthropic-sleutel server-side, controleert de ingelogde gebruiker tegen de allowlist, en proxyt naar `api.anthropic.com`. De frontend praat met die functie via `src/api.js`.

**Tech Stack:** Vanilla ES-modules (geen bundler), in-browser zelftests via `?test=1` (`src/tests.js` → `window._testResult`), Vercel Node serverless function, Service Worker precache (`sw.js`).

**Spec:** `docs/superpowers/specs/2026-06-18-dossier-chat-agent-design.md`
**Branch:** `feat/dossier-chat` (vanaf `main`, al actief).

---

## Hoe je tests draait (dit project)

De zelftests draaien in de browser (geen terminal-runner). Lokaal:
1. Start de no-cache server: `python3 -m http.server 8123 --directory /Users/servicedesk/collectief-dashboard` (of de bestaande `dashboard`-preview).
2. Open `http://localhost:8123/index.html?test=1`, lees de console + `window._testResult` (= `"<N> OK, <M> FAIL"`).
3. **Slagen = geen nieuwe `FAIL:`-regels én `window._testResult` eindigt op `0 FAIL`.**

De **live AI-aanroep** werkt niet op de lokale python-server (`/api/chat` bestaat daar niet) — die test je op de staging-Vercel-deploy zodra de sleutel staat. Lokaal test je de pure helpers + de UI-weergave.

## File Structure

- **Create** `src/dossier-chat.js` — pure helpers `dossierContextTekst`, `buildChatSysteemPrompt` + UI-handlers `openChat`/`closeChat`/`setChatVve`/`renderChat`/`vraagChat`.
- **Create** `api/chat.js` — Vercel serverless proxy naar Claude.
- **Modify** `src/api.js` — `askChat(system, messages)` helper.
- **Modify** `src/config.js` — `PROXY_URL`-constante.
- **Modify** `src/tests.js` — zelftests voor de pure helpers.
- **Modify** `index.html` — FAB `#chat-fab` + paneel `#chat-bg`/`#chat-paneel` + CSP `connect-src`.
- **Modify** `src/actions.js` — `data-action`-entries voor versturen + VvE kiezen.
- **Modify** `src/main.js` — init (FAB-knop, sluiten, Enter-toets).
- **Modify** `styles.css` — stijlen voor FAB + paneel + bubbels.
- **Modify** `sw.js` — `CACHE_VERSION` → `cd-v31` + `./src/dossier-chat.js` in precache.

---

## Task 1: Pure kern — context + systeem-instructie (TDD)

**Files:**
- Create: `src/dossier-chat.js`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests** — voeg in `src/tests.js` de import toe (bij de andere imports, ~regel 18) en het assert-blok vlak vóór `const totOk = ok + _tOk` (~regel 685).

Import:

```js
import { dossierContextTekst, buildChatSysteemPrompt } from "./dossier-chat.js";
```

Assert-blok:

```js
  // ── VvE-dossier AI-agent (chat) ──
  console.log('%c[TESTS] Dossier-chat', 'background:#0D7377;color:white;padding:2px 6px;border-radius:3px');
  const _Tchat = new Date(2026, 5, 2);
  const _Dchat = {
    ntd: {
      OPPAKKEN: [{ code:'CH1', naam:'VvE Chattest', actiepunt:'Lekkage dak blok B herstellen',
        behandelaar:'Cihad', deadline:'20 mei 2026', _sec:'OPPAKKEN' }],
      VERGADERVERZOEKEN: [], 'OFFERTE-TRAJECTEN': [], LOD: [],
    },
    af: { OPPAKKEN: [{ code:'CH1', actiepunt:'Lift-onderhoudscontract verlengd', datum:'18 mei 2026' }],
      VERGADERVERZOEKEN: [], 'OFFERTE-TRAJECTEN': [], LOD: [] },
    alvo: [{ code:'CH1', naam:'VvE Chattest', uitnodiging:true, notulen:false, begroting:false, status:'Gepland' }],
    alfa: [],
    logboek: [{ code:'CH1', timestamp:'2026-05-30T10:00:00.000Z', actie:'Contact', veld:'Telefoon',
      oudeWaarde:'Bestuur', nieuweWaarde:'voorzitter gebeld over schilderwerk', gebruiker:'info@vvebeheercollectief.nl' }],
  };

  const _ctx = dossierContextTekst('CH1', _Dchat, _Tchat);
  truthy('chat: context bevat VvE-naam', _ctx.includes('VvE Chattest'));
  truthy('chat: context bevat lopende taak', _ctx.includes('Lekkage dak blok B herstellen'));
  truthy('chat: context bevat afgerond punt', _ctx.includes('Lift-onderhoudscontract verlengd'));
  truthy('chat: context bevat ALV-status', /ALV/i.test(_ctx));
  truthy('chat: context bevat laatste contact', _ctx.includes('voorzitter gebeld over schilderwerk'));

  const _ctxLeeg = dossierContextTekst('ZZZ', _Dchat, _Tchat);
  truthy('chat: onbekende code geeft geldige (niet-lege) tekst', typeof _ctxLeeg === 'string' && _ctxLeeg.includes('ZZZ'));
  truthy('chat: onbekende code zonder verzonnen taken', !_ctxLeeg.includes('Lekkage'));

  const _sys = buildChatSysteemPrompt(_ctx);
  truthy('chat: systeem-instructie bevat harde regel "alleen op basis van"', /alleen op basis van/i.test(_sys));
  truthy('chat: systeem-instructie bevat "verzin niets"', /verzin niets/i.test(_sys));
  truthy('chat: systeem-instructie bevat de context-tekst', _sys.includes('VvE Chattest'));
```

- [ ] **Step 2: Run de tests, verifieer dat ze FALEN** — herlaad `index.html?test=1`. Verwacht: import van `./dossier-chat.js` faalt (bestaat nog niet) → tests draaien niet.

- [ ] **Step 3: Schrijf de minimale implementatie** — maak `src/dossier-chat.js` met (voorlopig) alleen de twee pure helpers + imports:

```js
// ══════════════════════════════════════
//  VvE-DOSSIER AI-AGENT — vraag-en-antwoord over één VvE (read-only)
// ══════════════════════════════════════
import { esc, displayName } from "./util.js";
import { SECS, PROXY_URL } from "./config.js";
import { state, D } from "./state.js";
import { showToast } from "./notifications.js";
import { vveOverzicht } from "./render-vve.js";
import { fmtLogTs } from "./render-overig.js";
import { askChat } from "./api.js";
import { ensureToken } from "./auth.js";

// Pure helper (testbaar): compacte, feitelijke context-tekst over één VvE.
function dossierContextTekst(code, data, vandaag){
  const o = vveOverzicht(code, data, vandaag);
  const t = r => (r.actiepunt || r.agendapunten || r.status || r.periode || '').trim();
  const L = [];
  L.push(`VvE: ${o.code}${o.naam ? ' — ' + o.naam : ''}`);
  if(o.behandelaars.length) L.push(`Behandelaar(s): ${o.behandelaars.join(', ')}`);
  if(o.open.length){
    L.push('Lopende taken:');
    o.open.forEach(r=>{
      const sec = SECS[r._sec] ? SECS[r._sec].label : (r._sec || '');
      L.push(`- [${sec}] ${t(r)}${r.deadline?` (deadline ${r.deadline})`:''}${r.behandelaar?` — ${r.behandelaar}`:''}`);
    });
  } else L.push('Lopende taken: geen.');
  if(o.weggelegd.length){
    L.push('Weggelegd (later opvolgen):');
    o.weggelegd.forEach(r=>L.push(`- ${t(r)}${r.opvolgdatum?` (terug op ${r.opvolgdatum})`:''}`));
  }
  if(o.afgerond.length){
    L.push('Recent afgerond:');
    o.afgerond.slice(0,8).forEach(r=>L.push(`- ${t(r)}${r.datum?` (${r.datum})`:''}`));
  }
  if(o.alvo){
    L.push(`Komende ALV: status ${o.alvo.status}; uitnodiging ${o.alvo.uitnodiging?'verstuurd':'nog niet'}, `
      + `notulen ${o.alvo.notulen?'ja':'nee'}, begroting ${o.alvo.begroting?'ja':'nee'}.`);
  }
  if(o.alfa && o.alfa.length) L.push(`Laatst gehouden ALV: ${o.alfa[0].datum}.`);
  if(o.logboek.length){
    L.push('Laatste logboek/contactmomenten (nieuwste eerst):');
    o.logboek.slice(0,15).forEach(r=>{
      const wie = displayName(r.gebruiker) || r.gebruiker || '?';
      const wat = r.actie === 'Contact'
        ? `${r.veld || 'Contact'} met ${r.oudeWaarde || '?'}: ${r.nieuweWaarde || ''}`
        : `${r.actie}${r.nieuweWaarde ? ': ' + r.nieuweWaarde : ''}`;
      L.push(`- ${fmtLogTs(r.timestamp)} (${wie}) ${wat}`);
    });
  }
  return L.join('\n');
}

// Pure helper (testbaar): systeem-instructie met harde regels + context.
function buildChatSysteemPrompt(contextTekst){
  return [
    'Je bent de assistent van VvE Beheer Collectief, een VvE-beheerkantoor.',
    'Je beantwoordt vragen van een beheerder over ÉÉN specifieke VvE, in het Nederlands, bondig en zakelijk.',
    '',
    'Harde regels:',
    '- Antwoord ALLEEN op basis van de hieronder gegeven dossier-gegevens.',
    '- Verzin niets. Blijkt het antwoord niet uit de gegevens, zeg dat eerlijk ("daar staat niets over in het dossier").',
    '- Verzin geen namen, datums of bedragen die er niet staan.',
    '- Houd het kort en concreet.',
    '',
    'De dossier-gegevens van deze VvE:',
    '"""',
    contextTekst,
    '"""',
  ].join('\n');
}

export { dossierContextTekst, buildChatSysteemPrompt };
```

> Let op: de UI-handlers + `askChat`/`PROXY_URL` worden in latere taken toegevoegd. De imports van `askChat`/`PROXY_URL`/`ensureToken`/`showToast`/`state`/`esc` staan vast bovenaan; zolang ze nog niet gebruikt worden is dat ongebruikte-import (geen fout in ES-modules). `askChat` en `PROXY_URL` bestaan na Task 2/4 — tot dan faalt de **import** van die symbolen. **Daarom: voer Task 2 (api.js `askChat`) en de `PROXY_URL`-toevoeging aan config (Step hieronder) vóór de eerste testronde van Task 1 uit, óf laat die twee imports voorlopig weg.** Eenvoudigst: voeg nu vast de `PROXY_URL`-export en `askChat`-stub toe (zie Step 3b), dan draaien de tests.

- [ ] **Step 3b: Voorkom import-fouten** — voeg de `PROXY_URL`-export toe in `src/config.js` (zie Task 4 Step 1 voor de definitieve regel) en de `askChat`-helper in `src/api.js` (zie Task 2). Zonder deze twee faalt de module-import van `dossier-chat.js`.

- [ ] **Step 4: Run de tests, verifieer dat ze SLAGEN** — herlaad `index.html?test=1`. Verwacht: geen nieuwe `FAIL:`-regels; OK-teller +10.

- [ ] **Step 5: Commit**

```bash
git add src/dossier-chat.js src/tests.js src/config.js src/api.js
git commit -m "feat(chat): pure kern dossier-context + systeem-prompt + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Frontend-helper `askChat` (api.js)

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Voeg de helper toe** — in `src/api.js`, importeer `PROXY_URL` en voeg `askChat` toe; neem 'm op in de export. Bovenaan:

```js
import { SID, SKEYS, PROXY_URL } from "./config.js";
```

Functie (vóór de `export`-regel):

```js
// Stuurt de systeem-instructie + gespreksgeschiedenis naar de Vercel-proxy, die
// server-side Claude aanroept. Geeft de antwoordtekst terug. Vereist een ingelogde
// gebruiker (OAuth-token gaat mee voor de allowlist-check in de proxy).
async function askChat(system, messages){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r = await fetch(PROXY_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${state.oauthToken}` },
    body: JSON.stringify({ system, messages }),
  });
  const data = await r.json().catch(()=>({}));
  if(!r.ok){ const e=new Error(data.error||'AI-fout'); e.status=r.status; throw e; }
  return (data.antwoord || '').trim();
}
```

Pas de export-regel aan:

```js
export { fetchSheet, writeRange, appendRange, _shiftNtdRows, _isTransient, _withRetry, askChat };
```

- [ ] **Step 2: Commit** (samen met Task 1, of apart)

```bash
git add src/api.js
git commit -m "feat(chat): askChat-helper naar de Vercel-proxy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Vercel serverless proxy (`api/chat.js`)

**Files:**
- Create: `api/chat.js`

- [ ] **Step 1: Maak de functie**

```js
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
    if (!key) { res.status(500).json({ error: 'sleutel niet ingesteld' }); return; }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1024, system, messages }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(502).json({ error: (data.error && data.error.message) || 'AI-fout' }); return; }
    const antwoord = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    res.status(200).json({ antwoord });
  } catch (e) {
    res.status(500).json({ error: 'serverfout' });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/chat.js
git commit -m "feat(chat): Vercel proxy api/chat.js (allowlist + Claude Haiku)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Config-URL + FAB/paneel-markup + CSP

**Files:**
- Modify: `src/config.js`, `index.html`, `styles.css`

- [ ] **Step 1: Proxy-URL in `src/config.js`** — voeg ná de `SID`-regels toe:

```js
// AI-proxy: op staging same-origin (/api/chat); op productie de vaste Vercel-functie-URL.
export const PROXY_URL = IS_STAGING ? '/api/chat' : 'https://collectief-dashboard.vercel.app/api/chat';
```

- [ ] **Step 2: CSP — sta de Vercel-functie toe** — in `index.html`, in de `Content-Security-Policy`-meta (regel 11), voeg `https://collectief-dashboard.vercel.app` toe aan `connect-src`:

Wijzig in de `connect-src`-lijst van:
```
connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://script.google.com https://accounts.google.com https://onesignal.com https://*.onesignal.com;
```
naar (voeg de Vercel-origin toe):
```
connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://script.google.com https://accounts.google.com https://onesignal.com https://*.onesignal.com https://collectief-dashboard.vercel.app;
```

- [ ] **Step 3: FAB + paneel in `index.html`** — plak vlak vóór `<div id="login-gate" ...>` (~regel 865):

```html
<button id="chat-fab" title="Vraag over een VvE" aria-label="Vraag over een VvE">
  <img src="icon-192.png" alt=""/>
</button>
<div id="chat-bg">
  <div id="chat-paneel">
    <div class="chat-hdr">
      <div class="chat-hdr-l">
        <span class="chat-titel">Vraag over deze VvE</span>
        <span id="chat-vve-label" class="chat-vve-label">—</span>
      </div>
      <button class="modal-close" id="chat-close" aria-label="Sluiten">×</button>
    </div>
    <div class="chat-vve-wrap">
      <input type="text" id="chat-vve-zoek" placeholder="Andere VvE kiezen… (code of naam)" autocomplete="off"/>
      <div class="vve-suggestions" id="chat-vve-sug"></div>
    </div>
    <div id="chat-bubbles" class="chat-bubbles"></div>
    <div class="chat-invoer">
      <input type="text" id="chat-input" placeholder="Stel een vraag…" autocomplete="off"/>
      <button id="chat-send" data-action="chat-send" aria-label="Versturen">↑</button>
    </div>
    <div class="chat-foot">👁 Leest alleen mee · verandert niets · via Claude (Haiku)</div>
  </div>
</div>
```

- [ ] **Step 4: Stijlen in `styles.css`** — plak onderaan (gebruikt de bestaande CSS-variabelen):

```css
/* ── VvE-dossier chat-agent ── */
#chat-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;
  border:none;background:var(--sur);box-shadow:var(--shm);cursor:pointer;z-index:900;
  display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden}
#chat-fab img{width:100%;height:100%;object-fit:cover}
#chat-bg{position:fixed;right:20px;bottom:88px;z-index:901;display:none}
#chat-bg.open{display:block}
#chat-paneel{width:380px;max-width:calc(100vw - 40px);max-height:70vh;display:flex;flex-direction:column;
  background:var(--sur);border:1px solid var(--bor);border-radius:16px;box-shadow:var(--shm);overflow:hidden}
.chat-hdr{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bor)}
.chat-hdr-l{display:flex;flex-direction:column;gap:1px}
.chat-titel{font-size:14px;font-weight:600}
.chat-vve-label{font-size:12px;color:var(--mut)}
.chat-vve-wrap{position:relative;padding:8px 12px;border-bottom:1px solid var(--bor)}
.chat-vve-wrap input{width:100%;font-size:12.5px}
.chat-bubbles{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--bg)}
.chat-bub{max-width:85%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap}
.chat-bub.user{align-self:flex-end;background:var(--ac);color:#fff}
.chat-bub.ai{align-self:flex-start;background:var(--sur);border:1px solid var(--bor)}
.chat-bub.bezig{align-self:flex-start;color:var(--mut);font-style:italic}
.chat-leeg{color:var(--mut);font-size:12.5px;text-align:center;margin:auto}
.chat-invoer{display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid var(--bor)}
.chat-invoer input{flex:1;font-size:13px}
#chat-send{flex:none;width:36px;height:36px;border-radius:9px;border:none;background:var(--ac);color:#fff;font-size:18px;cursor:pointer}
.chat-foot{padding:8px 12px;font-size:11px;color:var(--mut);border-top:1px solid var(--bor)}
```

- [ ] **Step 5: Commit**

```bash
git add src/config.js index.html styles.css
git commit -m "feat(chat): PROXY_URL + FAB/paneel-markup + stijlen + CSP-Vercel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: UI-handlers + wiring

**Files:**
- Modify: `src/dossier-chat.js`, `src/actions.js`, `src/main.js`, `sw.js`

- [ ] **Step 1: UI-handlers in `src/dossier-chat.js`** — voeg ná `buildChatSysteemPrompt` toe (en breid de export uit):

```js
// ── UI ──
function openChat(){
  if(!state._chatHistorie) state._chatHistorie = [];
  if(!state._chatVve) state._chatVve = state.vveCode || '';
  renderChat();
  document.getElementById('chat-bg').classList.add('open');
  const inp = document.getElementById('chat-input'); if(inp) setTimeout(()=>inp.focus(), 30);
}
function closeChat(){ document.getElementById('chat-bg')?.classList.remove('open'); }

function setChatVve(code){
  state._chatVve = code;
  state._chatHistorie = [];
  const z = document.getElementById('chat-vve-zoek'); if(z) z.value='';
  const s = document.getElementById('chat-vve-sug'); if(s){ s.innerHTML=''; s.classList.remove('show'); }
  renderChat();
}

function renderChat(){
  const code = state._chatVve;
  const naam = code ? (((D.alvo||[]).find(r=>r.code===code)||{}).naam || '') : '';
  const lbl = document.getElementById('chat-vve-label');
  if(lbl) lbl.textContent = code ? `${code}${naam?' — '+naam:''}` : 'kies een VvE';
  const box = document.getElementById('chat-bubbles');
  if(!box) return;
  if(!code){ box.innerHTML = '<div class="chat-leeg">Kies eerst een VvE om vragen over te stellen.</div>'; return; }
  let html = (state._chatHistorie||[]).map(m =>
    `<div class="chat-bub ${m.rol==='user'?'user':'ai'}">${esc(m.tekst)}</div>`).join('');
  if(!html) html = `<div class="chat-leeg">Stel een vraag over ${esc(code)}${naam?' ('+esc(naam)+')':''}.</div>`;
  if(state._chatBezig) html += '<div class="chat-bub bezig">aan het typen…</div>';
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

async function vraagChat(){
  const inp = document.getElementById('chat-input');
  const vraag = (inp?.value || '').trim();
  const code = state._chatVve;
  if(!vraag || !code || state._chatBezig) return;
  inp.value = '';
  state._chatHistorie.push({ rol:'user', tekst:vraag });
  state._chatBezig = true; renderChat();
  try{
    if(!await ensureToken()) throw new Error('Niet ingelogd');
    const systeem = buildChatSysteemPrompt(dossierContextTekst(code, D));
    const messages = state._chatHistorie.map(m => ({ role: m.rol==='user'?'user':'assistant', content: m.tekst }));
    const antwoord = await askChat(systeem, messages);
    state._chatHistorie.push({ rol:'assistant', tekst: antwoord || '(leeg antwoord)' });
  }catch(e){
    console.error('chat-fout', e);
    state._chatHistorie.push({ rol:'assistant', tekst:'⚠️ Kon nu geen antwoord ophalen. Probeer het later opnieuw.' });
  }finally{
    state._chatBezig = false; renderChat();
  }
}

// VvE-suggesties (hergebruikt filterVves op D.alvo)
function chatVveSuggesties(q){
  const box = document.getElementById('chat-vve-sug'); if(!box) return;
  const term = (q||'').trim();
  if(!term){ box.innerHTML=''; box.classList.remove('show'); return; }
  const hits = (D.alvo||[]).filter(r => `${r.code} ${r.naam}`.toLowerCase().includes(term.toLowerCase())).slice(0,8);
  box.innerHTML = hits.map(r =>
    `<div class="vve-sug-item" data-action="chat-setvve" data-code="${esc(r.code)}">${esc(r.code)} — ${esc(r.naam||'')}</div>`).join('')
    || '<div class="vve-sug-item" style="color:var(--mut)">geen resultaten</div>';
  box.classList.add('show');
}
```

En de export-regel onderaan vervangen door:

```js
export { dossierContextTekst, buildChatSysteemPrompt, openChat, closeChat, setChatVve, renderChat, vraagChat, chatVveSuggesties };
```

> De class `.vve-sug-item`/`.vve-suggestions.show` bestaan al in `styles.css` (gebruikt door het AI-modal-zoekveld) — hergebruik dus de bestaande opmaak.

- [ ] **Step 2: Actions in `src/actions.js`** — import + entries. Bij de imports:

```js
import { vraagChat, setChatVve } from './dossier-chat.js';
```

In het `ACTIONS`-object (bv. ná `vve-log-alles`):

```js
  'chat-send':   () => vraagChat(),
  'chat-setvve': (el) => setChatVve(el.dataset.code),
```

- [ ] **Step 3: Init in `src/main.js`** — import + bindings. Bij de imports:

```js
import { openChat, closeChat, vraagChat, chatVveSuggesties } from './dossier-chat.js';
```

Bij de andere knop-bindings (regio ~regel 94-99), voeg toe:

```js
  document.getElementById('chat-fab').onclick = openChat;
  document.getElementById('chat-close').onclick = closeChat;
  document.getElementById('chat-vve-zoek').addEventListener('input', e => chatVveSuggesties(e.target.value));
```

En in de bestaande `keydown`-listener-regio (of een nieuwe), Enter in het chat-invoerveld = versturen. Voeg in `initActions` (`src/actions.js`) bij de `keydown`-listener toe (ná de offerte-aann-input-regel):

```js
    if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') {
      e.preventDefault(); vraagChat();
    }
```

(voeg dan ook `vraagChat` aan de actions-import toe — al gedaan in Step 2.)

- [ ] **Step 4: Service Worker** — in `sw.js`: `const CACHE_VERSION = 'cd-v31';` en voeg `'./src/dossier-chat.js',` toe aan de precache-lijst (bij de andere `./src/...`-regels).

- [ ] **Step 5: Run de zelftests** — herlaad `index.html?test=1`. Verwacht: `0 FAIL` (de pure-helper-tests blijven groen; de UI-wiring breekt geen tests).

- [ ] **Step 6: Commit**

```bash
git add src/dossier-chat.js src/actions.js src/main.js sw.js
git commit -m "feat(chat): UI-handlers, wiring (FAB/Enter/VvE-kiezer) + SW cd-v31

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Verificatie + uitrol

**Files:** geen (verificatie + deploy)

- [ ] **Step 1: Zelftests + UI lokaal** — `index.html?test=1`: `window._testResult` eindigt op `0 FAIL`. Log in lokaal (of bekijk achter de login-gate via preview-eval), open een VvE, klik de FAB → paneel opent met de juiste VvE-naam; typ een VvE in het zoekveld → suggesties verschijnen; klik er één → label wijzigt + gesprek leegt. (De live AI-aanroep werkt lokaal niet — dat is verwacht.)

- [ ] **Step 2: Push naar staging**

```bash
git push origin feat/dossier-chat        # of: merge feat/dossier-chat → staging en push staging
```

(Voor de Vercel-testdeploy moet de branch op een door Vercel gebouwde branch staan. De vaste route is via `staging`: `git checkout staging && git merge --ff-only feat/dossier-chat` lukt alleen als staging eraan vooraf gaat; anders een gewone merge. Overleg met de beheerder welke branch Vercel bouwt.)

- [ ] **Step 3: Backend-eenmalig (beheerder, met begeleiding)** — maak een **Anthropic API-sleutel** (console.anthropic.com → API keys) + zet een spend-limit. Zet die in het **Vercel-dashboard** → Project → Settings → Environment Variables als `ANTHROPIC_API_KEY`, voor Production én Preview. (Vercel deployt `api/chat.js` automatisch met de push mee. Kosten: centen/maand, begrensd door het spend-limit.)

- [ ] **Step 4: Live test op staging** — open de staging-URL, log in, open de FAB, stel een echte vraag over een VvE. Verifieer: een zinnig antwoord uit het dossier, en dat de agent "daar staat niets over in het dossier" zegt bij iets onbekends. Controleer in de browser-Network-tab dat `/api/chat` 200 geeft en de sleutel nergens in de frontend zichtbaar is.

- [ ] **Step 5: Naar productie** — na GO van de beheerder: fast-forward `staging` → `main` (GitHub Pages). De Vercel-functie draait al (zelfde env var). Verifieer op `vvebeheercollectief.github.io`: FAB zichtbaar na inloggen, `/api/chat` naar `collectief-dashboard.vercel.app` geeft 200 (CORS ok), antwoord verschijnt.

---

## Self-Review (uitgevoerd bij schrijven)

- **Spec-dekking:** chat-venster + FAB rechtsonder met logo (Task 4) ✓; één VvE per gesprek + VvE-kiezer + reset bij wissel (Task 5 `setChatVve`) ✓; Claude Haiku via Vercel-proxy met sleutel server-side (Task 3) ✓; allowlist-check via userinfo (Task 3) ✓; CORS (Task 3) + CSP (Task 4) ✓; read-only systeem-prompt met harde regels (Task 1, getest) ✓; multi-turn historie (Task 5 `vraagChat`) ✓; pure helpers getest (Task 1) ✓; SW cd-v31 (Task 5) ✓; uitrol incl. Vercel env var + spend limit (Task 6) ✓; foutbubbel + token-refresh (Task 5) ✓.
- **Placeholders:** geen TBD/TODO; alle stappen bevatten complete code. De enige door-de-beheerder-in-te-vullen waarde is de API-sleutel (env var) — een bewuste, expliciete config-stap, geen code-placeholder.
- **Type-consistentie:** `dossierContextTekst`/`buildChatSysteemPrompt`/`askChat`/`openChat`/`closeChat`/`setChatVve`/`renderChat`/`vraagChat`/`chatVveSuggesties` consistent tussen module, tests, api, actions, main. `PROXY_URL` consistent (config → api). DOM-id's `chat-fab`/`chat-bg`/`chat-paneel`/`chat-bubbles`/`chat-input`/`chat-vve-label`/`chat-vve-zoek`/`chat-vve-sug`/`chat-close`/`chat-send` consistent tussen index.html, dossier-chat.js en main.js. `data-action` `chat-send`/`chat-setvve` consistent tussen index.html/dossier-chat.js en actions.js. State `_chatVve`/`_chatHistorie`/`_chatBezig` consistent. Proxy-contract `{system, messages}` → `{antwoord}` consistent tussen api.js en api/chat.js.
