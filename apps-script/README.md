# Apps Script — bron van waarheid voor het live project

Dit is de **broncode** van de Google Apps Script die bij de spreadsheet hoort
(Sheets-gebonden project, in de Apps Script-editor heet dit "Afgerond script").
Geen back-up meer: wat hier in de repo staat, wordt automatisch uitgerold.

## Automatische deploy (clasp + GitHub Action)

`.github/workflows/apps-script-deploy.yml` rolt deze map uit met `clasp push --force`
zodra er iets in `apps-script/**` (of in de workflow zelf) wijzigt:

| Aanleiding | Doel-script |
| --- | --- |
| push naar `main` | **PRODUCTIE** (`PROD_SCRIPT_ID`) |
| push naar `staging` | **TEST** (`TEST_SCRIPT_ID`) |
| `workflow_dispatch` op `main` | **PRODUCTIE** |
| `workflow_dispatch` op een andere tak | **TEST** |
| push naar een feature-tak | *niets* — de Action luistert alleen op `main` en `staging` |

De keuze valt op `github.ref_name == 'main'`: alles wat niet `main` is, gaat naar TEST.
Een feature-tak testen doe je dus met **Actions → Apps Script uitrollen → Run workflow**
op die tak; dat schrijft naar het TEST-script.

> ⚠️ **Niet handmatig in de editor plakken.** `clasp push --force` overschrijft het
> hele script bij de volgende deploy, dus een editor-wijziging is stil weg zodra iemand
> iets in `apps-script/**` pusht. Wijzig hier, commit, push.

### Let op: een README-only commit deployt ook

De path-filter is `apps-script/**`, dus ook een wijziging in dít bestand vuurt de Action
af. `clasp` pusht alleen `.gs`/`.js`/`.html`/`appsscript.json` — de README gaat niet mee,
dus de deploy is een no-op: dezelfde code wordt opnieuw gepusht.

Dat is bewust zo gelaten. De filter aanscherpen tot `apps-script/**.gs` +
`apps-script/appsscript.json` scheelt een overbodige run van een minuut, maar levert een
stille mis op zodra hier ooit een `.html`- of `.js`-bestand bij komt: dan wijzigt er code
die niet wordt uitgerold, en dat merk je pas als iets niet werkt. Een overbodige no-op is
goedkoper dan een gemiste deploy — laat staan tenzij de Action-minuten echt gaan knellen.

## Bestanden (zelfde namen als in de editor)
- `Code.gs` — sheet-automatisering: afgeronde taken verplaatsen, ALV's afhandelen, secties sorteren
- `Notifications.gs` — **OneSignal push-notificaties** + webhook (`doPost`/`doGet`) + trigger-setup
- `Extra functies.gs` — in-app meldingen (`Meldingen`-sheet) + logboek
- `AutoPrioriteit.gs` — dagelijkse auto-prioriteit voor Oppakken (06:00)
- `Opvolging.gs` — fase 4: opvolging, herhaalregels en stille-dossier-escalatie (dagelijks ±06:30)
- `appsscript.json` — manifest (tijdzone, V8, webapp-instellingen); wordt meegepusht

## Triggers

Installeerbaar vanuit de editor:
- `setupNotificationTriggers()` (Notifications.gs) — `cd_onEditChange`, `cd_checkDeadlines`,
  `cd_dailySummary`, `cd_onNotifQueueChange`, `cd_sweepNotifQueue`
- `ap_installeerTrigger()` (AutoPrioriteit.gs) — `cd_recalcPrioriteiten`, dagelijks 06:00
- `cd_installeerOpvolgingTrigger()` (Opvolging.gs) — `cd_opvolgingMotor`, dagelijks ±06:30

**Legacy-triggers staan in géén enkele setup-functie.** `verplaatsAfgerond`, `verplaatsALV`
en `sorteerOfferteTrajecten` (Code.gs) zijn ooit handmatig als `onEdit`-trigger aangemaakt
en worden dus níét meegenomen door een deploy of door de setup-functies hierboven:

| Trigger | PROD | TEST |
| --- | --- | --- |
| `verplaatsAfgerond` | ✅ | ❌ |
| `verplaatsALV` | ✅ | ✅ (handmatig gezet op 2026-07-22) |
| `sorteerOfferteTrajecten` | ✅ | ❌ |

Nieuwe code uitrollen installeert deze triggers niet. Controleer ze via de betreffende
sheet → **Uitbreidingen → Apps Script → wekker-icoon** voordat je op TEST trigger-gedrag
gaat debuggen. En let op: `onEdit` vuurt alleen op echte edits in de Sheets-UI — API-writes
(dashboard, MCP-tools) vuren niets.

## Belangrijk
- Notificaties lopen via **OneSignal** (`cd_sendNotification` in `Notifications.gs`).
  `cd_notifyByTag` / `cd_notifyByExternalId` schrijven óók naar de `Meldingen`-sheet
  (in-app toasts) én sturen een OneSignal-push. Niet verwijderen.
- Alle `.gs`-bestanden delen één globale scope in Apps Script — declareer constanten
  daarom maar in één bestand (geen dubbele `const`-namen over bestanden heen).

## Werkelijk geïnstalleerde triggers (gecontroleerd 2026-07-28)

PROD-script `Afgerond script`, id `1BALy8QbzWr7DbJy_RjYi7m-c6HdNDRs_47ndYcKV_cFIHh6GDR-GicKF`
(bereikbaar via de PROD-Sheet → Uitbreidingen → Apps Script → wekker-icoon). Tien triggers,
állemaal in eigendom van de Sheet-eigenaar `info@vvebeheercollectief.nl` — er draait niets
onder een ander account.

| Functie | Type | Draait als |
|---|---|---|
| `cd_recalcPrioriteiten` | Tijdgebonden (dagelijks ±06:00) | eigenaar |
| `cd_opvolgingMotor` | Tijdgebonden (dagelijks ±06:30) | eigenaar |
| `cd_dailySummary` | Tijdgebonden (dagelijks ±08:30) | eigenaar |
| `cd_checkDeadlines` | Tijdgebonden (elk uur) | eigenaar |
| `cd_sweepNotifQueue` | Tijdgebonden (elke 5 min) | eigenaar |
| `cd_onNotifQueueChange` | Uit spreadsheet — Bij wijzigen (`onChange`) | eigenaar |
| `cd_onEditChange` | Uit spreadsheet — Bij bewerken (`onEdit`) | eigenaar |
| `verplaatsAfgerond` | Uit spreadsheet — Bij bewerken (`onEdit`) | eigenaar |
| `verplaatsALV` | Uit spreadsheet — Bij bewerken (`onEdit`) | eigenaar |
| `sorteerOfferteTrajecten` | Uit spreadsheet — Bij bewerken (`onEdit`) | eigenaar |

De legacy onEdit-triggers (`verplaatsAfgerond`, `verplaatsALV`, `sorteerOfferteTrajecten`)
staan in geen enkele setup-functie, maar draaien op PROD wél degelijk. Er verschuiven dus
rijen buiten het dashboard om (zie fase 4 van
docs/superpowers/plans/2026-07-28-opslag-hardening.md).

In de praktijk staan de vier `onEdit`-triggers stil — hun kolom "Laatste keer uitgevoerd"
was leeg terwijl alle tijdgebonden triggers diezelfde dag hadden gedraaid. Verklaring: het
team werkt via het dashboard, en Sheets-API-writes vuren geen `onEdit`. Ze wórden pas wakker
zodra iemand met de hand in de Sheet typt.

### Sorteerbereik van `sorteerOfferteTrajecten` (gerepareerd 2026-07-29)

`sorteerOfferteTrajecten` sorteert bij elke handmatige bewerking het hele sectieblok waarin je
typt. Het sorteerbereik was **`getRange(start, 1, rijen, 9)` — alleen kolom A t/m I**, terwijl de
rijen tot en met kolom P gevuld zijn (K=subcategorie, L=opvolgdatum, M=herhaalID, N=escalatie,
O=fase, P=aannemers). Wat in J–P stond bleef dus liggen en hoorde daarna bij de verkeerde taak.

Dat is nu `NTD_SORT_KOLOMMEN = 17` (A t/m Q), geklemd op `sheet.getMaxColumns()` zodat de
trigger nooit omvalt op een blad dat nog niet verbreed is. **Bij een nieuwe kolom rechts: dit
getal mee ophogen**, anders zakt die kolom bij de eerste handmatige bewerking weer weg.

Waarom dit ertoe doet voor fase 4: gemeten op 2026-07-29 (zie
`docs/superpowers/proeven/2026-07-29-fase4-rij-identiteit.md`) verplaatst een sortering die het
volledige gevulde bereik dekt de **rijen zelf** — inclusief een vast taaknummer in kolom Q én
inclusief eventuele DeveloperMetadata. Een smaller bereik verplaatst alleen celwaarden en laat
elk merkteken achter bij de verkeerde taak.
