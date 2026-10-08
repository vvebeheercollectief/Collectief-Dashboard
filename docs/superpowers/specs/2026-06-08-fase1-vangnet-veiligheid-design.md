# Fase 1 — Vangnet & veiligheid (design)

**Datum:** 2026-06-08
**Onderdeel van:** [Routekaart dashboard-verbeterplan](2026-06-08-dashboard-routekaart-design.md), Fase 1
**Status:** Goedgekeurd qua ontwerp — klaar voor implementatieplan

## 1. Doel

Het live beveiligingslek in het meldingen-kanaal dichten, en een testnet leggen dat
de huidige werking vastlegt vóór de grote refactor in Fase 2.

## 2. Probleem (waarom het lek bestaat)

De frontend schrijft taken rechtstreeks naar Google Sheets met het OAuth-token van de
ingelogde gebruiker. Zulke API-wijzigingen vuren géén `onEdit`-trigger in Apps Script
(zie `apps-script/Notifications.gs:376`). Daarom roept de frontend expliciet de Apps
Script-webhook (`doPost`) aan om een pushmelding te laten versturen — en stuurt daarbij
een gedeeld wachtwoord mee.

Dat wachtwoord staat hardcoded in de **publiek leesbare** `index.html`
(`NOTIF_WEBHOOK_SECRET`, regel 1160) en in de git-historie. De webhook (`doPost`,
`Notifications.gs:378-471`) controleert alléén dit secret, niet de identiteit van de
aanroeper. Wie de broncode bekijkt, kent het secret en kan dus meldingen afvuren en —
via `event:'create_task'` — taken aanmaken.

**Belangrijk om te onthouden:** de eigenlijke *data* (taken, ALV's, logboek) is NIET via
dit secret beveiligd. Lezen/schrijven gaat via OAuth + Google's eigen Sheet-permissies.
Het lek beperkt zich tot het meldingen-/taakaanmaak-kanaal.

## 3. Scope

**In scope (3 delen):**
1. Frontend ontkoppelen van het webhook-secret.
2. Secret roteren en server-only maken.
3. Testnet uitbreiden.

**Non-goals (expliciet niet in Fase 1):**
- De webhook (`doPost`) verwijderen — blijft bestaan voor de toekomstige mail-intake
  (Fase 3). Of die ooit weg kan, hangt af van de n8n-vs-Apps-Script-keuze daar.
- Een echt testframework (vitest e.d.) — dat vereist de build-stap uit Fase 2.
- CSP aanscherpen tot strikt — dat hangt aan het opruimen van inline handlers (Fase 2).
  (Een kleine, niet-brekende CSP-aanscherping mag meeliften indien triviaal.)

## 4. Ontwerp

### 4.1 Frontend schrijft meldingen via een Sheet-wachtrij (i.p.v. webhook + secret)

We draaien de richting om. In plaats van een POST naar de webhook met secret, schrijft
de frontend een "meldings-intentie" als rij naar een nieuwe tab **`Notif-wachtrij`** via
het bestaande OAuth-schrijfpad (`appendRange`).

- **Enige aan te passen plek:** de `fetch(NOTIF_WEBHOOK_URL, …)` binnen `fireNotifEvent`
  (`index.html:3657`). Alle event-typen lopen hierdoorheen. In het implementatieplan
  eerst grep-controle op overige aanroepers van `NOTIF_WEBHOOK_URL` / `fireNotifEvent`
  (o.a. `sendTestNotif`, en eventuele `alv_update`/`logboek`-events).
- **Rij-formaat `Notif-wachtrij`:** `ts | event | code | naam | behandelaar | sec | actor | extra(JSON) | verwerkt`.
  De `verwerkt`-kolom blijft leeg tot de wachter de rij heeft afgehandeld.
- **In-app toasts blijven ongemoeid:** `fireNotifEvent` toont lokaal al een toast
  (`index.html:3645-3653`); andere clients zien meldingen via hun bestaande
  `pollNotifsForToast` (elke 10s leest die de `Meldingen`-sheet). De wachter (4.2)
  schrijft `Meldingen` net als voorheen, dus dit pad verandert niet.
- **Verwijderen uit de frontend:** `NOTIF_WEBHOOK_SECRET` (regel 1160) volledig; de
  `NOTIF_WEBHOOK_URL`-constante en `fetch` worden vervangen door de append-aanroep.

### 4.2 Backend "wachter" die de wachtrij verwerkt

- **Refactor:** haal de event-afhandeling uit `doPost` (de `if (ev === …)`-keten,
  `Notifications.gs:397-465`) naar één herbruikbare functie `cd_processNotifEvent(data)`.
  `doPost` roept die voortaan aan; de wachter ook. Geen logica-duplicatie.
- **Installeerbare `onChange`-trigger** `cd_onNotifQueueChange`: scant `Notif-wachtrij`
  op rijen met lege `verwerkt`-kolom, draait `cd_processNotifEvent` per rij (binnen
  `cd_withLock`), en zet daarna `verwerkt` = tijdstempel. `onChange` (anders dan `onEdit`)
  vuurt óók bij wijzigingen via de Sheets-API — dat is precies waarom we deze gebruiken.
- **Veegbeurt-vangnet:** een time-based trigger (elke 5 min) `cd_sweepNotifQueue` draait
  dezelfde verwerking, zodat een eventueel gemiste `onChange` alsnog wordt opgepakt
  (melding dan hooguit ~5 min later i.p.v. seconden).
- **Idempotentie:** de `verwerkt`-vlag + `cd_withLock` voorkomen dubbele verwerking;
  de bestaande `dedupKey`/`web_push_topic` in `cd_sendNotification` voorkomt dubbele push.
- **Geen lus:** de wachter schrijft alleen de `verwerkt`-kolom terug in `Notif-wachtrij`
  en schrijft meldingen naar `Meldingen` — beide veroorzaken geen ongewenste herverwerking
  (de scan filtert op lege `verwerkt`).

### 4.3 Secret roteren en server-only maken

Zodra de frontend het secret niet meer gebruikt:
1. Nieuw, lang random secret genereren.
2. `setupWebhookSecret()` (`Notifications.gs:546`) bijwerken en draaien (schrijft naar
   Script Property `CD_WEBHOOK_SECRET`).
3. Web App opnieuw implementeren (Deploy → nieuwe versie) — `doPost` wordt als web-app
   geserveerd, dus codewijzigingen daaraan vereisen een redeploy.
4. Het nieuwe secret komt **nergens** in `index.html`. Het leeft alleen in de Script
   Property (en later in n8n voor de mail-intake).

Daarmee is het ooit-gelekte secret definitief dood en is `doPost` weer echt afgeschermd.

### 4.4 Testnet uitbreiden (`?test=1`)

De bestaande in-browser zelftest (17 prioriteit-asserts, draait bij `?test=1`) uitbreiden
met assert-blokken voor de pure functies die Fase 2 gaat verplaatsen:
- `berekenPrioriteit(deadline, categorie)` — randgevallen rond de dag-grenzen.
- `_parseAnyDate` — alle formaten incl. `sept`, `jan.`, 2-cijfer-jaar, Nederlandse long-date.
- De taak-sorteervergelijker (in-behandeling > te laat > prio > deadline > VvE-code).
- `logZin(r)` / logboek-helpers en `displayName(email)`.

Output: pass/fail-telling in de console (zelfde stijl). Geen nieuw gereedschap. Dit legt
het huidige gedrag vast als regressievangnet vóór Fase 2.

## 5. Uitrolvolgorde (raakt live meldingen — voorzichtig)

1. **Testnet** (4.4) — laag risico, mag als eerste live.
2. **Backend** (4.2): `cd_processNotifEvent` + wachter + triggers plakken in "Afgerond
   script", web app redeployen. Testen met een handmatige wachtrij-rij die alleen naar
   *jezelf* pusht (niet het hele team pingen).
3. **Frontend** (4.1): `fireNotifEvent` omzetten naar append; deployen. End-to-end testen
   (self-targeted).
4. **Secret roteren** (4.3): pas nadat de frontend het niet meer gebruikt.
5. **Secret + webhook-constanten uit `index.html`** verwijderen; pushen.

## 6. Risico's & mitigaties

| Risico | Mitigatie |
|---|---|
| `onChange` vuurt niet betrouwbaar bij API-append | **Eerst valideren** met een mini-spike. Fallback = de 5-min veegbeurt (4.2). |
| Dubbele pushmeldingen | `verwerkt`-vlag + `cd_withLock` + bestaande `dedupKey`. |
| Hele team pingen tijdens test | Test met self-targeted melding (zie 5.2). |
| Web App niet geredeployed → oude code live | Checklist-stap 4/in uitrolvolgorde expliciet. |

## 7. Acceptatiecriteria

- `index.html` bevat geen `NOTIF_WEBHOOK_SECRET` en geen webhook-`fetch` meer (grep = leeg).
- Een nieuwe taak / toewijzing levert nog steeds: in-app toast bij open clients **én**
  OneSignal-push bij gesloten app (self-test bevestigt push).
- Het oude secret werkt niet meer; `doPost` weigert zonder geldig (nieuw, server-only) secret.
- `?test=1` draait de uitgebreide set en rapporteert 0 failures op de huidige codebasis.

## 8. Open punten
- Eén tab `Notif-wachtrij` vs. rechtstreeks in `Meldingen` enqueuen — voorkeur: aparte tab
  (schoner, geen vermenging met de poll-data). Definitief in het plan.
- Exacte lijst frontend-aanroepers van de webhook (grep in plan-stap 1).
