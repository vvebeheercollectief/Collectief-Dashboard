# Signaal-kolom — ontwerp

**Datum:** 2026-08-24
**Uitgangsversie:** v10.31 / cd-v126
**Aanleiding:** de takenrijen op Oppakken en Vergaderverzoeken zijn te druk. Er staan drie
urgentie-signalen per rij, op drie plekken, in drie kleuren — plus labels die alleen herhalen
waar je al bent. Omdat bijna elke rij kleur heeft, valt geen enkele rij nog op.

---

## 1. Wat er verandert

### 1.1 Eén signaal-kolom

Er komt één nieuwe kolom **"Signaal"**, direct na de VvE-naamkolom. Alle meldingen die nu
verspreid staan verhuizen daarheen:

| Melding | Staat nu | Straks |
|---|---|---|
| `pill-stil` ("10d") | in de tekstkolom | Signaal-kolom |
| `pill-opvolg` ("Vandaag") | in de tekstkolom | Signaal-kolom |
| `pill-snooze` (weggeleg-datum) | in de tekstkolom | Signaal-kolom |
| "Te laat (Nd)" | in de deadline-kolom | Signaal-kolom |
| deadline binnen 7 dagen (amber) | in de deadline-kolom | Signaal-kolom (trap 3, zie 1.2) |
| "Geen deadline" (amber) | in de deadline-kolom | blijft daar, maar grijs |

De deadline-kolom houdt alleen nog een **neutrale datum** over.

### 1.2 Rangorde: de zwaarste wint

Per rij wordt één melding groot getoond, met een gekleurd bolletje ervoor. Een tweede melding
komt klein en gedempt grijs erachter:

```
● 45 dagen te laat   10d stil
```

Rangorde, van zwaar naar licht:

1. **te laat** — rood
2. **vandaag opvolgen** — amber
3. **bijna te laat** ("nog 3 dagen") — gedempt amber
4. **stil** ("10d stil") — grijs
5. **weggelegd** ("terug 28 aug") — grijs

**"Bijna te laat" blijft een vaste 7 dagen**, voor alle drie de tabbladen. `deadlineCel` doet dat
vandaag ook (`src/render-tabel.js:122`), los van de prioriteitsdrempels per sectie. Een deadline
die over vijf dagen verloopt is even dringend op LOD als op Oppakken; de sectiedrempels gaan over
hoe lang iets mág liggen, niet over hoe dichtbij een afgesproken datum is.

Er worden er maximaal **twee** getoond. Kan een rij er drie hebben (te laat + vandaag + stil,
dat komt echt voor), dan valt de derde weg uit de cel maar staat hij wél in de `title` van de cel.

### 1.3 Alleen op drie tabbladen

De kolom komt op **Oppakken, Vergaderverzoeken en LOD**.

**Offerte-trajecten en Subsidie-trajecten krijgen hem niet.** Daar kan "stil" per ontwerp niet
voorkomen (je wacht op een aannemer of op de gemeente), Offerte kent de knop "In behandeling"
niet eens, en Subsidie heeft bewust één kolom minder om ruimte te houden voor de fase-bolletjes.
Een kolom die daar meestal leeg is kost elke rij ruimte zonder iets terug te geven. Die twee
tabbladen blijven **volledig ongewijzigd** — ook de pillen en de gekleurde deadline blijven daar
staan zoals ze nu zijn.

### 1.4 Opruimen: drie van de vier punten

| # | Punt | Besluit |
|---|---|---|
| 1 | Labels weg die het eigen tabblad herhalen | **doen** |
| 2 | Behandelaars als rondje | **doen, met twee letters bij botsende beginletter** |
| 3 | Knoppen pas zichtbaar bij aanwijzen | **niet doen** — de vier knoppen blijven altijd staan |
| 4 | Sleep-handvat pas zichtbaar bij aanwijzen | **doen, met touch-uitzondering** |

**Punt 1.** `subBadge` toont vandaag de subcategorie, ook als die gelijk is aan het tabblad waar
je op staat ("Oppakken" in de Oppakken-tab). Die herhaling verdwijnt; een afwijkende subcategorie
blijft wél staan.

**Punt 2 — aangepast na meting.** Het oorspronkelijke voorstel (één letter) levert **0 px** winst
zolang de kolomkop "Behandelaar" heet: de kop is 111 px, twee rondjes samen 51 px, dus de kop
bepaalt de breedte. En **Cihad en Cihan zouden allebei "C"** worden, terwijl de vier kleurklassen
tegenwoordig allemaal dezelfde kleur hebben — er is dus niets om op terug te vallen. Daarom:
rondjes met **zoveel letters als nodig om uniek te zijn** binnen de lijst behandelaars (`Ci`, `Ch`,
`J`), en de kolomkop wordt "Wie" zodat de winst ook echt geïnd wordt. Die hernoeming zit in
dezelfde `cols`-lijst als de Signaal-kop en valt dus onder dezelfde toetsen (§5.1).

**Punt 4 — met touch-uitzondering.** Het handvat verschijnt bij hover. Op een aanraakscherm bestaat
hover niet, dus daar zou het handvat onbereikbaar worden. Zelfde patroon als `.log-acts`
(`styles.css:690`): binnen `@media (hover:none)` blijft het staan op `opacity:.5`.

### 1.5 Stil-drempel per tabblad

`STIL_DREMPEL_DAGEN` is vandaag één vast getal (4) voor alle secties. Op LOD betekent dat "stil 5d"
op een dossier waar de gemeente 90 dagen geeft en de herinneringsmail pas na 30 dagen komt.

De drempel wordt per sectie gelijkgetrokken met de eerste trap van `STIL_ESCALATIE_REGELS`, zodat
het scherm hetzelfde zegt als de mail:

| Sectie | Drempel |
|---|---|
| Oppakken | 7 dagen |
| Vergaderverzoeken | 14 dagen |
| LOD | 30 dagen |
| Offerte-trajecten | n.v.t. (geen stil-signaal) |
| Subsidie-trajecten | n.v.t. (geen stil-signaal) |

### 1.6 Mobiel: bewust niets

Op een telefoon (378 px) is de tabel ~1430 px breed. Je ziet alleen de VvE-code, een stuk van de
naam en de vastgezette knoppen; de signaal-kolom valt buiten beeld.

**Het rode waas over te late rijen (`.row-telaat`) blijft daarom staan.** Dat is vandaag het enige
urgentie-teken dat een telefoongebruiker zonder vegen ziet, en dat blijft zo. Op mobiel verandert
er dus niets; de winst van dit ontwerp zit op een groot scherm.

---

## 2. Wat er nadrukkelijk **niet** verandert

- **Offerte-trajecten en Subsidie-trajecten** — geen enkele wijziging.
- **De vier actieknoppen** — blijven op elke rij altijd zichtbaar.
- **De rode rijkleur en het prioriteitsstaafje links** — blijven.
- **De groepskoppen** ("In behandeling (6)", "Weggelegd (3)") — blijven.
- **Het VvE-dossier** — houdt zijn eigen vorm ("Te laat", "terug op <datum>"). Dat scherm toont
  geen "stil" en geen "Vandaag" en dat blijft zo. Wordt genoemd in §4 als bewust aanvaard verschil.
- **De Afgerond-lijst, de ALV-pagina, Analytics, de herhaalregels** — buiten scope, op de
  behandelaar-rondjes na (zie §3.5).

---

## 3. Technisch ontwerp

### 3.1 Eén nieuwe functie: `signaalCel(r, sec, rid)`

Nieuwe functie in `src/render-tabel.js`, naast `deadlineCel`. Levert één `<td>` en berekent zelf
niets nieuws — hij weegt bestaande, pure aanroepen:

| Trap | Bron | Aanroep |
|---|---|---|
| te laat | `src/util.js:235` | `berekenPrioriteit(r.deadline, sec).teLaat` |
| vandaag opvolgen | `src/util.js:180` | `opvolgStatus(r).vandaag` |
| bijna te laat | `src/util.js:235` | `dagenTot !== null && dagenTot <= 7` |
| stil | `src/render-tabel.js:100` | `bepaalStil(r, sec)`, mits `!GEEN_STIL_PILL.includes(sec)` |
| weggelegd | `src/util.js:180` | `opvolgStatus(r).weggelegd` |

Harde regels voor deze functie:

- **`rid` komt als parameter binnen.** Niet zelf naar `state._rowCache` pushen: `rowNtd` zet één
  `rid` per rij (`src/render-tabel.js:128`) die gedeeld wordt met de knoppen, het bulk-vinkje en
  de fase-bolletjes. Een extra push verschuift `indexOf` in `src/crud.js:668` en `:740`.
- **`GEEN_STIL_PILL` moet mee.** Kijkt de functie alleen naar `bepaalStil`, dan krijgen Offerte en
  Subsidie alsnog een stil-signaal — en mogelijk als zwaarste van de rij.
- **Alleen aanroepen binnen `renderTbody`.** De stil-index leeft daar (`:49`, opgeruimd in de
  `finally` op `:69`). Daarbuiten scant `bepaalStil` het hele logboek (±1.300 regels) per rij en
  komt de oude leeslast stil terug.
- **De cel blijft klikbaar.** Alle drie de pillen dragen nu `data-action`
  (`src/render-tabel.js:149/153/155`). De cel krijgt `data-action="taak-wegleggen"` met `data-rid`,
  óók als de grote melding "te laat" is — vandaag heeft "Te laat" geen actie, waardoor juist de
  rijen die het hardst een opvolgdatum nodig hebben die snelweg missen. Zonder `data-action` zou de
  cel bovendien de rij-uitklapper triggeren (`src/main.js:155` slaat `[data-action]` over).
  **Gevolg dat aanvaard wordt:** `pill-stil` opent vandaag het bewerkscherm
  (`data-action="taak-bewerken"`, `src/render-tabel.js:149`). Omdat de hele cel voortaan naar
  wegleggen gaat, vervalt die snelweg. Bewerken blijft bereikbaar via het potlood en via de
  rij zelf.

### 3.2 Kolom toevoegen

De kop hoort in **`SECS[sec].cols`**, nooit in `SECS[sec].keys`. `keys` is de kolomvolgorde van het
Sheet (`src/data.js:837-839`, `src/inbehandeling.js:31`, `src/verplaats.js:88`).

Raakpunten die automatisch goed gaan zodra de kop in `cols` staat:

- `thead` wordt uit `cols` gebouwd (`src/render-lijsten.js:332`).
- Alle colspans rekenen met `cols.length + 1 + bulk`: `src/render-tabel.js:45` (lege lijst),
  `:58/61/65` (groepskoppen), `:261` (bundelpaneel).

Raakpunten die **handmatig** mee moeten:

- **`_veldLabel` breekt stil.** `src/verplaats.js:55-60` koppelt `cols` en `keys` op index. Een
  kolom op index 2 schuift alle labels erna op. Faalt zonder foutmelding en breekt
  `src/tests.js:10811-10815`. Elke sectie behalve Oppakken heeft een veld dat in die dialoog
  genoemd wordt, dus dit is niet LOD-specifiek. Oplossing: de koppeling niet op index maar op een
  expliciete afbeelding, óf de Signaal-kop overslaan omdat er geen `key` bij hoort.
- **Naamgeving.** Sorteren werkt op **label**, niet op index (`src/render-lijsten.js:468`). De kop
  mag nooit met "Deadline" beginnen. "Signaal" krijgt geen sorteerknop — bewust: `filterNtd`
  sorteert al op groep → te laat → vandaag → prioriteit → deadline → code (`:439-464`).
- **Zoeken vindt de kolom niet.** `filterNtd` zoekt alleen over `SECS[sec].keys` (`:420`).
  Aanvaard: er staat geen nieuwe informatie in de kolom, alleen herschikte.

### 3.3 Opmaak

- **De tabel wordt breder, niet smaller.** Gemeten op 1440 breed: 1422 → 1433 px. `thead th`
  heeft `white-space:nowrap` (`styles.css:255`), dus de kop is de ondergrens: een lege
  Signaal-kolom kost 74 px. `.cell-txt>.ct{max-width:350px}` (`:289`) is een vaste klem, dus de
  tekstkolom krimpt niet mee. De prijs is horizontaal scrollen, geen afkapping. Dit is bewust
  aanvaard.
- **`tr.expanded` moet de nieuwe cel dekken** (`styles.css:291-292` noemt nu alleen
  `.cell-name/.cell-txt/.cell-note`).
- **`tr.snooze-row td{opacity:.55}`** (`:345`) dempt ook het nieuwe bolletje. Het bolletje krijgt
  een eigen regel zodat het contrast haalbaar blijft; de contrasttoets (`src/tests.js:9812`) meet
  op een fixture zónder die klasse en moet worden uitgebreid.
- **Bulkmodus** zet het prioriteitsstaafje op het vinkje in plaats van op de VvE-code
  (`styles.css:269-270`). Bestaand gedrag; nieuwe opmaak hangt aan een eigen klasse, nooit aan
  een positie.
- **Kleurkeuze op Vergaderverzoeken.** Daar staat al een amberkleurige periode-badge. "Weggelegd"
  blijft daarom grijs (zoals nu) en krijgt géén amber.
- **Kleurkeuze op LOD.** De tabkleur van LOD is hetzelfde rood als "Te laat". Het rode bolletje
  gebruikt `--prio` (baksteen, `#b5544b`), niet het felle `--rd`, zodat het zich onderscheidt.

### 3.4 Het bundelpaneel moet mee

`src/render-bundel.js:116, 126-128, 134-137, 141` tekent zijn eigen "Te laat", "Geen deadline",
weggeleg-datum en "In behandeling", als extra rij binnen dezelfde tabel
(`src/render-tabel.js:263`). Maak je de deadline-kolom neutraal zonder dit paneel aan te passen,
dan staat er twee regels lager gewoon rood "Te laat". Dit is de dichtstbijzijnde plek waar het uit
de pas loopt en de code waarschuwt er zelf voor: dit is eerder misgegaan.

### 3.5 `subBadge` en `persBadges`

**`subBadge`** (`src/util.js:424`) kent zijn eigen tabblad niet — één parameter. Er komt een tweede
parameter bij: de gerénderde sectie. Vergelijken genormaliseerd (`.trim().toLowerCase()`), net als
`renderNtdCrossList` (`src/render-lijsten.js:357, 363`). **Nul toetsen op deze functie** — een fout
hier is volledig stil, dus er komen toetsen bij.

**`persBadges`** (`src/util.js:268`) raakt zeven plekken tegelijk: de vijf tabbladen, de
Afgerond-lijst, het VvE-dossier, de Ontwikkeling-pagina en een analytics-tabel. Alleen in de
takentabel is breedte een probleem. Besluit: de rondjes komen **alleen in de takentabel**; de
overige plekken houden de volle naam. De uniek-makende afkorting (`Ci`/`Ch`/`J`) wordt een eigen
helper zodat beide vormen uit dezelfde bron komen.

---

## 4. Bewust aanvaarde gevolgen

1. **De tabel wordt 11 px breder.** Op een groot scherm onmerkbaar, op mobiel niet relevant
   (daar scroll je toch al).
2. **Op mobiel verandert er niets.** Dit was een expliciete keuze; zie §1.6.
3. **Een derde signaal valt weg uit de cel** (staat wel in de `title`).
4. **Het VvE-dossier blijft afwijken.** Twee schermen vertellen een iets ander verhaal over
   dezelfde taak. Er is vandaag géén test die dat dossiergedrag bewaakt; die wordt ook nu niet
   toegevoegd, dit valt buiten scope.
5. **Het blokje "Ook hier" onder de tabel** toont een kale datum zonder markering. Blijft zo.
6. **De filterpillen bovenaan** kunnen twee van de vijf standen afstrepen ("te laat",
   "weggelegd"), niet alle vijf. Ze werken op data en blijven werken (`src/render-lijsten.js:430-431`);
   ze uitbreiden naar vijf valt buiten deze scope.
7. **"Weggelegd" dubbelt met het groepskopje erboven** (`src/render-tabel.js:65`); alleen de datum
   is nieuwe informatie. Aanvaard.
8. **"Vandaag" is feitelijk "vandaag of eerder"** (`src/util.js:186`: `diff <= 0`). Bestaand
   gedrag, ongewijzigd.
9. **Ctrl+K toont alleen "Te laat" of de kale deadline.** Buiten scope.

---

## 5. Toetsen

### 5.1 Toetsen die zeker omvallen en moeten meebewegen

| Toets | Wat |
|---|---|
| `src/tests.js:3702` | Oppakken heeft 6 koppen → wordt 7 |
| `src/tests.js:3711` | `cols[5].startsWith('Deadline')` → index schuift op |
| `src/tests.js:4003` | 7 `<td>` → wordt 8 |
| `src/tests.js:4005` | 7 `<th>` → wordt 8 |
| `src/tests.js:4015-4017` | exacte koppenlijst |
| `src/tests.js:10811-10815` | `_veldLabel` ("Status: Wacht op gemeente") |

### 5.2 Klassenamen blijven

Negen toetsen hangen aan de bestaande klassenamen: `pill-stil` (`:839, 4012, 9778`),
`pill-opvolg` (`:9779`), `pill-snooze` (`:4964, 4966, 4970, 9779`), `s-telaat` (`:4980, 4982`),
`warn-geen-deadline` (`:4985`). **De klassenamen blijven ongewijzigd**, alleen hun plek in de rij
verandert. Zou je ze hernoemen, dan wordt `src/tests.js:4012` vacuüm groen
(`querySelectorAll('.pill-stil').length === 0` telt dan altijd 0) — zelfde val bij de
contrastfixture `:9777-9779`.

### 5.3 Nieuwe toetsen

1. Rangorde: per combinatie van signalen wint de juiste, en de tweede staat gedempt erachter.
2. Drie signalen tegelijk: de derde valt uit de cel maar staat in de `title`.
3. `GEEN_STIL_PILL`: Offerte en Subsidie krijgen géén signaal-kolom en géén stil-signaal.
4. Stil-drempel per sectie: 7 / 14 / 30, en Offerte/Subsidie n.v.t.
5. `subBadge`: gelijk aan de sectie → weg; afwijkend → blijft. Genormaliseerd vergelijken.
6. `persBadges`: `Ci`/`Ch` bij botsende beginletter, volle naam buiten de takentabel.
7. Kolomtelling per sectie: 7 / 8 / 8 op de drie gewijzigde tabbladen, 7 / 6 ongewijzigd op
   Offerte en Subsidie.
8. Het bundelpaneel toont dezelfde meldingen als de rij erboven.
9. `tr.snooze-row`: het bolletje haalt nog steeds contrast.
10. `.row-telaat` staat er nog (mobiele vangnet).
11. De signaal-cel draagt `data-action="taak-wegleggen"` met het juiste `data-rid`, ook bij
    "te laat".
12. `_rowCache` bevat precies één ingang per rij (geen extra push vanuit `signaalCel`).

### 5.4 Meetlessen die gelden bij het toetsen

- Zet overgangen uit vóór een kleurmeting; `getComputedStyle` levert anders een waarde van
  halverwege de animatie.
- Een pixel-assert zonder expliciete vensterbreedte meet het venster van de testrunner.
- `:focus` matcht niet in een venster zonder focus.
- Draai `tools/syntaxcheck.js` vóór elke testronde.

---

## 6. Volgorde van uitrollen

1. `signaalCel` + rangorde-motor, achter de bestaande klassenamen.
2. Kolom toevoegen aan `cols` van de drie secties; `_veldLabel` losmaken van de index.
3. Deadline-kolom neutraal; "Geen deadline" grijs.
4. Bundelpaneel gelijktrekken.
5. Stil-drempel per sectie.
6. `subBadge` tweede parameter; `persBadges` afkorting-helper.
7. Sleep-handvat bij hover, met `@media (hover:none)`-uitzondering.
8. Toetsen uit §5.3; `APP_VERSION` en `CACHE_VERSION` ophogen.

Stap 1 t/m 3 horen bij elkaar en moeten in één keer live: los van elkaar levert het een rij op met
de melding op twee plekken, of juist nergens.
