# Werkwijzen-verbeterprogramma — ontwerp

**Datum:** 2026-06-19
**Status:** Ontwerp (ter review bij de beheerder)
**Doel:** Tien geverifieerde verbeterpunten uit de brede dashboard-check uitvoeren in zes veilige, los te leveren batches — in een vaste volgorde die elkaar veilig maakt.

---

## 1. Aanleiding

Een brede code-review (5 parallelle verkenners, 2026-06-19) over alle werkwijzen van het [[Collectief Dashboard 4.0]] leverde een gerangschikte lijst verbeterkansen. De eigenaar koos tien punten (alle behalve "weggelegde taken uit Doe-dit-eerst filteren") en akkoord op de batch-volgorde A→F. Dit document legt per punt het probleem (met bewijs), de gekozen aanpak en het acceptatiecriterium vast, plus de werkwijze van uitvoeren.

## 2. Scope

**Binnen scope (10 punten):**
1. Service worker: nieuwe versie bereikt de gebruiker (subtiel herlaad-balkje) + cache-aanpak GitHub Pages.
2. Bescherming tegen schrijven naar de verkeerde VvE-rij.
3. Apps Script `cd_parseDate`: Nederlandse maandnamen (deadline-push + dagsamenvatting).
5. Afhandel-knop op de Vandaag-pagina.
6. Trap-2 stille-dossier-escalatie naar de juiste persoon (nu hardcoded 'Jer').
7. Mobiele layout voor de Vandaag-cockpit.
8. Offerte: één-klik "ontvangen" en "gegund".
9. AI-chat: kostenrem in het ontwerp + voorbeeldvragen + allowlist op één plek.
10. Repo opruimen: losse mockup-/presentatie-bestanden.
11. `render-lijsten.js` splitsen.

**Bewust buiten scope:**
- **Punt 4** (weggelegde taken uit "Doe dit eerst" filteren) — de beheerder wil dat een geparkeerde taak met verstreken deadline tóch opduikt. Huidig gedrag blijft.
- Mail-intake (apart project, geparkeerd op gebruikers-prerequisite — zie [[project_mail_intake_motor]]).

## 3. Werkwijze (geldt voor elke batch)

- **Incrementeel leveren.** Elke batch doorloopt: spec is er al (dit document) → implementatieplan (per batch) → bouwen (TDD waar logica) → **alle tests groen** → live → live gecontroleerd → pas dán de volgende batch.
- **Vast deploy-ritme:** feature-branch → tests → `staging` → `main` (fast-forward / cherry-pick, geen kale staging-merge — zie [[feedback_staging_main_merge]]) → `sw.js` versie ophogen (cd-vNN) → GitHub Pages controleren.
- **Apps Script** wordt handmatig in de editor geplakt (geen clasp/auto-deploy); `apps-script/*.gs` in de repo is de bron/back-up. Apps Script-punten worden gebundeld om plak-sessies te minimaliseren.
- **Test op de echte prod-URL** (GitHub Pages), niet alleen lokaal (zie [[reference_lokaal_testen]]).

## 4. Batches & ontwerp per punt

### Batch A — "Zorg dat fixes je bereiken" (punt 1) — eerst

**Probleem.** De canonieke productie draait op GitHub Pages (`src/config.js:8`). De anti-cache-headers staan alleen in `vercel.json:7-24` en gelden dus niet op Pages. Daarnaast registreert de client de service worker zonder update-listener (`src/main.js:51-54`); `sw.js` doet wel `skipWaiting()`+`clients.claim()` (`sw.js:50,58`), maar de al geladen pagina herlaadt niet, dus verse code wordt pas zichtbaar na een handmatige harde refresh. Samen: een gefixte bug kan de gebruiker dagen niet bereiken ("oude versie"-gevoel).

**Aanpak.**
- Registreer de SW met `updateViaCache: 'none'` en doe periodiek (en bij terugkeer naar het tabblad) een `registration.update()`, zodat een nieuwe `sw.js` ook op Pages snel wordt opgemerkt ondanks HTTP-cache.
- Detecteer een wachtende nieuwe versie (`updatefound` → nieuwe worker `installed` terwijl er al een controller is). Toon dan **onderin een subtiel balkje "Nieuwe versie — herladen"** (gekozen door de beheerder). Het balkje onderbreekt nooit lopend werk (geen auto-reload).
- Bij klik: stuur `SKIP_WAITING` naar de wachtende worker en herlaad op `controllerchange`. Verplaats `skipWaiting()` in `sw.js` van onvoorwaardelijk (install) naar getriggerd via bericht.

**Klaar wanneer.** Na een versie-bump verschijnt bij een geopende app het balkje; klikken laadt de nieuwe versie; geverifieerd op de echte GitHub-Pages-URL.

---

### Batch B — Apps Script-vangnet (punten 3 + 6) — één plak-sessie

**Punt 3 — `cd_parseDate` kent geen Nederlandse maandnamen.**
*Probleem.* `cd_parseDate` (`apps-script/Notifications.gs`) parseert alleen `dd-mm-yyyy`, ISO en `new Date(s)` — geen "21 mei 2026". De frontend `_parseAnyDate` (`src/util.js`) kan dat wél. Sheets geeft Nederlandse long-dates terug (zie [[feedback_datum_formaat]]). Gevolg: zo'n deadline wordt **stil overgeslagen** in `cd_checkDeadlines` en `cd_dailySummary` — geen push, telt niet als "te laat", terwijl de frontend de taak wél urgent toont.
*Aanpak.* Voeg een maandnamen-tak toe aan `cd_parseDate` (zelfde maandtabel als `_MAANDEN` in `util.js`). Voeg een Apps Script-testfunctie toe die "21 mei 2026" e.d. controleert.
*Klaar wanneer.* `cd_parseDate('21 mei 2026')` geeft de juiste datum; een deadline met maandnaam levert push/dagsamenvatting op.

**Punt 6 — trap-2-escalatie gaat hardcoded naar 'Jer'.**
*Probleem.* In `cd_escaleerStilleDossiers` gaat trap-1 naar de behandelaar (`Opvolging.gs:207`), maar trap-2 (de zwaarste) naar een hardcoded `'Jer'` (`Opvolging.gs:200`) — voor álle secties (OPPAKKEN/VERGADER/OFFERTE/LOD), niet alleen offertes. De daadwerkelijke behandelaar én de rest van het team missen dus juist het zwaarste signaal.
*Beslissing (door beheerder).* Trap-2 is een **teambrede** melding: behandelaar + alle collega's. Een dossier dat zó lang stilligt mag iedereen zien.
*Aanpak.* Vervang de hardcoded `cd_notifyByExternalId('Jer', …)` op `Opvolging.gs:200` door de bestaande teambrede broadcast `cd_notifyByTag(…)` (hetzelfde pad waarmee nieuwe taken nu al naar het hele team gaan). Het exacte tag-kenmerk (hergebruik bestaand of een nieuw `n_escalatie`) bepaalt het implementatieplan. Trap-1 blijft een persoonlijke melding aan de behandelaar.
*Klaar wanneer.* Bij trap-2 krijgt het hele team (incl. behandelaar) een melding; geen hardcoded naam meer.

---

### Batch C — Veiligheidsnet data (punt 2)

**Probleem.** Schrijf-/verwijderacties adresseren een absolute rij via `r._row` (`src/crud.js:167-172,238-243`; `src/offerte-acties.js:63-64`; `src/offerte-aannemers.js:27`; `src/snooze.js:63`). `_row` wordt lokaal meegeschoven (`src/api.js:37`) en bij resync herschreven (`src/data.js:40`). Als de Sheet tussen render en write verschuift (handmatige bewerking of resync), wijst `r._row` naar een andere rij → de actie raakt **stil de verkeerde VvE**. Er is alleen een `if(!r._row) return`-guard (ontbreken), geen verschuif-controle. Dit is de familie van de eerdere 14-kolommen-bug.

**Aanpak.** Vóór elke cel-write/delete op `r._row`: lees kolom A van die rij terug en bevestig dat die gelijk is aan `r.code` (binnen de geserialiseerde `_writeChain`, zodat geen andere write ertussen komt). Bij mismatch: **weiger de write**, trigger een volledige resync (`loadAll(true)`) en toon een toast ("De lijst was net gewijzigd — opnieuw geladen, probeer nog eens."). Dit dekt de realistische resync-race; server-side verificatie blijft een sterkere optie voor later.

**Klaar wanneer.** Een test met een kunstmatig verschoven `_row` laat de write weigeren i.p.v. corrumperen; normale writes werken ongewijzigd; alle tests groen.

---

### Batch D — Fundament (punten 10 + 11) — vóór de zichtbare functies

**Punt 10 — repo-rommel.**
*Probleem.* De repo-root bevat ~26 losse `mockup-*.html` / `website-mockup-*.html` / `presentatie-*.html` (~648 KB), 21 untracked, dwars door de echte app (`index.html`, `styles.css`, `sw.js`). Risico: per ongeluk een mockup bewerken i.p.v. de echte app. `README.md` is leeg.
*Aanpak.* Verplaats schetsen naar `mockups/` (en presentaties naar `docs/presentaties/`); commit wat bewaard moet, verwijder pure wegwerp-schetsen. Vul `README.md` met "wat is wat" (welke bestanden zijn live). Controleer `.vercelignore`/`.gitignore`.
*Klaar wanneer.* De root toont alleen live bestanden + heldere mappen; de app deployt en draait ongewijzigd.

**Punt 11 — `render-lijsten.js` splitsen.**
*Probleem.* Eén bestand (795 regels, `src/render-lijsten.js`) bevat 6 schermen: NTD, de hele offerte-motor (~`190-364`), Afgerond, ALV-overzicht incl. een directe Sheets-`fetch` in `toggleAlvoFlag` (`496-547`), ALV-afgerond, en de generieke tabel/paginering. Wijzigingen hier zijn risicovol (offerte-edit zit naast ALV-schrijfactie).
*Aanpak.* Zuivere verplaats-refactor (geen gedragswijziging): `render-offerte.js` (offerte-render + aannemerspanelen + Vandaag-paneel), `render-alv.js` (ALVO/ALFA + `toggleAlvoFlag`), `render-tabel.js` (`renderThead/Tbody/Pag/rowNtd/rowAf`). `renderNtd` blijft klein in het resterende bestand. Verwijder en passant de dode `_inPeriod`/`_weekIndex` (geen aanroepers).
*Klaar wanneer.* Alle tests groen; de app is functioneel identiek (geen zichtbaar verschil); imports kloppen.

---

### Batch E — Dagstart & offerte (punten 5 + 7 + 8)

**Punt 5 — afhandel-knop op Vandaag.**
*Probleem.* "Doe dit eerst"-rijen hebben alleen `data-action="vve-open"` (`src/render-vandaag.js:25-31`) — elke afhandeling vereist eerst het hele dossier openen. In de Oppakken-lijst bestaat de icoonrij (afronden/wegleggen) al (`src/render-lijsten.js:668`) en de acties bestaan (`src/actions.js:41,49`).
*Aanpak.* Voeg op elke Vandaag-rij icoon-knoppen toe (minimaal afronden + wegleggen) die `taak-afronden`/`taak-wegleggen` hergebruiken. Voorkom klik-doorslag (knop-klik mag de rij-`vve-open` niet triggeren).
*Klaar wanneer.* Vanaf Vandaag kun je een taak afronden/wegleggen zonder het dossier te openen; de rij-klik (dossier openen) blijft werken.

**Punt 7 — mobiele layout Vandaag.**
*Probleem.* Geen `@media`-regels voor `.vd-*`; op smal scherm behoudt `.vd-reden` (`flex-shrink:0; nowrap`) zijn breedte en knijpt `.vd-actie` tot "…" (`styles.css:782-784`). Op mobiel lees je dan de reden wél, het actiepunt niet.
*Aanpak.* Eén media-query die `.vd-top` op smal scherm naar kolom zet (actiepunt boven, reden eronder).
*Klaar wanneer.* Op mobiele breedte is het volledige actiepunt leesbaar.

**Punt 8 — offerte één-klik "ontvangen"/"gegund".**
*Probleem.* De motor volgt alleen mee bij fase-overgang, maar er is geen één-klik "ontvangen" (fase→`ontvangen`) of "gegund" (fase→`gegund`). "Ontvangen" gebeurt nu alleen indirect via aannemer-vinkjes (`src/util.js:145-150`); "gegund" heeft géén actie (`src/actions.js:51-61`) → gegunde trajecten blijven eeuwig in "Nu opvolgen" hangen, of de beheerder moet handmatig `gegund` typen.
*Aanpak.* Voeg één-klik-acties "Offerte ontvangen" en "Gegund" toe in de offerte-UI; schrijf de fase naar kolom O via de **gewaarborgde write uit Batch C**. Respecteer de `OFFERTE_FASES`-witlijst. (Optioneel binnen deze batch: de "eerlijke stil-teller" — toon en drempel in dezelfde tijdseenheid; offerte-review-punt #2.)
*Klaar wanneer.* Vanaf de offerte-tab markeer je in één klik "ontvangen"/"gegund"; "gegund" haalt het traject uit "Nu opvolgen".

---

### Batch F — AI-chat (punt 9)

**Probleem.** Elke vraag stuurt de volledige gespreksgeschiedenis opnieuw mee (`src/dossier-chat.js:121`, geen `slice`) plus de hele dossiercontext; alleen `max_tokens:1024` begrenst het antwoord, niet de invoer. De enige kostenrem is het $5-prepaidplafond. De chat opent leeg zonder hulp (`src/dossier-chat.js:104`). De allowlist staat dubbel: `api/chat.js:4` én `src/config.js:33` — bij personeelswissel makkelijk één vergeten.

**Aanpak.**
- **Kostenrem in ontwerp:** begrens de meegestuurde geschiedenis tot de laatste ~8 berichten en cap de lengte van de dossiercontext-tekst.
- **Voorbeeldvragen:** toon in de lege chat 2-4 klikbare suggestie-chips ("Wat staat er nog open?", "Wanneer was de laatste ALV?", "Welke offertes lopen er?").
- **Allowlist op één plek:** haal de e-maillijst uit één gedeelde bron die zowel `api/chat.js` als `src/config.js` gebruiken.
- *(Optioneel)* lichte opmaak van antwoorden (regelafbrekingen/bullets) i.p.v. rauwe tekst, met behoud van HTML-veiligheid.

**Klaar wanneer.** Een lang gesprek stuurt niet de volledige historie mee; voorbeeldvragen verschijnen en werken; de allowlist wijzig je op één plek.

## 5. Vastgelegde beslissingen

- **Batch-volgorde:** A → B → C → D → E → F (door beheerder bevestigd).
- **Nieuwe versie (punt 1):** subtiel "Nieuwe versie — herladen"-balkje, geen auto-reload.
- **Trap-2-escalatie (punt 6):** teambrede melding (behandelaar + alle collega's) via `cd_notifyByTag`.
- **Punt 4** (weggelegde taken filteren) blijft bewust buiten scope; huidig gedrag behouden.

## 6. Risico's & aandachtspunten

- **Apps Script handmatig.** Batch B vereist plakken in de editor + autorisatie; een live webhook-/escalatietest kan pushmeldingen naar het team sturen — test bewust (zie [[project_mail_intake_motor]]-les).
- **Refactor zonder net.** De splitsing (punt 11) mag geen gedrag wijzigen; de testsuite + een visuele controle zijn het vangnet. Doen vóór Batch E zodat die functies in schone bestanden landen.
- **Write-guard (punt 2)** dekt de resync-race client-side; volledige bescherming tegen gelijktijdige handmatige Sheet-bewerking vraagt server-side verificatie (later).
- **Volgorde is bewust:** A maakt dat alle latere fixes de gebruiker bereiken; B+C zetten het vangnet; D maakt het fundament schoon; E levert de zichtbare winst; F sluit af.

## 7. Niet in scope

Punt 4 (weggelegde taken filteren), mail-intake, en grotere her-render/performance-herzieningen (review-punt code #3) — die laatste alleen aanstippen, niet uitvoeren, tenzij later apart gekozen.
