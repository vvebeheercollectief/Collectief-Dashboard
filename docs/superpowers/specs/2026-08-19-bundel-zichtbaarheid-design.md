# Bundel-zichtbaarheid — ontwerp

**Datum:** 2026-08-19
**Status:** ontwerp goedgekeurd, nog niet gebouwd
**Branch:** `feature/bundel-zichtbaarheid`
**Volgt op:** [Takenbundel](2026-08-14-takenbundel-design.md)

---

## 1. Waarom

De Takenbundel werkt, maar is op drie plekken onzichtbaar. De aanleiding is een echt geval
(2026-08-19): de gebruiker sleepte in het VvE-dossier van 381005 een offerte-traject op een
vergaderverzoek, en zag daarna nergens terug dát die taken aan elkaar hangen.

Drie oorzaken, alle drie bevestigd in de code:

1. **Het label zegt te weinig.** Het bewerkscherm toonde `Hoort bij: sept/okt`. Dat is
   `taakTitel()` van de hoofdtaak, en die valt voor een vergaderverzoek terug op
   *actiepunt → agendapunten → periode → status*. Agendapunten was leeg, dus bleef de periode
   over. Geen soort taak, geen VvE-code, geen VvE-naam — terwijl `magKoppelen` koppelen
   **over VvE's heen** toestaat, dus de VvE is geen overbodige informatie.
2. **Bij zoeken/filteren valt de stapel weg.** `isPlatteWeergave` schakelt bij een zoekterm,
   filter, kolomsortering of bulk de hele gestapelde weergave uit (§4.2 van het
   Takenbundel-ontwerp: een treffer mag niet verstopt zitten in een dichtgeklapte bundel).
   Wat overblijft is `bundelMerkje`: een icoontje waarvan de tekst alleen in de `title` staat —
   en die tekst is bovendien datzelfde nietszeggende `sept/okt`.
3. **Het dossier toont niets.** `render-vve.js` kent alleen het sleep-handvat: geen chevron,
   geen paneel, geen merkje. Je sleept dus op de enige plek die het resultaat niet laat zien.

De gebruiker ontdekte oorzaak 2 zelf: ongefilterd stond alles er wél (pijltje, `0 van 1 klaar`,
paneel), na het typen van "oudeman" niet meer.

## 2. Kernprincipe

> **Eén bron voor de zin "waar hoort dit bij".**

Nu zet elke plek zelf een tekstje in elkaar, en daarom staat de VvE er op de ene plek wel en op
de andere niet. Er komt één pure functie die de bundelstand van een rij beschrijft, en één die
daar tekst van maakt. Alle plekken lezen die ene tekst.

Dat is dezelfde afweging als bij `wordtGeabsorbeerd` in `bundel.js`: twee plekken die hetzelfde
moeten zeggen, lopen bij de eerstvolgende wijziging stil uit elkaar tenzij ze uit één functie
komen. Het gevolg van uiteenlopen is hier niet zichtbaar als fout — het ziet er alleen verkeerd
uit, en dat is precies wat deze hele wijziging repareert.

**Buiten scope, bewust:** het datamodel. Geen nieuwe kolommen, geen Sheet-migratie, geen wijziging
aan wie de kop is, aan de volgorde of aan het koppelen zelf. Dit is uitsluitend weergave.

## 3. De twee nieuwe functies

### 3.1 `bundelVerwijzing(r, index)` — `src/bundel.js`

Pure logica, geen DOM, los toetsbaar — net als de rest van die module.

```
bundelVerwijzing(r, index) →
  null                                    // zit niet in een bundel (of bundel < 2 leden)
  { rol:'kop',  klaar, totaal }           // is de zichtbare kop
  { rol:'sub',  kop }                     // is een stap; kop = de rij van de zichtbare kop
```

- Bouwt op de bestaande `bundelVan` → `zichtbareKop` → `zelfdeTaak`. Géén eigen regels: wie de
  kop is en wat een bundel is, blijft één antwoord.
- `klaar`/`totaal` komen uit de bestaande `bundelStand`, zodat de telling in het platte label
  gelijkloopt met de telpill op de kop-rij.
- Vergelijking op **taaknummer** (`zelfdeTaak`), niet op objectidentiteit — zelfde reden als
  daar: `r` kan uit een oudere leesronde komen dan de index.

### 3.2 `taakVerwijzing(r)` — `src/util.js`

Levert de zin waar alles om draait:

```
Vergaderverzoek · 381005 VvE Oudemansstraat 123/125/127 — sept/okt
└ soort         └ code  └ naam                          └ taakTitel(r)
```

- Bouwt op `taakTitel(r)`; die functie zelf verandert **niet**. Dit is een extra laag eromheen,
  geen vervanging — alle bestaande gebruikers van `taakTitel` blijven ongemoeid.
- Soort = het sectielabel in **enkelvoud**. `SECS[...].label` is meervoud omdat het tabbladen
  benoemt, en "Vergaderverzoeken · 381005" leest fout voor één taak. Daarom een kleine vaste
  tabel naast `SECS`, met een terugval op het meervoud voor een onbekende sectie:

  | Sectie | In de regel |
  |---|---|
  | OPPAKKEN | `Taak` |
  | VERGADERVERZOEKEN | `Vergaderverzoek` |
  | OFFERTE-TRAJECTEN | `Offerte-traject` |
  | LOD | `LOD` |
  | SUBSIDIE-TRAJECTEN | `Subsidie-traject` |

  (`Oppakken` is geen zelfstandig naamwoord — een rij uit dat tabblad is gewoon een taak.)
- Ontbreekt de naam, dan valt de regel terug op alleen de code. Ontbreekt `taakTitel`, dan
  eindigt de regel na de VvE — nooit een losse `—`.
- Eén regel, geen twee. (Overwogen en verworpen: een tweeregelig blok in het bewerkscherm; het
  veld is een `<input>` en zou dan vervangen moeten worden door een chip-weergave, wat een
  tweede toestand in dat veld introduceert voor alleen opmaakwinst.)

## 4. Waar de regel landt

### 4.1 Platte lijst (zoeken, filteren, sorteren)

`bundelMerkje` in `render-bundel.js` wordt van icoon-met-tooltip een icoon-met-tekst:

| Rol | Label |
|---|---|
| kop | `Bundel · 0 van 1 klaar` |
| stap | `↳ stap in: Vergaderverzoek · 381005 VvE Oudemansstraat — sept/okt` |

- Blijft **dezelfde knop** met dezelfde `data-action="bundel-spring"` en hetzelfde gedrag.
  Alleen de inhoud verandert; de `aria-label` blijft de volledige zin.
- Plek: als tweede regel onder de VvE-naam in de kolom `cell-name`, afgekapt met `…`
  (bestaande `.ct`-behandeling), volledig in de `title`.
- **In bulk-modus blijft het label helemaal weg**, zoals nu (`bw.merk`). Ongewijzigd.
- In de gestapelde (ongefilterde) weergave verandert er niets: de kop houdt zijn telpill, een
  stap in hetzelfde tabblad wordt nog steeds geabsorbeerd, een stap uit een ánder tabblad krijgt
  nu het leesbare label in plaats van het kale icoontje.

De stapel bij zoeken/filteren alsnog aanzetten is **bewust uitgesteld**, niet afgewezen: dan zou
een gevonden stap zijn niet-gevonden hoofdtaak mee de lijst in trekken (of andersom verdwijnen in
een dichtgeklapte bundel), en schuiven de tellers boven de tabbladen. Eerst kijken of het label
volstaat.

### 4.2 VvE-dossier, "Open taken"

`renderVve` bouwt de bundelindex één keer per render en groepeert `o.open`:

- Een stap waarvan de zichtbare kop **óók in `o.open` staat** schuift direct onder die kop, met
  inspringing en een verticaal streepje (zelfde vorm als het bundelpaneel in de tabel).
- Staat de kop **niet** in die lijst — andere VvE, weggelegd, of afgerond — dan blijft de rij op
  zijn eigen plek staan.
- In **beide** gevallen komt de verwijzingsregel onder de rij te staan. Dat is de reden dat het
  "allebei" is: de regel is de enige aanwijzing zodra de kop niet op deze pagina staat.
- De kop zelf krijgt `Bundel · 0 van 1 klaar` achter zijn titel.

**Volgorde.** De kop houdt zijn plek in de bestaande sortering (te laat eerst, dan vroegste
deadline); zijn stappen volgen direct daaronder op `bundelVolg`. Gevolg: een stap die zélf te
laat is, staat niet langer bovenaan tussen het andere te-late werk. Dat is dezelfde keuze die
voor de takentabel al bewust is gemaakt ("een bundel volgt zijn zichtbare kop", §Bewuste
besluiten van het Takenbundel-ontwerp) en hoort hier gelijk te lopen.

**Weggelegd en Afgerond blijven ongemoeid.** Die groepen worden niet gehergroepeerd; een
weggelegde stap krijgt hooguit de verwijzingsregel.

### 4.3 Bewerkscherm

`zetHoortBij` in `crud.js` vult het veld met `taakVerwijzing(kop.r)` in plaats van
`taakTitel(kop.r)`.

Meeveranderen, anders raken ze uit de pas:
- `main.js`: `hbVeld.value = taakVerwijzing(taak)` bij het kiezen, én de `input`-luisteraar die
  op `hbVeld.value === taakTitel(state._hbDoel)` toetst of de gebruiker is gaan overtypen. Blijft
  die op `taakTitel` staan, dan denkt hij bij élke aanslag dat er overgetypt is en gooit de net
  gemaakte keuze weg.
- De suggestielijst tijdens het kiezen (`itemHtml`) blijft **zoals hij is**: twee regels,
  omschrijving boven, `code — naam` eronder. Die was al goed.

### 4.4 De melding na het slepen

`bundel-acties.js` toont nu `${taakTitel(sub)} onder ${doel.naam||doel.code}`. Dat wordt de
verwijzing van het doel, zodat de melding zegt onder wélke taak van welke VvE het is gekomen.

## 5. Randgevallen

| Geval | Gedrag |
|---|---|
| Hoofdtaak bij een andere VvE | Regel toont die andere code + naam; in het dossier geen inspringing |
| Hoofdtaak weggelegd | Staat in de groep Weggelegd; stap springt niet in, regel staat er wel |
| Hoofdtaak afgerond, kop doorgeschoven | Regel wijst naar de nieuwe zichtbare kop (via `zichtbareKop`) |
| Alles afgerond | `zichtbareKop` is null → geen label, geen regel |
| Bundel gekrompen tot één lid | `bundelVan` geeft null (`isBundel` eist er twee) → geen label |
| Taak zonder omschrijving | Regel eindigt na de VvE, geen losse `—` |
| Taak zonder VvE-naam | Alleen de code |
| Bulk-modus | Geen label, ongewijzigd |

## 6. Toetsing

- **Pure functies los:** `bundelVerwijzing` en `taakVerwijzing`, inclusief elk randgeval uit §5.
- **Bedrading:** dat het label na een zoekterm echt in de DOM staat (het bestaande
  `bedrading:`-blok in `tests.js` meet al de platte lijst en het merkje — daar aanhaken), en dat
  het dossier een stap onder de juiste kop zet.
- **Mutatietoetsen** op de twee kerngaranties: haal de regel weg en de toets hoort om te vallen.
  Zonder die stap is een groene suite geen bewijs — dat is in dit project meermaals gebleken.
- Suite draaien op de **uitgeleverde** code én **ingelogd** op staging, niet alleen lokaal.
- Zichtbaar `APP_VERSION` naar **10.23**, cache naar **cd-v118**.

## 7. Uitrol

`feature/bundel-zichtbaarheid` → staging (CI deployt naar TEST) → controleren met een echte
bundel → main (CI deployt naar PROD) → nameten op de productie-URL zelf.
