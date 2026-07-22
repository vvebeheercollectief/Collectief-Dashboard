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
</content>
</invoke>
