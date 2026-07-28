# apps-script-backup

Los Apps Script-project dat elke nacht een complete kopie van de PRODUCTIE-Sheet in een
aparte Drive-map zet.

**Rolt NIET automatisch uit.** De GitHub Action `apps-script-deploy.yml` triggert alleen op
`apps-script/**` en pusht alleen `rootDir: apps-script`. Deze map staat hier voor
versiebeheer; installeren gaat handmatig.

## Waarom een apart project

Het gebonden project (`apps-script/`) vraagt vandaag geen Drive-scope: er komt nergens
`DriveApp` of `openById` in voor, en `appsscript.json` heeft geen expliciete `oauthScopes`.
`DriveApp` daar toevoegen is dus een scope-uitbreiding → herautorisatie → en tot dát gebeurt
vallen `cd_checkDeadlines`, `cd_dailySummary`, `cd_sweepNotifQueue` en `cd_opvolgingMotor`
stil. Daarom staat de back-up buiten dat project.

## Scopes die dit project vraagt

- Drive (`makeCopy`, `setTrashed`, mappen lezen)
- Script-triggers
- Script Properties

## Installeren

1. script.google.com → Nieuw project → naam `Collectief Dashboard — Back-up`
2. Inhoud van `Backup.gs` plakken
3. `BK_MAP_ID` invullen met het id van de back-upmap
4. `bk_test` draaien en de log controleren
5. `bk_dagelijks` één keer handmatig draaien (autoriseren) en controleren dat er een kopie in de map staat
6. `bk_installeerTriggers` draaien

Verwachte log bij stap 4:

```
naam:           BACKUP Collectief Dashboard 2026-07-28 — NIET BEWERKEN
datum terug:    2026-07-28
vreemde naam:   null
bijna-naam:     null
bewaard (15):   ["2026-07-01","2026-07-07", … ,"2026-07-20"]
```

Staat er bij `vreemde naam` of `bijna-naam` iets anders dan `null`, **stop dan** — dan kan het
opruimen vreemde bestanden in de map raken.

## Tweede herstelweg: wekelijkse export

`bk_wekelijkseExport` zet elke zondagnacht een **XLSX-bestand** in een aparte map
(`BK_EXPORT_MAP_ID`). Ander formaat, andere map — zodat één ongeluk niet beide herstelwegen
tegelijk meeneemt, en zodat je de gegevens ook zonder Google-account kunt openen.

Wat het **niet** dekt: het staat in dezelfde Drive onder hetzelfde account. Raakt dát account
kwijt, dan is de export ook weg. Wil je dat afdekken, dan hoeft alleen `bk_exportAfleveren`
te wijzigen (bijvoorbeeld naar `MailApp.sendEmail` met de bijlage, of naar een map van een
tweede account) — de rest van het script blijft hetzelfde.

## Alarm

`bk_dagelijks` en `bk_controleer` vangen hun fouten bewust NIET af. Een mislukking levert
Google's eigen storingsmail aan de eigenaar op. Dat is het alarm — er is geen stil
Logger.log-vangnet zoals in het gebonden project.
