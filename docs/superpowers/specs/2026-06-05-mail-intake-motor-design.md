# Mail-intake motor — ontwerp

**Datum:** 2026-06-05
**Status:** Ontwerp (goedgekeurd, klaar voor implementatieplan)
**Doel:** De dagelijkse keten *lezen → sorteren → overtypen → standaard terugmailen* automatiseren, zodat het team alleen nog inhoudelijke beslissingen en uitzonderingen doet.

---

## 1. Aanleiding

Alle post komt binnen op één gedeelde inbox (`info@vvebeheercollectief.nl`). Het team plukt er handmatig uit wat bij de eigen VvE's hoort en **typt taken/meldingen over** in het Collectief Dashboard. Dit kost dagelijks tijd en er glipt weleens iets doorheen.

Uit de brainstorm kwamen drie grote tijdvreters: e-mail/communicatie, meldingen/technisch, en ALV's/notulen. Dit project pakt de eerste twee aan via één gezamenlijke "intake-motor". Notulen (`vve-notulen`-skill) en financieel vallen buiten scope.

## 2. Doel & succescriterium

- Een nieuwe mail in `info@` leidt **binnen ~1-2 minuten, 24/7 en zonder handmatige actie** tot een correct aangemaakte taak in "Nog Te Doen".
- Voor mails die een reactie vragen staat een **concept-antwoord** klaar in Gmail dat een mens checkt en verstuurt (nooit automatisch versturen).
- De beslislogica ("hoe bepalen wij wat er moet gebeuren") staat in een **leesbaar playbook** dat de beheerder zelf kan aanpassen zonder aan de automatisering te komen.

## 3. Autonomie-grenzen (vastgesteld in brainstorm)

| Handeling | Niveau |
|-----------|--------|
| Taak/melding aanmaken | **Volautomatisch** |
| E-mail opstellen | **Concept — mens checkt & verstuurt** |
| Twijfelgeval | Taak in OPPAKKEN met label "🔎 controleren", **geen** automatisch concept |

## 4. Gekozen aanpak

- **Automatiseringsplatform:** n8n **Cloud** (beheerd, draait 24/7 vanzelf, geen onderhoud/server nodig).
- **AI:** Google **Gemini** via een **zakelijke/betaalde sleutel** waarvan de data **niet voor training** wordt gebruikt (AVG — bewonersmails bevatten persoonsgegevens).
- **Schrijfroute naar dashboard:** via de **bestaande Apps Script-webhook**, zodat prioriteitsberekening, logboek en OneSignal-melding meelopen (één bron van waarheid). Géén directe rij-insert vanuit n8n.

Afgewogen alternatieven: Apps Script + Claude API (server-side, maar meer dev en minder zelf-aanpasbaar); periodieke Claude-omgeving (niet echt 24/7); directe Sheet-insert vanuit n8n (omzeilt dashboard-logica). Alle drie afgevallen.

## 5. Architectuur

```
Gmail (info@)  ──trigger (poll ~1 min)──▶  n8n Cloud
                                              │
                                  [AI Agent — Gemini]
                                  leest mail + beheer-playbook
                                  geeft gestructureerde JSON terug
                                              │
                            POST → Apps Script webhook
                            { event:"create_task", secret, ... }
                                              │
                         Apps Script: rij in "Nog Te Doen"
                         onder juiste kop + melding + logboek
                                              │
                       n8n → Gmail: concept-antwoord klaarzetten (indien nodig)
                       n8n → Gmail: label "verwerkt" op de mail
```

### n8n-workflow, stap voor stap
1. **Gmail Trigger** — nieuwe mail in `info@` (filter: niet reeds gelabeld "verwerkt").
2. **AI Agent (Gemini)** — krijgt de mailinhoud + het beheer-playbook als instructie; levert gestructureerde JSON (zie §6).
3. **HTTP Request** — POST naar de webhook met `event:"create_task"` + het secret + de velden.
4. **Gmail (concept)** — alleen als de AI een concept-antwoord teruggaf: maak een Gmail-concept in de betreffende thread.
5. **Gmail (label)** — zet label "verwerkt" zodat de mail niet dubbel wordt opgepakt (dedup-vangnet).

## 6. AI-uitvoer (gestructureerde JSON)

De AI Agent moet per mail een vast JSON-object teruggeven:

| Veld | Inhoud |
|------|--------|
| `vve_code` | VvE-code, herkend uit afzender/onderwerp/inhoud (leeg → twijfelgeval) |
| `vve_naam` | VvE-naam |
| `categorie` | `OPPAKKEN` / `VERGADERVERZOEKEN` / `OFFERTE-TRAJECTEN` / `LOD` |
| `actiepunt` | Korte, heldere taakomschrijving |
| `behandelaar` | Beheerder op basis van VvE-portefeuille (naam zoals in EMAIL_NAMES) |
| `deadline` | Datum afgeleid uit inhoud (prioriteit rekent het dashboard zelf) |
| `concept_antwoord` | Tekst óf leeg (alleen als mail een reactie vraagt) |
| `twijfel` | `true`/`false` — bij `true`: categorie OPPAKKEN + label "🔎 controleren", geen concept |
| `samenvatting` | 1 zin context, mee in logboek |

## 7. Webhook-uitbreiding (Apps Script — `Notifications.gs`, `doPost`)

**Bevinding:** de huidige `doPost` maakt **geen** taken aan — het event `newtask` stuurt alleen een push-melding en gaat ervan uit dat het dashboard de rij al schreef.

**Toevoeging:** een nieuw event `create_task` dat:
1. de juiste subsectie-kop opzoekt in "Nog Te Doen" (`OPPAKKEN`/`VERGADERVERZOEKEN`/`OFFERTE-TRAJECTEN`/`LOD`) — hergebruik het patroon uit `findSectieRow` / de insert-voor-volgende-kop-logica in `Code.gs`;
2. een rij invoegt met de juiste kolommen (A VvE-code, B naam, C actiepunt, E behandelaar, H deadline; prioriteit laat het dashboard/`cd_recalcPrioriteiten` zelf doen);
3. daarna het bestaande `newtask`-meldingspad + `cd_schrijfLogboek` aanroept (code bestaat al).

Beveiliging: het bestaande `CD_WEBHOOK_SECRET`-mechanisme blijft gelden (n8n stuurt `secret` mee).
Deploy: handmatig in de Apps Script-editor plakken (geen clasp/auto-deploy); `apps-script/Notifications.gs` in de repo blijft de back-up/bron.

## 8. Beheer-playbook (`beheer-playbook.md`)

Een los, leesbaar bestand dat als instructie aan de AI Agent wordt meegegeven. Bevat:
- **VvE-/afzender-mapping** — welke afzender of adres hoort bij welke VvE-code + beheerder.
- **Categorie-regels** — wat hoort in OPPAKKEN / VERGADERVERZOEKEN / OFFERTE-TRAJECTEN / LOD.
- **Deadline-vuistregels** — per type melding.
- **Toon & sjablonen** — voor concept-antwoorden (ontvangstbevestiging melding, offerte opvragen, doorzetten).
- **Twijfel-regels** — wanneer iets als "🔎 controleren" moet worden gemarkeerd.

De beheerder onderhoudt dit bestand; de n8n-flow hoeft er niet voor aangepast te worden.

## 9. Scope

**Binnen scope:** mail → taak (automatisch); concept-antwoord (ter controle); het beheer-playbook; de webhook-uitbreiding `create_task`; de n8n Cloud-workflow.

**Buiten scope (later, bouwt hierop voort):**
- #4 Offerte-traject-bewaker (herinnert als aannemer X dagen stil is).
- #5 Notulen-motor: besluiten/actiepunten automatisch als taken terug in dashboard.

## 10. Aandachtspunten / risico's

- **AVG:** uitsluitend een Gemini-sleutel met "geen training op data"-voorwaarden gebruiken.
- **Dubbelen:** het "verwerkt"-label is het dedup-vangnet; de Gmail Trigger moet gelabelde mails uitsluiten.
- **Foute classificatie:** liever vaak "🔎 controleren" dan een verkeerde VvE/beheerder — het playbook stuurt op voorzichtigheid.
- **Kosten:** n8n Cloud ~€20-50/mnd + Gemini-gebruik (enkele centen per mail).
- **Onderhoud playbook:** kwaliteit van de motor staat of valt met het playbook; eerste weken bijsturen op basis van wat er misgaat.
