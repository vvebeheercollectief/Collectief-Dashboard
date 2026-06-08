# Routekaart — Collectief Dashboard verbeterplan

**Datum:** 2026-06-08
**Type:** Routekaart / decompositie (overkoepelend ontwerp)
**Status:** Goedgekeurd qua vorm en volgorde — open punt: n8n-infrastructuur (zie Fase 3)

Dit is een overkoepelende routekaart, geen implementeerbare spec. Elke fase wordt
later een eigen mini-traject met z'n eigen ontwerp → plan → bouwen-cyclus. Doel van
dit document: de richting, volgorde en afhankelijkheden vastleggen.

---

## 1. Aanleiding

Vraag: het dashboard optimaliseren op alle vlakken — workflow, efficiëntie, functies,
veiligheid en code — als één groot gefaseerd plan.

Het dashboard is volwassen en goed onderhouden (recent nog een code review-ronde met
beveiligingsfixes op 2026-06-08). De makkelijke winst is dus al binnen; dit plan gaat
over de volgende stap: fundament verstevigen en daarop zichtbare werkwijze-winst bouwen.

### Sturende keuzes van de gebruiker
- **Apparaat:** desktop-first. → mobiel/offline/accu-optimalisaties bewust láág geprioriteerd.
- **Grootste pijn in de werkwijze:** (1) te veel handwerk/overtypen vanuit mail,
  (2) opvolging & herhaling (terugkerende taken, stille dossiers bewaken).
- **Ambitie:** groot plan over meerdere sessies, met fasering.

---

## 2. Wat het code-onderzoek opleverde (huidige staat)

| Onderwerp | Bevinding | Gevolg voor plan |
|---|---|---|
| Data lezen/schrijven | Rechtstreeks naar Google Sheets API met het OAuth-token van de ingelogde gebruiker (`fetchSheet`/`writeRange`/`appendRange`). Google's Sheet-rechten bewaken de poort. | **Data is goed beveiligd.** De `ALLOWED_EMAILS`-lijst is alleen een nette voordeur (UX), niet het echte slot. |
| Webhook (`doPost`) | Valideert **alleen het gedeelde secret**, niet de identiteit van de aanroeper (geen `Session.getActiveUser()`-check). Het secret staat hardcoded in de publieke `index.html` (en in git-history). | **Echte zwakte.** Iedereen die broncode bekijkt kan meldingen afvuren en taken aanmaken (`event:create_task`). → Fase 1. |
| XSS | Centrale `esc()`-helper, consequent toegepast op Sheet-data. Geen duidelijke gaten. | Kleiner item dan gedacht; meeliften met CSP-aanscherping. |
| CSP | Aanwezig maar slap (`script-src 'unsafe-inline' 'unsafe-eval'`). | Aanscherpen ná het opruimen van inline handlers (Fase 2). |
| Polling | Elke 8s volledige dataset (6 sheets) ophalen, diff via JSON-hash. Poll pauzeert bij `pendingWrites>0`. | Werkt prima op desktop bij hun schaal. **Láág geprioriteerd.** |
| Externe scripts | `chart.js` laadt op álle pagina's (mogelijk blokkerend), terwijl het alleen op de statistiekpagina nodig is. `gsi` en OneSignal laden async/defer. | Lazy-load chart.js → Fase 5 (opportunistisch). |
| Code-organisatie | ~4000 regels JS + ~450 CSS + minimale HTML, alles in één `index.html`. Logische clusters bestaan (auth, render, API, AI, logboek, prioriteit) maar zijn niet als modules gescheiden. | Grootste onderhoudsrisico. → Fase 2. |
| Build/deploy | Geen build-stap. `index.html` deployt via Vercel bij push. Apps Script heeft **geen clasp** — wijzigingen moeten handmatig in de editor geplakt worden (heeft al eens tot een verouderde kopie geleid). | clasp + auto-deploy + staging → Fase 2. |

---

## 3. De routekaart — 5 fases

De volgorde is bewust: eerst een **vangnet** en de **motor onder de motorkap**,
dan de **zichtbare werkwijze-winst** daarop.

### Fase 1 — Vangnet & veiligheid `[klein]`
**Doel:** het live webhook-lek dichten en een testnet leggen vóór de verbouwing.

- **Webhook ontkoppelen van het publieke secret.** De frontend heeft al OAuth-schrijfrechten;
  laat 'm meldingen wegschrijven via een Sheet-regel + automatische Apps Script-trigger, in
  plaats van de webhook met secret aan te roepen. Daardoor hoeft het secret niet meer in
  `index.html` te staan en leeft het alleen nog server-side (Script Property) voor de
  mail-koppeling.
- **Server-side identiteitscheck** in `doPost` (defense in depth) + het gelekte secret intrekken/roteren.
- **Test-vangnet:** de bestaande `?test=1`-controles uitbouwen tot een echte testset die de
  huidige logica vastlegt (prioriteit, datumparser, sortering, logzinnen) — vóór Fase 2.

*Levert op:* live lek dicht + veiligheidsnet voor de refactor.
*Afhankelijkheid:* blokkeert Fase 3 (mail-intake gebruikt de webhook).

### Fase 2 — Onderhoudbaarheid `[groot — kernverbouwing]`
**Doel:** elke toekomstige wijziging sneller, veiliger en automatisch uitrolbaar maken.

- **`index.html` opsplitsen** in logische modules (login, weergave, API, AI, logboek, prioriteit)
  met een lichte build-stap (bv. esbuild) die naar één geminificeerd bestand bundelt. Deploy
  blijft "push → Vercel".
- **Inline event-handlers → event-delegation**, zodat de CSP strikt kan (`unsafe-inline` eruit).
- **Apps Script auto-deploy** via clasp + GitHub Action — einde handmatig plakken / verouderde kopieën.
- **Staging-omgeving:** preview-URL + test-Sheet om wijzigingen te proberen zonder het live dashboard te raken.

*Levert op:* veilige, snelle basis voor alle latere feature-bouw.
*Afhankelijkheid:* leunt op het testnet uit Fase 1.

### Fase 3 — Minder overtypen `[middel]` → pijnpunt #1
**Doel:** mail het dashboard in krijgen zonder handwerk.

- **Mail-intake motor:** info@-mail wordt automatisch een taak (samenvatting + categorie + acties
  via Gemini). Spec + plan liggen al klaar
  (`docs/superpowers/specs|plans/2026-06-05-mail-intake-motor*`).
- **Taak-sjablonen** voor terugkerende soorten + slimmere snelinvoer.

> **OPEN PUNT (te beslissen bij detailontwerp Fase 3):** er draait nog **geen n8n**. Twee opties:
> **(a)** n8n opzetten (zelf-gehost of cloud) zoals de bestaande spec aanneemt, óf
> **(b)** mail-intake puur in Apps Script bouwen — Gmail direct uitlezen (`GmailApp`) + Gemini
> aanroepen (`UrlFetchApp`) op een tijd-trigger. Optie (b) is vermoedelijk simpeler voor deze
> setup (geen extra server, alles binnen Google), maar de bestaande spec gaat uit van n8n.
> Deze keuze maken we expliciet voordat Fase 3 begint.

*Levert op:* directe winst op de grootste dagelijkse irritatie.
*Afhankelijkheid:* webhook beveiligd (Fase 1); rijdt op schone code (Fase 2).

### Fase 4 — Opvolging & herhaling `[middel]` → pijnpunt #2
**Doel:** zorgen dat niets er meer doorheen glipt.

- **Terugkerende taken** (herhaalregels).
- **Opvolg-/snooze-datums** + automatische escalatie van stille dossiers (uitbreiding van de
  bestaande "stille taken"-melding, `STIL_DREMPEL_DAGEN`).
- **Digest-herinneringen** per persoon (sluit aan op de bestaande maandagbriefing / dagelijkse summary).

*Levert op:* opvolging gebeurt vanzelf i.p.v. uit het hoofd.
*Afhankelijkheid:* beveiligde notificaties (Fase 1).

### Fase 5 — Desktop-kracht & overzicht `[doorlopend, optioneel]`
**Doel:** power-user-gemak en beter overzicht op desktop.

- **Per-VvE overzichtspagina** — alle taken/ALV/logboek van één VvE op één scherm
  (hergebruik van de bestaande `aiVveContext`-opbouw).
- **Globaal zoeken + bulk-acties** (meerdere taken tegelijk afronden/herverdelen).
- **Toetsenbord-shortcuts / command palette** (desktop-power).
- **Opportunistisch:** chart.js pas laden op de statistiekpagina.

*Levert op:* sneller werken en beter overzicht; losse brokken, geen harde volgorde.

---

## 4. Bewust láág geprioriteerd (met reden)

| Idee | Waarom niet (nu) |
|---|---|
| Push i.p.v. 8s-polling | Desktop-first: accu/quota-winst is klein bij hun schaal. |
| Offline schrijf-wachtrij | Desktop-first: offline-scenario komt zelden voor. |
| Mobiel-specifieke optimalisaties | Desktop is de hoofdomgeving. |

Niet nutteloos — kan later alsnog, maar levert nu te weinig op om voorrang te krijgen.

---

## 5. Afhankelijkheden in één oogopslag

```
Fase 1 (vangnet+veiligheid)
  ├── testnet ─────────────► Fase 2 (veilige refactor)
  └── webhook beveiligd ───► Fase 3 (mail-intake) & Fase 4 (notificaties)

Fase 2 (schone code + staging) ──► veilige basis voor Fase 3, 4, 5
```

## 6. Aannames & open punten
- **Aanname:** een lichte build-stap (esbuild) is acceptabel ondanks dat de gebruiker
  niet-technisch is; de complexiteit blijft verborgen (deploy blijft "push → Vercel").
  Te bevestigen bij Fase 2.
- **Open:** mail-intake-architectuur n8n vs. Apps Script-only (zie Fase 3).
- **Aanname:** staging-Sheet is een aparte kopie van de productie-Sheet; exacte opzet bij Fase 2.

## 7. Volgende stap
Fase 1 in detail uitwerken (eigen ontwerp → plan → bouwen), te beginnen met het ontkoppelen
van de webhook en het testnet.
