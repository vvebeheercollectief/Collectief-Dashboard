# Ontwerp — Offerte "Vandaag"-focus: van platte achterstand naar een korte dagshortlist

Datum: 2026-06-15
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: bouwt voort op het C2-herontwerp dat al op `staging` staat (nog niet naar
`main`). Eerst op `staging`, na akkoord van de beheerder merge naar productie (zie
[[feedback_staging_main_merge]] — eerst diffen/cherry-picken).

## Aanleiding

Het C2-herontwerp (`2026-06-15-offerte-tab-herontwerp-design.md`) maakte de offerte-tab
volwassen, maar bij het bekijken met **echte data** bleek een dieper probleem: de groep
"Nu opvolgen" bevat ~24 trajecten, allemaal "Te laat" en allemaal prioriteit "Hoog". Dat is
geen dagtaak — dat is de hele achterstand, ongedifferentieerd. De beheerder: *"Het voelt te
onduidelijk om te kunnen zeggen: vandaag moet ik deze nabellen en deze versturen."*

Als alles rood en hoog is, vertelt het signaal niets meer. De lijst verlamt in plaats van te
sturen.

## Doel

De offerte-opvolging tonen als een **korte, gerichte dagshortlist** die de beslissing voor je
maakt: wat kan ik vandaag *afmaken*, en wie moet ik *najagen* — met de volle achterstand uit
het zicht maar bereikbaar.

**Kernkeuzes (brainstorm 2026-06-15, door beheerder bevestigd):**
- Werkmodel: **korte dagshortlist** (niet: alles tonen, niet: inbox-één-kaart).
- Lengte: **flexibel** — een handvol per blok standaard, met "toon meer" voor inhaalslag-dagen
  (capaciteit "wisselt sterk").
- Splitsing: **Doorsturen** (zelf afmaken) vs **Nabellen** (najagen).
- "later"-knop: **alleen "morgen weer"** (één tik, geen datumprikker).
- Vastgelopen trajecten: **subtiel signaal op de rij** ("N× nagebeld"), géén apart scherm.

## Gekozen ontwerp — het "Vandaag"-paneel

Vervangt de platte "Nu opvolgen"/"Lopend"-tabelgroepering bovenaan de offerte-tab. Het paneel
woont in de bestaande `#off-briefing-slot` (waar nu de C2-briefing zit) en is altijd zichtbaar.

### Opbouw (boven → onder)

1. **Kop** — "Vandaag · <datum>".
2. **Cijfer-strip (overzicht)** — vier getallen, in de stijl van de bestaande stat-strip.
   Nieuwe labels (vervangen de C2-strip):

   | Label | Betekenis | Bron |
   |---|---|---|
   | Te doen | totaal dat opvolging vraagt | `feiten.nuOpvolgen` |
   | Vastgelopen | trajecten ≥3× nagebeld zonder reactie | nieuwe teller (zie onder) |
   | Klaar te versturen | offerte binnen, bal bij ons | `feiten.balBijOns` |
   | Bij de VvE | wacht op akkoord eigenaren | `feiten.klaarTeGunnen` |

   (De C2-`Urgentst`-blok vervalt — het bovenste Nabellen-item neemt die rol over.)
3. **Blok "Doorsturen · N"** — offertes die binnen zijn en klaar staan voor de eigenaren
   (quick wins, in eigen hand). Rijen: VvE-code (section-paars) · naam · context
   (`X/N binnen · omschrijving`) · `later` · knop **Doorsturen**.
4. **Blok "Nabellen · N"** — langst stil eerst, bal bij de aannemer/VvE. Rijen: code · naam ·
   context (`X dagen stil · <evt. "N× nagebeld"> · omschrijving`) · `later` · knop **Nabellen**.
5. **Inklap-voet** — "Hele lijst · N trajecten — Volledige tabel tonen". Klapt de volledige
   C2-tabel (`#ntd-tbody`, groepen Nu opvolgen/Lopend) eronder open voor zoeken/overzicht.

### Gedrag

- **Splitsing komt uit de motor.** Elk "nu opvolgen"-item heeft al `st.actie`
  (`'Doorsturen'` als `balBij==='ons'`, anders `'Nabellen'`). Het paneel groepeert daarop —
  géén nieuwe statusvelden, géén dataverhuizing.
- **Sortering.** Nabellen: aflopend op `offerteSorteerScore` (langst stil / meest te laat eerst).
  Doorsturen: meest-complete/oudste eerst (volgorde te verfijnen bij bouw, default sorteerscore).
- **Standaard ingekort.** Doorsturen toont standaard ~3, Nabellen ~5; "toon meer" klapt het
  betreffende blok volledig uit. Toggle-status in `state` (niet persistent nodig).
- **"later" = morgen weer.** Eén tik zet een snooze tot morgen (hergebruik snooze-patroon /
  `snooze.js`): het item verdwijnt vandaag uit het paneel en komt er morgen weer in. Geen
  logboek-regel, geen termijn-reset.
- **Acties hergebruiken de bestaande flow.** Doorsturen/Nabellen openen de bestaande
  `offerte-acties`-modal (`openOfferteActieModal`), die logt in het logboek + reset de
  opvolgtermijn. Daardoor zakt een afgehandeld traject ~een week weg → de lijst **roteert
  vanzelf**; je werkt de stapel echt af i.p.v. steeds dezelfde koppen te zien.
- **Vastgelopen-signaal.** Een nieuwe pure helper telt per code de Nabellen-acties in
  `D.logboek` (`offerteNabelTeller(code, logboek)`). Bij **≥3** krijgt de rij een gedempt
  amber tekst-label "N× nagebeld" (geen pill). De strip-teller "Vastgelopen" telt de
  nu-opvolgen-items met teller ≥3.

## Wat verandert per bestand

- **`src/render-lijsten.js`** — `renderOfferteBriefing()` wordt het "Vandaag"-paneel (kop +
  strip + Doorsturen-blok + Nabellen-blok + inklap-voet). Nieuwe helpers: `offerteNabelTeller`,
  rij-render voor de focus-mini-rijen, blok-inkorting + "toon meer". De C2-tabelrender
  (`#ntd-tbody`, groepen) blijft bestaan maar wordt standaard ingeklapt; de voet-toggle stuurt
  de zichtbaarheid.
- **`styles.css`** — focus-paneel (strip-hergebruik, sectiekoppen, mini-rijen, knoppen
  Doorsturen=teal-gevuld / Nabellen=teal-outline, `later`-link, vastgelopen-label, inklap-voet).
- **`src/state.js`** — toggle-vlaggen voor "blok uitgeklapt" + "volledige tabel zichtbaar".
- **`src/actions.js`** — handlers voor "toon meer", "volledige tabel tonen", "later" (snooze tot
  morgen), en de focus-rij-acties (hergebruiken `openOfferteActieModal`).
- **`src/util.js`** — alleen toevoegen indien een pure teller-helper daar beter past; de
  bestaande motor blijft ongewijzigd.
- **`src/tests.js`** — tests voor `offerteNabelTeller`, de splitsing Doorsturen/Nabellen, en de
  paneel-markup.
- **`sw.js`** — cacheversie ophogen.

## Wat NIET verandert

- De motor in `util.js` (`offerteNuOpvolgen`, `offerteFase`, `balBij`, `sorteerscore`,
  `offerteBriefingFeiten`) — alleen geconsumeerd, niet gewijzigd.
- `src/offerte-acties.js` (de actie-modal + logboek/termijn-logica).
- De C2-stijl van de volledige tabel (die wordt nu de ingeklapte "volledige lijst").
- Data, Sheet-structuur, Apps Script.

## Testen

- Bestaande tests (180 OK) groen houden.
- Nieuw: `offerteNabelTeller` telt Nabellen-logregels per code correct; de splitsing zet items
  met `balBij==='ons'` in Doorsturen en de rest in Nabellen; paneel-markup bevat beide
  blokken + de strip; "later"/snooze haalt een item uit de vandaag-render.
- Visuele check op staging in licht + donker, met echte ingelogde data: is de dagshortlist
  kort en scanbaar, roteert hij na een actie, werkt "toon meer" en de inklap-voet.

## Open punten

- **Cijfer-strip labels** — nieuwe labels (Te doen / Vastgelopen / Klaar te versturen / Bij de
  VvE) voorgesteld; beheerder mag terug naar de oude labels. Te bevestigen bij spec-review.
- Exacte standaard-aantallen per blok (3/5) en de vastgelopen-drempel (3) zijn redelijke
  defaults; fijn te stellen tijdens de bouw/op staging.
