# AUDIT — grote naloopronde Collectief Dashboard (16 oktober 2026, v15.2 → v15.3 → v15.4)

> **v15.4 (zelfde dag, na akkoord): alle tien UX-voorstellen uit §4 zijn gebouwd.** Zie §8 voor wat er
> precies is gemaakt, hoe het getest is en wat het betekent voor de stap naar live.

Doel: volledige doorlichting van de testversie op bugs, robuustheid, gelijktijdig gebruik,
veiligheid en privacy; alles wat stuk of riskant is gefixt, UX-verbeteringen als voorstel.
De live versie is niet aangeraakt.

## 1. Werkwijze

- **Code volledig gelezen** (index.html, alle 56 modules in `src/`, `api/chat.js`, `sw.js`,
  `sw-strategie.js`, `zoek-tools.js`, `allowed-emails.js`, `styles.css`, Apps Script,
  workflow, Vercel/Jekyll-config). Vier onafhankelijke reviewrondes per modulegroep
  (chat/AI/zoek · schrijfpaden/concurrency · renderers/XSS · backend/CSS/hosting), elke
  bevinding daarna zelf in de code geverifieerd.
- **Zelftest** (`?test=1`, 3.531 asserties) headless gedraaid vóór en ná de wijzigingen.
- **Browsertests** met Playwright/Chromium tegen een nagebootste Sheets-API (in-memory
  kopie van de structuur van de test-Sheet, inclusief inserts/deletes/append, foutinjectie
  429/500/401/offline). Zo kon élke functie ingelogd worden doorlopen zonder echte
  Google-login. Scenario's: zie §6.
- **Sheet-rechten gecontroleerd** via de Drive-API (zie §3).

## 2. Bevindingen (bugs, fouten, robuustheid) — allemaal gefixt in v15.3

Ernst: kritiek / hoog / middel / laag. Status staat per punt.

### Middel

**B1 — Rij-controle vergeleek met het levende rij-object i.p.v. een momentopname**
- Locatie: `src/snooze.js` (schrijfOpvolgdatum), `src/inbehandeling.js` (zetInBehandeling),
  `src/bundel-acties.js` (herstelBundel, ontkoppelTaak, schrijfVolg), `src/bulk.js` (bulkVeld).
- Probleem: de vingerafdruk voor `assertRowMatch` werd pas berekend als de schrijfactie in de
  seriële wachtrij aan de beurt was, uit `r` zoals het dán is. Een actie die daarná op dezelfde
  rij was ingeschreven maar al optimistisch in `r` stond (opslaan van een bewerking, 'Opgevolgd',
  bulk-deadline) zat dan in de vingerafdruk terwijl de Sheet hem nog niet had → vals "Iemand heeft
  deze taak net gewijzigd" en een teruggedraaide weglegging/vinkje.
- Oplossing: overal `const snap = {...r}` vóór de mutatie en díe aan de guard geven (het idioom dat
  offerte-aannemers.js en crud.js al hadden). Status: **gefixt**.

**B2 — Analytics en Dashboard helemaal leeg als Chart.js (CDN) niet laadt**
- Locatie: `src/render-analytics.js` (buildAnalytics, buildDash, ensureChartJs).
- Probleem: `if(!window.Chart) return` stond als eerste regel, dus bij een geblokkeerd CDN
  (kantoorfilter, storing jsDelivr) verdwenen óók de KPI-getallen, de stat-strook, het leaderboard
  en 'Recent afgerond' — terwijl de foutbox zei dat de cijfers klopten. Bovendien kwam er bij elke
  pollronde een nieuw dood `<script>`-element en netwerkverzoek bij.
- Oplossing: cijfers altijd tekenen, alleen de grafieken achter de Chart-poort; mislukt script
  wordt verwijderd en een minuut niet opnieuw geprobeerd (knop 'Opnieuw proberen' zet de klok
  terug). Status: **gefixt**.

**B3 — Kenmerken opslaan gooide de invoer weg als de tokenvernieuwing mislukte**
- Locatie: `src/kenmerken.js` (saveKenmerken).
- Probleem: `kenmerkenEdit=false` stond vóór `ensureToken()`; mislukte die (verlopen sessie,
  geblokkeerde popup), dan tekende `renderVve()` de leeskaart en waren de gekozen waarden weg.
- Oplossing: pas ná de tokenpoort uit de bewerkstand. Status: **gefixt**.

**B4 — Herhaalregel heractiveren leverde een reeks 'te late' taken op**
- Locatie: `src/render-herhaal.js` (toggleHerhaalStatus) i.c.m. `apps-script/Opvolging.gs`
  (cd_hr_zetTakenKlaar).
- Probleem: pauzeren/activeren schreef alleen kolom K; J (volgende deadline) bleef op de oude
  datum. De motor doet per ochtend precies één stap (taak + J één interval verder), dus een
  maandregel die drie maanden stilstond gaf drie ochtenden achter elkaar een taak die al te laat
  was, plus drie pushes.
- Oplossing: bij activeren schuift het dashboard J door naar de eerste deadline op of na vandaag
  (één schrijfactie J:K, met logregel). De motor zelf is niet gewijzigd (zie §7 voor de
  backend-aanvulling). Status: **gefixt (frontend)**.

**B5 — 401 op het lezen gaf 'Fout' / 'controleer je verbinding' terwijl de verbinding goed was**
- Locatie: `src/data.js` (_loadRonde, catch).
- Probleem: bij een tussentijds verlopen of ingetrokken token gooide `fetchSheets` het token weg,
  maar de ronde eindigde op 'Fout' (en bij Vernieuwen: de netwerkbanner). Pas de volgende 8s-ronde
  herstelde het stil.
- Oplossing: één directe vervolgronde na een 401 (die vernieuwt via ensureToken en leest opnieuw),
  zonder zichtbare fout; één keer per storing. Status: **gefixt**.

### Laag

**B6 — Geen dubbelklik-rem op vier schrijfpaden** — `render-overig.js` (submitOntwItem,
deleteOntwItem, deleteLogboek) en `render-herhaal.js` (submitHerhaal, nieuw). Twee klikken in het
`ensureToken`-gat gaven een dubbel item / dubbele herhaalregel (twee HR-nummers, dus twee taken
van de motor) of een tweede logregel die weg was. Oplossing: bezig-vlag ná de invoercontroles, en
voor logregels een tijdrem van 400 ms (een per-rij-sleutel zou de verschoven buurregel doorlaten).
Status: **gefixt**.

**B7 — deleteHerhaal schoof rijnummers ook op als de regel lokaal al weg was** —
`render-herhaal.js`. Zelfde reparatie als deleteOntwItem al had. Status: **gefixt**.

**B8 — Wegleggen-venster werkte op een verouderd rij-object** — `snooze.js`. Rondde een
eerdere schrijfactie af terwijl het venster openstond, dan muteerde `schrijfOpvolgdatum` een wees:
de Sheet klopte, het scherm liet niets zien tot de volgende ronde. Oplossing: rij vers opzoeken op
het klikmoment (`verseRij`), met melding als hij weg is. Status: **gefixt**.

**B9 — Kenmerk-select wiste een afwijkende Sheet-waarde** — `render-vve.js`. Stond er met
de hand 'Deels' in kolom B/C, dan viel de select op 'Onbekend' en schreef Opslaan '' terug.
Oplossing: onbekende waarde als extra optie (zelfde regel als `setv`). Status: **gefixt**.

**B10 — Chat: filter wissen op een dossier werd bij heropenen stil ongedaan gemaakt** —
`dossier-chat.js` (openChat). Het dashboardbrede gesprek ging daarmee verloren. Oplossing:
onthouden voor welk dossier de gebruiker het filter zelf wiste. Status: **gefixt**.

**B11 — Chat: na een VvE-wissel tijdens een lopende vraag was de chat stil geblokkeerd** —
`dossier-chat.js`. Het lege gesprek toonde 'denkt na…' en nieuwe vragen werden genegeerd tot het
oude antwoord (tot een minuut later) binnen was. Oplossing: beurt-teller; de bezig-stand hoort bij
één gesprek. Status: **gefixt**.

**B12 — Chat: 401/403 van de proxy heetten 'tijdelijke storing'** — `dossier-chat.js`,
`api.js` (askZoek). Nu eigen tekst (sessie verlopen / geen toegang) en bij 401 wordt het token
weggegooid zodat de volgende poging stil vernieuwt. Status: **gefixt**.

**B13 — Zoekfilter accepteerde onbestaande datums** — `dashboard-zoek.js` (_invoerDatum).
`2026-02-31` rolde stil door naar 3 maart; Claude kreeg dan een verkeerd aantal. Oplossing: via
`_parseAnyDate` (round-trip-controle). Status: **gefixt**.

**B14 — 'Gekopieerd' zonder dat er gekopieerd was** — `ai.js`. Het klembord werd niet
afgewacht; bij een weigering (geen focus, geen recht) plakte je oude klembordinhoud in Claude.
Oplossing: eerst kopiëren, dan melden; bij mislukking een eerlijke melding. Status: **gefixt**.

**B15 — AI-hulp overleefde uitloggen** — `auth.js` (logout). De geplakte eigenarenmail en de
gekoppelde VvE bleven staan voor de volgende gebruiker op dezelfde computer (de chat werd om precies
deze reden wél opgeruimd). Status: **gefixt**.

**B16 — 'Vandaag' volgde de klok van het toestel, niet Europe/Amsterdam** — `util.js`
(_vandaagAmsterdam). Vanaf een toestel in een andere tijdzone liepen te-laat-tellingen,
prioriteiten en deadline-voorstellen 's avonds een dag voor of achter. Oplossing: kalenderdag via
`Intl` in Europe/Amsterdam, teruggegeven als lokale middernacht (zodat het rekenen in kalenderdagen
overal gelijk blijft). Status: **gefixt**.

**B17 — Service-worker-bewaking crashte als `register()` niets opleverde** — `sw-update.js`.
In de console 'SW registratie mislukt: Cannot read properties of undefined'; de halfuurlijkse
update-controle startte dan nooit. Status: **gefixt** (nette terugkeer).

**B18 — Bulk-meldingen in het meervoud bij één taak** — `bulk.js`: '1 taken afgerond'.
Status: **gefixt**.

**B19 — Toetsenbordfocus onzichtbaar op twee velden** — `styles.css`: het datumveld in de
bulk-balk en het zoekveld van Ctrl+K hadden geen zichtbare focus (de globale outline was er voor
alle invoervelden afgehaald). Status: **gefixt**.

**B20 — Donker thema: witte cijfers op de gevulde voortgangsbalk (2,5:1)** — `styles.css`.
Status: **gefixt**.

**B21 — Afdrukken leverde alleen het eerste scherm op** — geen `@media print`; de schil staat
op 100vh met overflow hidden. Status: **gefixt** (minimale printregel).

**B22 — Vercel: cache-header voor `/index.html` was dood** — met `cleanUrls` is het pad `/`.
Nu beide. Status: **gefixt**.

**B23 — Deploy-workflow zonder `permissions` en `concurrency`** — twee snelle pushes konden
parallel `clasp push --force` doen zonder volgordegarantie. Nu `contents: read` en één uitrol per
tak tegelijk. Status: **gefixt** (geen gedragsverandering voor een gewone push).

### Dode of dubbele code (opgeruimd, geen gedragsverandering)

- `api.js` `askChat` (dossier-modus; nergens meer aangeroepen sinds v15.0 — de proxy kent hem nog
  voor oude tabbladen).
- `rij.js` `rijBestaatNog`, `render-overig.js` `_LOG_AVKLEUR`/`avatarKleur`,
  `render-analytics.js` `DASH_ICONS`, `render-alv.js` `ALVO_ICONS` (+ her-export in
  render-lijsten.js), ongebruikte import `verseRij` in `verplaats.js`, het nergens gelezen
  `id="undo-btn-…"` op de undo-knop (gaf dubbele id's).
- Bewust laten staan: `urgentie.js` (alleen de zelftest gebruikt hem; verwijderen raakt de
  tests), `actieBadge`/`buildChatSysteemPrompt` (door de zelftest getoetst), tientallen exports die
  alleen intern gebruikt worden (onschadelijk).

## 3. Veiligheid en privacy

**Gecontroleerd en in orde**
- **XSS**: elke interpolatie van Sheet-, gebruikers- en AI-tekst loopt door `esc()`, ook in
  attributen (`title`, `data-*`, `aria-label`). Getest met `<img onerror>`, `<script>` en `<b>` in
  taaktekst, CRM-mail, VvE-naam, logregels, Ontwikkeling-titels: nergens komt een element door.
  `opmaak.js` escapet eerst en zet pas daarna `**vet**`/`_schuin_` om; klembord-HTML gaat via
  `DOMParser` naar platte tekst.
- **Geen secrets in de code**: alleen publieke identifiers (OAuth client-id, OneSignal app-id,
  Sheet-id's). De Anthropic-sleutel staat server-side; `.clasprc.json` is nooit gecommit; het
  webhook-secret staat in Script Properties.
- **De Sheet is NIET publiek gedeeld.** Via de Drive-API nagemeten: productie- én test-Sheet
  zijn alleen gedeeld met de vier medewerkersaccounts (owner + 3 writers), geen 'iedereen met de
  link'. Een Sheet-id in de broncode is daarmee geen datalek: zonder OAuth-token van een van die vier
  accounts geeft Google een 403. AVG-technisch is de dossierdata dus afgeschermd op accountniveau.
- **OAuth**: scopes `spreadsheets` + `userinfo.email` (minimaal voor wat de app doet). Token in
  `sessionStorage` (per tabblad, weg bij sluiten), nooit in localStorage, nooit in een URL of
  console. Uitloggen wist token, leescache, meldingenstand, open vensters en nu ook de AI-hulp.
  Verlopen sessie: stille vernieuwing alleen mét focus; na drie mislukkingen een banner met
  inlogknop. Proxy controleert audience (client-id), `email_verified` én de allowlist.
- **CSP/headers**: volledige CSP in de meta (script-src alleen self + exacte Chart.js-URL met SRI +
  Google/OneSignal), `frame-ancestors`/X-Frame-Options/nosniff/Referrer/Permissions via vercel.json,
  frame-buster in JS voor GitHub Pages. HSTS: Vercel zet hem standaard, github.io staat op de
  preloadlijst.
- **Formule-injectie**: `veiligeCel` op élke schrijfweg (ook bulk en Apps Script `cd_safeCell`).
- **Apps Script**: doPost fail-closed op secret, LockService op alle muterende triggers,
  kolomposities backend ↔ frontend kloppen (L..W), geen mail-HTML met Sheet-data.

**Aandachtspunten (geen lek, wel een afweging voor jou)**
- **S1 — Privé-e-mailadressen van collega's staan in de publieke frontend** (`allowed-emails.js`
  wordt door GitHub Pages en Vercel geserveerd; drie zijn @gmail.com). Dat is geen toegangsrisico
  (de echte poort is de Sheet-deling + de proxy), maar wel persoonsgegevens op een openbare URL.
  Alternatief: de lijst als SHA-256-hashes opnemen en in frontend én proxy op hash vergelijken.
  Kost ~1 uur en een kleine aanpassing van de sessieherstel-controle (die is nu synchroon).
  → **Voorstel, wacht op je akkoord** (zie §4, U9).
- **S2 — `apps-script/README.md` bevat het productie-script-id** terwijl de workflow het als
  secret behandelt. Geen toegang mogelijk zonder OAuth, maar inconsistent. Advies: uit de README
  halen (of het secret-masking laten vallen). Open.
- **S3 — `icon-maskable.png` is identiek aan `icon-512.png`**: op Android wordt het icoon
  afgesneden. Cosmetisch; heeft het logo-bronbestand nodig. Open.

## 4. UX-voorstellen — **gebouwd in v15.4** (akkoord gegeven; de tabel is de oorspronkelijke lijst, de uitwerking staat in §8)

| # | Wat | Waarom | Impact | Moeite |
|---|-----|--------|--------|--------|
| U1 | **Conflict bij opslaan: invoer bewaren.** Verwerpt de rij-controle een bewerking omdat een collega de taak net wijzigde, dan sluit het venster nu en is je getypte tekst weg (alleen de toast blijft). Voorstel: venster weer openen met de nieuwe stand én je eigen invoer per veld gemarkeerd. | Het enige pad waar werk verloren gaat; komt vaker voor naarmate er meer collega's tegelijk werken. | Hoog | Middel |
| U2 | **Alerts vervangen door toasts/in-venster-meldingen.** ~80 `alert()`-aanroepen (inlogfouten, 'Datum is verplicht', 'Taak niet gevonden'). Chrome tekent die bovenaan met de URL erbij en blokkeert alles. | Consistenter, geen blokkade, leesbaar op telefoon. | Middel | Middel |
| U3 | **Command palette uitbreiden (Ctrl+K).** Er is al een palet voor VvE/taak/logboek. Toevoegen: acties ("afronden", "wegleggen", "naar Afgerond", "thema"), recente VvE's bovenaan, en `/`-prefixen (`/log tekst`, `/vve code`). | Minder muis, sneller schakelen tussen dossiers. | Middel | Laag-middel |
| U4 | **Melding "collega heeft deze taak net gewijzigd" ZONDER te wachten op opslaan.** Zodra een poll een wijziging binnenbrengt op een taak die bij jou in het bewerkscherm openstaat, een gele regel in het venster tonen (de poll staat nu stil zolang een venster open is; voorstel: lezen wél, toepassen niet). | Voorkomt het conflict in plaats van het af te vangen. | Hoog | Middel-hoog |
| U5 | **Verbindingsindicator met automatisch herstel is er al** (Offline-banner, 'Gepauzeerd', 'Fout'); voorstel: één klikbare status in de zijbalk die uitlegt wát er aan de hand is en wat de volgende stap is, plus 'laatste geslaagde verversing HH:MM' permanent zichtbaar. | De drie losse standen zijn nu niet in één oogopslag te duiden. | Laag-middel | Laag |
| U6 | **Opgeslagen weergaven.** De filters op Nog Te Doen (zoekterm, code, behandelaar, prioriteit, statuspil, sortering, per-VvE) als benoemde weergave in localStorage ("Mijn te-late", "Cihad – offertes"), met een chip-rij boven de tabel. Geen eigen dataopslag buiten de browser. | Dagelijkse terugkerende filters kosten nu vijf klikken. | Middel | Laag |
| U7 | **Ongedaan maken ook voor 'in behandeling', 'wegleggen' en bewerken.** Afronden/verwijderen/bulk hebben een undo-knop; deze drie niet (wel via het logboek terug te lezen). | Eén patroon voor alle wijzigingen. | Middel | Laag |
| U8 | **Sneltoetsen op de lijst:** `j/k` rij kiezen, `e` bewerken, `a` afronden, `w` wegleggen, `?` overzicht. | Veel sneller voor wie de lijst dagelijks afwerkt. | Middel | Laag-middel |
| U9 | **Allowlist als hashes** (zie S1). | Privacy collega's. | Laag | Laag-middel |
| U10 | **'Laatst gewijzigd door … om …' in het bewerkscherm** (uit het logboek), zodat je bij twijfel ziet wie er net aan zat. | Context bij gelijktijdig werken. | Laag | Laag |

Niet voorgesteld (bewust): eigen database/sync-laag, realtime websockets, offline schrijven.
TwinQ blijft de database, de Sheet het werkblad, het dashboard het overzicht.

## 5. Open punten (niet gefixt; bewust gedocumenteerd)

- **O1 — Positionele batch + herkansing na een 5xx-ná-commit.** Komt Google's antwoord op een
  geslaagde afronding/verwijdering/verplaatsing terug als 5xx, dan draait `_withRetry` de stap
  opnieuw, slaat de rij-controle aan (de rij is immers al weg) en zie je 'De lijst was net
  gewijzigd' terwijl het gelukt is; bij verwijderen is de undo dan weg. Data in de Sheet klopt,
  de resync herstelt het scherm binnen een seconde. Zeldzaam; `bulkVeld` en `bulkUndoAfronden`
  hebben al de tweede controle die dit oplost — dezelfde controle in `doCompleteTask`,
  `deleteTaskRow`, `verplaats.js`, `bulkAfronden`/`bulkVerwijderen` is een vervolgstap.
- **O2 — `insertDimension` binnen een herkansing** (zelfde klasse): een 5xx ná een geslaagde
  invoeging kan lege rijen in het blok achterlaten. Onschadelijk voor de data (parseSections
  negeert lege rijen), wel vervuiling.
- **O3 — `bulkUndoAfronden` meldt succes ook als niet elke archiefregel gevonden is** (alleen
  bereikbaar voor rijen van vóór de taaknummer-backfill). Voorstel: waarschuwende toast.
- **O4 — Backend-aanvulling B4**: `cd_hr_zetTakenKlaar` zou zelf J moeten doorschuiven tot de
  eerste deadline ≥ vandaag (één lus) vóór hij een taak maakt. Raakt Apps Script (productie-deploy
  via de workflow op `main`), daarom niet in deze ronde gedaan.
- **O5 — `apps-script/appsscript.json` staat op `Europe/Brussels`**, Mailintake/Backup op
  `Europe/Amsterdam`. Zelfde offset, cosmetisch.
- S2, S3 hierboven.

## 6. Getest

**Zelftest** (`index.html?test=1`): vóór 3.531 OK / 0 FAIL — ná de wijzigingen 3.531 OK / 0 FAIL
(alleen de versie-wachtpost is op 15.3 gezet; de console bevat uitsluitend de opzettelijke
stub-fouten van de suite zelf).

**Browserscenario's** (Playwright, 1440×900, nl-NL, Europe/Amsterdam, console op fouten bewaakt):
- Laden met 494 VvE's en 1.800 logregels: eerste render 0,3 s; alle negen pagina's, zes
  tabbladen, paginering, dossier via code-klik, Ctrl+K, donker thema, dichtheid, CSP schoon.
- Taak toevoegen (incl. vraag bij onbekende code), bewerken + notitie meeschrijven, conflict met
  collega (rij-controle weigert en herlaadt), afronden met duur + ongedaan maken (rij terug met
  hetzelfde taaknummer, archiefregel weg), wegleggen, in behandeling, verwijderen vanuit het
  bewerkscherm (+ logregel), dubbelcheck 'bestaat deze taak al', dezelfde taak voor drie VvE's
  (drie rijen, drie unieke nummers, één invoeging), nieuw offerte-traject met aannemers →
  automatische voorleg-subtaak in dezelfde bundel.
- Filters/zoeken (incl. 'al' matcht niet op FALSE), kolomsortering, per-VvE-groepering, bulk
  geven/afronden/undo (balk zegt 'verversen staat stil'), ALV-vinkjes Klaargezet → Gepland →
  Afgerond (+ archiefregel), logregel bewerken/verwijderen/undo, Ontwikkeling toevoegen/bewerken/
  verwijderen/undo, herhaalregel toevoegen/pauzeren/verwijderen, kenmerken opslaan, contactmoment
  vastleggen, taak vanuit dossier, chat (zoekmodus met mock-proxy), notificatie-instellingen,
  AI-hulp (prompt + antwoord ontleden), Afgerond-periodefilter en zoeken in CRM-mails (mail op
  verzoek opgehaald).
- Storingen: 429 op schrijven (herkansing, geen dubbele logregel), blijvende 500 (rollback +
  blijvende melding), offline (banner, geen optimistische wijziging, herstel bij online), 401 op
  lezen (nu stille vervolgronde), 401 op schrijven, 429 op lezen (balk 'Fout' pas na twee stille
  rondes, herstel daarna), collega voegt een rij in vóór mijn toevoeging (invoegplek-controle
  weigert, herlaadt), collega verwijdert de taak die ik afrond (rij-controle weigert, rollback),
  minimumversie-rem (balk + schrijven geblokkeerd).

**Kanttekeningen bij de testreeks**
- De reeks 'dezelfde taak voor drie VvE's' was in één run rood: het testscript typte de volgende
  tekst door in het codeveld (zichtbaar als vraag "Onbekende VvE-code '381105Servicekosten e2e'").
  Dat is een race van het script met de VvE-suggestielijst, geen fout in de app; de herhaling
  slaagde (drie rijen, drie unieke nummers).
- Ctrl+K met een kale numerieke code (bijv. 381105) toonde in de testomgeving alleen acties, geen
  VvE-treffers. Handmatig niet gereproduceerd; staat open als controlepunt bij de werkdag testen.

## 7. Wat er nodig is om naar live te zetten

1. Testversie (deze tak, Vercel-preview / staging) een werkdag door het team laten gebruiken;
   let op de Analytics-pagina (gewijzigde Chart-poort) en het heractiveren van een herhaalregel.
2. `main` bijwerken vanaf deze tak (merge of PR). `versie.json` hoeft NIET omhoog: er is niets aan
   kolomindeling of schrijfgedrag van de Sheet veranderd; `APP_VERSION`/`CACHE_VERSION` staan al op
   15.3 / cd-v176, dus open tabbladen krijgen de 'nieuwe versie'-balk.
3. Apps Script: deze ronde raakt `apps-script/` niet; de workflow draait dus niet. De
   backend-aanvulling O4 is een aparte, kleine release.
4. Na livegang: één keer `?test=1` op productie draaien en de console van de eerste sessie
   bekijken.

## 8. v15.4 — de tien voorstellen gebouwd

Alles in de testversie; live is niet geraakt. Versie 15.4 / cd-v177. Nieuwe modules: `src/hash.js`,
`src/verbinding.js`, `src/weergaven.js`, `src/sneltoetsen.js` (alle vier in de app-shell van `sw.js`).

| # | Wat er gebouwd is | Waar |
|---|---|---|
| U1 | **Conflict bij opslaan: invoer bewaren.** Weigert de rij-controle de opslag nadat het scherm al dicht was, dan gaat het scherm na de stille verversing weer open op de stand van de collega, met jouw eigen gewijzigde velden teruggezet, oranje gemarkeerd en benoemd ("Jouw invoer staat gemarkeerd (Opmerkingen)"). De notitie uit het Logboek-vak wordt niet dubbel gezet (die was al weggeschreven). Wordt de conflicterende stand al vóór het opslaan gezien, dan blijft het scherm gewoon open met een gele regel en de knop 'Nieuwe stand overnemen'. | `crud.js` (`herstelNaConflict`, `heropenMetInvoer`, `_pasInvoerToe`), `data.js` (`backgroundWrite` kreeg `opties.bijFout`, die ná de resync draait) |
| U2 | **Geen `alert()` meer.** Alle 85 aanroepen vervangen door `meldFout` (rode toast, zonder ontdubbeling, geen systeemmelding). De zelftest ving alerts op via `window.alert`; die stubs zetten nu `state._meldStub`. | `notifications.js` + 11 modules |
| U3 | **Palet uitgebreid.** Acties zijn doorzoekbaar ('thema', 'vernieuwen', 'ga naar logboek', 'selecteren', 'sneltoetsen'); met een focusrij (U8) staan Bewerken/Afronden/Wegleggen/In behandeling voor díe taak bovenaan. Laatst bezochte VvE's komen vooraan in de treffers. `/`-opdrachten: `/vve code`, `/log tekst` (notitie in het open dossier, of `/log 311212 tekst`), `/taak omschrijving`, `/ga pagina`; `/` alleen toont de lijst. | `palette.js` (`palActies`, `zoekActies`, `renderCommando`, `snelleNotitie`, `ontleedLog`) |
| U4 | **Live melding "collega heeft deze taak net gewijzigd".** De 8s-poll loopt nu door terwijl het bewerkscherm open staat (elk ánder venster remt nog steeds: `modalRemtPoll` in `main.js`). Na elke hertekening vergelijkt `controleerBewerkConflict` de open taak met de verse stand; verschilt die, dan verschijnt bovenin een gele regel die de veranderde velden noemt, met 'Nieuwe stand overnemen'. Is de taak verdwenen (afgerond/verwijderd), dan zegt de regel dat. Gemeten: melding binnen één pollronde (≈8 s). | `crud.js`, `main.js` (`renderAll` roept de controle aan) |
| U5 | **Klikbare verbindingsstatus.** De bol/het label in de zijbalk is een knop; het paneel legt per stand uit wat er aan de hand is en wat de volgende stap is (Live, Laden, Opslaan met aantal wijzigingen, Fout, Offline, Gepauzeerd, Sessie verlopen, Selecteren, Verouderde versie) met 'Laatste geslaagde verversing: HH:MM' en waar zinvol een knop 'Nu vernieuwen'. Zodra het label zelf geen tijd meer toont (Fout/Offline/Gepauzeerd) staat er '· stand HH:MM' onder. Geen koppeling met data.js: een MutationObserver kijkt mee met de bol. | `verbinding.js` (`statusUitleg` is puur), `index.html`, `data.js` (`state._laatsteSyncMs`) |
| U6 | **Opgeslagen weergaven.** Rij boven de takenlijst: tabblad + zoekterm + code + behandelaar + prioriteit + statuspil + sortering + 'Per VvE' als benoemde weergave in localStorage (max. 12, per browser). Chip = toepassen, × = verwijderen (met vraag), '+ Weergave opslaan' = naam typen, Enter. De actieve weergave licht op; na herladen staan ze er nog. In de selecteerstand wisselt hij niet (dat zou de selectie legen). | `weergaven.js`, `render-lijsten.js` (na elke `renderNtd`) |
| U7 | **Ongedaan maken ook voor in behandeling, wegleggen en bewerken.** Dezelfde undo-knop in de toast als bij afronden/verwijderen (8 s). De undo zoekt de rij op dát moment vers op (identiteit), draait via dezelfde schrijfweg met rij-controle en logregel, en weigert netjes als de taak intussen weg is of — bij bewerken — daarna opnieuw is gewijzigd. Geen undo-op-undo (ping-pong). | `inbehandeling.js` (`schrijfInBehandeling`), `snooze.js` (`maakWeglegOngedaan`), `crud.js` (`maakBewerkingOngedaan`, `_rijWaardenAK`) |
| U8 | **Sneltoetsen op de lijst.** `j`/`k` kiezen een rij (dunne rand, onthouden op taaknummer dus ook na hertekenen), `e` bewerken, `a` afronden, `w` wegleggen, `i` in behandeling, `?` overzicht (ook `Shift+/`). Klikken op een rij maakt hem de focusrij. Niet actief in invoervelden, in een open venster, het palet of de chat; de focus die na Escape in een gesloten venster achterblijft telt niet mee. | `sneltoetsen.js`, overzichtsvenster `#sneltoets-bg` in `index.html` |
| U9 | **Allowlist als hashes.** `allowed-emails.js` bevat SHA-256-hashes; `EMAIL_NAMES` is op hash gesleuteld; `emailToegestaan(email)` en `naamBijEmail(email)` normaliseren en hashen zelf (memoized, dus ook in de logboeklus goedkoop). De Vercel-proxy hasht met `node:crypto`. Een collega toevoegen: zie het commentaar in `allowed-emails.js`. Getoetst tegen de SHA-256-testvectoren. Let op bij livegang: `api/chat.js` en de frontend moeten samen uitrollen (zelfde bestand `allowed-emails.js`). | `hash.js`, `allowed-emails.js`, `config.js`, `util.js`, `auth.js`, `data.js`, `main.js`, `api/chat.js` |
| U10 | **'Laatst gewijzigd door … · vandaag 14:02 · actie'** bovenin het bewerkscherm, uit het logboek (laatste regel van deze VvE in deze categorie — het logboek kent geen taaknummers; dat staat in de tooltip). Systeemregels tellen niet mee. | `crud.js` (`laatsteWijziging`, `toonLaatstGewijzigd`) |

**Bewust niet gedaan:** geen eigen opslag buiten de browser (weergaven staan in localStorage, niet in de Sheet),
geen websockets, geen undo-op-undo.

**Getest (v15.4)**
- Zelftest: 3.581 OK / 0 FAIL (50 nieuwe asserties: SHA-256-vectoren en allowlist, statusuitleg per stand,
  actie-zoeken, `/log`-ontleding, recente VvE's vooraan, weergave-vergelijking en -omschrijving, eigen
  wijzigingen, gewijzigde velden, laatste wijziging, oude cellen A..K).
- Browser (Playwright, 1440×900 licht én donker, 375×812): U1 (collega wijzigt het actiepunt tussen poll en
  opslaan → 'Opslaan mislukt', scherm heropent met de nieuwe stand én mijn opmerking gemarkeerd; tweede
  opslag landt met beide), U4 (collega wijzigt opmerking terwijl ik typ → gele regel binnen 7,9 s; 'Nieuwe
  stand overnemen' houdt mijn tekst; opslaan bewaart beide), U7 (undo op in behandeling: H terug op FALSE met
  'Aangevinkt' + 'Uitgevinkt' in het logboek; undo op wegleggen: L weer leeg; undo op bewerken: oude tekst
  terug), U8 (j/k/e/a/w/?; in een zoekveld doen de toetsen niets), U3 (acties, thema wisselen, `/`, `/vve`,
  `/log` schrijft een Opmerking-regel, `/taak` opent het scherm met de tekst, 'ga naar logboek'), U6 (opslaan,
  actief, toepassen, overleeft herladen, verwijderen met vraag), U5 (Live-paneel; bij 8× 429 'Fout bij
  verversen' met stand-tijd en knop; knop herstelt naar Live), U2 (lege code → toast, geen dialoog), U9 (een
  vreemd account blijft op de inlogkaart, geen enkele leesronde), U10 (regel zichtbaar met naam, dag en actie).
  Console schoon, op de opzettelijke conflict- en 429-fouten na. Regressie: smoke, flows1–3 uit §6 opnieuw groen.
- Kanttekening: in de reeks flows2 viel de AI-hulp-stap om doordat het testscript twee velden binnen de
  30 ms van de autofocus van het venster (modal-a11y.js) invulde; de autofocus trok de cursor terug naar het
  eerste veld en de suggestielijst sloot. Een mens haalt dat tempo niet; het script wacht nu op de autofocus.

**Naar live (aanvulling op §7)**
- `versie.json` hoeft nog steeds niet omhoog (kolomindeling en schrijfgedrag ongewijzigd).
- Frontend en `api/chat.js` samen uitrollen (U9): beide lezen `allowed-emails.js`; Vercel bouwt ze uit dezelfde commit.
- Eerste werkdag: let op de gele regel in het bewerkscherm (U4) en op de undo-toasts (U7); het palet
  en de sneltoetsen zijn opt-in en raken niemand die ze niet gebruikt.


## 9. v15.6 (20 oktober 2026) — opruimen, sneller, veiliger, verhuizing voorbereid

Na een tweede doorlichting (dode code, snelheid, beveiliging). Zelftest 3.564 OK / 0 FAIL; draait nu
ook automatisch in GitHub Actions (`.github/workflows/zelftest.yml`, `tools/zelftest.mjs`).

**Veiligheid en privacy**
- Leescache van localStorage naar sessionStorage (`data.js`): op github.io was de hele dataset 14
  dagen leesbaar voor elke pagina op de gedeelde origin. Een oude localStorage-cache wordt gewist.
- Privé-adressen van collega's en een adres dat op een eigenaar leek uit `tests.js` en `docs/`
  (U9 was daarmee niet af). Productie-script-id uit `apps-script/README.md` (S2).
- `AUDIT.md` niet meer publiek (Pages en Vercel). Vercel publiceert alleen nog een allowlist
  (`tools/bouw.mjs` → `dist/`); een nieuw bestand is standaard niet publiek.
- OneSignal-SDK pas na het inloggen (`laadOneSignal`). Gemini-knop uit de AI-hulp (AVG).
- Chat-proxy: rem van 150 aanroepen per 10 min per collega, Anthropic-foutdetails alleen in de log.
- HSTS-header; deploy-workflow met GitHub-omgeving per doel (reviewer instellen in Settings).

**Sneller**
- Service-worker-install met `no-cache` i.p.v. `reload` (ongewijzigde bestanden komen als 304).
- Verkleinde build op Vercel: JS+CSS 534 → 194 kB gzip. Zijbalklogo 37 → 3 kB; dubbel icoon weg.
- Verversen in een rustig venster (geen focus of 5 min geen invoer) eens per 30 s i.p.v. 8 s;
  bij terugkeer meteen een ronde. Datums één keer parsen bij sorteren (`sorteerOpDatum`).
- Bewust niet: parsen overslaan bij ongewijzigde Sheet-data. Elke ronde bouwt de lokale
  (optimistische) stand opnieuw op uit de Sheet; overslaan kan een mislukte wijziging laten staan.

**Opgeruimd**: `migratie-offerte.js` (v12.5, gedraaid), `logo-login.png`, `icon-maskable.png`,
`prioBadge`, `editRow`, `offerteFase`/`OFFERTE_FASES`, `deriveOffertes`, `CRM_TERMIJN_WERKDAGEN`,
ongebruikte imports/her-exports, ~1,5 kB CSS (`.off-*`, ongebruikte varianten en variabelen).

**Verhuizing naar `dashboard.vvebeheercollectief.nl` (voorbereid, nog niet actief)**
De code werkt op beide adressen (`PROD_HOSTS`, `_proxyUrl`, proxy-origins). De doorverwijzing staat
klaar achter `VERHUISD_NAAR` in `config.js` (leeg). Volgorde: DNS → domein in Vercel → Google
OAuth-origin → deze tak naar main → OneSignal-site-URL → `VERHUISD_NAAR` zetten +
`APP_URL`/`CD_*_FRONTEND_URL` in Apps Script → iedereen opent het oude adres één keer →
na een week Pages uit en repo privé.
