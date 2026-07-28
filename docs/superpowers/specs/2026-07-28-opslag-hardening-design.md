# Opslag-hardening: back-up, rij-identiteit, schrijfzekerheid, leeslast

**Datum:** 2026-07-28
**Status:** ontwerp, goedgekeurd door gebruiker
**Versie na uitrol:** loopt over meerdere releases (start APP_VERSION 9.3 / CACHE_VERSION cd-v88)

## Aanleiding

Op verzoek van de gebruiker is de opslaglaag van het dashboard doorgelicht: "wat voor
zwakke punten heeft ons dashboard als het aankomt op opslag". Dat leverde negen punten op.
De gebruiker heeft daarop gevraagd ze allemaal aan te pakken.

Daarna is een onderzoek gedraaid van veertien agents: zeven die per gebied de
oplossingsrichtingen tegen de echte code uitzochten, en zeven die elk voorstel adversarieel
tegen diezelfde code probeerden te weerleggen. **Alle zeven voorstellen kwamen terug als
"aanpassen".** Dit ontwerp is de gecorrigeerde uitkomst; de belangrijkste correcties staan
expliciet in de tekst, zodat ze niet stil terugsluipen tijdens het bouwen.

## Beslissingen

Genomen in het gesprek van 2026-07-28:

| # | Vraag | Besluit |
|---|-------|---------|
| 1 | Waar landt de back-up? | **Dagelijkse kopie in een aparte Drive-map**, met retentie |
| 2 | Mag de Sheet-indeling wijzigen voor een vast taaknummer? | **Ja** — maar mechanisme (verborgen kolom vs. regel-metadata) wordt met een proef bepaald |
| 3 | Hoe ver gaat offline? | **Kijken kan, wijzigen wordt geblokkeerd**; geen offline-schrijfwachtrij |
| 4 | Wat doen we met de bewerkrechten op de Sheet? | **Schrijfpad blijft; wel opschonen wie mag bewerken en periodiek bewaken** |
| 5 | Volgorde van de fases? | **Vangnet eerst** (back-up), dan schrijfzekerheid, dan pas de verbouwing |

## Bevindingen die het ontwerp sturen

Feiten die tijdens het onderzoek op de echte code én de productie-Sheet zijn vastgesteld.
Zij zijn de reden dat dit ontwerp afwijkt van de eerste, intuïtieve aanpak.

### Correcties op de eerste analyse

| Eerste aanname | Werkelijkheid |
|---|---|
| Logboek ~2.100 regels, Afgerond ~1.200 | Dat waren **rastergroottes**. Gevuld: Logboek tot ±regel 1.200, Afgerond tot regel 224 |
| Afgerond is een zware post per poll | Afgerond is verwaarloosbaar (~224 regels). Het Logboek is ~330 KB van ~430 KB per poll |
| Testsuite ≈ 466 asserts | ≈ **641** `eq()`/`truthy()`-aanroepen. Bron van waarheid is `window._testResult`, niet een geteld getal |
| `veiligeCel` remt alle frontend-writes | Alleen `writeRange`/`appendRange`. De 15 `batchUpdate`-routes lopen erlangs |
| 17 mutatie-callsites | **29** (15 `batchUpdate` + 14 `writeRange`/`appendRange`), waarvan 19 via `backgroundWrite` |

### Afwijkingen in de productie-Sheet (nu al aanwezig)

1. **Onzichtbare taken.** In `OFFERTE-TRAJECTEN` staat op regel 47 een datarij (VvE 311198)
   op de plek waar `parseSections` de kolomkoprij verwacht (`src/data.js`, `colHeaderRow`).
   Die regel wordt onvoorwaardelijk als kop gelezen en verdwijnt uit de lijsten, de
   urgentie-motor, de te-laat-tellingen en `cd_checkDeadlines`. Bij een tweede sectie speelt
   hetzelfde (regel 29). `apps-script/Opvolging.gs:234-238` documenteert dit fenomeen al
   ("zoekt daarom 1-3 rijen ver") — de frontend doet dat niet.
2. **Lege regel midden in een sectie.** Regel 52 in `OFFERTE-TRAJECTEN` is leeg.
   `cd_createTaskRow` (`apps-script/Notifications.gs:661-668`) zoekt zijn invoegpositie vanaf
   kop+2 tot de **eerste lege cel in kolom A** — nieuwe taken uit de herhaalmotor en de
   mail-intake belanden daardoor midden in de lijst in plaats van onderaan, en verschuiven
   alle regels eronder buiten het dashboard om.
3. **Dubbele VvE-codes binnen één sectie.** O.a. regels 67/68 (verschillen alleen in kolom G)
   en het blok rond 121034. Dit is precies de situatie waarin de huidige guard op kolom A
   geen onderscheid maakt.

### Structurele bevindingen

- **Niet-atomair ongedaan maken is het grootste dataverlies-risico.**
  `undoComplete`/`undoDelete` (`src/notifications.js`) verwijderen éérst de regel uit
  `Afgerond` en doen dán `insertAndWriteRow` in `Nog Te Doen`; `bulkUndoAfronden`/
  `bulkUndoVerwijderen` (`src/bulk.js`) idem. Een onderbreking daartussen laat de taak in
  **geen van beide** lijsten achter. Deze paden lopen bovendien buiten `_writeChain` en
  buiten `pendingWrites`.
- **De ALV-resetknop** (`src/alv-reset.js`) archiveert en wist alle vlagkolommen volledig
  buiten de schrijfteller — de meest destructieve actie in de app is onzichtbaar voor elke
  status- of waarschuwingsmaatregel.
- **Schrijfwegen zonder token-guard die hun fout opeten:** `logEvent`
  (`src/render-overig.js`), `queueNotif` en `sendTestNotif` (`src/notifications.js`).
  Een grep op `ensureToken` vindt die per definitie niet.
- **`logEvent` wordt in vrijwel alle `writeFn`s niet ge-await** (o.a. `src/crud.js`,
  `src/snooze.js`, `src/render-herhaal.js`, `src/bulk.js`): de teller valt naar 0 en de
  resync start terwijl de logboek-append nog loopt.
- **Twee verschillende append-mechanismen schrijven het Logboek:** de frontend doet
  `values.append` op `'Logboek'!A:H` (tabel-detectie binnen A:H), Apps Script doet
  `sheet.appendRow()` na `getLastRow()` over alle 26 kolommen. Die kunnen op verschillende
  regels uitkomen zodra er ooit iets in kolom I+ belandt.
- **`appsscript.json` bevat geen expliciete `oauthScopes`;** de scopes worden uit de code
  afgeleid. Er komt nergens `DriveApp` of `openById` voor. Drive-toegang toevoegen aan het
  gebonden project **is** dus een scope-uitbreiding → herautorisatie → tot dat gebeurt
  vallen `cd_checkDeadlines`, `cd_dailySummary`, `cd_sweepNotifQueue` en
  `cd_opvolgingMotor` stil.
- **`cd_onNotifQueueChange` is een onChange-trigger en vuurt óók bij API-writes**
  (`apps-script/Notifications.gs:575-576`). Elk nieuw tabblad en elke append in de
  PROD-Sheet maakt dus `cd_drainNotifQueue` wakker, die de document-lock neemt.
- **`state` zit in modulescope**; er staat niets op `window` behalve `OneSignalDeferred`.
  Metingen via de console moeten via een dynamische `import()`.
- **`logout()` wist alleen sessionStorage** (`src/auth.js`). Er is vandaag geen enkele
  opruimweg voor localStorage-inhoud.
- **Het OAuth-token heeft de volle `spreadsheets`-scope** en staat in sessionStorage: het
  geeft schrijfrechten op élke spreadsheet waar die persoon bij kan, niet alleen op dit
  bestand.
- **Het Logboek is bewerkbaar en verwijderbaar vanuit het dashboard**
  (`src/render-overig.js`). Het is daarmee een werkspoor, geen auditspoor.
- **De sectievolgorde in `Afgerond` wijkt bewust af van `SKEYS`**
  (`apps-script/Code.gs` zet OPPAKKEN, VERGADERVERZOEKEN, LOD, OFFERTE-TRAJECTEN;
  `src/config.js` heeft OPPAKKEN, VERGADERVERZOEKEN, OFFERTE-TRAJECTEN, LOD). Een controle
  die volgorde meeneemt zou vanaf dag één vals alarm slaan.
- **Een leeg `rows`-array is dubbelzinnig:** `fetchSheets` geeft `[]` terug voor een leeg
  én voor een ontbrekend tabblad, en de terugvaltak vangt vier tabbladen af met
  `.catch(()=>[])`. "Leeg" is dus geen bewijs van schade.
- **Er staat geen installer voor `sorteerOfferteTrajecten` in de repo.** De geïnstalleerde
  triggers volgens de repo zijn `cd_recalcPrioriteiten`, `cd_onEditChange`,
  `cd_checkDeadlines`, `cd_dailySummary`, `cd_onNotifQueueChange`, `cd_sweepNotifQueue` en
  `cd_opvolgingMotor`. Of de legacy onEdit-triggers echt draaien — en onder welk account —
  is **onbekend** en moet vastgesteld worden vóór fase 4.

---

## Fase 0 — Nulmeting en opruiming

**Doel:** de onbekenden wegnemen waar latere fases op leunen, en de bestaande afwijkingen
in de Sheet herstellen. Geen code, geen deploy.

1. **Trigger-inventarisatie.** In de Apps Script-editor van het PROD-project vastleggen
   welke triggers werkelijk geïnstalleerd zijn en onder welk account. Uitkomst vastleggen in
   `apps-script/README.md`. Dit bepaalt of er rijen buiten het dashboard om verschuiven en
   of fase 4 extra bescherming nodig heeft.
2. **Drive opschonen.** Nalopen wie het bestand mag bewerken, oude deellinks intrekken,
   uitkomst vastleggen. Dit is besluit 4.
3. **Sheet-afwijkingen herstellen** (na handmatige kopie vooraf): verdwaalde datarijen 47 en
   29 onder hun kolomkoprij zetten, lege regel 52 verwijderen.
   **Gevolg dat vooraf besproken moet worden:** twee nu-onzichtbare taken worden zichtbaar,
   inclusief hun deadlines, te-laat-status en deadline-notificaties.
4. **Metingen.** Werkelijke poll-omvang en cachegrootte vaststellen via
   `(await import('./src/state.js')).state._lastDHash?.length` op het live dashboard, ná de
   eerste geslaagde poll. Rekening houden met ~20-30% escaping-groei en 2 bytes per teken
   bij een latere opslagkeuze.

**Testbaarheid:** visuele controle in het dashboard dat de twee taken verschijnen en dat de
sectietellingen kloppen; `?test=1` moet ongewijzigd blijven.

---

## Fase 1 — Back-up en herstel

**Doel:** twee onafhankelijke, geteste herstelwegen.

### Aanpak

**Een apart, niet-gebonden Apps Script-project** onder `info@vvebeheercollectief.nl`.

*Waarom apart en niet in `apps-script/`:* een `DriveApp`-scope in het gebonden project
dwingt herautorisatie af, en tot dat gebeurt vallen de bestaande tijdgestuurde triggers
stil. Daarnaast pusht `clasp push --force` de hele map naar zowel het TEST- als het
PROD-script, wat dubbele retentie op dezelfde map zou opleveren. Het beveiligingsargument
dat eerder is aangevoerd ("Drive-rechten achter de anonieme doPost") is **onjuist** en wordt
niet gebruikt: `doPost` roept uitsluitend `cd_processNotifEvent` aan, een scope is geen
bereikbaar oppervlak.

- Tijdgestuurde trigger, dagelijks (nacht): `DriveApp.getFileById(SID_PROD).makeCopy(...)`
  naar een **aparte Drive-map**.
- Naamgeving: vaste prefix + ISO-datum, bv. `BACKUP Collectief Dashboard 2026-07-28 — NIET BEWERKEN`.
- Retentie: laatste **14 dagelijkse** + de **oudste kopie per maand** van de laatste 12
  maanden. Bewust "oudste per maand" en niet "die van de 1e": een overgeslagen trigger-run
  zou anders een maand definitief leeg laten.
- Opruimen uitsluitend binnen die ene map, uitsluitend op de strikte naam-regex, met
  `setTrashed(true)` — nooit hard verwijderen (prullenbak = 30 dagen genadetijd).
- **Geen `Back-up-log`-tabblad in de PROD-Sheet.** Dat zou via `cd_onNotifQueueChange` elke
  nacht `cd_drainNotifQueue` wakker maken. De laatst geslaagde back-up komt in
  `PropertiesService` van het **losse** project; dat project doet ook zelf de leeftijdscheck.
- **Fouten niet opslokken.** Het `cd_safeRun`/`cd_lockedRun`-idioom is hier expliciet
  ongewenst: een doorgegooide fout levert Google's eigen storingsmail aan de eigenaar op —
  dat is het alarm. Setup-idioom volgt `cd_installeerOpvolgingTrigger` (Logger.log), niet de
  varianten met `SpreadsheetApp.getUi().alert()` — die bestaat in een los project niet.
- Alarmeert het project tóch in de Sheet, dan **één** aanroep (`cd_schrijfMelding` óf
  `cd_notifyByExternalId` — de tweede doet de eerste al) en alleen bij een echt alarm.
  Bewuste eigen tag, niet aan de `n_daily`-voorkeur hangen.

**Wekelijkse XLSX-export** naar een tweede plek buiten Drive, als onafhankelijke tweede
herstelweg (dekt het scenario "account of Drive kwijt").

**Herstel-draaiboek** in gewone taal. **Niet in de openbare repo** — het zou script-id's,
Script Property-namen en de overnameprocedure prijsgeven. Locatie: de back-upmap zelf.

**Herstel-oefening:** één keer echt terugzetten, op de TEST-omgeving. Let op: `SID_TEST`
tijdelijk omzetten vraagt een commit naar `staging` en verandert de staging-frontend die de
gebruiker mogelijk parallel gebruikt — dat vooraf afstemmen.

**Wat we niet doen:** de back-upcode in het bestaande gebonden project (zie hierboven).

**Testbaarheid:** handmatige testfunctie in het losse project (idioom `cd_testMotor`);
controle dat er na een run precies één nieuw bestand in de map staat; retentie-simulatie op
verzonnen bestandsnamen; de herstel-oefening zelf is de acceptatietest.

---

## Fase 2 — Eerlijke opslagstatus en veilig ongedaan maken

**Doel:** geen bevestiging meer die niet waar is, en geen actie meer die halverwege kan
afbreken.

### 2a — Alles onder één schrijfteller

Eén omhulsel (werktitel `metWriteMarkering(fn)`) dat `pendingWrites` op- en aftelt met een
**start**-tijdstempel, en dat óók om de paden heen gaat die er nu buiten vallen:
`undoComplete`/`undoDelete`, `bulkUndoAfronden`/`bulkUndoVerwijderen`, `undoDeleteLog`,
`undoOntwDelete`, `submitOntwItem` en de ALV-reset. Zonder deze stap is een "eerlijke"
statusbalk alleen een geloofwaardiger onwaarheid.

In dezelfde stap: de niet-ge-awaite `logEvent`-aanroepen afwachten, zodat "klaar" niet
structureel te vroeg komt.

### 2b — Statusbalk vertelt de waarheid

`Opslaan…` in de bestaande statusbalk zolang er iets loopt; de groene bevestiging pas ná
succes. Patroon om te kopiëren: `addTaskNote` (`src/render-overig.js`) schrijft eerst,
controleert de returnwaarde en toont pas daarna.

Drie valkuilen die meegenomen moeten worden:
- **Undo-toasts blijven staan waar ze staan.** Alleen de kale "Opgeslagen"/"Taak
  toegevoegd"-toasts verhuizen naar ná de write.
- **Toast-ontdubbeling omzeilen** voor opslagbevestigingen (`TOAST_DEDUP_MS`, 15 s op
  title+msg) — anders slikt hij juist de bevestiging in bij herhaald opslaan.
- **OS-notificatie onderdrukken** voor deze toasts: `showToast` vuurt een systeemmelding als
  het venster niet in focus is — precies het scenario waarvoor deze maatregel is bedoeld.
- **Guard in `setSynced`/`data.js`:** een handmatige Vernieuwen-klik zet nu `Live · HH:MM`
  over de nieuwe stand heen.

### 2c — Ongedaan maken wordt onbreekbaar

Volgorde omdraaien (eerst terugzetten, dan weghalen) of beide in één `batchUpdate`, zodat
een onderbreking nooit "uit beide lijsten" oplevert.

### 2d — Waarschuwing bij sluiten

`beforeunload` zolang er een write loopt, met het tijdstempel bij het **starten** van de
write, niet bij het in de wachtrij zetten (de wachtrij is serieel; een wachtende bulk-write
zou anders onterecht als "te oud" gelden). Eerlijk over de reikwijdte: werkt op de desktop,
op telefoon/PWA nauwelijks.

### 2e — Guardloze schrijfwegen

`logEvent`, `queueNotif` en `sendTestNotif` krijgen een echte foutmelding in plaats van hun
fout op te eten.

### Meeliftende kleine winst

`_veiligeRij` ook toepassen op de `values:batchUpdate`-route in `src/bulk.js` (nu de enige
`USER_ENTERED`-write zonder formule-rem).

**Wat we niet doen:** een persistente schrijfwachtrij die openstaande writes bij het
opstarten opnieuw uitvoert. Vrijwel elke schrijfactie hangt aan een regelpositie die op het
moment van klikken is vastgelegd; die later afspelen is een manier om de verkeerde regel te
overschrijven. Een "kluis" die openstaande voornemens alleen **bewaart en meldt** (nooit
automatisch afspeelt) mag als latere, aparte stap terugkomen — pas ná fase 4.

**Testbaarheid:** `src/tests.js` asserteert al de exacte `pendingWrites`-overgangen rond
`toggleAlvoFlag`; die tests zijn de regressiebewaking en moeten meegroeien, niet wijken.
Nieuwe pure helpers los testbaar houden.

---

## Fase 3 — Structuurbewaking

**Doel:** structurele beschadiging vroeg zien in plaats van pas als het dashboard raar doet.
Deze fase is **uitsluitend waarnemend** en kan per definitie niets kwijtmaken.

Nieuwe module `src/structuurcheck.js` met pure, los testbare functies:

1. **Sectiecontrole** na elke lading: verwachte sectiekoppen aanwezig, geen datarijen tussen
   sectiekop en kolomkoprij, geen rijen buiten een sectie.
   **Sectievolgorde niet meenemen** — `Afgerond` wijkt bewust af van `SKEYS`.
   **Leeg ≠ schade** — een leeg `rows`-array kan ook een leesfout of ontbrekend tabblad zijn.
2. **Rasterbreedte-verwachtingstabel**, afgeleid uit de code met de bewijs-callsite per
   regel: `Nog Te Doen` ≥16, `Afgerond` ≥12 (A:L — **niet** 16), `Herhaalregels` ≥12,
   `Kenmerken` ≥6, `Ontwikkeling` ≥6, `Logboek` ≥8, `Notif-wachtrij` ≥4,
   `ALV's overzicht` ≥7, `ALV's afgerond` ≥3.

**Uitrol in twee trappen:** eerst een periode alleen naar `console.log` op live data. Pas
een zichtbare banner zodra het aantal bevindingen op gezonde data aantoonbaar nul is —
anders leert de gebruiker de melding negeren. De banner mag de bestaande laadfout-banner
niet kapen. De controle draait niet als `loadAll` vroegtijdig terugkeert wegens lopende
writes; dat is acceptabel en wordt vastgelegd.

**De dagelijkse Apps Script-structuurcontrole wordt uitgesteld**, niet "later gedaan":
zoals bedacht komt de bevinding bij niemand aan (de toast-poll onderdrukt bij elke
paginalading alle bestaande meldingen, en de logregel wordt door `logPaginaSoort`
weggefilterd). Hij vereist dus eerst een frontend-wijziging en hoort daarmee ná fase 3.

**Uitrolregel:** `src/structuurcheck.js` moet in `APP_SHELL` van `sw.js` (48 items, alle
modules staan er met de hand in).

---

## Fase 4 — Vast taaknummer

**Doel:** rij-positie is niet langer de identiteit van een taak.

### Voorwaarden vooraf

- Fase 1 moet live en **beproefd** zijn. Dit is de enige fase die de productiegegevens zelf
  aanraakt.
- De trigger-inventarisatie uit fase 0 moet af zijn. Draait er een sorteer-trigger die maar
  een deel van de kolommen meesorteert, dan zou een nummer in een hoge kolom na één
  sortering bij de verkeerde regel horen — en dan schrijft de guard mét overtuiging fout.
  *Let op: dit is een **voorwaarde**, geen vastgesteld feit — er staat geen installer voor
  die trigger in de repo, en een onEdit-trigger vuurt sowieso niet op API-writes.*

### Proefopstelling eerst

Eén dag op de TEST-Sheet, twee mechanismen naast elkaar, daarna keuze voorleggen:

| | Verborgen kolom (bv. Q) | DeveloperMetadata op de rij |
|---|---|---|
| Zichtbaar in de Sheet | ja (verbergbaar) | nee |
| Rasterverbreding 16→17 nodig | ja | nee |
| Zichtbare backfill over productiedata | ja | nee |
| Schuift mee bij invoegen/verwijderen | alleen via sortering-discipline | ja, automatisch |
| API-complexiteit | laag (`values.get`) | hoger (`batchUpdateByDataFilter`) |
| Bewezen in dit project | nee | nee |

### Tussenmaatregel tot dan

De guard verbreden van alleen kolom A naar de **al bestaande volledige serialisatie**
(`serializeNtdUndo` / `_ntdValues`, A..P — dezelfde die `_herankerRij` gebruikt en die al
getest is), met expliciete normalisatie van:
- ontbrekende cellen → `''` (`values.get` kapt afsluitende lege cellen én lege rijen af;
  in het gelezen bereik leverde regel 53 maar 6 waarden en regel 52 een lege array),
- `'TRUE'`/`'FALSE'`-erfenis,
- datumkolommen: uitsluiten óf vergelijken via `_parseAnyDate`, nooit tekstueel — het
  dashboard schrijft `17-06-2026` terwijl `values.get` `17 juni 2026` teruggeeft.

**Eerlijk over de grens:** een vingerafdruk-guard die matcht, schrijft. Bij écht identieke
regels doet hij dat fout, stil. Alleen een uniek nummer (of her-lokalisatie met weigering
bij meerdere kandidaten) sluit dat helemaal. Dit is een tussenmaatregel, geen eindstation.

**Omvang:** 18 `assertRowsMatch`-callsites in 9 bestanden; elke aanroeper bouwt zijn eigen
`{row, code}`-objecten, dus elke callsite moet mee. Inspanning: **middel**, niet klein.

---

## Fase 5 — Leeslast en offline

**Doel:** de leeslast ontkoppelen van de historie, en offline eerlijk maken.

### 5a — Gelaagd ophalen

- **Snelle groep (8 s):** `Nog Te Doen`, `ALV's overzicht`, **`Afgerond`**.
  Afgerond hoort er nadrukkelijk bij: het is het enige tabblad met een positionele
  `deleteDimension` zónder rij-guard, en de invoegpositie wordt volledig uit `D.af._row`
  afgeleid. Kosten: ~224 regels, verwaarloosbaar.
- **Trage groep (bv. 60 s):** `ALV's afgerond`, `Ontwikkeling`, `Logboek`, `Herhaalregels`,
  `Kenmerken` — alle vier met een eigen guard (titel, id, code, timestamp).
- **Uitpakken op naam, niet op index.** Een overgeslagen tabblad moet zijn vorige data
  **behouden**, niet overschreven worden met een lege lijst.
- **Eerlijk over het risico:** minder vaak lezen verlengt het TOCTOU-venster op de trage
  tabbladen van 8 s naar 60 s. Beheersbaar met guards, maar niet nul — daarom ná fase 4.
- Bestaande test-stub die op een hardgecodeerde array van acht `valueRanges` leunt moet mee.

### 5b — Incrementeel staart-lezen van het Logboek

Volledig bij start, daarna alleen nieuwe regels. Van ~330 KB naar <1 KB per poll, en dat
blijft zo bij 6.000 of 20.000 regels. Aandachtspunt: `D.logboek` bevat optimistische regels
met `_row: 0`; ontdubbeling is een ontwerpeis, geen testpunt achteraf.

*Optioneel, goedkoop:* de aparte Meldingen-poll kost 6 van de 13,5 leesverzoeken per minuut
en haalt het hele tabblad op. Dat is de goedkoopste resterende winst.

### 5c — Zichtbare offline-toestand

Schrijven wordt geblokkeerd **vóór** de optimistische mutatie, niet erna teruggedraaid.

- **Signaal:** `navigator.onLine === false` plus een **eigen** netwerkteller die alleen
  ophoogt bij een echte netwerkfout, en die na elke geslaagde read op 0 gaat.
  **Uitdrukkelijk niet `state._syncFails`:** die telt ook mislukte inlogpogingen, 401/403 en
  quota-fouten — in een quotum-incident zou het dashboard zichzelf op slot zetten precies
  wanneer het zich zou herstellen.
- **Inventarisatie via de schrijf-primitieven,** niet via `ensureToken`:
  `grep -rn "writeRange\|appendRange\|batchUpdate" src/*.js` en elke callsite afvinken.
  Twee plekken muteren/renderen vóór de guard en moeten omgedraaid
  (`src/offerte-aannemers.js`, `src/kenmerken.js`).
- **Geen blijvende `state.offline`-vlag** die de bestaande tests niet terugzetten; de
  toestand wordt live berekend.
- Knoppen dempen met een **gescopete** class, niet body-breed (de `[hidden]`-cascade-les en
  de focus-ring-val uit het compacte-statkop-werk).

### 5d — Leescache (pas na meting)

- Sleutel gekoppeld aan **`APP_VERSION`** én aan het **e-mailadres** van de gebruiker
  (localStorage is origin-gebonden, niet gebruiker-gebonden; anders ziet collega B eerst de
  stand van collega A).
- **`logout()` wist de cache** — vandaag wist die alleen sessionStorage.
- `D` heeft **10** eigenschappen; `ntdSecInfo`/`afSecInfo` zitten niet in de hash maar
  worden wél door het schrijfpad gebruikt. Zonder die twee valt de invoegpositie terug op
  regel 2 en belandt een nieuwe taak bovenaan `Nog Te Doen` in plaats van in zijn sectie.
  Ze moeten dus mee in de cache.
- `D.ntd`/`D.af` zijn objecten per sectie, geen arrays.
- De logboeklijst mag niet hersorteerd, gecomprimeerd of ontdubbeld worden: `parseLogboek`
  keert de lijst om en filtert `Bewerkt` eruit terwijl `_row` bewust de **ruwe** Sheet-index
  houdt — daar hangt bewerken/verwijderen van logregels aan.
- Verwacht winst in comfort, niet in offline-vermogen: bij een koude start is inloggen
  netwerkafhankelijk.

**Wat we niet doen:** een offline-schrijfwachtrij; en de service worker blijft
**network-first** (cache-first is eerder door de gebruiker afgewezen).

---

## Bewust niet

| Maatregel | Reden |
|---|---|
| Logboek automatisch snoeien (`MELDING_MAX`-idioom) | Het stil-signaal en de escalatie lezen "laatste activiteit"; historie weghalen zet die stil op groen |
| Jaarlijkse logboek-archivering | Zelfde bezwaar, tenzij mét export naar een apart bestand; pas veel later |
| Alle writes achter een server, gebruikers alleen-lezen | 29 callsites, geen CI voor de frontend-tests, Web App-redeploy-valkuil; en het lost het gestelde probleem maar half op |
| Back-upcode in het gebonden Apps Script-project | Scope-uitbreiding legt de bestaande triggers stil tot herautorisatie |
| Harde rasterwachter vóór elke write | Opbrengst weegt niet op tegen het risico; de meeste gevaarlijke writes lopen niet via `writeRange` |
| Beveiligde bereiken in de Sheet | Faalt stil zodra een Apps Script-trigger hem raakt, en bindt de eigenaar niet |
| Cache-first service worker | Eerder door de gebruiker afgewezen |
| Offline schrijven met wachtrij | Positionele writes later afspelen = de verkeerde regel overschrijven |

## Restrisico's die dit ontwerp niet wegneemt

- Het OAuth-token heeft de volle `spreadsheets`-scope; een XSS in het dashboard reikt
  verder dan dit ene bestand. Een smallere scope bestaat niet voor deze API-vorm.
- Het Logboek blijft bewerkbaar en verwijderbaar en is dus geen auditspoor.
- Drie van de vier toegestane accounts zijn privé-Gmail-adressen: geen centrale intrekking,
  geen Drive-auditlog over die accounts.

## Doorlopende regels per stap

- `APP_VERSION` (`src/config.js`, nu 9.2) ophogen **en** `CACHE_VERSION` (`sw.js`, nu
  cd-v87) bumpen bij elke frontend-wijziging.
- Elke nieuwe module expliciet toevoegen aan `APP_SHELL` in `sw.js` (48 items).
- Uitrolroute: `staging` → testen → `main`. Niet kaal mergen (staging is divergent).
- Tests: `?test=1` lokaal én op staging; `window._testResult` vergelijken met de waarde
  vóór de wijziging — **niet** met een geteld getal.
- Datums die naar de Sheet gaan: Nederlandse notatie via het bestaande idioom; nooit een
  rauw `Date`-object (dat komt terug als long-date).

## Openstaande punten

1. **Mechanisme voor het taaknummer** — uitkomst van de proef in fase 4, aan de gebruiker
   voor te leggen.
2. **Bestemming van de wekelijkse export** — welke tweede plek buiten Drive.
3. **Moment van de herstel-oefening** — die verandert tijdelijk de staging-omgeving.
