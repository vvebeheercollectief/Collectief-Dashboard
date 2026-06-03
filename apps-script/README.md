# Apps Script — back-up van het live project

Dit is een **mirror/back-up** van de Google Apps Script die hoort bij de spreadsheet
(Sheets-gebonden project, in de Apps Script-editor heet dit "Afgerond script").

> ⚠️ Deze bestanden worden **niet automatisch gedeployed**. Een `git push` zet alleen
> `index.html` live (via Vercel). Wijzigingen hier moeten **handmatig** in de Apps
> Script-editor geplakt worden om live te gaan — óf via `clasp` als dat ooit wordt opgezet.

## Bestanden (zelfde namen als in de editor)
- `Code.gs` — sheet-automatisering: afgeronde taken verplaatsen, ALV's afhandelen, secties sorteren
- `Notifications.gs` — **OneSignal push-notificaties** + webhook (`doPost`/`doGet`) + trigger-setup
- `Extra functies.gs` — in-app meldingen (`Meldingen`-sheet) + logboek
- `AutoPrioriteit.gs.gs` — dagelijkse auto-prioriteit voor Oppakken (06:00)

## Belangrijk
- Notificaties lopen via **OneSignal** (`cd_sendNotification` in `Notifications.gs`).
  `cd_notifyByTag` / `cd_notifyByExternalId` schrijven óók naar de `Meldingen`-sheet
  (in-app toasts) én sturen een OneSignal-push. Niet verwijderen.
- Alle `.gs`-bestanden delen één globale scope in Apps Script — declareer constanten
  daarom maar in één bestand (geen dubbele `const`-namen over bestanden heen).

_Laatst gesynchroniseerd met de live editor: 2026-06-03._
