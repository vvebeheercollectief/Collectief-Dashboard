# Ontwerp — Fase 2, stap 1: Testomgeving + automatisch uitrollen

**Datum:** 2026-06-09
**Type:** Ontwerp / spec (eerste deelproject van Fase 2 — Onderhoudbaarheid)
**Status:** Goedgekeurd door gebruiker, klaar voor implementatieplan
**Onderdeel van:** routekaart `docs/superpowers/specs/2026-06-08-dashboard-routekaart-design.md` — Fase 2, combineert **klus 3** (automatisch uitrollen) + **klus 4** (testomgeving/staging)

---

## 1. Aanleiding & doel

Fase 1 (vangnet & veiligheid) is voltooid. De gebruiker koos voor "veilig opbouwen": eerst de
vangnetten van Fase 2, dán de eigenlijke verbouwing (index.html opsplitsen + strikte CSP = klus 1+2).
De gebruiker wil een **volledige tweeling** (voorkant én achterkant), niet alleen de schermen.

Een tweeling van de achterkant betekent een tweede kopie van de automatiserings-code die in sync moet
blijven met de echte. Vandaag gebeurt dat met handmatig plakken in de Apps Script-editor — precies de
bron van de verouderde-kopie-fout van 2026-06-03. Daarom is **klus 3 (automatisch uitrollen) hierbij
naar voren getrokken**: één bron-code rolt automatisch uit naar zowel het echte als het test-project,
zonder dubbel werk of drift.

**Doel in één zin:** een complete, veilige tweeling van het dashboard (voorkant + achterkant) op een
aparte vaste link met test-data, die automatisch in sync blijft met het echte — zodat de verbouwing
(en alles daarna) veilig getest kan worden vóór het live gaat.

---

## 2. Sturende keuzes (door gebruiker gemaakt)

- **Volgorde Fase 2:** "veilig opbouwen" — eerst vangnetten (klus 3 + 4), dán de verbouwing (klus 1 + 2).
- **Scope testomgeving:** volledige tweeling (voorkant + achterkant), niet alleen frontend.
- **Auto-deploy meegenomen:** klus 3 wordt nu opgezet, omdat een handmatig onderhouden achterkant-tweeling
  drift veroorzaakt.
- **Keuze A — test-data:** de test-Sheet wordt gevuld met een **eenmalige kopie van de echte data**
  (realistischer testen) i.p.v. verzonnen nep-data.
- **Keuze B — meldingen:** een **aparte test-OneSignal-app**, zodat echte push veilig getest wordt los
  van de productie-abonnementen.

---

## 3. Huidige staat (uit code-onderzoek 2026-06-09)

| Onderwerp | Bevinding | Gevolg voor ontwerp |
|---|---|---|
| Deploy voorkant | Vercel (`vercel.json`: cleanUrls, cache-headers). `git push` naar `main` → live. Repo `github.com/vvebeheercollectief/Collectief-Dashboard`. | Test-link kan een Vercel-branchdeploy met vaste alias zijn; voorkant rolt al automatisch uit. |
| Sheet-koppeling | Eén `const SID` (`index.html:1156`). Alle Sheets-calls gebruiken `SID` (o.a. `getSheetIds()` `index.html:2701`). Lezen/schrijven rechtstreeks via Sheets-API met OAuth-token van de ingelogde gebruiker. | `SID` is dé schakelaar naar een test-Sheet. |
| Login | Google Identity Services; OAuth-client `clientId` `560046984985-…apps.googleusercontent.com` (`index.html:1222`); GSI-script `index.html:22`. | **Origin-gebonden**: alleen geautoriseerde links mogen inloggen, geen wildcards → test-link moet een **vaste** URL zijn én aangemeld worden. |
| Push | `ONESIGNAL_APP_ID` (`index.html:1161`). | Aparte test-app-id op de test-link (keuze B). |
| Achterkant | Apps Script, **container-bound** aan de Sheet ("Afgerond script"). 4 `.gs`-bestanden gemirrord in `apps-script/` (Code.gs, Notifications.gs, `Extra functies.gs`, `AutoPrioriteit.gs.gs`). **Geen** `clasp`/`.clasp.json` → uitrol nu handmatig plakken. `doPost` = **Web App** (codewijziging vereist nieuwe implementatie-versie). Triggers: onEdit, uurlijkse deadlinecheck, dagelijkse summary 08:30, dagelijkse recalc 06:00, 5-min sweep notif-wachtrij, onChange-wachter. | Tweede script-project nodig + clasp om beide in sync te houden; CI moet ook de Web App opnieuw implementeren. |
| CSP | Aanwezig maar slap (`unsafe-inline`/`unsafe-eval`). | **Buiten scope** hier; aanscherpen pas in klus 2 (na de verbouwing). |

---

## 4. Het ontwerp — onderdelen

### 4.1 Voorkant-tweeling (omgevingsherkenning)
- Vaste test-link op Vercel (bv. een `staging`-branch met vaste alias zoals `collectief-dashboard-staging.vercel.app`; exacte URL bij het plan).
- Kleine uitbreiding bovenin het CONFIG-blok (`index.html` ~1156): `IS_STAGING` bepaald op `location.hostname`; `SID` en `ONESIGNAL_APP_ID` worden keuzes (test vs. prod). **Eén codebase** — de voorkant kan niet driften.
- Zichtbare **"TESTOMGEVING"-balk** wanneer `IS_STAGING`.
- (Later, ná de build-stap van klus 1, kan dit netter via build-time variabelen i.p.v. hostname-detectie. Nu is hostname-detectie het simpelst en werkt het zónder build.)

### 4.2 Data-tweeling (test-Sheet)
- Kopie van de productie-Sheet → test-Sheet; gedeeld met de 4 `ALLOWED_EMAILS`.
- Startdata = eenmalige kopie van echte data (keuze A). Productie-Sheet wordt nooit geraakt.

### 4.3 Achterkant-tweeling (test Apps Script)
- Tweede Apps Script-project, gekoppeld aan de test-Sheet. (Een Sheet-kopie neemt een startkopie van het gebonden script mee; daarna wordt het beheerd via clasp.)
- Eenmalig: triggers (her)installeren op het test-project + eigen Script Properties (eigen test-webhook-geheim, los van prod).

### 4.4 Automatisch uitrollen (klus 3 — de lijm)
- `clasp` + GitHub Action, met dezelfde branch→omgeving-koppeling als de voorkant: een push op de **staging-branch** rolt de Apps Script-code uit naar het **test-scriptId**, een merge naar **`main`** naar het **prod-scriptId**. Voor de webhook ook `clasp deploy` (nieuwe Web App-versie), want `doPost` serveert de geïmplementeerde versie.
- CI-auth: clasp-credential (refresh token) als GitHub-secret; least-privilege Google-account; rotatie-afspraak. Details bij het plan.
- `appsscript.json`-manifest toevoegen aan `apps-script/` (clasp vereist dit).
- Voorkant blijft via Vercel uitrollen (ongewijzigd).

### 4.5 Meldingen in de test
- Aparte test-OneSignal-app (keuze B); test-app-id wordt gebruikt op de test-link. Echte push veilig testbaar, los van de productie-abonnementen.

### 4.6 Login op de test-link
- Test-origin toevoegen aan OAuth-client `560046…` (Authorized JavaScript origins) in de Google Cloud Console. Eenmalig, handmatig (gebruiker of samen). Geen wildcards mogelijk → daarom een vaste test-URL.

---

## 5. Werkwijze straks (deploy-flow)

Wijziging op de **staging-branch** → de voorkant verschijnt op de test-link en de achterkant rolt uit
naar het test-project (op de test-Sheet) → testen (incl. `?test=1`-unittests, 30 asserts) → akkoord? →
merge naar `main` → voorkant én achterkant gaan live naar productie. Voor- en achterkant volgen dus
dezelfde branch→omgeving-koppeling.

---

## 6. Eenmalig handwerk (gebruiker — met instructie of samen)

- Sheet kopiëren + delen met de 4 gebruikers.
- Test-link bij Google aanmelden (1 scherm in de Cloud Console).
- Eenmalig Google-toegangstoken voor clasp veilig in GitHub zetten (uitleg bij het plan).
- Gratis test-OneSignal-app aanmaken.

---

## 7. Klaar-criteria (wat "af" betekent)

- Test-link toont het dashboard met "TESTOMGEVING"-balk; productie niet.
- Inloggen werkt op de test-link.
- Test-link leest/schrijft de test-Sheet; productie-Sheet aantoonbaar onaangeroerd.
- Het test Apps Script draait dezelfde automatisering op de test-Sheet (triggers werken).
- Eén bronwijziging in `apps-script/` rolt automatisch uit naar prod én test (geverifieerd met een triviale wijziging).
- Push op de test-link gaat naar de test-OneSignal-app.
- Gedocumenteerde flow: branch → test → prod.

---

## 8. Buiten scope (bewust)

- De verbouwing zelf: `index.html` opsplitsen + esbuild (klus 1) en strikte CSP (klus 2) — apart deelproject ná deze stap.
- Build-time env-injectie (komt vanzelf met klus 1; nu hostname-detectie).
- Mobiel/offline-optimalisaties (routekaart: bewust láág).

---

## 9. Aannames & open punten (te bevestigen bij het plan)

- Exacte productie-URL + of er een eigen domein is (Vercel nakijken) → bepaalt de test-URL-strategie (branch-alias vs. los Vercel-project).
- clasp CI-auth-mechanisme + welk Google-account.
- Triggers her-installeren op het test-project: handmatig of gescript.
- Eventuele anonimisering van de gekopieerde data.
- **Aanname:** Vercel ondersteunt een vaste alias voor een branch.
- **Afhankelijkheid:** leunt op het `?test=1`-testnet uit Fase 1.

---

## 10. Risico's

- OAuth/Cloud Console + Sheet-kopie + OneSignal vragen eenmalig toegang tot het Google-account van de gebruiker.
- clasp-credential in CI is gevoelig → least-privilege account + rotatie-afspraak.
- Container-bound script + Web App: een code-push is niet automatisch een live webhook; de CI moet ook deployen (nieuwe versie).
- Test-Sheet met echte data = privacy → alleen gedeeld met de 4 gebruikers.

---

## 11. Afhankelijkheden

- **Leunt op Fase 1:** het `?test=1`-testnet en de beveiligde webhook.
- **Levert op:** de veilige basis + onderhoudbare uitrol voor klus 1 + 2 (de verbouwing) en de latere fases 3–5.
