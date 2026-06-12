# Ontwerp — Offerte-opvolgsysteem: het offerte-tabblad slim maken (briefing + Nu-opvolgen-motor)

Datum: 2026-06-12 (herzien na verkenning + gebruikerskeuzes)
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: eerst volledig op `staging` (test-Sheet `SID_TEST`), na akkoord van de
beheerder merge naar `main`/productie

## Aanleiding

Offerte-trajecten hebben al een **eigen sectie/tabblad binnen "Nog Te Doen"**
(`SECS['OFFERTE-TRAJECTEN']` in `src/config.js`), naast Oppakken, Vergaderverzoeken en LOD.
In de praktijk lopen er tientallen tegelijk. Zoals de live-data laat zien staan ze bijna
allemaal op "Te laat" én op prioriteit "Hoog" — daarmee is het prioriteitssignaal waardeloos:
als alles rood en hoog is, vertelt het je niets meer.

Het offerte-tabblad is dus een **lange, platte lijst** waar het team periodiek doorheen ploegt
("we doen een rondje offertes"). Dat kost veel mentale energie en is foutgevoelig. De échte
pijn zit in **opvolging**: een traject blijft liggen omdat niets erop wijst dat er iets moet
gebeuren. De drie terugkerende faalvormen, door de beheerder bevestigd:

1. Een aannemer levert niet en er wordt vergeten na te bellen → traject blijft stil liggen.
2. Een offerte komt binnen maar wordt niet (op tijd) met de eigenaren gedeeld.
3. Bij meerdere uitgevraagde aannemers raakt men het overzicht kwijt: van wie wacht ik nog
   reactie?

Doel: die mentale last overnemen — het systeem bepaalt vóór jou wat aandacht nodig heeft, in
welke volgorde, en bij wie de bal ligt.

## Gekozen aanpak (na verkenning)

**Het bestaande offerte-tabblad slim maken** — géén nieuwe pagina, géén menu-item, géén
samenvattingskaart, géén dataverhuizing. We verrijken de render van de bestaande
`OFFERTE-TRAJECTEN`-sectie binnen "Nog Te Doen", en lezen/verrijken de data die er al is.

Dit bouwt voort op infrastructuur die al bestaat (verkend in de code):

- **Stil-escalatie** (`STIL_ESCALATIE_REGELS` in `src/util.js`, Fase 4): per categorie drempels;
  `OFFERTE-TRAJECTEN: { trap1: 21, trap2: 35 }` dagen. Plus `bepaalStil(r, sec)` die "Stil Nd"
  berekent en een `pill-stil` toont (`src/render-lijsten.js`).
- **Opvolgdatum / wegleggen** (`opvolgStatus(r)`, kolom L `opvolgdatum`): traject parkeren tot
  een datum; `pill-opvolg` "🔔 Opvolgen vandaag" / `pill-snooze`.
- **X/N-telling** (`offProg(r.offertes)` in `src/util.js`): ontvangen/aangevraagd met balk.
- **Contactmoment-logging** (`addContactLog()` in `src/render-vve.js`): schrijft naar het
  `Logboek`-tabblad met `actie:'Contact'`; patroon voor de één-klik acties.
- **Datumlogica**: `_parseAnyDate()`, `_vandaagAmsterdam()`, `_verschilInKalenderdagen()`.

> Reden voor deze keuze (i.p.v. een aparte pagina + migratie): één bron van waarheid, geen
> risico voor bestaande data, snel veilig op staging/productie, en het past in het bestaande
> sectie-render-patroon. Het zichtbare eindresultaat is gelijk; alleen de bouwwijze is
> lichter en veiliger.

## Doel & succescriteria

- Het "rondje offertes" plannen is niet meer nodig: bovenaan het offerte-tabblad staat elke dag
  al wat aandacht nodig heeft, op volgorde van urgentie.
- Geen vergeten opvolging meer: een traject dat te lang stil ligt komt vanzelf bovendrijven.
- Bij elk traject is in één oogopslag zichtbaar **bij wie de bal ligt** (aannemer / wij / VvE).
- Meetbaar: minder trajecten die "Te laat" worden; een dagelijkse flow van enkele minuten
  vervangt de onregelmatige grote "rondjes".

## Scope

Vier samenhangende onderdelen, allemaal binnen de bestaande `OFFERTE-TRAJECTEN`-sectie van de
"Nog Te Doen"-pagina:

- **A — De "Nu opvolgen"-motor**: bovenaan de sectie een zelf-sorterende groep die toont wat
  opvolging nodig heeft, met een vloeiende zweef-animatie bij herordening. Daaronder de rest van
  de trajecten.
- **B — De dagelijkse briefing**: schuift bij de eerste keer dat het offerte-tabblad die dag
  geopend wordt automatisch open met een korte, slimme stand van zaken; altijd opnieuw te openen
  via een knop.
- **C — Per-traject detail**: fase-balk (Aangevraagd → Ontvangen → Bij VvE → Gegund) plus
  optionele per-aannemer statusregels.
- **D — Eén-klik acties**: "Nabellen" / "Doorsturen" leggen direct een regel vast in het
  `Logboek` en zetten de opvolgdatum (resetten de teller), waarna het traject uit "Nu opvolgen"
  zakt.

### Buiten scope (YAGNI — expliciet niet nu)

- **Geen aparte Offertes-pagina / menu-item / samenvattingskaart.** Alles leeft in het bestaande
  offerte-tabblad.
- **Geen nieuw `Offertes`-tabblad in de Sheet en geen migratie.** We lezen de bestaande
  offerte-rijen (`D.ntd['OFFERTE-TRAJECTEN']`).
- **Geen e-mail/telefoon vanuit het dashboard.** De acties leggen alleen vast en herinneren;
  daadwerkelijk bellen of mailen doet de beheerder zelf.
- **Geen kanban met slepen.** De fase schuift vanzelf op.
- **Geen automatische aannemer-herkenning uit binnenkomende mail.** Dat hoort bij de aparte
  mail-intake motor (`2026-06-05-mail-intake-motor-design.md`).
- **Per-aannemer detail is optioneel** (los, klein `Aannemers`-tabblad): de bestaande
  "X/N"-telling en namen-in-`opmerkingen` blijven werken; verrijken kan per traject, wanneer het
  uitkomt — nooit verplicht alles opnieuw invoeren.

## Levensloop van een traject

Vijf stadia, door de beheerder bevestigd:

1. **Aangevraagd** — offerte uitgevraagd bij één of meer aannemers.
2. **Wachten op aannemer** — bal bij hen. *Wacht-toestand binnen "Aangevraagd", geen aparte
   fase in de balk.*
3. **Ontvangen** — (alle) offerte(s) binnen, klaar om te delen met de VvE.
4. **Bij VvE** — voorgelegd, wachten op akkoord.
5. **Gegund / afgerond** — opdracht verstrekt, traject klaar (bestaande "Afronden"-knop).

De **fase-balk** toont vier mijlpalen: `Aangevraagd → Ontvangen → Bij VvE → Gegund`.

Fase-afleiding (zonder nieuwe verplichte invoer): af te leiden uit de bestaande velden —
`offertes` "X/N" (X==0 → Aangevraagd; 0<X≤N → Ontvangen) — met een optioneel expliciet
`fase`-veld dat de afleiding overschrijft zodra het team "Bij VvE"/"Gegund" wil markeren (zie
Opslag).

## A — De "Nu opvolgen"-motor

### Wanneer heeft een traject opvolging nodig?

Bepaald door de stil-teller (hergebruik van `bepaalStil` / `STIL_ESCALATIE_REGELS`), de
opvolgdatum, en de deadline. Een traject is "nu opvolgen" als:

- **Bal bij aannemer**: fase `Aangevraagd`, nog niet alle offertes binnen
  (`ontvangen < aangevraagd`), én aantal dagen stil ≥ `termijn_aannemer`. → suggestie "Nabellen".
- **Bal bij ons**: fase `Ontvangen`, nog niet gedeeld met de VvE, én dagen stil ≥ `termijn_delen`.
  → suggestie "Doorsturen".
- **Bal bij VvE**: fase `Bij VvE`, én dagen stil ≥ `termijn_eigenaren`. → suggestie "Herinneren".
- **Deadline overschreden** of **opvolgdatum = vandaag/verleden**: altijd in "Nu opvolgen".

Een **weggelegd** traject (`opvolgStatus(r).weggelegd`, opvolgdatum in de toekomst) staat
bewust geparkeerd en verschijnt níet in "Nu opvolgen" tot zijn opvolgdatum — consistent met
Fase 4.

### Sorteervolgorde (score)

Volgorde binnen "Nu opvolgen":

1. Deadline overschreden of opvolgdatum-vandaag (ja vóór nee), dan
2. Aantal dagen stil (aflopend), dan
3. Prioriteit (Hoog > Midden > Laag), dan
4. Deadline (vroegste eerst).

Trajecten zonder opvolgbehoefte verschijnen onder een tweede groep "Lopend" binnen dezelfde
sectie. Een telkop toont het aantal ("Nu opvolgen — 4").

### Zweef-animatie bij herordening

Wanneer een actie de score verandert en een rij van plek verschuift, animeert de lijst dit met
de **FLIP-techniek** (First-Last-Invert-Play), in vanilla JS, in lijn met bestaande animaties:

1. Meet posities van de zichtbare rijen vóór de her-render (First).
2. Render de nieuwe volgorde (Last).
3. Zet elke rij met `transform` terug naar de oude plek (Invert).
4. Transitioneer de transform naar 0 → de rij "zweeft" (Play).

Respecteer `prefers-reduced-motion` (direct verspringen).

## B — De dagelijkse briefing

### Gedrag

- Bij de **eerste keer dat het offerte-tabblad die kalenderdag actief wordt**, schuift de
  briefing automatisch open. Latere keren die dag niet (anders ruis). Bijgehouden in
  `localStorage` (sleutel met de datum).
- Altijd **opnieuw te openen** via een knop bovenin de sectie (`✦ Briefing`); `↻` ververst,
  `✕` klapt dicht.

### Inhoud — regel-gebaseerde kern + AI-toon

Twee lagen, zodat hij altijd werkt:

1. **Regel-gebaseerde kern** (deterministisch, snel, gratis): berekent de feiten — aantal
   nu-opvolgen, hoeveel langer dan trap2 stil, hoeveel "bal bij ons", hoeveel klaar om te
   gunnen, en het urgentste traject met naam + dagen + bal-bij-wie.
2. **AI-laag voor de toon** (via `src/ai.js`, die al per-VvE live context kan ophalen): giet die
   feiten in 2–4 natuurlijke Nederlandse zinnen, assistent-toon. **Fallback**: lukt de
   AI-aanroep niet, dan toont de briefing dezelfde feiten via een vast tekstsjabloon. De kern is
   nooit afhankelijk van de AI.

De briefing eindigt met enkele highlight-chips ("2 lang stil" · "1 wacht op jou" · "3 klaar om
te gunnen").

## C — Per-traject detail

- **Fase-balk** met vier mijlpalen; actieve fase gemarkeerd, afgeronde gevuld, toekomstige grijs.
  Schuift vanzelf op (geen slepen).
- **Per-aannemer statusregels** (optioneel per traject): naam + status-pill. Statussen:
  `Uitgevraagd` · `Offerte ontvangen` · `Geen reactie · N dagen` · `Afgewezen` · `Gekozen`.
- **Migratie-vriendelijk**: zonder losse aannemer-regels toont het detail de bestaande
  "X/N"-telling (`offProg`) + namen uit `opmerkingen`, precies zoals nu.

## D — Eén-klik acties

Per item in "Nu opvolgen" een contextuele actieknop (afgeleid van bal-bij-wie):

- **Nabellen** (bal bij aannemer/VvE) → korte bevestiging (optionele notitie), legt een regel
  vast in het `Logboek` (hergebruik `addContactLog`-patroon: `actie:'Contact'`,
  `veld:'Telefoon'`), zet `opvolgdatum`/laatste-contact = vandaag, en het traject zakt uit
  "Nu opvolgen" (met zweef-animatie).
- **Doorsturen** (bal bij ons) → idem, logregel "offerte gedeeld met eigenaren", fase →
  `Bij VvE`.

Eén handeling, geen dubbel bijhouden in `opmerkingen`. (De feitelijke bel-/mailactie doet de
beheerder zelf.)

## Opslag (Google Sheets)

### Geen nieuw verplicht tabblad, geen migratie

De motor en briefing lezen de **bestaande** offerte-rijen uit `D.ntd['OFFERTE-TRAJECTEN']`
(geparseerd door `parseSections` in `src/data.js`). Beschikbare velden per rij: `code`, `naam`,
`datumAangevraagd`, `offertes` ("X/N"), `behandelaar`, `deadline`, `prioriteit`, `opmerkingen`,
`opvolgdatum` (kolom L), `subcategorie`, `esc`.

### Optioneel: één nieuw kolom-veld `fase`

Om "Bij VvE"/"Gegund" expliciet te kunnen markeren (los van de X/N-afleiding) gebruiken we een
ongebruikte kolom in het "Nog Te Doen"-tabblad voor offerte-rijen (te bepalen in het plan;
naar het Fase-4-patroon van `opvolgdatum`=L/`herhaalId`=M/`esc`=N, dus een volgende vrije
kolom). Leeg = afleiden uit X/N. Schrijven via dezelfde `writeRange`-aanroep als bestaande
celwrites. **Geen Apps Script-wijziging** nodig.

### Optioneel: los `Aannemers`-tabblad (per-aannemer detail)

Eén regel per aannemer per traject, gekoppeld op `code` + `onderwerp` (of een traject-id):
kolommen `code` · `onderwerp` · `aannemer` · `status` · `datumUitgevraagd` · `laatsteContact`.
Geladen/geparsed naar het bestaande `kenmerken.js`-patroon (parse + helper + save +
`backgroundWrite`). Volledig optioneel: ontbreekt het tabblad of een regel, dan valt het detail
terug op X/N + `opmerkingen`.

## Instellingen — opvolg-termijnen

- **Standaardtermijnen** (constante in `src/config.js` of hergebruik/uitbreiding van
  `STIL_ESCALATIE_REGELS`): aannemer **5** werkdagen stil → opvolgen; offerte delen binnen **7**
  dagen; eigenaren **7** dagen. *(Let op: bestaande `STIL_ESCALATIE_REGELS` voor
  OFFERTE-TRAJECTEN is 21/35 kalenderdagen voor de generieke stil-pill; de offerte-motor
  gebruikt fijnere, fase-afhankelijke termijnen — apart van de generieke pill, om de bestaande
  Apps-Script-sync niet te verstoren.)*
- **Per-traject override**: optioneel later; v1 gebruikt de standaarden.
- **Werkdagen vs kalenderdagen**: werkdagen voor de aannemer-klok (weekend telt niet mee);
  helper toevoegen naast `_verschilInKalenderdagen`.

## Architectuur / betrokken modules

Bestaand patroon: modulaire vanilla JS in `src/`, Google Sheets backend, optimistische writes
met `backgroundWrite` (`src/data.js`), tests via `?test=1` → `src/tests.js`.

- **`src/util.js`** — nieuwe pure functies: `offerteFase(r)`, `offerteBalBij(r, vandaag)`,
  `offerteNuOpvolgen(r, vandaag, termijnen)`, `offerteSorteerScore(r, vandaag)`,
  `_verschilInWerkdagen(a, b)`, briefing-feitenfunctie `offerteBriefingFeiten(rijen, vandaag)`.
  Allemaal puur → testbaar in `tests.js`.
- **`src/render-lijsten.js`** — render van de offerte-sectie uitbreiden: briefing-banner,
  "Nu opvolgen"-groep + "Lopend"-groep, fase-balk, per-aannemer regels, actieknoppen; FLIP bij
  herordening.
- **`src/actions.js`** of **`src/crud.js`** — handlers voor "Nabellen"/"Doorsturen" (logboek +
  opvolgdatum/fase) via `ACTIONS`-map (data-action attributen, bestaand patroon).
- **`src/ai.js`** — briefing-prompt (AI-toonlaag) bovenop de regel-gebaseerde feiten.
- **`src/config.js`** — standaard-termijnen-constante; eventueel `fase`-kolomindex.
- **`src/data.js` / `src/state.js`** — optioneel `Aannemers`-tabblad meeladen + `D.aannemers`.
- **`styles.css`** — stijlen voor briefing, fase-balk, aannemer-regels, "Nu opvolgen"-groepkop.
- **`src/tests.js`** — tests voor de nieuwe pure functies (zie Testen).

## Foutafhandeling

- **Schrijffouten**: hergebruik `backgroundWrite` met rollback + toast (bestaand patroon).
- **AI-briefing faalt**: stilletjes terugvallen op het tekstsjabloon; geen blokkering.
- **Ontbrekende/lege datums**: zonder bruikbare stil-datum geen valse "N dagen stil" (toon "—").
- **Geen `Aannemers`-regels**: detail valt terug op X/N + `opmerkingen`.
- **Datumparsing**: altijd via `_parseAnyDate()` (Nederlandse long-dates uit Sheets).

## Testen

- **Staging-first**: bouwen en testen op de test-Sheet (`SID_TEST`); de bestaande
  `?test=1`-suite moet groen blijven, aangevuld met `eq()`/`truthy()`-tests voor:
  `offerteFase`, `offerteBalBij`, `offerteNuOpvolgen`, `offerteSorteerScore`,
  `_verschilInWerkdagen`, en `offerteBriefingFeiten` (regel-gebaseerde kern, los van de AI-laag).
- Pas na expliciet akkoord van de beheerder merge naar `main`/productie.

## Open punten (te beslissen in/vóór het plan)

1. **Exacte standaardtermijnen** (aannemer / delen / eigenaren) — voorstel 5 / 7 / 7 dagen.
2. **Welke vrije kolom** in het "Nog Te Doen"-tabblad voor het optionele `fase`-veld (na N).
3. **Krijgt fase "Bij VvE" een eigen klok** (eigenaren herinneren) — voorstel ja.
4. **Per-aannemer `Aannemers`-tabblad** nu al (leeg) aanmaken, of pas bij eerste verrijking —
   voorstel: pas bij eerste gebruik (v1 werkt zonder).
