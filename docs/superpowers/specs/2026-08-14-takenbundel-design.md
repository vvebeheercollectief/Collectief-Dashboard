# Takenbundel — ontwerp

**Datum:** 2026-08-14
**Status:** ontwerp goedgekeurd, nog niet gebouwd
**Branch:** `feature/takenbundel`

---

## 1. Waarom

Taken staan nu volledig los van elkaar. In de praktijk horen ze vaak bij elkaar: komt er een
vergaderverzoek binnen, dan moeten er eerst offertes worden aangevraagd, of moet er subsidie
worden geregeld. Dat verband is nu nergens vastgelegd — je moet het onthouden.

De Takenbundel legt dat verband wél vast: je stapelt subtaken op een bestaande taak, en de
volgorde daarvan kun je slepend wijzigen.

## 2. Kernprincipe

> **Een subtaak is een volwaardige taak. Alleen de weergave is gebundeld.**

Er komt géén nieuw soort taak bij. Een subtaak is een gewone taak in zijn eigen categorie, met
dezelfde velden, dezelfde knoppen (bewerken / wegleggen / afronden), dezelfde prioriteits-
berekening, dezelfde plek in het logboek en in Afgerond. Het enige verschil is dat hij twee
extra verborgen kolommen draagt die zeggen bij welke bundel hij hoort.

Dit is de belangrijkste keuze in het ontwerp. Ze zorgt ervoor dat er geen tweede code-pad
ontstaat dat uit de pas kan lopen met het bestaande, en dat de functie in principe niets kan
breken: maak de twee kolommen leeg en het dashboard is exact als vandaag.

## 3. Datamodel

### 3.1 Kolommen

**Tabblad "Nog Te Doen"** — twee nieuwe kolommen:

| Kolom | Index | Naam | Inhoud |
|---|---|---|---|
| R | 17 | `bundelId` | Het vaste taaknummer van de hoofdtaak van de bundel |
| S | 18 | `bundelVolg` | Volgnummer binnen de bundel: `0` voor de hoofdtaak, daarna 10, 20, 30 … |

**Tabblad "Afgerond"** — drie nieuwe kolommen, op **exact dezelfde indexen**:

| Kolom | Index | Naam |
|---|---|---|
| Q | 16 | `taakId` |
| R | 17 | `bundelId` |
| S | 18 | `bundelVolg` |

Dat `taakId` er ook bij staat is nieuw en noodzakelijk: een afgeronde taak heeft nu **geen enkele
identiteit** meer — er valt achteraf niets meer aan te knopen.

De gelijke indexen zijn geen toeval maar een harde eis. `parseSections()` (src/data.js) leest
beide tabbladen met dezelfde functie en vaste kolomposities. Zouden de bundelkolommen in
"Afgerond" ergens anders staan, dan ontstaan er stille verwisselingen. Die valkuil bestaat al:
de Herhaal-ID staat in "Afgerond" op kolom L, maar wordt door `parseSections()` gelezen als
`opvolgdatum` (row[11]), terwijl `herhaalId` uit row[12] komt — dat is nu onschadelijk omdat
niets `af[].opvolgdatum` gebruikt, maar het laat precies zien hoe dit misgaat. Zie §10.

### 3.2 De kernregel

**Elk lid van een bundel draagt hetzelfde `bundelId`, óók de hoofdtaak.**

De hoofdtaak krijgt `bundelId` = zijn eigen `taakId`, en `bundelVolg` = 0. Een bundel is dus
simpelweg "alle taken met hetzelfde bundelnummer". Dat blijft waar of een lid nu open staat,
afgerond is, of verwijderd wordt.

Een eerder overwogen variant — alleen de subtaak wijst naar de hoofdtaak, de hoofdtaak zelf
blijft leeg — is verworpen: zodra de hoofdtaak wordt afgerond verhuist die naar "Afgerond" en
wijzen de subtaken naar iets dat niet meer in de takenlijst staat. De bundel viel dan uit elkaar.

### 3.2b Een afgeronde rij hoort pas bij een bundel als hij een taaknummer heeft

Rijen in "Afgerond" tellen alleen mee als bundellid wanneer hun `taakId` (kolom Q) gevuld is.

Dat is een bewuste vangrail. Kolom Q van "Afgerond" wordt uitsluitend geschreven door de nieuwe
afrondcode; élke rij van vóór deze functie heeft daar niets staan. Wat er in de kolommen M t/m S
van dat blad staat is nergens gedocumenteerd — het dashboard schreef er nooit verder dan L — en
het was niet te controleren: de Sheets-koppeling die hier beschikbaar is kan geen specifiek
tabblad aanwijzen. Zonder deze regel zou historische rommel in kolom R afgeronde rijen stil aan
een bundel knopen die niet bestaat.

De regel volgt bovendien uit de logica van de functie zelf: bundellidmaatschap is een verwijzing
tussen taken met een identiteit. Een rij zonder taaknummer heeft geen identiteit en kan dus per
definitie nergens bij horen.

### 3.3 De zichtbare-kop-regel

> **De zichtbare kop van een bundel is het nog openstaande lid met het laagste volgnummer.**

Eén regel die alle gevallen dekt:

| Situatie | Gevolg |
|---|---|
| Hoofdtaak afgerond | De eerste openstaande subtaak wordt de zichtbare kop. De bundel staat dan in het tabblad van díe taak. De afgeronde hoofdtaak blijft afgevinkt bovenin het bundelpaneel zichtbaar |
| Subtaak afgerond | Blijft afgevinkt en doorgestreept in de bundel staan |
| Hoofdtaak verwijderd | De overige leden delen nog steeds het bundelnummer en blijven dus een bundel; de eerstvolgende wordt de kop |
| Alle leden afgerond | Bundel verdwijnt uit de takenlijst en blijft compleet terug te lezen in "Afgerond" |
| Nog maar één lid over | Wordt weer als gewone taak getekend (bundel van één = geen bundel) |

Er ontstaan dus nooit wezen — ook niet als er handmatig in de Sheet wordt gerommeld.

### 3.4 Gaten van tien

Volgnummers lopen 10, 20, 30 … zodat een subtaak ertussen schuiven één cel schrijven is in
plaats van alles hernummeren. Bij slepen wordt de hele bundel hernummerd naar 10, 20, 30 …

De `0` van de hoofdtaak (§3.1) is daarbij een **startwaarde, geen kenmerk**: bij het hernummeren
krijgen álle open leden een nieuw nummer, ook de hoofdtaak — die mag net zo goed versleept worden.
Welk lid de kop is volgt altijd uit §3.3 (het laagste openstaande volgnummer), nooit uit de waarde
0; en of een taak subtaken heeft volgt uit wie naar haar taaknummer wijst, nooit uit een
volgnummer.

Afgeronde leden houden hun nummer — hun rij staat in "Afgerond" en die wordt bij het herordenen
niet aangeraakt. Hun nummers liggen dus **vast**, en de open leden krijgen hun nieuwe nummer
binnen het gat tot het eerstvolgende vaste nummer. Alleen zo krijgen twee leden nooit hetzelfde
volgnummer én is de gesleepte volgorde ook echt de getoonde volgorde — óók wanneer een open lid
vóór een afgerond lid moet komen. Dat laatste is geen randgeval: een bundel met een open hoofdtaak
op 0 en één afgevinkte subtaak op 10 is de gewone stand zodra er één vinkje is gezet.

Er is één situatie waarin de gesleepte volgorde sowieso niet gehaald kan worden: een **afgerond
lid op volgnummer 0**. Daar ligt geen ruimte onder, dus een open lid kan er nooit vóór komen. Dat
is geen bedacht randgeval — elke bundel begint met de hoofdtaak op 0, dus zodra iemand de
hoofdtaak afvinkt vóórdat er ooit gesleept is, staat dat vaste 0 er. De sleepafhandeling moet dit
daarom bénoemen in plaats van stil niets te doen (§6.3).

Passen er geen ronde tientallen in zo'n gat, dan wordt het gat gelijk verdeeld (11, 12, 13 …).
Past er zelfs dán niets meer tussen — twee vaste nummers pal naast elkaar — dan telt de reeks
door voorbij het afgeronde lid en landen die leden er in beeld áchter in plaats van ervoor. Dat is
de tweede situatie waarin de getoonde volgorde afwijkt van de gesleepte; de nummers botsen ook dan
niet, en het gevolg blijft een verkeerde volgorde en nooit verloren werk (§5). Een afgerond lid
met een leeggemaakt volgnummer is geen vast punt: het sorteert achteraan en zakt naar de staart
van de bundel, in plaats van dat één lege cel de hele reeks gijzelt.

## 4. Weergaveregels

### 4.1 Eén plek per tabblad

> **Een taak wordt binnen één tabblad op precies één plek getoond.**

- Staat de zichtbare kop in **hetzelfde** tabblad → de subtaak zit in het bundelpaneel en niet
  óók nog als losse rij in de vlakke lijst.
- Staat de kop in een **ander** tabblad → de subtaak staat gewoon als rij in zijn eigen tabblad,
  met een bundelmerkje achter de VvE-naam. Klikken springt naar het tabblad van de kop en klapt de
  bundel open.

De tellers per tabblad tellen elke taak dus precies één keer, net als nu.

### 4.2 Stapelweergave alleen in de standaardlijst

De gestapelde weergave verschijnt **alleen in de ongefilterde standaardlijst**. Bij een actief
zoekveld, een gezet filter, kolomsortering (`sort.key` is gezet) of bulk-modus wordt de lijst
**plat** getoond: elke taak als gewone rij, met het bundelmerkje als enige aanwijzing van het
verband. In platte weergave kan er ook niet gesleept worden — noch om te sorteren, noch om te
stapelen.

Reden: bij zoeken wil je een treffer niet verstopt hebben in een dichtgeklapte bundel; bij
kolomsortering is een vaste groepering per definitie in strijd met de gekozen sortering; en in
bulk-modus moet élke taak aanvinkbaar zijn. Deze regel snijdt een groot deel van de mogelijke
foutsituaties in één keer weg.

### 4.2b Uitzondering: geen bundelmerkje in bulk-modus

In bulk-modus wordt het bundelmerkje wél weggelaten, anders dan de overige platte standen.

Reden: klikken op het merkje springt naar het tabblad van de kop, en dat wist via `setNtd` een
half gemaakte bulk-selectie. Een knop die je selectie stilletjes weggooit is erger dan een
ontbrekende aanwijzing. In bulk-modus ben je bovendien aan het aanvinken, niet aan het navigeren.

### 4.3 De gestapelde rij

Een bundel-kop is een normale taakrij, met:

- twee dunne randjes eronder die de stapel suggereren (verdwijnen bij openklappen)
- een pill met de stand: `1 van 3 klaar` (titel: "1 van 3 subtaken klaar")
- links een **eigen chevron-knop** om te openen/sluiten

De pill telt **alle leden van de bundel behalve de zichtbare kop zelf** — dus precies wat er in
het paneel staat. Is de hoofdtaak afgerond en schoof de kop door (§3.3), dan staat die afgeronde
hoofdtaak in het paneel en telt hij mee als "klaar". Het aantal blijft zo stabiel terwijl een
bundel vordert.

De chevron moet een eigen knop met `data-action` zijn en níet de rij-klik gebruiken: een klik op
een taakrij is al bezet (`src/main.js` — klapt de volledige tekst uit). Die handler negeert
elementen met `[data-action]`, dus een eigen knop botst niet.

**Open/dicht wordt onthouden op `bundelId`, niet op rijnummer.** `state.expandedRows` gebruikt nu
`_row`, en rijnummers schuiven voortdurend; daarom staat er een filterregel omheen die verlopen
ids weggooit. Op `bundelId` blijft een opengeklapte bundel gewoon openstaan als er elders een rij
bijkomt.

### 4.4 Het bundelpaneel

Per lid, op volgnummer:

- sleep-handvat (icoon `sleepGreep`)
- volgnummer
- gekleurd bolletje in de kleur van de categorie
- omschrijving (klikbaar → bewerkscherm)
- categorie + deadline
- dezelfde drie actieknoppen als een tabelrij: **bewerken**, **wegleggen**, **afronden**

Afgeronde leden: doorgestreept en gedempt, met de afronddatum; geen actieknoppen (net als in
"Afgerond"). Onderaan het paneel: **`+ Voeg een subtaak toe`**.

### 4.5 Terminologie

**hoofdtaak** en **subtaak**. Niet "stap" — dat suggereert een verplichte volgorde, en die is er
juist niet (§5).

## 5. Volgorde is een leidraad

De volgorde is puur informatief. Niets is geblokkeerd: je mag subtaak 3 afronden terwijl 1 en 2
nog openstaan. Er is geen "wacht op"-status en geen blokkade.

Dat heeft een prettig gevolg voor de betrouwbaarheid: de ergste uitkomst van een half mislukte
sleepactie is een verkeerde vólgorde — nooit verloren werk.

## 6. Acties

### 6.1 Een bundel maken — drie wegen

1. **`+ Voeg een subtaak toe`** in het open bundelpaneel → het gewone nieuwe-taak-scherm, met
   VvE-code en naam al ingevuld. Je kiest de categorie en de omschrijving.
2. **Veld "Hoort bij"** in het bewerkscherm van een bestaande taak → hoofdtaak opzoeken via het
   bestaande VvE-zoekveldpatroon. Een kruisje ontkoppelt weer.
3. **Slepen aan het handvat van een rij**, en dat handvat op een andere rij loslaten:
   - in de takentabel: binnen één categorie
   - op de VvE-dossierpagina: dwars door alle categorieën heen — dáár werkt het hoofdvoorbeeld
     (offerte onder vergaderverzoek) met slepen

   Elke sleepbare rij draagt vooraan een eigen greepje (sleep-handvat), net als de subtaakregels in het
   bundelpaneel. Oppakken kan **alleen** daar; de rest van de rij blijft gewoon tekst die je kunt
   selecteren en kopiëren. Zie §6.3 voor het waarom. Het gebaar werkt met de muis én met een
   vinger, in de tabel en op de dossierpagina — met één beperking op een klein scherm: bron- en
   doelrij moeten samen in beeld staan (§6.3). Weg 2 kent die beperking niet.

### 6.2 Regels bij slepen

- **Het gebaar begint alleen op het handvat.** Een `pointerdown` ergens anders in de rij — op de
  tekst, op de VvE-code, op een van de icoon-knoppen — start niets. In platte weergave (zoeken,
  filteren, kolomsortering, bulk) staat er ook geen handvat, want dan kan er niet gestapeld worden
  (§4.2); op de VvE-dossierpagina staat het er altijd, want die kent de gestapelde weergave niet.
- **Op een rij die al in een bundel zit** → je voegt je toe aan díe bundel (achteraan). Zo kan er
  geen fout ontstaan door "op de verkeerde helft" te mikken.
- **Een taak die zelf al subtaken heeft** kun je nergens onder slepen → melding *"Deze taak heeft
  zelf subtaken; ontkoppel die eerst."* Dit houdt de structuur gegarandeerd één laag diep.
- **Hoofdtaak zonder taaknummer** (rijen van vóór de backfill, of aangemaakt door een oude
  client): eerst een nummer toekennen via `nieuwTaakId()`, dan pas koppelen.
- **Andere VvE** wordt niet geblokkeerd. Het gebeurt zelden, en de ongedaan-maken-melding is hier
  een beter vangnet dan een extra bevestigingsvraag.

### 6.3 Sleep-techniek

> Bijgewerkt na de bouw (`src/bundel-acties.js`). Er zijn twee sleepgebaren en ze staan hieronder
> los van elkaar: **sorteren** binnen het bundelpaneel (`initBundelSlepen`) en **stapelen** van een
> taak onder een andere (`initStapelSlepen`). Ze kunnen elkaar niet kapen — ze toetsen op een eigen
> attribuut, `[data-bdl-grip]` tegen `[data-stapel-grip]`.

#### Volgorde wijzigen in het bundelpaneel

Slepen wordt gebouwd op **pointer-events** (`pointerdown` / `pointermove` / `pointerup` /
`pointercancel`), niet op de HTML5-sleepfunctie van de browser — die werkt niet op een touchscreen,
en het dashboard wordt ook op de telefoon gebruikt.

Twee dingen wijken bewust af van wat hier eerst stond. Zet ze niet terug:

- **Geen `setPointerCapture`; `pointermove`/`pointerup` hangen aan `window`.** Het loslaten móet
  aankomen, en de gesleepte regel kan tussentijds uit het document verdwijnen: `renderTbody` zet de
  hele `innerHTML` van `#ntd-tbody` opnieuw zodra een leesronde iets nieuws oplevert — de 8s-poll,
  maar ook de stille resync ná élke eigen schrijfactie. Een listener op de regel of de tabel zou dat
  loslaten dan mislopen en de sleepstand bleef staan. Dat een `pointermove` zonder capture naar het
  element ónder de muis gaat is precies de reden dat `window` de juiste plek is. `losgeraakt()`
  breekt het gebaar af zodra het paneel of de opgepakte regel niet meer verbonden is.
- **`touch-action: none` staat alléén op het handvat (`.bdl-h`), niet op de sleepbare rijen.** De
  browser leidt het scrollgedrag af uit het element waar de aanraking landt sámen met zijn
  voorouders: die kunnen het verder beperken, nooit terugzetten. Het gebaar begint hier altijd op
  `[data-bdl-grip]`, dus op de rij levert de regel niets extra's op — en wél schade: hij maakt élke
  aanraking op een subtaakregel dood voor de horizontale pan van `.tbl-wrap`, waar de takentabel op
  een smal scherm van leeft.

Bij het loslaten wordt de hele bundel hernummerd (10, 20, 30 …) en in **één** batch-opdracht
weggeschreven. Is er niets verschoven, dan wordt er ook niets geschreven: `hernummerLeden` deelt
namelijk óók zonder sleepbeweging nieuwe nummers uit zodra een bundel nog op zijn startwaarden
staat (0 en 10 worden 10 en 20), dus een kale klik op het handvat zou anders een schrijfronde en een
ongedaan-maken-melding opleveren voor een verplaatsing die niemand deed.

#### Stapelen: een eigen handvat per rij

Eerst was de **hele rij** het handvat. Dat is teruggedraaid: elke sleepbare rij draagt nu vooraan
zijn eigen greepje (`[data-stapel-grip]`), en een `pointerdown` daarbuiten ketst af — net zoals
`initBundelSlepen` alleen vanaf `[data-bdl-grip]` oppakt. Twee redenen, en ze wegen allebei zwaar
genoeg om er de rij-brede variant voor op te geven:

- **Tekst selecteren mag nooit een schrijfactie worden.** Stapelen schrijft naar de Sheet. Toen de
  rij het handvat was, was "tekst selecteren en daarbij een rijgrens passeren" hetzelfde gebaar als
  "stapelen". Remmen (een drempel van 6px, de opgelichte doelrij, de ongedaan-maken-melding) maakten
  een ongeluk onwaarschijnlijk, niet onmogelijk. Met een eigen handvat kán het niet meer, en een
  VvE-naam of actiepunt selecteren en kopiëren is weer een doodgewone leeshandeling — ook dwars over
  rijen heen.
- **`touch-action: none` blijft beperkt tot het handvat.** Zonder die regel leest de browser een
  vingerbeweging als scroll-gebaar en stuurt hij een `pointercancel` in plaats van `pointermove`. Op
  de hele rij gezet zou hij élke aanraking op een taakrij doodmaken voor de verticale paginascroll
  én voor de horizontale pan van `.tbl-wrap` — precies hoe je op een telefoon de rechterkolommen van
  de takentabel bereikt. Op een greepje van 16px kost hij niets.

**Gevolg: stapelen werkt óók met een vinger** — in de takentabel én op de VvE-dossierpagina. Daar
was één ding extra voor nodig. Bij aanraking en pen zet de browser bij `pointerdown` zélf een
*impliciete pointer-capture* op het aangeraakte element, waardoor elke volgende `pointermove` en
`pointerup` op de bron-rij binnenkomt; `e.target` wijst dan altijd naar de eigen rij en nooit naar
een doel. De drop wordt daarom bepaald met `document.elementFromPoint(e.clientX, e.clientY)`. Voor
de muis verandert dat niets — dat geeft hetzelfde element als `e.target`, inclusief het gedrag dat
een toast vóór de tabel (z-index 700, vangt zelf pointer-events) een drop eronder blokkeert.

**Wat het gebaar op een telefoon níet doet: meescrollen.** Er is geen auto-scroll bij de schermrand,
en omdat het gebaar op het handvat begint (`touch-action: none`) neemt de slepende vinger de pagina
ook niet mee. Bron- en doelrij moeten dus tegelijk in beeld staan op het moment van loslaten — het
doel wordt met `elementFromPoint` in venstercoördinaten bepaald. In de takentabel zijn dat er op een
telefoon een handvol. Dat is bewust geen bezwaar: weg 2 uit §6.1 — het veld **"Hoort bij"**
in het bewerkscherm — maakt exact dezelfde koppeling, werkt altijd en is ook met het toetsenbord te
bereiken. Slepen is de snelle weg voor twee rijen die je toch al naast elkaar ziet, niet de enige.

**Ook bewust: de VvE-dossierpagina geeft na een geslaagde stapelactie geen zichtbare terugkoppeling
in de lijst.** `render-vve.js` importeert uit `render-bundel.js` alleen `STAPEL_GREEP` — dus wel het
handvat, maar geen chevron, geen bundelpaneel en geen bundelmerkje (§4.2b, §4.3, §4.4). De
ongedaan-maken-melding uit §6.4 is daar het enige bewijs dat er iets veranderd is; de rijen zien er
daarna hetzelfde uit. Het resultaat staat wél meteen goed in de takentabel. Dit volgt uit de keuze in
fase C om het dossier een platte takenlijst te laten en het bundelbeeld in de takentabel te houden,
en het weegt zwaarder nu juist deze pagina de plek is waar het vingergebaar het nuttigst is. Blijkt
het alsnog storend, dan is de kleinste stap het bundelmerkje op een lid, niet het hele paneel.

De 6px-drempel blijft staan: een trillende hand op het handvat mag geen sleepactie worden, anders
dimt de rij en licht de rij eronder op bij een gewone klik.

Eén detail dat makkelijk over het hoofd te zien is: een greep die niet verplaatst eindigt gewoon in
een `click` — `preventDefault()` op `pointerdown` onderdrukt de muis-compatibiliteitsevents, niet de
klik erna. Het handvat draagt daarom een eigen (lege) `data-action`, zodat die klik niet doorschiet
naar de afhandeling van de rij eronder. Op de VvE-dossierpagina is de rij namelijk zélf de knop naar
het bewerkscherm; zonder dat attribuut opende elke mislukte greep dat scherm.

### 6.4 Elke stapel-actie krijgt een ongedaan-maken-melding

Hetzelfde balkje (`showUndoToast`) dat nu bij afronden en verwijderen verschijnt. Sleep je op de
verkeerde taak, dan is dat één klik terug. Dat is het echte vangnet — sterker dan een
bevestigingsvraag vooraf, en het past bij de bestaande werkwijze van de app.

### 6.5 Afronden

Het ✓ op een subtaak opent **hetzelfde afrond-scherm** als in de tabel (datum + toelichting). Er
komt geen tweede manier van afronden bij. De taak belandt via de bestaande weg in "Afgerond" en
in het logboek — nu inclusief `taakId`, `bundelId` en `bundelVolg`.

**Hoofdtaak afronden met openstaande subtaken** → waarschuwing:
*"Er staan nog 2 subtaken open — toch afronden?"* Bij ja gaat alleen de hoofdtaak naar Afgerond;
de bundel blijft bestaan en de kop schuift door (§3.3).

### 6.6 Verwijderen

Bij het verwijderen van een taak met subtaken: melding dat de bundel blijft bestaan met de
overige leden. Geen cascade — verwijderen raakt nooit meer dan één taak.

## 7. Waterdichtheid

| Risico | Vangnet |
|---|---|
| Schrijven naar de verkeerde rij (rijnummers schuiven) | `assertRowMatch` op het vaste taaknummer vóór élke schrijfactie — de bestaande guard |
| Slepen schrijft meerdere rijen | Eén batch-opdracht, elke rij afzonderlijk gecontroleerd. Ergste uitkomst = verkeerde volgorde, geen dataverlies (§5) |
| Twee collega's tegelijk | Elk schrijft naar zijn eigen rij; ze botsen niet |
| Offline | `blokkeerOffline()` vóór de mutatie, zoals overal in de app |
| Schrijffout | `backgroundWrite` met rollback + rode melding; writes geserialiseerd via `_writeChain` |
| Undo verliest de bundel | `serializeNtdUndo` uitgebreid met `bundelId` + `bundelVolg` |
| Kolommen bestaan nog niet | Raster eerst verbreden én verifiëren (§9) — anders mislukt opslaan **stil** |
| Handmatig gerommel in de Sheet | Bundel met gat of dood nummer wordt gewoon getekend zonder te klappen; leden zonder bundel zijn normale taken |
| Nesting | Geblokkeerd bij het koppelen (§6.2), niet pas bij het tekenen |

## 8. Wat níet verandert

Bewust onaangeroerd: de kolommen van de takentabel (inclusief "Periode" bij Vergaderverzoeken),
de sortering, de tellers, de filters, de prioriteitsberekening, het logboek, de bulk-acties, de
herhaalmotor, Analytics en de meldingen.

Een bundel is geen nieuw soort taak — het is een verwijzing tússen taken die er al zijn.

## 9. Voorwaarden vooraf

1. **Raster verbreden.** "Nog Te Doen" is nu **precies 17 kolommen** breed (A t/m Q; Q is de
   laatste). Kolom R en S bestáán niet. Verbreden naar 19 kolommen op **zowel de TEST- als de
   PROD-Sheet**, en daarna verifiëren. Schrijven buiten het raster mislukt stil — deze val is in
   dit project eerder toegeslagen.
   "Afgerond" is 26 kolommen breed; daar is geen aanpassing nodig.
2. **Uitrolvolgorde**: eerst het raster, dan de lezende code, dan de schrijvende code. Nooit
   andersom.

## 10. Losse waarneming (buiten scope)

`parseSections()` leest voor "Afgerond"-rijen de Herhaal-ID (kolom L) als `opvolgdatum`, en
`herhaalId` uit de lege kolom M. Nu onschadelijk — niets gebruikt `af[].opvolgdatum` — maar
`opvolgStatus()` op een afgeronde rij zou verkeerd uitpakken. **Niet meeveranderen in dit
traject**: Apps Script (`Opvolging.gs:119`) leest die kolom L en is er afhankelijk van. Apart
oppakken.

## 11. Testplan

Nieuwe unittests in `src/tests.js` (draaien via `?test=1`):

- `parseSections` leest `bundelId` / `bundelVolg` uit R en S, voor NTD én Afgerond
- bundelindex: leden groeperen, sorteren op volgnummer, leden uit "Afgerond" meenemen
- zichtbare-kop-regel: hoofdtaak open / hoofdtaak afgerond / hoofdtaak verwijderd / alles
  afgerond / één lid over
- eén-plek-per-tabblad: subtaak in hetzelfde tabblad wordt geabsorbeerd, in een ander tabblad niet
- platte weergave bij zoeken, filteren, kolomsortering en bulk-modus
- hernummeren na slepen (10/20/30), inclusief invoegen tussen twee leden
- nesting-blokkade
- `serializeNtdUndo` draagt de bundelvelden mee (19 velden)
- afrondwaarden zijn 19 lang met `taakId`/`bundelId`/`bundelVolg` op index 16/17/18 en de
  Herhaal-ID onveranderd op index 11

Daarnaast: ingelogd doortesten op staging vóór productie, volgens de vaste route
(bouwen op `staging` → Vercel-testlink → merge naar `main`).

## 12. Bewust niet gebouwd

- **Een bundel op zijn plek houden als de kop doorschuift.** Schuift de kop door naar een taak die
  'in behandeling' is, dan zakt de hele bundel mee naar het in-behandeling-blok onderaan. Dat is
  even schrikken — je rondt iets af en het blok verdwijnt uit beeld — maar het volgt uit de
  bestaande sorteerregel, die losse taken precies zo behandelt. De gebruiker is hier op
  2026-08-17 expliciet mee geconfronteerd (met een echt geval op de testomgeving) en koos ervoor
  het zo te laten. Een bundel volgt dus altijd zijn zichtbare kop; er is geen aparte
  bundel-sortering. **Niet 'repareren' zonder dat opnieuw voor te leggen.**
  Wat wél is opgelost: je kón niet zien dát een subtaak in behandeling was, waardoor de
  verspringing willekeurig aanvoelde (§4.4, het amber label).
- **Blokkerende volgorde** — de praktijk wijkt te vaak af; je gaat vechten met je eigen dashboard
- **Meerdere niveaus diep** — bundels-in-bundels worden zelden gebruikt en maken slepen,
  afronden en tellen fors ingewikkelder
- **Subtaken verbergen uit hun eigen tabblad** — dan kloppen de tellers niet meer met wat er
  werkelijk loopt, en een collega die daar kijkt mist werk
- **Apart tabblad "Bundels"** — extra bron die synchroon moet blijven, en extra leeslast per
  poll; die leeslast is net met 64% teruggebracht
- **Cascade-afronden of cascade-verwijderen** — één klik mag nooit werk wegvegen dat nog niet
  gedaan is
- **Bundelbeeld op de VvE-dossierpagina** (chevron, paneel, bundelmerkje-merkje) — die pagina blijft een
  platte takenlijst; alleen het sleep-handvat staat er. Gevolg en afweging staan in §6.3
- **Auto-scroll tijdens het slepen** — bron en doel moeten samen in beeld staan; wie verder moet
  reiken gebruikt "Hoort bij" (§6.1, weg 2). Zie §6.3
