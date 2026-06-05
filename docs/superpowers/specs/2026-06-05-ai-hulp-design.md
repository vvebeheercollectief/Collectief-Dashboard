# Spec — AI-hulp (plak mailtekst, slim kopieer-plak)

**Datum:** 2026-06-05
**Project:** [[Collectief Dashboard 4.0]] — `index.html`
**Status:** Goedgekeurd ontwerp (mockup `mockup-ai-hulp.html` akkoord, incl. resultaat-cards)

## Doel

Een mail (of stuk tekst) plakken en er met behulp van Claude/Gemini snel iets
bruikbaars uit halen: een samenvatting, de juiste categorie + VvE, concrete
actiepunten en een concept-antwoord. **Koppeling-keuze van de gebruiker: "slim
kopieer-plak"** — geen API-sleutel, geen kosten, geen automatische uitgaande data.
Het dashboard bouwt de perfecte vraag; de gebruiker kopieert die naar de chat die
hij toch al gebruikt en plakt het antwoord terug.

## Gedrag

Geopend via een **bovenbalk-knop** (✦, naast de dichtheid- en thema-knop) in een
modal in huisstijl. Stappen:

1. **Mailtekst plakken** in een groot tekstvak.
2. **Kiezen wat je nodig hebt** (meerdere mag): Samenvatting · Categorie & VvE ·
   Actiepunten · Concept-antwoord. (Default: alle vier aan.)
3. **Optioneel een VvE koppelen** (dropdown uit live dashboard-data). Bij koppeling
   stuurt het dashboard *live context* mee: behandelaar, open taken voor die VvE,
   en de laatste paar logboek-regels.
4. **Prompt wordt live opgebouwd** en getoond (read-only preview). De prompt
   instrueert de AI om te antwoorden met vaste kopjes (`Samenvatting:`,
   `Categorie:`, `Actiepunten:`, `Concept-antwoord:`) zodat terugplakken netjes
   te ontleden is.
5. **Kopieer & open** Claude of Gemini: prompt naar klembord + chat opent in nieuw
   tabblad. Bevestigingstoast.
6. **Antwoord terugplakken** in een tekstvak → het dashboard ontleedt het op de
   vaste kopjes en toont **resultaat-cards**:
   - 📝 Samenvatting (tekst)
   - 🏷️ Categorie & VvE (sectie + VvE + prioriteit) met knop **Overnemen** →
     opent de "Taak toevoegen"-modal voorgevuld met sectie/code/naam.
   - ✅ Actiepunten (lijst) met **+ Taak** per punt en **Alles → taken**; opent de
     toevoeg-modal voorgevuld met het actiepunt (+ code/naam).
   - ✍️ Concept-antwoord met **Kopieer** → naar klembord voor in de mail.

## Techniek

- **Nieuwe modal** `#ai-bg` (zelfde patroon als `#modal-bg`): header, body met de
  stappen, sluitknop. Open/sluit via `openAiHelp()` / `closeAiHelp()`.
- **Bovenbalk-knop** `#ai-btn` vóór `#density-btn`; binding in boot.
- **VvE-dropdown** wordt gevuld uit `D.alvo` (code + naam) bij openen.
- **Contextopbouw** `aiVveContext(code)`:
  - behandelaar(s) en open taken: zoek in `D.ntd` (alle secties) op `code`.
  - laatste logboek: eerste ~3 items uit `D.logboek` met die `code`
    (al nieuw→oud gesorteerd).
- **Promptopbouw** `buildAiPrompt()`: rol-instructie + mailtekst + (optioneel)
  VvE-context + gevraagde onderdelen met de vaste-kopjes-instructie.
- **Kopiëren** `copyAiPrompt(waar)`: `navigator.clipboard.writeText` + `window.open`
  (`https://claude.ai/new` of `https://gemini.google.com/app`) + `showToast`.
- **Antwoord ontleden** `parseAiAnswer()`: split de geplakte tekst op de bekende
  kopjes; render de cards voor de onderdelen die de gebruiker had gekozen.
- **Acties op cards** hergebruiken de bestaande taakflow: een helper
  `prefillNieuweTaak(sec, {code,naam,actiepunt})` zet `activeNtd=sec`, roept
  `openModal(false)` aan en vult daarna de velden. Niets aan `submitTask` wijzigen.
  "Kopieer"-knoppen gebruiken het klembord + toast.
- Alles via bestaande CSS-variabelen → dark mode klopt.

## Privacy / veiligheid
- Er gaat **niets automatisch** naar buiten. De gebruiker kopieert bewust en plakt
  in zijn eigen chat. Geen API-sleutels in de frontend, geen kosten.
- De meegestuurde "live context" is dezelfde info die de gebruiker zelf al in het
  dashboard ziet; hij ziet 'm in de prompt-preview vóór kopiëren.

## Niet-doelen
- Geen ingebouwde API-aanroep (bewust afgewezen i.v.m. sleutels/kosten).
- Geen automatische e-mailverzending; "Kopieer als mail-antwoord" zet alleen tekst
  op het klembord.
- Geen opslag van mailtekst of AI-antwoord; alles leeft alleen in de modal.

## Testplan (headless waar mogelijk; live met Google-login door gebruiker)
1. Knop opent modal; voorbeeldmail/leeg veld; chips togglen.
2. Prompt bouwt live mee met mailtekst, gekozen onderdelen en VvE-context.
3. Kopieer-knop: klembord gevuld (headless te checken) + nieuw tabblad-intentie.
4. Antwoord plakken (voorbeeld) → juiste cards verschijnen; alleen voor gekozen
   onderdelen.
5. "Overnemen" en "+ Taak" openen de toevoeg-modal correct voorgevuld.
6. "Kopieer" concept-antwoord → klembord gevuld.
7. Dark mode correct.
