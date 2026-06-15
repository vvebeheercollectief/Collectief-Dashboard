# Ontwerp — Offerte-tab herontwerp: volwassen, on-brand uitstraling (C2)

Datum: 2026-06-15
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: eerst volledig op `staging`, na akkoord van de beheerder merge naar
`main`/productie (zie [[feedback_staging_main_merge]] — eerst diffen/cherry-picken, niet kaal mergen).

## Aanleiding

Het offerte-opvolgsysteem (zie `2026-06-12-offerte-opvolgsysteem-design.md`) is functioneel
af en draait op staging: de "Nu opvolgen"-motor, de dagelijkse briefing, de fase-balk en de
één-klik acties (Nabellen/Doorsturen) werken. De **functionaliteit blijft volledig overeind.**

Het probleem is puur **visueel**. De beheerder bekeek de test-versie en vond hem
"kinderlijk en AI" ogen. De oorzaak: terwijl de rest van het dashboard de volwassen
V3-make-over heeft gehad (Manrope, status-als-tekst, géén pills — zie
[[project_dashboard_redesign]]), zijn de offerte-specifieke onderdelen nog in de oude,
speelse stijl gebouwd:

- **Emoji's** in de chrome: `✦ Briefing`, `🔔 Nu opvolgen`, `🎉` in de lege staat.
- **Paarse "snoep"-vlakken**: de briefing is een paars getint kader met paarse tekst, met
  daaronder rode/amber/teal **pill-chips**.
- **Speelgoed-fase-balk**: 4 segmenten met een felle amber-stip voor de huidige fase.
- **Paarse actieknoppen** voor Nabellen/Doorsturen.
- De **briefing-tekst zelf** is een gegenereerde paragraaf-met-✦ die als een chatbot aanvoelt —
  het sterkste "AI"-signaal.

## Doel & scope

De offerte-tab in lijn brengen met de volwassen V3-taal van de rest van het dashboard,
én de briefing een strakker, zakelijker format geven. Gekozen richting na brainstorm:
**C2 — zakelijk/terminal** (binnen Manrope, bijna geen kleur, sterke typografie, haarlijnen
i.p.v. gevulde vlakken).

**In scope:** alleen presentatie/CSS + render-markup van de offerte-onderdelen.
**Buiten scope:** de motor/logica (`util.js`), de actie-flow (`offerte-acties.js`), de data,
en de feiten-berekening. Die blijven byte-voor-byte zoals ze zijn.

**Harde regel:** geen paars meer in de *inhoud*. Paars (`--pu` `#6D5BD0`) blijft uitsluitend
de **tab-kleur** van de offerte-subcategorie (die mag bewust niet wijzigen — zie
[[project_collectief_dashboard]]). Ink + teal (`#0D7377`/`#0a5c60`) doen het werk.

## Gekozen ontwerp (C2)

### 1. Briefing — nieuw format

Vervangt de paarse banner volledig. Opbouw van boven naar beneden:

1. **Datumregel** — een klein hoofdletter-kicker `Vandaag` links, de datum (`maandag 15 juni`)
   rechts, met een haarlijn eronder.
2. **Urgentst-blok** — een dunne **teal verticale streep** (2px, `#0D7377`, vierkant — geen
   afronding) met daarnaast: kicker `Urgentst`, de kop (`naam · offerte-omschrijving`, ink vet),
   en een meta-regel (`X dagen stil · bal bij de aannemer`) met daarin een rustige tekst-link
   `Nabellen`/`Doorsturen` (ink met teal onderlijn). Voedt zich uit `feiten.urgentste`
   (`naam`/`code`, `dagen`, `balBij`).
3. **Cijfer-strip** — vier metrieken in de stijl van de bestaande V3-stat-strip (groot
   tabulair getal + klein hoofdletter-label), met een haarlijn erboven. Vaste mapping op
   `offerteBriefingFeiten`:

   | Label | Bron | Kleur getal |
   |---|---|---|
   | Nu opvolgen | `nuOpvolgen` | ink |
   | Lang stil | `langStil` | rood `#B91C1C` |
   | Wacht op jou | `balBijOns` | amber `#B45309` |
   | Bij de VvE | `klaarTeGunnen` | teal `#0D7377` |

De strip toont **altijd dezelfde vier metrieken** (ook als ze 0 zijn) — geen wisselende
kolommen, dat leest rustiger.

`balBij` → tekst: `aannemer` → "bal bij de aannemer", `ons` → "bal bij ons",
`vve` → "bal bij de eigenaren".

### 2. Altijd zichtbaar (open/dicht vervalt)

De briefing is nu compact genoeg om **permanent bovenaan de offerte-tab** te staan. Het oude
open/dicht-gedrag vervalt: weg zijn de `✦ Briefing`-pill, het `✕`-sluitknopje, de
`state.offerteBriefingOpen`-toggle, de bijbehorende `data-action`-handlers
(`offerte-briefing-openen`/`-sluiten`) en de auto-open-één-keer-per-dag-localStorage-logica.
Dit vereenvoudigt de code en haalt een laag ruis weg.

### 3. Rust-staat (niets dringend)

Geen `🎉`. De datumregel blijft; het urgentst-blok wordt een kalme zin
("Niets dat nu opvolging vraagt." + één regel context, met een grijze i.p.v. teal streep);
de cijfer-strip toont de vier metrieken (meestal 0/0/0/X). Voor de lege **"Nu opvolgen"-groep**
in de lijst: een rustige grijze regel ("Niets dat nu opvolging vraagt"), geen emoji.

### 4. Groepskoppen

`🔔 Nu opvolgen (3)` → **`Nu opvolgen · 3`** (klein hoofdletters, teal `#0a5c60`, haarlijn boven,
het getal in een gedempt grijs). `Lopend (5)` → **`Lopend · 5`** in gedempt grijs `#64748b`,
zodat "Nu opvolgen" (teal) en "Lopend" (grijs) van elkaar te onderscheiden zijn. Geen amber-vlak.

### 5. Fase-balk verfijnd

4 segmenten, hoogte 5px, `border-radius: 2px` (nauwelijks afgerond, geen pill). Afgeronde/huidige
fasen = teal `#0D7377`; toekomstige = `#e2e8f0`. **De felle amber-stip vervalt.** Ernaast een
kort tekstlabel met de fasenaam (`Aangevr.` / `Ontvangen` / `Bij VvE` / `Gegund`, teal `#0a5c60`),
zodat de exacte fase leesbaar is zonder kleur-raden.

### 6. Status-tekst & X/N-teller

- Deadlinestatus blijft als vetgedrukt woord (al V3): "12d stil" rood, "6d" amber, "binnen"/"3d"
  grijs — geen pills.
- De `offProg` X/N-teller (bv. "2/3" ontvangen offertes) staat nu in **paars** (`var(--pu)` voor
  zowel tekst als balkvulling). Dat wordt ink/gedempt met een **teal** vulling, conform de
  geen-paars-in-inhoud-regel.

### 7. Contextuele actieknop (Nabellen/Doorsturen)

De bestaande inline **lijn-iconen** (paper-plane = Doorsturen, telefoon = Nabellen) + tekst
blijven (geen-emoji-in-knoppen-beleid). Alleen de stijl wijzigt: de paarse `.off-actie`
(`var(--pu-l)`/`var(--pu-b)`/`var(--pu)`) wordt een **rustige teal-outline ghost-knop**
(transparante achtergrond, teal-rand `#5EEAD4`, tekst `#0a5c60`, hover `#CCFBF1`). Zo is het
duidelijk de "volgende stap", zonder te botsen met de licht-teal-gevulde "Afronden"-knop.

## Wat verandert per bestand

- **`styles.css`** — herontwerp van de offerte-blokken (regels rond 614–635 + 186–192):
  - Nieuw: briefing-blok (datumregel/kicker, urgentst-blok met teal streep, cijfer-strip —
    hergebruik waar mogelijk de bestaande `.stat-*`-tokens van de V3-stat-strip).
  - `.fase-balk`/`.fase-stap`: amber-stip eruit, segmenten verfijnd, fasenaam-label toegevoegd.
  - `.off-actie`: paars → teal-outline.
  - `.grp-kop`/`.grp-nu`: amber-vlak eruit, teal/grijs-onderscheid.
  - Verwijderen: `.off-briefing*` (banner, kop, chips, x, knop).
  - `offProg`-inline-stijl (in `util.js`): paars → ink/teal.
- **`src/render-lijsten.js`**:
  - `renderOfferteBriefing()` — nieuwe markup (datumregel + urgentst-blok + cijfer-strip),
    altijd zichtbaar; open/dicht-takken + localStorage-auto-open eruit.
  - `offerteBriefingTekst()` — vervangen door losse, korte tekstfragmenten voor het
    urgentst-blok en de rust-zin (de chatbot-paragraaf vervalt).
  - `faseBalk()` — fasenaam-label toevoegen, klassen aanpassen.
  - Groepkop-markup (rond regel 434/440) — emoji eruit, `· N`-vorm.
  - Lege-staat-markup (rond regel 437) — `🎉` eruit, rustige regel.
  - Contextuele-actie-markup (rond regel 547–551) — klasse naar teal-outline (iconen behouden).
- **`src/state.js` / handlers** — `offerteBriefingOpen` + de twee briefing-`data-action`-handlers
  verwijderen.
- **`src/util.js`** — alleen de inline-stijl in `offProg` (paars → ink/teal). De
  *logica* (`offerteBriefingFeiten`, `offerteNuOpvolgen`, `offerteFase`, scores) blijft ongewijzigd.
- **`sw.js`** — cacheversie ophogen.

## Wat NIET verandert

- De hele motor in `util.js` (feiten, fase-bepaling, bal-bij, sorteerscore, termijnen).
- `src/offerte-acties.js` (de modal + logboek-append + fase/opvolgdatum-schrijven).
- De data, de Sheet-structuur, de Apps Script-kant.
- Het gedrag van Nabellen/Doorsturen zelf (alleen de knop-stíjl wijzigt).

## Testen

- De bestaande **179 tests** moeten groen blijven. De pure-logica-tests (motor/feiten) worden
  niet geraakt omdat `util.js`-logica niet wijzigt.
- Render-/markup-tests die de oude strings asserten (`✦ Briefing`, `🔔 Nu opvolgen`, chip-teksten,
  `off-briefing`-klassen) worden bijgewerkt naar de nieuwe markup.
- Visuele verificatie op de staging-URL in **licht én donker** (de offerte-tab heeft eigen
  donkere-modus-tokens — `--pu`/`--ac` etc. — die mee moeten kleuren).
- Controle: geen paars meer zichtbaar in de inhoud van de offerte-tab; paars alleen nog als
  tab-indicator.

## Open punten

Geen. Gedragskeuze "briefing altijd zichtbaar (open/dicht vervalt)" is door de beheerder
bevestigd tijdens de brainstorm.
