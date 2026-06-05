# Mail-intake motor — Implementatieplan

> **Voor uitvoerders:** VERPLICHTE SUB-SKILL: gebruik superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Stappen gebruiken checkbox-syntax (`- [ ]`) voor tracking.
>
> **Let op — de gebruiker is niet-technisch.** Alle Apps Script- en n8n-stappen worden door Claude begeleid; geef bij elke handeling exact aan wáár te klikken/plakken. Apps Script wordt **handmatig** in de editor geplakt (geen clasp/auto-deploy); de repo-bestanden in `apps-script/` zijn de bron/back-up.

**Goal:** Een nieuwe mail in `info@vvebeheercollectief.nl` leidt binnen ~1-2 min, 24/7 en zonder handwerk tot een correcte taak in "Nog Te Doen", met een concept-antwoord ter controle.

**Architecture:** n8n Cloud (Gmail trigger → Gemini classificeert met het beheer-playbook → POST naar de bestaande Apps Script-webhook met nieuw event `create_task` → Gmail concept-antwoord → label "verwerkt"). De webhook maakt de rij aan en hergebruikt het bestaande melding- + logboekpad.

**Tech Stack:** n8n Cloud, Google Gemini API (betaalde/zakelijke sleutel, geen training), Gmail (Google Workspace), Google Apps Script (Sheets-gebonden project "Afgerond script"), Google Sheets backend.

**Spec:** `docs/superpowers/specs/2026-06-05-mail-intake-motor-design.md`

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Actie |
|---------|----------------------|-------|
| `apps-script/Notifications.gs` | Webhook `doPost`: nieuw event `create_task` + helper `cd_createTaskRow` + testfunctie | Wijzigen |
| `beheer-playbook.md` (repo-root) | Beslislogica die de AI meekrijgt: VvE/afzender→beheerder, categorie-regels, deadlines, sjablonen, twijfel-regels | Aanmaken |
| n8n Cloud workflow "Mail-intake info@" | Trigger → Gemini → webhook → concept → label | Aanmaken (in n8n UI) |

Geen wijziging aan `index.html` (de frontend rekent prioriteit live; `cd_recalcPrioriteiten` vult de Oppakken-prio dagelijks).

---

## DEEL A — Apps Script: webhook uitbreiden met `create_task`

### Taak A1: Helper `cd_createTaskRow` toevoegen

**Files:**
- Modify: `apps-script/Notifications.gs` (toevoegen onder de bestaande `doGet`, rond regel 411)

- [ ] **Stap 1: Schrijf de helper-functie**

Voeg dit blok toe in `apps-script/Notifications.gs`, direct ná de `doGet`-functie (rond regel 411):

```javascript
// ════════════════════════════════════════════════════════════
//  TAAK AANMAKEN via webhook (mail-intake motor)
//  Kolommen "Nog Te Doen" (1-geteld): A=code B=naam C=actiepunt
//  D=deadline E=behandelaar F=prioriteit. Data start op kop+2.
// ════════════════════════════════════════════════════════════
const CD_NTD_SECTIES = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

function cd_createTaskRow(categorie, code, naam, actiepunt, behandelaar, deadline) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NTD_SHEET); // 'Nog Te Doen'
  if (!sheet) throw new Error('Sheet "' + NTD_SHEET + '" niet gevonden');

  const sectie = (categorie || 'OPPAKKEN').toString().trim().toUpperCase();
  if (CD_NTD_SECTIES.indexOf(sectie) === -1) throw new Error('Onbekende categorie: ' + categorie);

  // 1) vind de sectie-kop in kolom A
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  let headerRow = -1;
  for (let i = 0; i < colA.length; i++) {
    if ((colA[i][0] || '').toString().trim().toUpperCase() === sectie) { headerRow = i + 1; break; }
  }
  if (headerRow === -1) throw new Error('Sectie-kop niet gevonden: ' + sectie);

  // 2) insert-positie: vanaf kop+2 tot eerste lege rij of volgende sectie-kop
  let insertRow = headerRow + 2;
  while (insertRow <= lastRow) {
    const v = (sheet.getRange(insertRow, 1).getValue() || '').toString().trim().toUpperCase();
    if (CD_NTD_SECTIES.indexOf(v) !== -1) break;          // volgende sectie
    if (sheet.getRange(insertRow, 1).getValue() === '') break; // lege rij
    insertRow++;
  }

  // 3) rij invoegen (erft opmaak/checkbox-validatie van de rij erboven)
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 5).setValues([[
    code || '', naam || '', actiepunt || '', deadline || '', behandelaar || ''
  ]]);
  return insertRow;
}
```

- [ ] **Stap 2: Verifieer de kolom-aanname tegen de live Sheet**

Bevestig vóór het live zetten dat de kolommen kloppen. Lees de live "Nog Te Doen" (spreadsheet `1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw`) via de Google Sheets MCP, of open de Sheet handmatig, en controleer dat een bestaande Oppakken-rij heeft: A=VvE-code, B=naam, C=actiepunt, D=deadline, E=behandelaar.
Verwacht: klopt → door. Wijkt af → pas de kolom-volgorde in `setValues` (Stap 1) aan en noteer de echte indeling als comment.

- [ ] **Stap 3: Commit (repo-bron bijwerken)**

```bash
git add apps-script/Notifications.gs
git commit -m "feat(apps-script): cd_createTaskRow helper voor mail-intake"
```

---

### Taak A2: Event `create_task` in `doPost` afhandelen

**Files:**
- Modify: `apps-script/Notifications.gs:348-353` (variabelen) en `:401` (nieuwe else-if vóór `ping`)

- [ ] **Stap 1: Voeg twee variabelen toe**

In `doPost`, ná regel 353 (`const actor = ...`), voeg toe:

```javascript
    const categorie = (data.categorie || '').toString();
    const actiepunt = (data.actiepunt || '').toString();
    const deadline  = (data.deadline || '').toString();
```

- [ ] **Stap 2: Voeg het `create_task`-event toe**

In `doPost`, vlak vóór `} else if (ev === 'ping') {` (rond regel 399), voeg dit blok toe:

```javascript
    } else if (ev === 'create_task') {
      const rij = cd_createTaskRow(categorie, code, naam, actiepunt, beh, deadline);
      // zelfde melding als bij een normale nieuwe taak
      cd_notifyByTag('n_newtask', '1', {
        title: '📋 Nieuwe taak — ' + (categorie || '').toLowerCase(),
        body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
        url: APP_URL, dedupKey: 'mailnew-' + code + '-' + Date.now()
      });
      if (beh) {
        cd_splitBehandelaar(beh).forEach(name => {
          if (name && name !== actor) {
            cd_notifyByExternalId(name, 'n_assigned', '1', {
              title: '➕ Toegewezen aan jou',
              body: code + (naam ? ' · ' + naam : ''),
              url: APP_URL, dedupKey: 'mailassign-' + code + '-' + name + '-' + Date.now()
            });
          }
        });
      }
      cd_schrijfLogboek(code, categorie, 'Aangemaakt via mail-intake', '', '', actiepunt, actor || 'mail-intake');
      return ContentService.createTextOutput(JSON.stringify({ ok: true, event: ev, rij: rij }))
        .setMimeType(ContentService.MimeType.JSON);
    }
```

- [ ] **Stap 3: Commit**

```bash
git add apps-script/Notifications.gs
git commit -m "feat(apps-script): doPost event create_task voor mail-intake"
```

---

### Taak A3: Testfunctie + live zetten + test

**Files:**
- Modify: `apps-script/Notifications.gs` (testfunctie onderaan, bij de andere TEST FUNCTIES rond regel 413)

- [ ] **Stap 1: Schrijf de testfunctie**

Voeg toe bij de TEST FUNCTIES (rond regel 414):

```javascript
function test_createTask() {
  const rij = cd_createTaskRow('OPPAKKEN', 'TESTVVE', 'VvE Testlaan 1', 'TEST — taak via script', 'Cihad', '2026-06-12');
  Logger.log('Testtaak ingevoegd op rij ' + rij + ' (handmatig verwijderen na controle)');
}
```

- [ ] **Stap 2: Plak de drie wijzigingen in de live Apps Script-editor**

Begeleid de gebruiker: Google Sheet openen → **Extensies → Apps Script** → project "Afgerond script" → bestand `Notifications.gs` → de toegevoegde blokken (helper, `create_task`-event, testfunctie) plakken op de juiste plek → **Opslaan** (Ctrl/Cmd+S).

- [ ] **Stap 3: Draai `test_createTask` vanuit de editor**

In de Apps Script-editor: functie-dropdown bovenaan → kies `test_createTask` → **Uitvoeren**. Eerste keer: autorisatie toestaan.
Verwacht: in "Nog Te Doen" staat onder OPPAKKEN een nieuwe rij `TESTVVE · VvE Testlaan 1 · TEST — taak via script · 2026-06-12 · Cihad`. In het Logboek staat een regel "Aangemaakt via mail-intake". Controleer ook of het afvink-vakje (kolom I) op de nieuwe rij werkt (overgeërfd van rij erboven).
Daarna: verwijder de testrij handmatig.

- [ ] **Stap 4: Test de webhook end-to-end met het `create_task`-event**

Haal de webhook-URL op uit de frontend:

```bash
grep -o 'https://script.google.com/macros/s/[^"'"'"']*' /Users/servicedesk/collectief-dashboard/index.html | head -1
```

Stuur een test-POST (vervang `<WEBHOOK_URL>`; het secret staat in `apps-script/Notifications.gs` als `CD_WEBHOOK_SECRET`):

```bash
curl -L -s -X POST "<WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -d '{"secret":"8e0642cbd3f44f44a4711d1ec5bae0a78d17e902b29a0ef7","event":"create_task","categorie":"OPPAKKEN","code":"TESTVVE","naam":"VvE Testlaan 1","actiepunt":"TEST via webhook","behandelaar":"Cihad","deadline":"2026-06-12","actor":"mail-intake"}'
```

Verwacht: JSON-antwoord `{"ok":true,"event":"create_task","rij":N}` en een nieuwe rij in de Sheet. Verwijder de testrij daarna handmatig.

- [ ] **Stap 5: Commit**

```bash
git add apps-script/Notifications.gs
git commit -m "test(apps-script): testfunctie voor cd_createTaskRow"
```

---

## DEEL B — Beheer-playbook (kennislaag)

### Taak B1: `beheer-playbook.md` aanmaken

**Files:**
- Create: `beheer-playbook.md` (repo-root)

- [ ] **Stap 1: Maak het bestand met dit startsjabloon**

```markdown
# Beheer-playbook — mail-intake

Dit bestand bepaalt hoe de AI inkomende mail op info@ omzet naar een taak.
De beheerder onderhoudt dit; de n8n-flow verandert niet als je dit aanpast.
Houd het concreet: voorbeelden werken beter dan abstracte regels.

## 1. VvE & beheerder herkennen
- Match op afzender-adres, onderwerp of inhoud naar een VvE-code.
- Portefeuille-verdeling (welke beheerder bij welke VvE's):
  - Cihad: <VvE-codes / kenmerken>
  - Cihan: <...>
  - Gabos: <...>
  - Jer: <...>
- Onbekende VvE of afzender → `twijfel = true`.

## 2. Categorie kiezen
- OPPAKKEN — losse acties/meldingen die opgepakt moeten worden (bijv. storing, klacht, vraag).
- VERGADERVERZOEKEN — alles rond het plannen/organiseren van een ALV/vergadering.
- OFFERTE-TRAJECTEN — offerte opvragen/vergelijken/gunnen bij aannemers.
- LOD — <jullie definitie van LOD invullen>.
- Twijfel tussen categorieën → kies OPPAKKEN en `twijfel = true`.

## 3. Deadline-vuistregels
- Spoed/lekkage/veiligheid: deadline = vandaag of morgen.
- Standaardmelding: <X> dagen.
- Vergaderverzoek: <X> dagen.
- Offerte: <X> dagen.
- Geen deadline af te leiden → laat leeg.

## 4. Concept-antwoord (alleen als de mail een reactie vraagt)
- Toon: vriendelijk, zakelijk, Nederlands, namens VvE Beheer Collectief.
- Sjabloon ontvangstbevestiging melding: "Beste <naam>, dank voor uw melding ..."
- Sjabloon offerte opvragen bij aannemer: "Geachte heer/mevrouw, namens VvE <naam> ..."
- Geen reactie nodig (bijv. interne cc, nieuwsbrief) → concept leeg laten.
- Bij `twijfel = true`: GEEN concept-antwoord.

## 5. Twijfel-regels (liever te vaak dan te weinig)
Zet `twijfel = true` bij: onbekende VvE/afzender, onduidelijke vraag,
juridische/financiële gevoeligheid, of meerdere VvE's in één mail.
Gevolg: categorie OPPAKKEN, actiepunt begint met "🔎 controleren — ", geen concept.
```

- [ ] **Stap 2: Vul samen met de beheerder de `<...>`-plekken in**

Loop de placeholders langs (portefeuille-verdeling, LOD-definitie, deadline-getallen) en vul ze in op basis van hoe het team nu werkt. Dit is de kern van de kwaliteit — neem hier de tijd voor.

- [ ] **Stap 3: Commit**

```bash
git add beheer-playbook.md
git commit -m "docs: beheer-playbook voor mail-intake classificatie"
```

---

## DEEL C — n8n Cloud workflow

> Alle stappen in de n8n-webinterface. Claude begeleidt het klikken; test telkens met de "Test workflow"-knop voordat je activeert.

### Taak C1: Account, credentials en label

- [ ] **Stap 1: n8n Cloud-account**

Maak een account op n8n.cloud (start-/trial-plan volstaat voor de bouw). Open een nieuwe lege workflow, naam: **"Mail-intake info@"**.

- [ ] **Stap 2: Gmail-credential**

Credentials → New → **Gmail OAuth2** → log in met het account dat bij `info@vvebeheercollectief.nl` kan (gedeelde inbox). Autoriseer.

- [ ] **Stap 3: Gemini-credential (AVG — betaalde sleutel)**

Maak in Google AI Studio een API-key onder een project met **facturering aan** (pay-as-you-go gebruikt prompts niet voor training — voldoet aan AVG). In n8n: Credentials → New → **Google Gemini (PaLM) API** → plak de key.

- [ ] **Stap 4: Gmail-label "verwerkt" aanmaken**

Maak in Gmail (info@) een label **verwerkt** aan. Dit is het dedup-vangnet.

---

### Taak C2: Gmail Trigger

- [ ] **Stap 1: Voeg de trigger toe**

Node **Gmail Trigger**. Instellingen:
- Credential: de Gmail-credential uit C1.
- Poll Times: **Every Minute**.
- Event: **Message Received**.
- Filters → **Search**: `in:inbox -label:verwerkt`
- Options → **Simplify**: aan (geeft o.a. `From`, `Subject`, `snippet`/`text`).

- [ ] **Stap 2: Test**

Stuur een testmail naar info@. Klik **Fetch Test Event** / **Test step**.
Verwacht: de testmail verschijnt als output-item met `From`, `Subject` en de tekst.

---

### Taak C3: Gemini-classificatie (LLM Chain + structured output)

- [ ] **Stap 1: Voeg het taalmodel toe**

Node **Google Gemini Chat Model** → credential uit C1 → Model: `models/gemini-2.0-flash` (of nieuwste flash). Dit node hangt onder de chain in stap 2.

- [ ] **Stap 2: Voeg de Basic LLM Chain toe**

Node **Basic LLM Chain**, verbonden ná de Gmail Trigger; koppel het Gemini-model eraan.
- **Prompt (System/Instructions)** — plak de inhoud van `beheer-playbook.md` (of, beter: lees het runtime in; voor v1 plakken volstaat), gevolgd door:

```
Je bent de mail-intake assistent van VvE Beheer Collectief. Bepaal op basis
van bovenstaand playbook wat er met de mail moet gebeuren. Antwoord UITSLUITEND
met geldige JSON, zonder uitleg, exact volgens het opgegeven schema.
```

- **User message** — expressie:

```
Afzender: {{ $json.From }}
Onderwerp: {{ $json.Subject }}
Bericht:
{{ $json.text || $json.snippet }}
```

- [ ] **Stap 2b: Koppel een Structured Output Parser**

Voeg **Structured Output Parser** toe aan de chain met dit JSON-schema:

```json
{
  "type": "object",
  "properties": {
    "vve_code": { "type": "string" },
    "vve_naam": { "type": "string" },
    "categorie": { "type": "string", "enum": ["OPPAKKEN","VERGADERVERZOEKEN","OFFERTE-TRAJECTEN","LOD"] },
    "actiepunt": { "type": "string" },
    "behandelaar": { "type": "string" },
    "deadline": { "type": "string" },
    "concept_antwoord": { "type": "string" },
    "twijfel": { "type": "boolean" },
    "samenvatting": { "type": "string" }
  },
  "required": ["categorie","actiepunt","twijfel"]
}
```

- [ ] **Stap 3: Test met de gefetchte mail**

Test step. Verwacht: één output-item met de bovenstaande velden ingevuld; bij een onbekende afzender `twijfel: true`, `categorie: "OPPAKKEN"` en leeg `concept_antwoord`.

---

### Taak C4: POST naar de webhook (`create_task`)

- [ ] **Stap 1: HTTP Request-node**

Node **HTTP Request**, ná de LLM Chain.
- Method: **POST**
- URL: de webhook-URL uit Deel A, Taak A3 Stap 4.
- Body Content Type: **JSON**
- Specify Body: **Using JSON** → plak (vervang `<SECRET>` door `CD_WEBHOOK_SECRET`):

```json
{
  "secret": "<SECRET>",
  "event": "create_task",
  "categorie": "{{ $json.output.categorie }}",
  "code": "{{ $json.output.vve_code }}",
  "naam": "{{ $json.output.vve_naam }}",
  "actiepunt": "{{ $json.output.twijfel ? '🔎 controleren — ' + $json.output.actiepunt : $json.output.actiepunt }}",
  "behandelaar": "{{ $json.output.behandelaar }}",
  "deadline": "{{ $json.output.deadline }}",
  "actor": "mail-intake"
}
```

> Pas `$json.output.*` aan naar het echte pad van de parser-output (in n8n vaak `$json.output`). Controleer via de node-input wat het exacte veldpad is.

- [ ] **Stap 2: Test**

Test step. Verwacht: response `{"ok":true,"event":"create_task","rij":N}` en een nieuwe rij in "Nog Te Doen". Verwijder testrijen daarna.

---

### Taak C5: Concept-antwoord (alleen indien nodig)

- [ ] **Stap 1: If-node**

Node **If**, ná HTTP Request. Conditie: `{{ $('Basic LLM Chain').item.json.output.concept_antwoord }}` **is not empty**.

- [ ] **Stap 2: Gmail "Create Draft" (true-tak)**

Node **Gmail** → Resource: **Draft** → Operation: **Create**.
- To: `{{ $('Gmail Trigger').item.json.From }}`
- Subject: `Re: {{ $('Gmail Trigger').item.json.Subject }}`
- Message: `{{ $('Basic LLM Chain').item.json.output.concept_antwoord }}`
- Options → Thread ID: `{{ $('Gmail Trigger').item.json.threadId }}` (zodat het concept in de juiste conversatie hangt).

- [ ] **Stap 3: Test**

Test met een mail die om een reactie vraagt. Verwacht: een **concept** (niet verzonden) in de juiste Gmail-thread.

---

### Taak C6: Label "verwerkt" + activeren

- [ ] **Stap 1: Gmail "Add Label"-node**

Node **Gmail** → Resource: **Message** → Operation: **Add Label**. Laat zowel de If-true- als If-false-tak hierin uitkomen (zodat het altijd draait).
- Message ID: `{{ $('Gmail Trigger').item.json.id }}`
- Label: **verwerkt**

- [ ] **Stap 2: End-to-end test (handmatig)**

Stuur een echte voorbeeldmail naar info@. Draai de workflow met **Test workflow**.
Verwacht, in volgorde: taak verschijnt in "Nog Te Doen" (juiste sectie/beheerder) → push-melding/logboekregel → (indien nodig) concept klaar in Gmail → mail krijgt label "verwerkt".

- [ ] **Stap 3: Activeer**

Zet de workflow op **Active**. Hij draait nu 24/7 op n8n Cloud, elke minuut.

---

## DEEL D — Go-live & nazorg

### Taak D1: Begeleide proefperiode

- [ ] **Stap 1: Schaduw-draaien (1 week)**

Laat de motor draaien terwijl het team nog meekijkt. Verzamel fout-classificaties (verkeerde VvE/beheerder/categorie, gemiste twijfelgevallen).

- [ ] **Stap 2: Playbook bijstellen**

Verwerk de bevindingen in `beheer-playbook.md` (extra voorbeelden, scherpere regels). Commit elke aanpassing:

```bash
git add beheer-playbook.md
git commit -m "docs: playbook bijgesteld na proefperiode"
```

- [ ] **Stap 3: Push de repo-wijzigingen**

```bash
git push
```

(Push raakt het live dashboard niet behalve `index.html`; Apps Script blijft handmatig. Doel: repo-bron actueel houden.)

---

## Zelf-review (door de planner uitgevoerd)

- **Spec-dekking:** §3 autonomie → A2 (auto-taak) + C5 (concept ter controle) + C3 (twijfel→OPPAKKEN, geen concept). §5 architectuur → C2-C6. §6 AI-velden → C3-schema. §7 webhook-uitbreiding → A1+A2. §8 playbook → B1. §9 scope (offerte-bewaker/notulen) bewust niet opgenomen. §10 risico's: AVG → C1-S3; dubbelen → C2-filter + C6-label; foute classificatie → twijfel-regels B1/C4; kosten → C1. ✅ Geen gaten.
- **Placeholders:** de `<...>` in `beheer-playbook.md` zijn bewuste invul-velden mét een ingevulde stap (B1-S2), geen plan-placeholders. Code-stappen bevatten volledige code.
- **Type-consistentie:** `cd_createTaskRow(categorie, code, naam, actiepunt, behandelaar, deadline)` identiek gebruikt in A1 (definitie), A2 (`create_task`-event) en A3 (testfunctie). Webhook-veldnamen (`categorie/code/naam/actiepunt/behandelaar/deadline/secret/event/actor`) identiek in A2 (lezen), A3-S4 (curl) en C4 (n8n-body). ✅
