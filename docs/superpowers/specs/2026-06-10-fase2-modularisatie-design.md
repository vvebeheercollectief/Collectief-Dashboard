# Fase 2 — Onderhoudbaarheid: `index.html` opsplitsen + centraal klik-systeem

**Datum:** 2026-06-10
**Status:** Ontwerp goedgekeurd door gebruiker (2026-06-10) — wacht op spec-review vóór implementatieplan
**Onderdeel van:** [Dashboard-routekaart](2026-06-08-dashboard-routekaart-design.md) → Fase 2 (Onderhoudbaarheid), klus 1+2 (de eigenlijke verbouwing). Volgt op de afgeronde stap "Testomgeving + automatisch uitrollen" ([ontwerp](2026-06-09-fase2-testomgeving-autodeploy-design.md)).

---

## 1. Doel

De huidige `index.html` is één bestand van ±4.100 regels (±450 CSS, ±670 HTML, ±2.950 JavaScript met ±115 functies, allemaal in één globale ruimte). Dat is lastig te doorzoeken, te bewerken en past slecht in het werkgeheugen bij wijzigingen.

Deze stap doet drie dingen:

1. **Opsplitsen** — de ene `index.html` uit elkaar trekken in een handvol korte modules (`src/*.js`) die elk over één ding gaan, plus één `styles.css`.
2. **Eén centraal klik-systeem** — alle losse inline klik-handlers vervangen door event-delegation: knoppen krijgen alleen nog een *label* (`data-action`), en één luisteraar regelt de afhandeling.
3. **Beveiligingsslot dichttimmeren** — de al aanwezige CSP (Content Security Policy) op het script-deel aanscherpen, wat pas kan zodra de inline-handlers weg zijn.

**Expliciet géén** bundler/Node-toolchain: de browser laadt de modules zelf in via `<script type="module">`. Daardoor blijft "pushen-en-live" exact hetzelfde als nu.

## 2. Context & vastgestelde feiten

- **Productie** = GitHub Pages (`vvebeheercollectief.github.io/Collectief-Dashboard`, bron = branch `main`/root). Een `git push` naar `main` gaat automatisch live; **Pages doet géén build-stap** — het serveert de bestanden zoals ze in de repo staan.
- **Test-link** = Vercel staging-preview (`collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`), serveert branch `staging`. Heeft eigen test-Sheet, test-OneSignal-app en de TESTOMGEVING-balk.
- **Geen** `package.json`, `node_modules` of build-stap aanwezig. Deploy = `git push`.
- **CSP bestaat al** (`index.html` regel 11, een `<meta http-equiv="Content-Security-Policy">`), maar laat scripts nu nog ruim toe met `'unsafe-inline'` en `'unsafe-eval'`. De bekende diensten (jsdelivr/Chart.js, accounts.google.com, cdn.onesignal.com, fonts.googleapis/gstatic) staan al op de witte lijst.
- **Inline-handlers:** 35 échte inline HTML-handlers (33× `onclick`, 1× `onchange`, 1× `onkeydown`) in de markup en in de getekende HTML-strings. Daarnaast 26 koppelingen die al netjes in JavaScript staan (`.onclick=` / `addEventListener`) — die zijn CSP-veilig en hoeven niet om, maar mogen voor consistentie meeverhuizen.
- **Externe scripts** in `<head>`: Chart.js (jsdelivr), Google Identity Services (`accounts.google.com/gsi/client`), OneSignal v16 SDK, DM Sans (Google Fonts).
- **Zelftest:** `index.html?test=1` draait nu ±37 asserts (prioriteit, datum-parsing, staging-detectie, logboek-zinnen, displayName). Dit is het vangnet en blijft tijdens de hele verbouwing groen.

## 3. Gemaakte keuzes (met gebruiker, 2026-06-10)

| Beslissing | Keuze | Waarom |
|---|---|---|
| **Bouwstap** | **Geen bundler — native ES-modules** | Lichtste optie; geen nieuwe toolchain die kan breken/onderhoud vraagt; "pushen-en-live" blijft identiek; sluit niets af (esbuild kan later bovenop dezelfde modulestructuur). |
| **Ambitie / beveiliging** | **Opsplitsen + centraal klik-systeem + slot op scripts** | Echte beveiligingswinst (blokkeert ingespoten/inline code) met beheersbaar risico. Het *stijl*-deel van het slot blijft bewust soepel (`style-src 'unsafe-inline'`): veel inline `style="…"` in de dynamische opmaak + door derden ingespoten stijlen maken een streng stijl-slot duur en weinig waardevol. |

## 4. Ontwerp

### 4.1 Modulestructuur (`src/`)

Zes logische groepen; exacte bestandsgrenzen mogen in het plan licht schuiven, maar dit is de vorm. Alle JS verhuist uit `<script>` naar deze modules; de CSS naar één `styles.css`.

```
collectief-dashboard/
├── index.html            ← alleen nog: <head>, HTML-markup, <link styles.css>, <script type="module" src="src/main.js">
├── styles.css            ← de ±450 regels CSS
└── src/
    ├── config.js         ← Fundament: constanten + iconen + kleuren
    │                       (PROD_HOSTS, SID_*/ONESIGNAL_*, ALLOWED_EMAILS, EMAIL_NAMES, SECS, PAGE_META,
    │                        PG, PRIO_REGELS, STIL_DREMPEL_DAGEN, ONTW_CATS, *_ICONS/*_THEMES, PERIODS, …)
    ├── state.js          ← Fundament: veranderlijke toestand als exporteerbaar object
    │                       (D, pgs, activeNtd/af/ontw, charts, oauthToken/expiry/email, editMode,
    │                        anaPeriod/anaMetric, _rowCache, _undoStack, pendingWrites, _writeChain, …)
    ├── util.js           ← Fundament: pure helpers
    │                       (esc, displayName, datum-parsers, berekenPrioriteit, _vandaagAmsterdam,
    │                        filt/filterNtd, _splitBeh, _lightenHex, getWeekNum, tekst-badges, …)
    ├── api.js            ← Gegevens: Sheets-laag
    │                       (fetchSheet, writeRange, appendRange, getSheetIds, _withRetry, _isTransient,
    │                        insertAndWriteRow, _shiftNtdRows)
    ├── data.js           ← Gegevens: laden + parsen + achtergrond-schrijven
    │                       (loadAll, parseSections/Alvo/Alfa/Ontw/Logboek, backgroundWrite)
    ├── auth.js           ← Gegevens: Google-login/OAuth
    │                       (doOAuth, fetchUserEmail, doLogin, ensureToken, sessieherstel)
    ├── render-taken.js   ← Schermen: Nog-te-doen + Afgerond
    │                       (renderNtd/af, filterNtd, rowNtd/af, renderThead/tbody/pag, deadlineCel,
    │                        bepaalStil, prio/pers/ib/sub-badges, flagPill, setNtd/af)
    ├── render-alv.js     ← Schermen: ALV's (renderAlvo, toggleAlvoFlag, statusIco)
    ├── render-analytics.js ← Schermen: grafieken/KPI's (buildAnalytics, renderHero*, renderKpi*,
    │                       sparkline/donut/bar, series*/bucket*, period bar, metric toggle — Chart.js)
    ├── render-overig.js  ← Schermen: Alfabetisch + Ontwikkeling + Logboek (+ log-helpers, renderTaskHistory)
    ├── crud.js           ← Acties: taak-modals & -acties
    │                       (openModal, fillModalFields, clearModal, submitTask, completeTask/doCompleteTask,
    │                        deleteTask*, onCodeInput/selectVvE, prefillNieuweTaak, adjOff/offProg)
    ├── ai.js             ← Acties: AI-hulp (openAiHelp, buildAiPrompt, aiVveContext, copyAiPrompt,
    │                       parseAiAnswer, aiOvernemen/aiActieTaak/aiKopieerConcept)
    ├── notifications.js  ← Acties: toasts + push (showToast/showUndoToast/dismissToast/undoComplete,
    │                       fireNotifEvent, logEvent, poll, notif-modal, subscribe/unsubscribe, sendTestNotif)
    ├── ui.js             ← Schil: goTo, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch, sync-indicator
    ├── actions.js        ← HET HART: de data-action-registry + één delegatie-listener
    ├── main.js           ← Opstart (DOMContentLoaded): imports, delegatie aanzetten, vaste listeners,
    │                       intervallen (8s-poll, 4-min token-heartbeat), sessieherstel, goTo('ntd')
    └── tests.js          ← De ?test=1-zelftest (importeert de te testen functies)
```

**Gedeelde toestand.** Omdat ES-modules geen globale ruimte delen, krijgt de veranderlijke toestand één thuis: `state.js` exporteert een object (bv. `state.D`, `state.pgs`, `state.oauthToken`). Modules importeren en muteren dat object. Pure constanten staan apart in `config.js`. Dit houdt "wie mag wat veranderen" expliciet.

**Importrichting (geen kringverwijzingen).** Globale stroom: `config`/`state`/`util` (geen afhankelijkheden) ← `api`/`data`/`auth` ← `render-*`/`crud`/`ai`/`notifications`/`ui` ← `actions` ← `main`. Renderen roept geen schrijf-acties aan en omgekeerd waar mogelijk vermijden we lussen; bij een onvermijdelijke wederzijdse afhankelijkheid lossen we het op met een late import of een klein event.

### 4.2 Het centrale klik-systeem (event-delegation)

Elke klikbare plek in de getekende HTML krijgt een *label* in plaats van een eigen instructie:

```html
<!-- NU (inline handler, schendt strikte CSP): -->
<button onclick="completeTask(3)">✓</button>
<div class="tab" onclick="setNtd('OPPAKKEN')">…</div>
<button class="pb" onclick="(${cb})(${p})">3</button>      <!-- functie als tekst ingebakken: weg -->

<!-- STRAKS (alleen een label + gegevens): -->
<button data-action="taak-afronden" data-rid="3">✓</button>
<div class="tab" data-action="sectie-kies" data-sec="OPPAKKEN">…</div>
<button class="pb" data-action="pagineer" data-doel="ntd" data-pg="3">3</button>
```

In `actions.js` staat één registry die elk label aan een functie koppelt, plus één luisteraar op `document` die bij elke klik de dichtstbijzijnde `[data-action]` opzoekt en de juiste functie aanroept met de meegegeven `data-*`:

```js
const ACTIONS = {
  'taak-afronden': (el) => completeTask(+el.dataset.rid),
  'taak-bewerken': (el) => openModal(true, state._rowCache[+el.dataset.rid]),
  'sectie-kies'  : (el) => setNtd(el.dataset.sec),
  'pagineer'     : (el) => paginaNaar(el.dataset.doel, +el.dataset.pg),
  // … één regel per actie
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
});
```

Aandachtspunten die 1-op-1 overgenomen worden:
- Handlers die nu `event.stopPropagation()` doen (bv. de "Stil"-pill) of `this.classList.toggle('on')` (toggles, AI-chips) krijgen hetzelfde gedrag in hun registry-functie (de luisteraar geeft `el` én `e` door).
- De paginerings-truc (`(${cb})(${p})` — een functie als string in de HTML) verdwijnt; paginering werkt voortaan via `data-doel` + `data-pg`.
- Niet-klik-handlers (`onchange` op een select, `onkeydown`) worden óf in de delegatie meegenomen óf als expliciete listener in `main.js` gezet — wat het schoonst is per geval.
- De 26 al-in-JavaScript-gekoppelde handlers blijven werken; waar het de code vereenvoudigt verhuizen ze mee naar de registry, anders blijven ze expliciete listeners (beide zijn CSP-veilig).

### 4.3 Het beveiligingsslot (CSP)

Na stap 4.2 staat er geen enkele inline `on*=`-handler en geen inline `<script>` meer. Dan scherpen we de bestaande `<meta>`-CSP aan:

- `script-src`: **`'unsafe-inline'` en `'unsafe-eval'` eruit**, `'self'` + de bekende diensten behouden. (Eerst verifiëren dat niets `eval`/`new Function` nodig heeft; de paginerings-truc was het enige string-naar-code-patroon en die is weg.)
- De stray `https://unpkg.com` (ongebruikt) opruimen.
- `style-src` blijft bewust `'self' 'unsafe-inline'` + Google Fonts — inline `style="…"` in de opmaak en door derden ingespoten stijlen blijven werken.
- `connect-src`/`frame-src`/`img-src`/`font-src` ongemoeid tenzij een console-overtreding anders aanwijst.

**Empirisch dichttimmeren op de test-link:** met de console erbij login, OneSignal-meldingen, Chart.js-grafieken, Sheets lezen/schrijven en de PWA/service-worker stuk voor stuk testen; bij een CSP-overtreding gericht de witte lijst bijstellen. Pas naar `main` als alles schoon en werkend is.

### 4.4 `index.html` na de operatie

`index.html` houdt over: de `<head>` (meta's, CSP, externe scripts, `<link rel="stylesheet" href="styles.css">`), de pure HTML-markup van de schermen/modals, en onderaan één `<script type="module" src="src/main.js"></script>`. Geen inline CSS, geen inline JS, geen inline handlers meer.

## 5. Aanpak — 3 geverifieerde mijlpalen, alles eerst op `staging`

Bewust incrementeel, want het is een dagelijks live gebruikt gereedschap. Elke mijlpaal: `?test=1` groen + met de preview-tools nagelopen (klikken, snapshots, console), vóór de volgende.

- **Mijlpaal A — Opsplitsen, gedrag identiek.** CSS → `styles.css`; alle JS → `src/*.js`. De 35 inline-handlers blijven in deze stap tijdelijk werken doordat de benodigde functies kortstondig bereikbaar gemaakt worden (bv. via `window`), zodat we de splitsing los kunnen verifiëren. Doel: schermen, gedrag en zelftest exact gelijk aan nu.
- **Mijlpaal B — Centraal klik-systeem.** De 35 inline-handlers → `data-action`; registry + delegatie-listener in `actions.js`; de tijdelijke globale functies weer weg. Doel: alle knoppen/tabs/paginering/toggles werken via de registry.
- **Mijlpaal C — Slot dichttimmeren.** `script-src` aanscherpen; login + meldingen + grafieken + Sheets op de test-link verifiëren tot de console schoon is.

**Go-live:** pas als A+B+C samen groen zijn op de test-link → merge `staging`→`main` (= live), met de bekende voorzichtigheid. De frontend-merge is op zichzelf staand (raakt geen Apps Script; de apps-script-CI is path-gefilterd en wordt hier niet getriggerd).

## 6. Wat NIET verandert

Uiterlijk, gedrag, je gegevens, de Google Sheets-backend, Apps Script, de deploy-opzet (push→Pages voor productie, Vercel voor de test-link), de test-Sheet/test-OneSignal-app, de staging↔prod-schakelaar (`PROD_HOSTS`/`IS_STAGING`) en de TESTOMGEVING-balk. De `?test=1`-zelftest blijft bestaan en wordt waar nuttig uitgebreid.

## 7. Risico's & vangnet

Het werk is vooral véél zorgvuldig verplaatsen — het hoofdrisico is "iets vergeten te koppelen" (een functie die niet meer gevonden wordt, een handler die niet meer afgaat), niet conceptuele complexiteit. Vangnet:

1. **Alles eerst op de test-link** — productie blijft ongemoeid tot de eindmerge.
2. **`?test=1`-zelftest groen houden** en uitbreiden (o.a. een controle dat de actie-registry alle gebruikte `data-action`-labels dekt).
3. **Per mijlpaal verifiëren** met de preview-tools: klikken, snapshots, console-check op fouten en CSP-overtredingen.
4. **Merge naar productie pas aan het eind**, en git maakt elke mijlpaal terugdraaibaar.

Specifieke valkuilen om op te letten:
- **Gedeelde toestand**: een module die `state.D` per ongeluk herbindt i.p.v. muteert, breekt de live-koppeling. Patroon: altijd het geëxporteerde object muteren, nooit vervangen.
- **Laadvolgorde/kringverwijzingen** tussen modules — opgevangen door de importrichting in 4.1.
- **Service-worker-cache** (`sw.js`) kan oude bestanden vasthouden; bij het testen cache-busten/verversen.
- **CSP te streng** → login of meldingen breken; daarom mijlpaal C apart en empirisch op de test-link.

## 8. Open punten voor het implementatieplan

- Exacte bestandsgrenzen en functie-toewijzing per module (de tabel in 4.1 is de richtlijn).
- Of `render-overig.js` opgesplitst wordt (logboek is fors) — beslissen tijdens het plan.
- Vorm van `state.js` (één object vs. enkele getters/setters).
- Definitieve `data-action`-namenlijst en de bijbehorende registry.
- Cache-strategie van `sw.js` t.o.v. de nieuwe bestanden.
