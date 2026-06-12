# Ontwerp — Offerte-opvolgsysteem: eigen "Offertes"-pagina met dagelijkse briefing

Datum: 2026-06-12
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: eerst volledig op `staging` (test-Sheet `SID_TEST`), na akkoord van de
beheerder merge naar `main`/productie

## Aanleiding

Offerte-trajecten zijn nu een categorie binnen de hoofdlijst "Nog Te Doen"
(`SECS['OFFERTE-TRAJECTEN']` in `src/config.js`). In de praktijk lopen er tientallen tegelijk,
ze staan tussen alle andere taken, en — zoals de live-data laat zien — staan ze bijna allemaal
op "Te laat" én op prioriteit "Hoog". Daarmee is het prioriteitssignaal waardeloos geworden:
als alles rood en hoog is, vertelt het je niets meer.

De échte pijn zit in **opvolging**. Een traject blijft liggen omdat er niets is dat erop wijst
dat er iets moet gebeuren. De drie terugkerende faalvormen, door de beheerder bevestigd:

1. Een aannemer levert niet en er wordt vergeten na te bellen → traject blijft stil liggen.
2. Een offerte komt binnen maar wordt niet (op tijd) met de eigenaren gedeeld.
3. Bij meerdere uitgevraagde aannemers raakt men het overzicht kwijt: van wie wacht ik nog
   reactie?

De huidige werkwijze is reactief: eens in de zoveel tijd besluit het team "we doen een rondje
offertes" en loopt het de uitstaande aanvragen één voor één langs. Dat kost veel mentale
energie en is foutgevoelig. Doel van dit systeem: die mentale last overnemen — het systeem
bepaalt vóór jou wat aandacht nodig heeft, in welke volgorde, en bij wie de bal ligt.

## Doel & succescriteria

- Het "rondje offertes" plannen is niet meer nodig: het rondje staat er elke dag al, op
  volgorde van urgentie.
- Geen vergeten opvolging meer: een traject dat te lang stil ligt komt vanzelf bovendrijven.
- Bij elk traject is in één oogopslag zichtbaar **bij wie de bal ligt** (aannemer / wij / VvE).
- Het hoofdscherm "Nog Te Doen" wordt fors rustiger: de offerte-drukte verdwijnt eruit.
- Meetbaar: minder trajecten die "Te laat" worden, en een dagelijkse flow van enkele minuten
  vervangt de onregelmatige grote "rondjes".

## Scope

Een nieuwe, eigen **"Offertes"-pagina** in het dashboard (zoals VvE-dossier en Analytics ook
losse pagina's zijn), met vier samenhangende onderdelen:

- **A — De "Nu opvolgen"-motor**: een zelf-sorterende lijst die bovenaan zet wat aandacht
  nodig heeft, met een vloeiende zweef-animatie bij herordening.
- **B — De dagelijkse briefing**: schuift bij de eerste opening per dag automatisch open met een
  korte, slimme stand van zaken; altijd opnieuw te openen.
- **C — Per-traject detail**: fase-balk (Aangevraagd → Ontvangen → Bij VvE → Gegund) plus
  per-aannemer statusregels.
- **D — Eén-klik acties**: "Nabellen" / "Doorsturen" leggen direct een regel vast in het
  dossier-logboek en resetten de opvolg-teller.

Plus twee randzaken:
- **Hoofdscherm-wijziging**: in "Nog Te Doen" vervangt één samenvattingskaart de hele
  offerte-sectie.
- **Opslag**: een nieuw tabblad `Offertes` (+ optioneel `Aannemers`) en eenmalige migratie van
  bestaande offerte-rijen.

### Buiten scope (YAGNI — expliciet niet nu)

- **Geen e-mail/telefoon vanuit het dashboard.** De acties leggen alleen vast en herinneren;
  daadwerkelijk bellen of mailen doet de beheerder zelf. (Versturen kan een latere uitbreiding
  zijn, los van dit ontwerp.)
- **Geen kanban met slepen.** Slepen = handwerk = méér mentale last; de fase schuift vanzelf op.
- **Geen automatische aannemer-herkenning uit binnenkomende mail.** Dat hoort bij de aparte
  mail-intake motor (zie `2026-06-05-mail-intake-motor-design.md`).
- **Geen verplichte per-aannemer migratie.** De bestaande "X/N"-telling en namen-in-opmerkingen
  blijven werken; verrijken met losse aannemer-regels is optioneel en per traject.

## Levensloop van een traject

Vijf stadia, door de beheerder bevestigd:

1. **Aangevraagd** — offerte uitgevraagd bij één of meer aannemers.
2. **Wachten op aannemer** — bal bij hen (komt de offerte binnen?). *Geen aparte fase in de
   balk, maar een wacht-toestand binnen "Aangevraagd".*
3. **Ontvangen** — (alle) offerte(s) binnen, klaar om te beoordelen/te delen met de VvE.
4. **Bij VvE** — voorgelegd aan bestuur/leden, wachten op akkoord.
5. **Gegund / afgerond** — opdracht verstrekt, traject klaar.

De **fase-balk** toont vier mijlpalen: `Aangevraagd → Ontvangen → Bij VvE → Gegund`.

## A — De "Nu opvolgen"-motor

### Wanneer heeft een traject opvolging nodig?

Bepaald door instelbare termijnen (zie Instellingen) + laatste-opvolging-datum + deadline:

- **Bal bij aannemer**: fase `Aangevraagd`, nog niet alle offertes binnen (`ontvangen < aangevraagd`),
  én `(vandaag − laatste opvolging) ≥ termijn_aannemer`. → suggestie "Nabellen".
- **Bal bij ons**: fase `Ontvangen`, nog niet gedeeld met de VvE, én
  `(vandaag − datum ontvangen of laatste opvolging) ≥ termijn_delen`. → suggestie "Doorsturen".
- **Bal bij VvE**: fase `Bij VvE`, én `(vandaag − laatste opvolging) ≥ termijn_eigenaren`.
  → suggestie "Herinneren". *(Open punt: of deze fase een eigen klok krijgt — zie onder.)*
- **Deadline overschreden**: staat altijd bovenaan, ongeacht het bovenstaande.

### Sorteervolgorde

Een berekende score per traject bepaalt de volgorde in "Nu opvolgen":

1. Deadline overschreden (ja vóór nee), dan
2. Aantal dagen stil (aflopend), dan
3. Prioriteit (Hoog > Midden > Laag).

Trajecten die géén opvolging nodig hebben, verschijnen niet in "Nu opvolgen" — die staan onder
"Lopende trajecten". De teller bovenin ("Nu opvolgen: 4") telt alleen wat actie vraagt.

### Zweef-animatie bij herordening

Wanneer een actie de score verandert en een item van plek verschuift, animeert de lijst dit
zichtbaar met de **FLIP-techniek** (First-Last-Invert-Play), in vanilla JS, consistent met de
bestaande animaties (`src/anim.js`):

1. Meet posities van de zichtbare rijen vóór de her-render (First).
2. Render de nieuwe volgorde (Last).
3. Zet elke rij met een `transform` terug naar de oude plek (Invert).
4. Transitioneer de transform naar 0 → de rij "zweeft" naar zijn nieuwe positie (Play).

Respecteer `prefers-reduced-motion` (direct verspringen zonder animatie).

## B — De dagelijkse briefing

### Gedrag

- Bij de **eerste opening van de Offertes-pagina per kalenderdag** schuift de briefing
  automatisch open. Vervolgopeningen die dag doen dat niet (anders is het ruis).
- "Voor het eerst vandaag" wordt clientside bijgehouden (`localStorage`, sleutel met de datum).
- Altijd **opnieuw te openen** via een knop bovenin de pagina (`✦ Briefing`). De `↻` haalt 'm
  opnieuw op, de `✕` klapt 'm dicht.

### Inhoud — regel-gebaseerde kern + AI-toon

De briefing wordt in twee lagen opgebouwd, zodat hij altijd werkt:

1. **Regel-gebaseerde kern** (deterministisch, snel, gratis): berekent de feiten —
   aantal nu-opvolgen, hoeveel >7 dagen stil, hoeveel wachten op ons, hoeveel klaar om te
   gunnen, en het urgentste traject met naam + dagen + bal-bij-wie.
2. **AI-laag voor de toon** (via de bestaande module `src/ai.js`, die al per-VvE live context
   kan ophalen): giet die feiten in 2–4 natuurlijke Nederlandse zinnen, assistent-toon.
   **Fallback**: lukt de AI-aanroep niet, dan toont de briefing dezelfde feiten via een vast
   tekstsjabloon. De kern is dus nooit afhankelijk van de AI.

De briefing eindigt met enkele highlight-chips (bv. "2 lang stil" · "1 wacht op jou" ·
"3 klaar om te gunnen").

## C — Per-traject detail

- **Fase-balk** met vier mijlpalen; de actieve fase is gemarkeerd, afgeronde fasen gevuld,
  toekomstige fasen grijs. Schuift vanzelf op als de fase verandert (geen slepen).
- **Per-aannemer statusregels** (optioneel per traject): naam + status-pill. Statussen:
  `Uitgevraagd` · `Offerte ontvangen` · `Geen reactie · N dagen` · `Afgewezen` · `Gekozen`.
- **Migratie-vriendelijk**: heeft een traject (nog) geen losse aannemer-regels, dan toont het
  detail de bestaande "X/N"-telling (`offProg`) plus de namen uit `opmerkingen`, precies zoals
  nu. Verrijken kan later, per traject, wanneer het uitkomt.

## D — Eén-klik acties

Per item in "Nu opvolgen" een contextuele actieknop (afgeleid van bal-bij-wie):

- **Nabellen** (bal bij aannemer/VvE) → opent een korte bevestiging ("nagebeld — eventueel een
  notitie"), legt bij akkoord een regel vast in het **dossier-logboek** (hergebruik van het
  bestaande `Logboek`-tabblad en de contactmoment-schrijfwijze uit het VvE-dossier,
  `actie === 'Contact'`), zet **laatste opvolging = vandaag**, en het traject zakt uit
  "Nu opvolgen" (met zweef-animatie).
- **Doorsturen** (bal bij ons) → idem, met logregel "offerte gedeeld met eigenaren" en
  fase-overgang naar `Bij VvE`.

Eén handeling, geen dubbel bijhouden in de opmerkingen. (De beheerder doet de feitelijke
belactie/mail zelf; de knop legt de opvolging vast.)

## Hoofdscherm-wijziging ("Nog Te Doen")

De hele offerte-sectie verdwijnt uit de hoofdlijst en wordt vervangen door één compacte
**samenvattingskaart**: *"18 offerte-trajecten · 4 nu opvolgen →"*, die naar de Offertes-pagina
linkt. Daarmee wordt het hoofdscherm fors rustiger en blijft het overzicht op één klik afstand.

De categorie `OFFERTE-TRAJECTEN` in `SECS` blijft bestaan voor data-compatibiliteit, maar wordt
in de "Nog Te Doen"-render niet meer als volledige sectie getoond.

## Opslag (Google Sheets)

### Nieuw tabblad `Offertes` — één rij per traject

| Kolom | Betekenis |
|---|---|
| `Traject-ID` | uniek id (bv. tijdstempel) — koppeling naar `Aannemers` en logboek |
| `VvE Code` | bestaande code |
| `VvE` | naam |
| `Onderwerp` | het werk, bv. "Schilderwerk gevel" (nu vaak in opmerkingen verstopt) |
| `Datum aangevraagd` | startdatum |
| `Aantal aangevraagd` | N |
| `Aantal ontvangen` | X (afgeleid uit `Aannemers` als die er zijn, anders handmatig) |
| `Fase` | Aangevraagd / Ontvangen / Bij VvE / Gegund |
| `Behandelaar` | |
| `Deadline` | |
| `Prioriteit` | Hoog / Midden / Laag |
| `Laatste opvolging` | datum — voedt de opvolg-klok |
| `Termijn aannemer (override)` | optioneel, dagen — leeg = standaard |
| `Termijn eigenaren (override)` | optioneel, dagen — leeg = standaard |
| `Opmerkingen` | vrije tekst (blijft werken zoals nu) |
| `Status` | open / afgerond |

### Optioneel tabblad `Aannemers` — één rij per aannemer per traject

| Kolom | Betekenis |
|---|---|
| `Traject-ID` | koppeling naar `Offertes` |
| `Aannemer` | naam |
| `Status` | Uitgevraagd / Offerte ontvangen / Geen reactie / Afgewezen / Gekozen |
| `Datum uitgevraagd` | |
| `Laatste contact` | datum |

Lezen/schrijven gaat rechtstreeks via de ingelogde gebruiker (zoals taken en kenmerken nu ook),
**geen Apps Script-wijziging** nodig voor de kernfunctie. Datums via `_parseAnyDate()` (Sheets
levert Nederlandse long-dates).

### Eenmalige migratie

Een eenmalige, idempotente migratie zet bestaande offerte-rijen uit "Nog Te Doen" om naar het
`Offertes`-tabblad: `code`, `naam`, `datumAangevraagd`, `offertes` (→ N en X), `behandelaar`,
`deadline`, `prioriteit`, `opmerkingen` worden overgenomen; `Onderwerp` initieel afgeleid uit
de eerste regel van `opmerkingen` (handmatig bij te schaven); `Laatste opvolging` initieel =
`datumAangevraagd`; `Fase` afgeleid uit X/N (X==0 → Aangevraagd; 0<X<N of X==N → Ontvangen).
Geen `Aannemers`-regels aangemaakt (optioneel, later).

## Instellingen — opvolg-termijnen

- **Standaardtermijnen** (constante in `src/config.js`, herzienbaar): aannemer 5 werkdagen
  geen reactie → opvolgen; offerte delen met eigenaren binnen 7 dagen; eigenaren 7 dagen.
  *(Exacte defaults: open punt — zie onder.)*
- **Per-traject override** via de twee override-kolommen.
- Werkdagen vs kalenderdagen: open punt (zie onder); voorstel werkdagen voor de aannemer-klok.

## Architectuur / betrokken modules

Bestaand patroon: modulaire vanilla JS in `src/`, Google Sheets backend, optimistische writes
met `backgroundWrite` (`src/data.js`).

- **`src/config.js`** — `PAGE_META.offertes`; standaard-termijnen; `SECS`-aanpassing voor de
  samenvattingskaart in "Nog Te Doen".
- **`src/data.js`** — `Offertes`- en `Aannemers`-tabbladen meeladen en parsen (uitbreiding van
  `loadAll` + nieuwe parse-functies); afleiden van fase/score.
- **`src/render-offertes.js`** *(nieuw)* — render van de pagina: briefing, tellers,
  "Nu opvolgen", lopende trajecten, fase-balk; FLIP-herordening.
- **`src/offertes.js`** *(nieuw)* of uitbreiding van `src/crud.js`/`src/actions.js` — de
  eén-klik acties (nabellen/doorsturen → logboek + laatste-opvolging + fase).
- **`src/ai.js`** — briefing-prompt (AI-toonlaag) bovenop de regel-gebaseerde feiten.
- **`src/main.js` / navigatie** — route naar de Offertes-pagina; briefing-trigger op eerste
  opening per dag (`localStorage`).
- **`src/anim.js`** — FLIP-helper (of hergebruik bestaande animatie-utilities).
- **`styles.css`** — stijlen voor briefing, fase-balk, aannemer-regels, "Nu opvolgen"-rijen.
- **`src/tests.js`** — tests voor de motor-logica (zie Testen).

## Foutafhandeling

- **Schrijffouten**: hergebruik `backgroundWrite` met rollback + toast (bestaand patroon).
- **AI-briefing faalt**: stilletjes terugvallen op het tekstsjabloon; geen blokkering.
- **Ontbrekende/lege datums**: traject zonder `Laatste opvolging` valt terug op
  `Datum aangevraagd`; ontbreekt dat ook, dan geen valse "X dagen stil" (toon "—").
- **Geen `Aannemers`-regels**: detail valt terug op X/N + opmerkingen.
- **Datumparsing**: altijd via `_parseAnyDate()` (Nederlandse long-dates uit Sheets).

## Testen

- **Staging-first**: alles bouwen en testen op de test-Sheet (`SID_TEST`); de bestaande
  62-tests-suite moet groen blijven, aangevuld met tests voor: opvolg-klok-berekening,
  sorteerscore, fase-afleiding, en de migratie (idempotent).
- **Briefing**: testbare regel-gebaseerde kern los van de AI-laag.
- Pas na expliciet akkoord van de beheerder merge naar `main`/productie.

## Open punten (te beslissen in/vóór het plan)

1. **Exacte standaardtermijnen** (aannemer / delen / eigenaren) — voorstel 5 / 7 / 7 dagen.
2. **Werkdagen vs kalenderdagen** voor de klok — voorstel werkdagen voor aannemer.
3. **Krijgt fase "Bij VvE" een eigen opvolg-klok** (eigenaren herinneren), of alleen tonen?
4. **`Aannemers`-tabblad nu al aanmaken** (leeg, klaar voor verrijking) of pas wanneer het eerste
   traject verrijkt wordt?
