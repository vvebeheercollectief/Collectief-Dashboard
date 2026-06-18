# Ontwerp — VvE-dossier AI-agent (vraag-en-antwoord)

Datum: 2026-06-18
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: schone feature-branch `feat/dossier-chat` vanaf `main` (main heeft de
bestuursupdate-knop **niet** — die staat alleen op `staging` en wordt apart beslist; zie
"Verhouding tot bestuursupdate" onderaan). Na akkoord netjes naar `main`
(zie [[feedback_staging_main_merge]] — niet kaal staging→main mergen).

## Aanleiding

Herontwerp van de communicatie-assistent (fase 2 / richting C, zie [[project_dagstart_cockpit]]).
De eerste uitwerking — één knop die een bestuursupdate-mail opstelt
([[project_bestuursupdate_assistent]], op staging) — bleek niet wat de beheerder wilde. De
werkelijke behoefte: **een AI-agent in het dashboard waaraan je vrije vragen kunt stellen over een
specifieke VvE** ("wat is de laatste stand van zaken van VvE X?", "wanneer was het laatste contact
met het bestuur?", "wat moet er nog gebeuren vóór de ALV?").

## Doel

Een chat-venster, overal in het dashboard bereikbaar, waarin de beheerder **vrije vragen stelt over
één VvE-dossier** en antwoord krijgt op basis van de dashboard-data van die VvE. Read-only: de agent
informeert, hij verandert niets.

## Kernkeuzes (brainstorm 2026-06-18, door beheerder bevestigd)

1. **Echte AI-agent** (geen regelgebaseerde vraagbaak, geen gratis kopieer-plak). De beheerder
   accepteert de kleine kosten die daarbij horen.
2. **Model: Claude Haiku 4.5** (`claude-haiku-4-5`). Goedkoop, snel, sterke Nederlandse formulering.
   Bij dit volume (enkele vragen/dag) orde grootte centen per maand. Eén AI-aanroep per vraag — dit
   is **Q&A, geen agent-loop en geen tools** (zie [[claude-api]] → "Single LLM call").
3. **Eén VvE per gesprek.** Je kiest een VvE (standaard de VvE-pagina waar je al bent) en alle
   vragen gaan over dát dossier. Géén overkoepelende vragen over alle 500+ VvE's — die passen niet
   in één prompt en worden al door de dashboard-filters/analyse gedekt.
4. **Read-only.** De agent leest het dossier en antwoordt; schrijft niets terug. Acties (taak maken,
   mail opstellen) zijn bewust een latere uitbreiding.
5. **Plek: een zwevend rond knopje rechtsonder met het logo** (`icon-192.png`), zoals een
   chat-widget op een website. Altijd zichtbaar voor ingelogde gebruikers; opent het chat-venster.

## Architectuur

### Frontend — nieuwe module `src/dossier-chat.js`

**Pure, testbare kern:**
- `dossierContextTekst(code, data, vandaag?)` — bouwt uit `vveOverzicht(code, data)` +
  `D.logboek` een compacte, leesbare context-tekst over die ene VvE: naam, lopende taken (met
  categorie/deadline/behandelaar — intern, mag de AI wél zien want dit blijft binnen), weggelegde
  taken, recent afgerond, ALV-status (komend + laatst gehouden), beheerderskenmerken, en de laatste
  ~15 logboek/contactmomenten. Dit is feitelijke grond voor de antwoorden.
- `buildChatSysteemPrompt(contextTekst)` — bouwt de systeem-instructie: rol ("assistent die vragen
  beantwoordt over één VvE voor een VvE-beheerkantoor"), de harde regels (antwoord **alleen** op
  basis van de meegegeven gegevens; verzin niets; zeg het eerlijk als iets niet in de gegevens
  staat; antwoord in het Nederlands, bondig), gevolgd door de context-tekst.

**UI-handlers:**
- Een zwevende knop (`#chat-fab`) rechtsonder + paneel (`#chat-paneel`), beide in `index.html`.
- `openChat()` / `closeChat()` — openen/sluiten; bij openen vanaf een VvE-pagina pakt het paneel
  `state.vveCode` als actieve VvE.
- VvE-kiezer in de paneelkop (hergebruikt het zoekpatroon van `src/vve-zoekveld.js`). Een andere VvE
  kiezen **reset het gesprek** (context wijzigt).
- Gespreksstaat in `state` (bv. `state._chatVve`, `state._chatHistorie` = array van
  `{rol, tekst}`). Per vraag: stuur systeem-instructie + volledige gespreksgeschiedenis naar de
  proxy, toon het antwoord als bubbel. Eenvoudige "aan het typen…"-indicator tijdens de aanroep.
- `vraagChat()` — leest het invoerveld, voegt de gebruikersvraag toe aan de historie, roept de proxy
  aan via `src/api.js`, voegt het antwoord toe, re-rendert de bubbels.

### Backend — proxy als Vercel serverless function (`api/chat.js`)

Een endpoint dat de **Anthropic-sleutel veilig server-side houdt** en namens de gebruiker Claude
aanroept. **Waarom Vercel i.p.v. Apps Script:** de frontend praat nu nergens met een Apps Script
Web App (notificaties lopen via een Sheet-tab), en een Apps Script Web App kan een browser-`POST`
géén leesbaar JSON-antwoord teruggeven (geen CORS-headers op het antwoord) — precies wat we hier
nodig hebben. Vercel hosten we al (staging + main zijn gekoppeld), serveert `api/*.js` zonder config
als serverless functions, regelt CORS/JSON netjes, en **deployt automatisch bij elke push** (geen
handmatige herimplementatie, anders dan een Apps Script Web App).

- Bestand `api/chat.js` (Node serverless function). Vercel serveert dit op `/api/chat`.
- Sleutel `ANTHROPIC_API_KEY` als **Vercel environment variable** (Vercel-dashboard → Project →
  Settings → Environment Variables). Nooit in de publieke pagina, nooit in git. `process.env.ANTHROPIC_API_KEY`.
- **Toegang afgeschermd tot ingelogde, toegestane gebruikers:** de frontend stuurt het Google-OAuth-
  token van de ingelogde gebruiker mee (`Authorization: Bearer <state.oauthToken>`); de functie
  valideert dat token server-side bij Google (`https://www.googleapis.com/oauth2/v3/userinfo`) en
  controleert of het e-mailadres in de `ALLOWED_EMAILS`-allowlist staat. Pas dan roept de functie
  Claude aan. (De allowlist staat als constante in `api/chat.js`, spiegel van de frontend-lijst.)
- **CORS:** de functie zet `Access-Control-Allow-Origin` voor de productie- (GitHub Pages) en
  staging-origin + beantwoordt de `OPTIONS`-preflight. Op staging draait de app op dezelfde Vercel-
  deploy (same-origin, geen CORS nodig); op productie (GitHub Pages) is het cross-origin → CORS-
  headers nodig.
- Roept `https://api.anthropic.com/v1/messages` aan (server-side `fetch`) met: `model:"claude-haiku-4-5"`,
  `max_tokens: 1024`, headers `x-api-key` (uit env) + `anthropic-version: 2023-06-01`, body
  `{model, max_tokens, system, messages}`. Geen tools, geen streaming. Geeft de tekst uit
  `content[].text` terug aan de frontend als `{antwoord: "..."}`.
- **Kostenrem:** een **spend limit op de API-sleutel in de Anthropic Console** is de echte backstop
  (begrenst de maandkosten hard). De OAuth-allowlist is de toegangspoort; een eigen dagteller is niet
  nodig (serverless = stateless) en bewust buiten scope.

De frontend roept de functie aan via een nieuwe helper `askChat(systeem, messages)` in `src/api.js`,
naar een proxy-URL uit `src/config.js`: op staging de relatieve `/api/chat` (same-origin), op
productie de absolute Vercel-productie-URL van het project (één keer vastleggen in `config.js`).

### CSP / netwerk

De proxy → Anthropic gebeurt **server-side** (Vercel), dus `api.anthropic.com` hoeft **niet** in de
CSP. Wél moet de productie-frontend (GitHub Pages) naar de Vercel-functie kunnen verbinden: voeg de
Vercel-productie-origin van het project toe aan `connect-src` in `index.html`. Op staging is het
same-origin (geen wijziging nodig), maar de CSP geldt voor beide, dus de toevoeging is veilig.

## Datastroom

Knop rechtsonder → `openChat()` → paneel met actieve VvE → beheerder typt vraag → `vraagChat()`
bouwt systeem-instructie (`dossierContextTekst` + `buildChatSysteemPrompt`) + historie → POST naar
de Apps Script-proxy (met OAuth-token) → proxy valideert gebruiker + dag-limiet → `UrlFetchApp` naar
Claude → antwoord terug → bubbel in het paneel. Vervolgvragen sturen de groeiende historie mee.

## Foutafhandeling / randgevallen

- **Geen actieve VvE:** paneel toont de VvE-kiezer en een hint ("kies eerst een VvE"); pas daarna
  kun je vragen stellen.
- **Onbekende/lege VvE:** `dossierContextTekst` levert nog steeds geldige (grotendeels lege) context;
  de systeem-instructie zorgt dat de AI "daar is niets over bekend" antwoordt i.p.v. verzint.
- **Proxy-fout / time-out / dag-limiet bereikt:** nette foutbubbel ("kon nu geen antwoord ophalen —
  probeer het later"), met de echte reden in de console. Geen stille mislukking.
- **Token verlopen:** hergebruik `ensureToken()` uit `src/auth.js` vóór de aanroep.

## Testen

Zelftests in `src/tests.js` (`?test=1` → `window._testResult`) op de pure helpers met een fixture-`D`:
- `dossierContextTekst` bevat de VvE-naam, de lopende taken en het laatste contactmoment.
- `dossierContextTekst` op een onbekende code → grotendeels lege, maar geldige tekst (geen crash).
- `buildChatSysteemPrompt` bevat de harde regels ("alleen op basis van", "verzin niets") en de
  meegegeven context-tekst.

Live AI-aanroep: handmatig op de staging-URL testen zodra de sleutel in Script Properties staat
(echte vraag → zinnig antwoord uit het dossier; controleer dat onbekende dingen eerlijk worden
beantwoord).

## Uitrol

- **Frontend:** vaste route — bouwen + zelftests op `feat/dossier-chat`, daarna naar `staging`
  (Vercel-testlink), na GO fast-forward naar `main` (GitHub Pages). SW-cache bumpen (cd-v31 op deze
  branch) + `./src/dossier-chat.js` in de precache-lijst.
- **Backend (Vercel-functie):** `api/chat.js` deployt **automatisch** met de push mee (Vercel is aan
  de repo gekoppeld) — geen handmatige herimplementatie. De beheerder doet eenmalig in het Vercel-
  dashboard: `ANTHROPIC_API_KEY` als Environment Variable zetten (voor staging én productie), en in
  de **Anthropic Console** een spend limit op de sleutel zetten als kostenrem. Claude levert de code
  + een stap-voor-stap-instructie. **Dit is de eerste feature met API-kosten** — bewust geaccepteerd.

## Verhouding tot de bestuursupdate-assistent

[[project_bestuursupdate_assistent]] (één-knop-mail, gratis kopieer-plak) staat alléén op `staging`,
niet op productie. Deze chat-agent vervangt die richting. Te beslissen bij integratie: de
bestuursupdate-knop laten vallen, óf later terugbrengen als één ding dat je de agent kunt vrágen
("stel een bestuursupdate op") zodra de read-only-agent bevalt. Niet nu meenemen.

## Bewust buiten scope (YAGNI)

- Acties uitvoeren (taken aanmaken, contact loggen, mail opstellen).
- Overkoepelende vragen over meerdere/alle VvE's.
- Gemini als alternatieve motor (eerder afgewogen; Claude gekozen).
- Streaming-antwoorden (token-voor-token) en PDF/export.
