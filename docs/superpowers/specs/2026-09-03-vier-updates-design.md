# Vier updates — ontwerp

**Datum:** 2026-09-03
**Uitgangsversie:** v12.7 / cd-v154
**Doelversie:** v12.8 / cd-v155
**Aanleiding:** gebruikersverzoek van 2026-09-02, vier punten.
**Mockups:** https://claude.ai/code/artifact/58812baf-5e3f-4503-9c14-70825537e8bc

Keuzes die de gebruiker heeft gemaakt (2026-09-02/03):

| | |
|---|---|
| Groeperen per VvE | **Variant A nu** (schakelaar met groepskoppen), **variant C later** als apart traject |
| Bulk-afronden | **één gedeelde opmerking** voor de hele selectie |
| Opmerking bij afronden | **echt verplicht**, met snelkeuzes |
| Kolomkoppen | **korter mag**, en `Behandelaar` → `Wie` op **alle** tabbladen — "daar moet wel consistentie in zijn" |

---

## 0. Wat er in deze ronde NIET gebeurt

- Geen nieuwe Sheet-kolom. Het raster van 'Nog Te Doen' is precies vol op **S** (19 kolommen);
  een twintigste kost raster verbreden op TEST én PROD, `RASTER_MIN` (structuurcheck.js:39),
  `NTD_SORT_KOLOMMEN` (Code.gs:517), plus `serializeNtdUndo`, `afrondWaarden`, `toevoegWaarden`
  en `_eindKolom`. Variant C (handmatige groepen) heeft die kolom nodig en valt daarom buiten
  deze ronde.
- Geen wijziging aan `LOG_VERBORGEN`, `bepaalStil` of de Apps Script-escalatiemotor. Zie §1.1.
- Geen migratie van bestaande logregels. Oude vormen blijven leesbaar naast de nieuwe.

---

## 1. Het logboek toont alleen nog wat iemand geschreven heeft

### 1.1 Filteren op de weergave, niet op de schrijver

De regels `Afgerond` en `Aangemaakt` zijn tegelijk **activiteitsbewijs**. Drie plekken tellen de
dagen sinds de laatste logregel:

- `bouwStilIndex` / `bepaalStil` (render-tabel.js:180/209) — het stille-taken-signaal;
- `cd_laatsteActiviteitMap` (apps-script/Opvolging.gs:84) — voedt `cd_escaleerStilleDossiers`
  (Opvolging.gs:281) en de dagbriefing van 08:30 (Notifications.gs:338/363);
- `dagenStil` (urgentie.js:23), niet in gebruik maar wel getoetst.

Zou het schrijven stoppen, dan heeft een **verse taak vaak helemaal geen logregel meer** en doen
`bepaalStil` (render-tabel.js:221) en `cd_escaleerStilleDossiers` (Opvolging.gs:304) allebei
niets. De taak valt dan stil uit de bewaking — geen melding, geen fout.

`LOG_VERBORGEN` (render-overig.js:238) zit ín `parseLogboek` en werkt daarom door in *alle*
consumenten, inclusief de stil-klok. Dat is dus niet de plek. **De poort is `logPaginaSoort`.**

### 1.2 `logPaginaSoort` wordt een regel-functie en blijft een allowlist

Nu krijgt hij alleen de actienaam. De regel "een afronding is zichtbaar *als* er een opmerking
bij staat" is niet uit de actienaam af te leiden — daar is de inhoud van de regel voor nodig.
Nieuwe signatuur: `logPaginaSoort(r)`.

```js
export function logPaginaSoort(r){
  const a = (typeof r === 'string' ? r : (r && r.actie) || '').trim();
  if (a === 'Opmerking' || a === 'Contact') return 'normaal';
  if (a === 'Teruggezet') return 'normaal';
  if (a === 'Afgerond' && afrondOpmerking(r)) return 'normaal';
  return null;
}
```

Drie dingen die geen detail zijn:

- **Allowlist, geen denylist.** Apps Script schrijft ook `Terugkerende taak klaargezet`
  (Opvolging.gs:170), `Aangemaakt via mail-intake` (Notifications.gs:627) en `Auto-prioriteit`
  (AutoPrioriteit.gs:67). Met een denylist glipt elk nieuw actietype er stil doorheen.
- **De string-tak blijft geldig.** De signatuurwissel zou anders *stil* falen: een gemiste
  aanroeper geeft `''` en dus `null`, en die regel verdwijnt zonder foutmelding van het scherm.
  Vandaag zijn er twee productie-aanroepers (render-overig.js:694/724, render-vve.js:92).
  De string-tak vangt een derde die later wordt toegevoegd.
- **`Teruggezet` staat erbij, en dat is nieuw.** Undo van een afronding schrijft `Teruggezet`
  (notifications.js:280, bulk.js:435) maar verwijdert de `Afgerond`-regel *niet*. Zonder deze
  regel beweert de tijdlijn straks prominent "Jer rondde 311199 af — dak hersteld" voor een taak
  die weer gewoon open staat, en is de intrekking onzichtbaar. `logZin` heeft er al een tak voor.

De uitkomst `'subtiel'` komt in productie niet meer voor, maar blijft in het contract: beide
renderers berekenen `subtiel = logPaginaSoort(r) !== 'normaal'`, zodat een regel die er
onverhoopt toch doorheen komt als dunne regel binnenkomt en niet als volle regel met avatar.

### 1.3 Bewerkbaar wordt losgekoppeld van zichtbaar

Vandaag is `logPaginaSoort(...) === 'normaal'` in render-vve.js:92 tegelijk "volle regel" én
"eigen/bewerkbaar". Dat mag niet zo blijven: een `Afgerond`-regel met opmerking wordt straks
'normaal', maar mag **geen potlood** krijgen. `logEditWrite` (render-overig.js:440) schrijft voor
niet-Contact alleen kolom G, terwijl diezelfde tekst óók in kolom J van 'Afgerond' staat
(crud.js `afrondWaarden`). Bewerken van alleen de logregel laat die twee stil uit de pas lopen.

```js
const logBewerkbaar = r => { const a=((r&&r.actie)||'').trim(); return a==='Opmerking'||a==='Contact'; };
```

`logItemHtml` gebruikt die zelf (`magBewerken = magActies && logBewerkbaar(r)`); de prullenbak
blijft aan `magActies` hangen. `render-vve.js:92` (`const eigen=…`) kan weg.

**Meeliftende reparatie:** `state.logEdit`/`logEditTs` worden nergens gewist als het
bewerkformulier onbereikbaar wordt. `_herankerLogEdit` doet bij meerdere ankertreffers bewust
niets (render-overig.js:648) en houdt het kale rijnummer vast; `_shiftLogEditRef` (:434) kan dat
nummer daarna naar een andere regel schuiven. `renderLogboek` krijgt daarom een guard: staat
`state.logEdit` op een regel die niet meer `logBewerkbaar` is, dan wordt de bewerkstand gewist.

### 1.4 De vorm van de afrond-logregel

Vandaag schrijft crud.js:1357:

```
veld='status'  oudeWaarde='Nog Te Doen'  nieuweWaarde='Afgerond op 03-09-2026 — dak hersteld'
```

Machinetekst en mensentekst door elkaar in één cel. Nieuwe vorm:

| kolom | inhoud |
|---|---|
| E `veld` | `''` — bewust leeg |
| F `oudeWaarde` | `Afgerond op <datum>` |
| G `nieuweWaarde` | **alleen de opmerking** |

E leeg omdat `renderTaskHistory` (render-overig.js:764) zijn `hist-change`-regel alleen tekent
als `r.veld` gevuld is; met `veld='status'` zou daar "status: Afgerond op 03-09-2026 → dak
hersteld" komen — een pijl tussen twee dingen die geen voor en na zijn.

Eén pure bouwer in crud.js, gedeeld door beide schrijfwegen, zodat de vorm niet op twee plekken
met de hand staat:

```js
export function afrondLogRegel(code, sec, datum, opmerking){
  return { code, sec, actie:'Afgerond', veld:'', oudeWaarde:'Afgerond op '+datum,
           nieuweWaarde:(opmerking||'').trim() };
}
```

`logEvent` is positioneel (render-overig.js:803) en `logEvents` neemt objecten (:821). De losse
weg roept `logEvent` aan met de velden uit `afrondLogRegel`, de bulkweg geeft de objecten
rechtstreeks aan `logEvents`. Eén toets legt vast dat beide wegen dezelfde vijf waarden
opleveren.

**De lezer kent twee vormen**, want er wordt niet gemigreerd:

```js
export function afrondOpmerking(r){
  if(!r || (r.actie||'').trim() !== 'Afgerond') return '';
  if(/^Afgerond op\b/.test((r.oudeWaarde||'').trim())) return (r.nieuweWaarde||'').trim();
  const t=(r.nieuweWaarde||'').trim(), i=t.indexOf(' — ');   // oude vorm
  return i<0 ? '' : t.slice(i+3).trim();
}
```

Bewust géén datum-regex om de oude vorm te strippen: `Afgerond op 14-08-2026 (bulk)`
(bulk.js:380) en `Afgerond op 1 juli` (tests.js:255 voert die vorm als realistisch op) zouden
daar allebei doorheen glippen en als notitie op het scherm komen. De ` — `-splitsing is precies
wat crud.js vandaag schrijft: oude bulkregels en oude regels zonder toelichting leveren `''` op
en blijven dus onzichtbaar, zoals gevraagd.

### 1.5 De opmerking komt niet door `opmaakHtml`

`#complete-comment` is een kale `<textarea>` zonder opmaakbalk (index.html:691); de tekst is
platte gebruikerstekst. `opmaakHtml` zou er `**vet**`, `_schuin_` en `- ` als opsomming
overheen laten lopen: *"kosten \*inclusief\* btw"* verliest zijn sterretjes. De `.log-note` voor
een afrondregel gebruikt daarom `esc()` met `white-space:pre-wrap`, net als render-vve.js:384
dezelfde cel al toont. Notitie- en Contact-regels houden `opmaakHtml` — die komen wél uit een
veld met opmaakbalk.

### 1.6 De Logboek-pagina

- Chip **Alles** (index.html:341) blijft.
- Chip **Notities** (`data-act="Opmerking"`, :342) blijft.
- Chip **Contact** (:343) blijft.
- Chip **Afgerond** (:344) blijft, maar heet voortaan **Afrondnotities**. "Afgerond" belooft dat
  je hier alle afrondingen ziet en dat is aantoonbaar niet zo. `data-act` blijft `Afgerond`.
- Chip **Aangemaakt** (:345) **verdwijnt** — hij zou gegarandeerd nul resultaten geven. Daarmee
  vervalt ook de prefix-uitzondering in render-overig.js:697.

`state.logAct` staat op `''` (state.js:175) en wordt nergens bewaard, dus er is geen migratie
van een blijvende filterstand nodig.

**De zoekbalk krijgt een tweede kans.** `renderLogboek` filtert op zichtbaarheid (:694) vóór de
zoekterm (:700). Zoeken op een taaknaam uit een `Aangemaakt`-regel geeft straks nul treffers,
terwijl de placeholder "Zoek op VvE, woord of naam…" (index.html:328) het hele logboek belooft.
Oplossing: **staat er een zoekterm, dan vervalt de zichtbaarheidspoort** en wordt er over alle
regels gezocht (verborgen treffers als dunne `.log-mini`-regel). Zoeken is een expliciete daad;
opruimen mag het resultaat daarvan niet stiekem inperken.

### 1.7 Het VvE-dossier

Het dossier toont vandaag álles en heeft één filter: `filterDossierLog` (render-vve.js:79) met
de standen `alles` en `contact`. Dat wordt:

| stand | inhoud | knop |
|---|---|---|
| **`notities`** (nieuw, standaard) | Opmerking, Contact, Teruggezet, Afgerond mét opmerking | Notities & contact |
| `contact` | alleen Contact | Contact |
| `alles` | ongefilterd, precies zoals nu | Alles |

De standaardstand is dus schoon, zoals gevraagd. `alles` blijft bestaan en dat is **geen half
werk maar noodzaak** — vier dingen hangen eraan:

1. **Het is de enige plek waar je een foute logregel weghaalt.** Elke automatische regel krijgt
   in het dossier een prullenbak (render-vve.js:89-91, getoetst op tests.js:884/897). Zonder
   `alles` is een dubbele `Aangevinkt`, een verkeerde `Kenmerk` of een `Fout`-regel van de Apps
   Script (Code.gs:69/201/224) alleen nog met de hand in de Sheet te verwijderen.
2. **Het ALV-afvinkspoor.** `Aangevinkt`/`Uitgevinkt` op sectie `ALVS` (render-alv.js:211) heeft
   geen bewerkscherm; `renderTaskHistory` draait alleen vanuit crud.js:265. Het dossier is de
   enige plek waar "Jer vinkte Uitnodiging aan" te lezen is.
3. **Kenmerken.** `kenmerken.js:77-79` zet zijn regel optimistisch in `D.logboek` juist om
   het opslaan onmiddellijk te bevestigen; die regels hebben een lege sectie en vallen daarom
   óók buiten `renderTaskHistory` (render-overig.js:763).
4. **De tegenspraak in de kop.** `cijfers.laatsteDagen` (render-vve.js:47-52) blijft ongefilterd
   tellen, dus een dossier kan "laatste activiteit: 1 d" boven "Geschiedenis 0" tonen. Met een
   zichtbare `Alles`-knop is dat geen raadsel maar een klik.

De teller boven de tijdlijn (render-vve.js:424) telt de **zichtbare** regels en krijgt de tekst
"N van M" zodra er iets verborgen is, zodat een leeg ogende tijdlijn niet als storing leest.

### 1.8 De AI-context wordt beter, niet slechter

**Uitgangspunt (gebruiker, 03-09):** het schermfilter is een *schermfilter*. De chatassistent moet
de hele geschiedenis blijven zien — hij heeft geen last van ruis zoals een mens dat heeft, hij
heeft alleen last van een te kleine greep.

Vandaag pakt `dossier-chat.js`:62 domweg `o.logboek.slice(0,15)` — vijftien regels vanaf de
nieuwste. Bij een VvE met veel bulk-afrondingen zijn dat vijftien kale `Afgerond`-regels en ziet
het model geen enkele notitie. Het probleem is dus niet dat er te véél in zit, maar dat de
willekeurige greep de belangrijke regels eruit duwt.

**Nieuwe opzet — twee blokken in plaats van één lijst**, met een eigen budget per blok, zodat het
ene het andere niet meer kan verdringen:

```
Notities, contactmomenten en afrondingen (nieuwste eerst):
  … tot 14 regels die logPaginaSoort() doorlaat, volledig uitgeschreven …

Overige handelingen (nieuwste eerst, verkort):
  03-09  Jer zette de behandelaar op Cihad
  02-09  Jer legde de taak weg tot 15-09
  01-09  Cihad maakte een nieuwe taak aan: Dakgoot vervangen
  … tot 12 regels, één regel per stuk …
```

Het tweede blok komt uit precies de regels die `logPaginaSoort` op `null` zet en gebruikt
`logZin(r)` — dezelfde zin die de Logboek-pagina zou tonen — met `_kapLog` op 160 tekens in
plaats van 400. Daarmee ziet het model **meer** dan vandaag (tot 26 regels in plaats van 15) en
staat de inhoudelijke informatie vooraan.

Vragen als "wie heeft dit opgepakt?" en "wanneer is dit weggelegd?" worden daarmee beter
beantwoord dan nu, niet slechter — vandaag vallen die regels weg zodra er vijftien afrondingen
boven staan.

Twee bedradingsdetails die niet mogen verschuiven:

- **`dossier-chat.js`:60** — `if(o.logboek.length)` toetst de ongefilterde lijst. Die toets blijft
  op de ongefilterde lijst staan; alleen de opbouw eronder verandert. Anders krijgt een VvE met
  alleen automatische regels een kop met nul regels eronder.
- **`ai.js`:50-52** — de leegtoets op :52
  (`if(!naam && !behs.size && !open.length && !laatste.length) return null`) blijft op de
  **ongefilterde** `laatste` staan. Zou hij op een gefilterde lijst staan, dan geeft
  `aiVveContext` null terug bij een VvE met alleen automatische regels en verdwijnt het complete
  'Live context'-kader (ai.js:76) inclusief behandelaar en open taken. De AI-helper krijgt
  dezelfde tweedeling, met een kleiner budget (3 inhoudelijke + 3 overige).

De token-kosten zijn verwaarloosbaar: de verkorte regels zijn ~60 tekens en er komen er hooguit
twaalf bij.

---

## 2. Afronden vraagt verplicht een opmerking

### 2.1 Het venster

`#complete-bg` (index.html:683) bestaat al met datum, opmerking en duur. Wijzigingen:

- Label wordt **"Hoe staat het er nu voor?"** met een `verplicht`-merkje in plaats van
  `optioneel`.
- Erboven vier snelkeuze-knoppen die het veld vullen en daarna vrij bewerkbaar laten:
  **Uitgevoerd en akkoord · Doorgezet naar aannemer · Vervallen · Bestuur geïnformeerd**.
  De teksten staan in één constante in `config.js` (`AFROND_SNELKEUZES`), niet in de HTML.
  Bewust géén `.soort-chip`: die heeft elders een blijvende `.aan`-stand (styles.css:1144) en
  wordt hier maar één keer gebruikt als invoeg-actie.
- De knop **Afhandelen** blijft klikbaar. Zie hieronder.

### 2.2 De knop wordt niet `disabled`

Twee harde redenen:

1. **Er bestaat geen `.btn:disabled`-regel in styles.css.** Een uitgeschakelde knop ziet er
   precies zo uit als een ingeschakelde: groen, `cursor:pointer` (styles.css:157), hover-glans
   (:158). De gebruiker klikt en er gebeurt niets — geen melding, geen uitleg, geen spoor.
2. **`modal-a11y.js`:23 filtert `button:not([disabled])`.** Een uitgeschakelde knop valt volledig
   uit de focusval: voor toetsenbord en schermlezer is 'Afhandelen' er dan niet meer, en er is
   niets dat vertelt waarom.

In plaats daarvan: de knop blijft aan; bij een klik met een leeg veld gebeurt er **niets
onomkeerbaars**, maar krijgt het veld focus, een rode rand en een regel eronder ("Vul eerst kort
in hoe het er nu voor staat"), aangekondigd via `aria-describedby` + `aria-invalid`. Dat is de
enige vorm die zowel zichtbaar als hoorbaar is.

De controle staat **ná** `blokkeerOffline()` en `ensureToken()` (crud.js:1265-1266). Andersom zou
de gebruiker eerst een zin typen en pás daarna horen dat er niets weggeschreven kan worden — de
vaste poortvolgorde uit bulk.js:200-201 en `submitTask` blijft leidend.

### 2.3 Geen concept-bewaring

Overwogen en bewust **niet** gebouwd: het bewaren van de getypte tekst bij het sluiten van het
venster. Elke sleutel die daarvoor nodig is (`r.taakId || _row|code`) botst: `code` is de
VvE-code en niet uniek, en `_row` schuift mee met `_shiftNtdRows` terwijl een bewaarde sleutel
bevroren is. Twee taken van dezelfde VvE met één afronding ertussen geven dan het concept van A
in het venster van B. Bovendien is `state._completeRow` op het pad crud.js:1303 al `null`.

In plaats daarvan één kleine, veilige ingreep: **een klik náást het venster sluit het niet meer
als er tekst in het opmerkingveld staat** (main.js:387-388). Het kruisje, Annuleren en Escape
sluiten wél en gooien weg — dat zijn expliciete daden. Daarmee is de enige toevallige weg naar
tekstverlies dicht en bestaat de hele klasse van conceptbugs niet.

### 2.4 De logregel binnen de idempotentie-vlag

`doCompleteTask` (crud.js:1341-1358) zet de vlag `afgerond` om de batch heen, maar de
`logEvent`-aanroep staat eronder, **buiten** de vlag, terwijl `backgroundWrite` de hele writeFn
via `_withRetry` tot drie keer opnieuw draait. Vandaag onbereikbaar omdat `logEvent` zijn fouten
opeet, maar zodra die regel de zichtbare mensentekst draagt is een tweede logregel geen ruis meer
maar een dubbele afrondnotitie in de tijdlijn én in de dossierteller. **De aanroep gaat binnen
`if(!afgerond)`.**

### 2.5 Bulk-afronden

`bulkAfronden` (bulk.js:273) kent geen venster. Nieuw: **één venster, één opmerking, voor de hele
selectie.** Uitwerking:

- **Eén venster, geen twee.** De bestaande bevestigingsvraag vanaf drie taken
  (`BULK_AFROND_VRAAG_VANAF`, bulk.js:271) en de waarschuwing over achterblijvende subtaken
  worden in dít venster opgenomen als tekst boven het opmerkingveld. Twee vensters achter elkaar
  voor één handeling is precies de wrijving die de bulkknop onbruikbaar maakt.
- Snelkeuze **Opgeruimd** komt bij de vier standaardteksten.
- De tekst gaat naar `afrondWaarden` (die nu met vier argumenten wordt aangeroepen, bulk.js:309,
  waardoor J leeg blijft) → kolom J van elke rij, én in de ene `logEvents`-append (:379) als
  `afrondLogRegel` per taak.
- Het merkje `(bulk)` verdwijnt niet stilletjes: het gaat van de tekst naar kolom F
  (`Afgerond op <datum> (bulk)`), zodat een bulk nog steeds herkenbaar is. `logTijd` toont
  alleen uu:mm (render-overig.js:366), dus zonder dat merkje zijn twee losse afrondingen in
  dezelfde minuut niet van een bulk van twee te onderscheiden.
- **Faalt `bevestigInvoegPlek`**, dan doet bulkAfronden nu `alert(); loadAll(); return` — venster
  dicht, getypte tekst weg (bulk.js:330-331). Dat wordt gelijkgetrokken met de losse weg, die het
  venster in dezelfde situatie bewust openhoudt (crud.js:1288-1296).

**Geaccepteerd nadeel:** veertig bulk-afrondingen op één dag geven veertig identieke notities in
het logboek. Dat is nog steeds minder ruis dan de veertig informatieloze regels van vandaag, en
het alternatief (één logregel zonder VvE-code) maakt de regel onvindbaar in het dossier van elke
betrokken VvE.

### 2.6 De Afgerond-pagina en het dossier

Kolom J was tot nu toe bijna altijd leeg en wordt nu altijd gevuld. Drie gevolgen die mee moeten:

- **`rowAf` (render-tabel.js:451/460)** tekent `r.opmerking` zonder `.ct`-wikkel, dus
  `white-space:nowrap` zónder ellipsis en zonder `title`. De kolom rekt uit en duwt de andere zes
  achter een zijwaartse schuifbalk. Krijgt een `.ct`-wikkel + `title`, zoals de andere
  teksscellen.
- **`_afZoekvelden` (util.js:39-40)** zoekt in `r.toelichting`, maar `parseSections` schrijft
  kolom J als **`entry.opmerking`** (data.js:979). De verplichte opmerking zou dus níét vindbaar
  zijn met de zoekbalk van de Afgerond-pagina. Dat is een bestaande fout die deze ronde pas gaat
  bijten en hier wordt rechtgezet — het is precies wat de gebruiker met "dan kan dit worden
  teruggevonden" bedoelt.
- **`afRij` (render-vve.js:384)** toont dezelfde tekst al onder de taaktitel in het paneel
  'Laatst afgerond'. Met de nieuwe `.log-note` in het paneel 'Geschiedenis' staat dezelfde zin
  twee keer op één dossierpagina. Opgelost door de tekst in 'Laatst afgerond' te beperken tot één
  regel met `text-overflow:ellipsis` + `title` (styles.css `.tk .nm .mt`), zodat het paneel niet
  twee keer zo hoog wordt en de belofte "drie panelen zonder paginascroll" heel blijft.

### 2.7 Wegen zonder venster

- **De Sheet zelf** — kolom I aanvinken start `verplaatsAfgerond` (Code.gs:9) en schrijft J leeg.
  Blijft zo. Die weg kent geen scherm; een verplichting is daar niet af te dwingen.
- **Herhaalregels en Apps Script-automatismen** — idem.

Die afrondingen zijn straks dus onzichtbaar op de Logboek-pagina. Dat is consistent met het
uitgangspunt (alleen tonen wat iemand geschreven heeft), en de taak staat gewoon in het archief.

---

## 3. De offerte-rij: ruimte herverdelen

### 3.1 Gewichten in plaats van vaste breedtes

De eerste opzet zette Behandelaar en de offertecel op vaste px. Dat is verworpen: bij
`table-layout:fixed` groeit een vaste kolom niet mee, en de klikzone van de aannemers-uitklapper
(`.of-aann-tbl-tog`, `flex:1`) is precies wat er ná de teller en het balkje overblijft. Bij een
vaste 150px is dat ~33px, terwijl het vandaag op een venster van 1920 zo'n 221px is — een factor
6,7 kleiner, en exact de bug die v11.3 heeft gerepareerd (getoetst op tests.js:1116-1121).

`SECS['OFFERTE-TRAJECTEN'].breedtes` (config.js:133) gaat van

```js
['130px', 19.6, '165px', 24.5, 16.5, '165px', 16.9, '120px']
```

naar

```js
['130px', 19, '130px', 13, 11, '148px', 28, '120px']
```

Uitgerekend (px-som 528, gewichtsom 71):

| Kolom | 1150 nu → straks | 1440 nu → straks | 1920 nu → straks |
|---|---|---|---|
| VvE Code | 130 → 130 | 130 → 130 | 130 → 130 |
| VvE | 144 → 166 | 217 → 244 | 245 → 296 |
| Aangevraagd | 165 → 130 | 165 → 130 | 165 → 130 |
| Offertes | 180 → 114 | 272 → 167 | 333 → 202 |
| Wie | 121 → 96 | 183 → 141 | 224 → 171 |
| Deadline | 165 → 148 | 165 → 148 | 165 → 148 |
| **Opmerkingen** | **124 → 245** | **188 → 360** | **231 → 436** |
| Knoppen | 120 → 120 | 120 → 120 | 120 → 120 |

Opmerkingen wordt overal ongeveer **twee keer zo breed**, en de offertecel houdt op elk scherm
een klikzone die met het venster meegroeit.

### 3.2 Korte datums, alleen op dit tabblad

`kortDatum` (util.js:748) geeft `14 jul` binnen het lopende jaar en `14 jul '25` daarbuiten. Twee
cellen op **uitsluitend** Offerte-trajecten gaan die vorm gebruiken:

- de cel 'Aangevraagd' (render-tabel.js:387);
- de datumregel van `deadlineCel` in de offerte-tak (render-tabel.js:255-264).

De andere tabbladen blijven ongewijzigd. `datumAangevraagd` kan vrije tekst bevatten
(tests.js:1018); `kortDatum` laat die staan en `td.cell-sm{overflow:hidden}` (styles.css:429)
vangt de afkapping netjes op.

**Te meten in de browser, niet aan te nemen:** `.dl-dat` en `.cell-sm` staan in `var(--font-mono)`
(styles.css:48), en die stapel verschilt per besturingssysteem. De berekende marge van ~4px op
148px is op een Mac gemeten. Bij de uitrol wordt op 1150, 1440 en 1920 gecontroleerd of de
tweede regel (`opvolgen · nog 14d`, ~105px) past in alle drie de dichtheidsstanden.
`Math.abs(dagenTot)` is onbegrensd; bij vier cijfers kapt `.dl-bij` af (styles.css:488) — niets
loopt over, maar de regel wordt dan onleesbaar in juist het meest urgente geval. Geaccepteerd.

### 3.3 Koppen

| tabblad | nu | straks |
|---|---|---|
| Offerte-trajecten | `Datum aangevr.` | `Aangevraagd` |
| Offerte-trajecten | `Ontvangen/Aangevr.` | `Offertes` |
| Offerte-trajecten | `Behandelaar` | `Wie` |
| Subsidie-trajecten | `Behandelaar` | `Wie` |

`Aangevraagd` en niet `Aangevr.`: dat laatste is een deelstring van de oude kop van de
buurkolom (`Ontvangen/Aangevr.`), en twee collega's die de oude tabel kennen mappen hem dan op de
verkeerde kolom.

`Offertes` verliest de uitleg die `Ontvangen/Aangevr.` letterlijk gaf. `renderThead` geeft
vandaag alleen sorteerbare koppen een `title` (render-tabel.js:113); dat wordt uitgebreid met een
optionele uitleg per kolom, zodat er `title="Ontvangen van aangevraagd"` op kan.

**Meelift:** de kolomkop voedt `VELD_LABELS` (verplaats.js:49) en de niet-opgeslagen-wijzigingen-
vraag (crud.js:401). Die gaan dus "je hebt wijzigingen in 'Wie'" zeggen. Dat is gewenst gedrag —
config.js:165-166 legt vast dat kop en label bij elkaar horen.

**Blijft ongemoeid:** `Behandelaar` als koprij in de Sheet zelf (Code.gs:300-304 en
Opvolging.gs:355, Herhaalregels-tab). Dat zijn Sheet-koppen, geen schermkoppen.

**Nagekeken:** twee schrijvers van de logboek-actienaam `Behandelaar gewijzigd` (crud.js:1540 en
bulk.js:563). Die actienaam verandert **niet** — hij is een logboekwaarde, geen kolomkop.

### 3.4 Het aannemers-label eruit, de klikzone erin

`offerteAannSamenvatting` (render-offerte.js:12-33) verliest zijn zichtbare label. Maar het
huidige opzetje kan niet zomaar blijven: als alleen de tekst weggaat, blijft er een klikzone over
van een paar pixels.

De cel wordt daarom herbouwd. `.of-aann-tbl-tog` omvat straks **de hele celinhoud** — chevron,
teller én balkje — in plaats van alleen de ruimte erna:

```html
<td class="cell-of">
  <span class="of-aann-tog" role="button" tabindex="0" aria-expanded="…"
        data-action="offerte-aann-open" data-aann="…"
        aria-label="Aannemers · 1 van 2 binnen — klik om de lijst te openen"
        title="Aannemers · 1 van 2 binnen">
    <svg chevron/> <span class="prog-wrap">1/2 ▮▮▯</span>
  </span>
</td>
```

Daarmee is de klikzone **de volle cel** op elk scherm — beter dan de 100%-van-de-restruimte van
vandaag — en is de v11.3-regressie niet alleen vermeden maar omgedraaid. `main.js:175` houdt
`.of-aann-tbl-tog` in de uitzonderingslijst van de rij-uitklapper; die wikkel blijft bestaan en
omvat nu de hele inhoud, dus een klik op het balkje opent niet langer per ongeluk de rij.

Drie punten die hierbij horen:

- **De lege cel.** `offProg('')` geeft een lege string terug (util.js:590). Een traject zonder
  aannemerslijst én zonder waarde in kolom D zou dan uit één chevron van 12px bestaan. Er komt
  daarom een gedempt streepje `–` als plaatshouder, zodat de cel altijd inhoud heeft.
- **Focus en hover.** `.of-aann-tbl-tog` heeft `overflow:hidden` (styles.css:515), en dat knipt
  zowel een `outline` als een `box-shadow` af. De focusring komt daarom op de `<td>` via
  `td.cell-of:has(.of-aann-tog:focus-visible)`, buiten de knippende wikkel. Hover krijgt een
  achtergrond op de hele cel in plaats van een onderstreping op verdwenen tekst — in het donker
  getoetst, want `var(--ac-l)` is daar #262b35 op een cel van #1f242c en dus vrijwel onzichtbaar.
- **Aanraakschermen.** `title` toont daar niet. De volledige zin staat daarom óók in
  `aria-label`, en de lijst zelf is één tik ver.

**Eerlijk over de prijs:** een pijltje zonder woord is minder uitnodigend dan de zin. Wie het
paneel nog nooit heeft geopend ziet niet meer dát er een aannemerslijst achter zit. De gebruiker
heeft hier expliciet om gevraagd; de volle klikzone en de zweeftekst zijn de dekking.

---

## 4. Groeperen per VvE — variant A

### 4.1 Wat het is

Een schakelaar in de kop van het NTD-tabblad. Aan: taken van dezelfde VvE staan bij elkaar onder
een grijze kopregel met code, naam en aantal. Uit: precies de lijst van vandaag. Puur weergave —
geen Sheet-kolom, geen schrijfactie, niets te onderhouden. Het dashboard wéét al welke taken bij
dezelfde VvE horen; het zet ze alleen niet bij elkaar.

### 4.2 Geen restbak

De eerste opzet had een blok 'Losse taken' onderaan. Dat is verworpen: een VvE met één taak die
te laat is, zakt daarmee onder álle groepen van zijn blok en bij `PG=25` desnoods naar pagina 2.
Dat breekt de urgentiebelofte waar de hele lijst op gebouwd is.

**De regel wordt:** een VvE met twee of meer zichtbare taken vormt een groep, en die groep staat
op de plek van **zijn urgentste lid**. Taken van een VvE met één zichtbare taak blijven precies
staan waar ze stonden. De volgorde blijft dus die van `filterNtd`; er wordt alleen naar voren
gehaald, nooit naar achteren geduwd.

### 4.3 Waar in de pijplijn

De keten is nu (render-lijsten.js:373):

```
filterNtd → zonderAutoStap → sorteerNtd → absorbeer
```

Daar komt één pure functie achteraan:

```js
// render-lijsten.js — puur, los testbaar
export function groepeerPerVve(rows){
  // → { rijen: [...], koppen: Map<index, {code, naam, aantal, teLaat}> }
}
```

`koppen` is **op index**, niet op rijsleutel. Dat is geen smaak: `rijSleutel(r)` (rij.js:107)
botst zodra twee rijen in dezelfde sectielijst hetzelfde taaknummer dragen — een geval dat dit
project gedocumenteerd kent (render-tabel.js:333-338 noemt het letterlijk, `checkNummers` meldt
het aan de gebruiker) — en geeft `'Rundefined'` voor elke rij zonder taakId én zonder `_row`
(bundel.js:301). Met een Map op sleutel zou de kop van een groep dan stil wegvallen en zou één
taak onder de kop van een ándere VvE komen te staan, zonder melding.

Groeperen gebeurt op **`String(r.code||'').trim().toLowerCase()`**, niet op de rauwe waarde. Een
spatie of hoofdletterverschil in kolom A zou anders één VvE in twee groepen splitsen die allebei
dezelfde zichtbare code tonen met verschillende aantallen. Dat de code getrimd moet worden blijkt
uit crud.js:574-580, dubbelcheck.js:124, render-alv.js:106-107, palette.js:78 en
vve-zoekveld.js:12, die het allemaal al doen.

### 4.4 Binnen de bestaande blokken

`renderTbody` (render-tabel.js:118-148) knipt de lijst al in drie blokken: actief, In
behandeling, Weggelegd. VvE-groepering gebeurt **binnen** elk blok. Anders zou een groep de
blokgrens overschrijden en zou een weggelegde taak tussen de actieve komen te staan.

**Correctie op een aanname:** `renderTbody` krijgt de **volledige** `rows` binnen (:118) en snijdt
pas zelf op :123; hij telt op :136 al over alle pagina's (`ibAll`/`wgAll`). Een omweg via een
globale `state._ntdGroepen` is dus niet nodig — de groepen worden als tweede argument
doorgegeven. Dat scheelt een globale stand die in data.js:887 (de catch rond `renderAll`, die
`_rowCache` en `_ntdZichtbaar` leegt) opgeruimd zou moeten worden.

### 4.5 Paginering

Groeperen gebeurt vóór het snijden, dus een groep kan over een paginagrens vallen. De kop wordt
dan boven aan de volgende pagina herhaald met **`· vervolg`** erachter. `ntdPagina`
(render-lijsten.js:472) werkt op object-`indexOf` en overleeft de herschikking;
`springNaarBundel` (:280-285) blijft werken omdat het dezelfde lijst gebruikt.

### 4.6 De groepskop

```html
<tr class="grp-kop grp-vve"><td colspan="N" role="rowheader">
  <div class="grp-in"> … </div>
</td></tr>
```

- **`display:flex` staat op de `<div>`, niet op de `<td>`.** Die fout is in dit bestand al één
  keer gemaakt en de les staat er letterlijk (styles.css:509-512): flex op een `<td>` haalt hem
  uit de tabelopmaak, de browser wikkelt er een anonieme cel omheen, de colspan telt niet meer
  mee en de kopband klapt terug naar de breedte van kolom 1.
- **`colspan`** telt de bulk-kolom mee als de selecteerstand aan staat.
- **Geen `tabindex`, geen `role="button"`.** De kop is niet klikbaar; tien koppen met een tabstop
  ertussen maken de lijst met het toetsenbord onbruikbaar, en de tbody wordt elke 8 seconden
  hertekend zonder focusherstel (alleen `herstelAannemerFocus` staat er, render-lijsten.js:396).
  `role="rowheader"` kost niets en geeft een schermlezer wél het verband met de rijen eronder.
- **Het aantal staat in de zichtbare tekst**, niet alleen in een `title`: op een telefoon is er
  geen hover, met het toetsenbord is `title` onbereikbaar, en sommige schermlezers lezen `title`
  ín plaats van de celtekst. De tekst wordt **"3 taken hier"** — "hier" omdat het over de
  zichtbare lijst gaat en niet over de VvE als geheel.
- **De te-laat-pil vervalt** als het statusfilter 'te laat' aan staat (render-lijsten.js:62);
  anders staat er op elke kop twee keer hetzelfde getal.
- **Dichtheid.** `.grp-kop` staat op vaste `padding:9px 26px` en luistert niet naar
  `--row-py/--row-px` (styles.css:602 vs 539-541). Bij tien groepen kost dat in de compacte
  stand ~300px die de compacte gebruiker juist niet wilde. De koppen gaan de dichtheidsvariabelen
  volgen.
- **Geen `--group-bg` zonder onderscheid.** `.bdl-paneel` gebruikt dezelfde kleur en ís
  uitklapbaar (styles.css:1749). De VvE-kop krijgt een `border-top` en géén `cursor:pointer`,
  zodat hij niet uitnodigt tot een klik die niets doet.
- Het gebouw-pictogram krijgt `aria-hidden` — `ico()` zet dat niet zelf (icons.js:65-68).

### 4.7 De schakelaar

- Knop in de kop van de takenkaart, naast de bestaande bedieningen. Label **"Per VvE"** met een
  schuifje, zelfde vorm als de dichtheidsknop.
- Stand in `state.ntdPerVve` (naast `ntdSort`/`ntdStatus`, state.js:159-160) en bewaard in
  `localStorage` onder `'ntdPerVve'`, net als `'density'`.
- **App-breed, niet per tabblad.** Het is een manier van kijken, geen eigenschap van een lijst.

### 4.8 Botsingen met bestaand gedrag

| | |
|---|---|
| **Kolomkop-sortering** | Sortering wint; 'Per VvE' staat dan tijdelijk uit en de schakelaar toont dat. Anders belooft `aria-sort="ascending"` een volgorde die de groepering breekt — en `sorteerNtd`:559 legt expliciet vast dat een taak zonder deadline altijd onderaan hoort. |
| **Zoeken en filteren** | Groepering blijft aan. De kop telt de zichtbare taken; vandaar "3 taken hier". |
| **Bulk** | `state._ntdZichtbaar` wordt een permutatie van dezelfde objecten. Nagerekend veilig: bulk.js:90-101 en 107-112 zijn verzamelingsgebaseerd, en shift-klik (bulk.js:48-56) leest de DOM waarin koprijen geen `bulk-vink` dragen. |
| **Bundelstapel** | Blijft aan; de kop van de bundel bepaalt de groep. Let op: een bundel kan over VvE's heen lopen (bundel.js:429). |
| **Sticky actiekolom** | Geen probleem: styles.css:528 selecteert `td:not([colspan]):last-child`. |
| **Slepen** | `doelOnder` (bundel-acties.js:840-853) vindt op een kopregel geen `tr[data-row]`, dus de `.stapel-doel`-markering knippert bij het passeren van een kop. Er kan niets fout gedropt worden. Geaccepteerd. |
| **'Ook hier'-crosslist** | Blijft ongegroepeerd onder de tabel staan (render-lijsten.js:407-454). De kop belooft "3 taken hier" over de hoofdtabel; de crosslist staat daarbuiten. Benoemd, niet opgelost. |
| **`flashRow`** | Een teruggezette taak landt in zijn VvE-groep en dus soms op een andere pagina; de amberflits speelt dan nergens (anim.js:22-25). Bestaand gedrag bij paginawissels, geen nieuwe fout. |

### 4.9 Wat er beweegt onder je cursor

Twee eerlijke nadelen die niet weg te ontwerpen zijn:

1. Zet je één taak van een VvE-paar op 'In behandeling' of rond je hem af, dan valt de groep
   uiteen en verspringt de **andere** taak — die je niet hebt aangeraakt.
2. Maakt een collega een tweede taak voor VvE X aan, dan verspringt de bestaande taak van X op
   jouw scherm bij de volgende poll. Vandaag verplaatst een vreemde rij nooit een rij die er al
   stond.

Beide alleen wanneer de schakelaar aan staat, en één klik terug te draaien. Dat is de reden dat
dit een schakelaar is en geen vaste regel.

### 4.10 Het VvE-dossier

Merkt hier niets van. `groepeerBundels` (render-vve.js:231-280) groepeert daar op bundel, en een
dossierpagina gaat per definitie al over één VvE.

---

## 5. Toetsen

Draai `tools/syntaxcheck.js` vóór elke testronde. Baseline meten op de live URL, niet aannemen
(v12.7 stond op 2821).

### Bestaande toetsen die aangepast moeten worden

| plek | wat |
|---|---|
| tests.js:242-245, 386-390 | `logPaginaSoort` krijgt een regel-object; `Afgerond`/`Aangemaakt` → `null` |
| tests.js:264 | `parseLogboek` nieuwste-eerst verwacht `_lb[0].actie==='Afgerond'` — blijft, want `parseLogboek` filtert niet |
| tests.js:870 | `dossierfilter alles` verwacht 4 — de standaardstand heet nu `notities` en geeft 2; `alles` blijft 4 |
| tests.js:883/884/894/897 | dossier-prominentie en de prullenbak op automatische regels |
| tests.js:5653 | `Fase gewijzigd` → `subtiel` wordt `null` |
| tests.js:6116-6118 | kolomkoppen Subsidie-trajecten: `Behandelaar` → `Wie` |
| tests.js:2313-2325 | het datumbreedte-blok. **Let op:** die assert bewijst voor Offerte-trajecten vandaag al niets — `td.querySelector('span')` levert daar `.dl-2` op (`display:block`, geen overflow), dus `scrollWidth <= clientWidth` is altijd waar. De nieuwe meettoets is daarom geen extraatje maar de enige bewaking van de 148px |
| tests.js:2295 | fixture met de harde datum `22 september 2026`: vanaf ~23-09-2026 is die overal verstreken en wordt het hele datumblok vacuüm groen. Vervangen door een datum die relatief aan vandaag wordt berekend |
| tests.js:11473-11483 | de `vraag()`-helper klikt `#bevestig-ja`/`#bevestig-nee`. Met het nieuwe bulk-venster antwoordt niemand, loopt `wachtTot` leeg en blijft `state._bulkBezig` op true — waarna alle latere `bulkDoe`-aanroepen in het blok stil terugkeren en het blok groen blijft op een dode bulkbalk |
| tests.js:12901 | `meet()` sleutelt op `el.className.split(' ')[0]`; een koprij met `class="grp-kop grp-vve"` sleutelt óók als `grp-kop` en overschrijft de meting van de bestaande blokkop |
| tests.js:12770 | `a11y: geen enkele knop zonder naam` draait over de live DOM en ziet de aannemers-toggle alleen als Offerte-trajecten toevallig actief is |
| tests.js:685-688 | vergelijkt `sw.js` en `config.js` alléén met elkaar — allebei vergeten ophogen is groen |

### Nieuwe toetsen

**Logboek (§1)**
1. `logPaginaSoort` met een `Afgerond`-regel mét opmerking → `'normaal'`; zonder → `null`.
2. `logPaginaSoort` accepteert nog steeds een string (terugvaltak).
3. `logPaginaSoort('Teruggezet')` → `'normaal'`.
4. `afrondOpmerking` leest de nieuwe vorm (F begint met `Afgerond op`) uit G.
5. `afrondOpmerking` leest de oude vorm via ` — ` en geeft `''` bij `(bulk)` en bij
   `Afgerond op 1 juli`.
6. `logBewerkbaar` is waar voor `Opmerking`/`Contact` en onwaar voor `Afgerond`-met-opmerking.
7. Rondgang: `afrondLogRegel` → `logEvent`-argumenten van de losse weg → `afrondOpmerking` levert
   de ingevoerde tekst terug. Idem voor de bulkweg via `logEvents`.
8. `filterDossierLog` met de drie standen.
9. Een zoekterm op de Logboek-pagina toont ook een verborgen regel.
9a. `dossierContextTekst` bevat twee blokken; een VvE met 20 afrondingen en 1 notitie toont die
    notitie nog steeds, en de overige handelingen staan verkort in het tweede blok.
9b. `aiVveContext` geeft géén null bij een VvE met uitsluitend automatische logregels.
10. `renderLogboek` wist een bewerkstand op een regel die niet meer bewerkbaar is.
11. De `.log-note` van een afrondregel gaat door `esc`, niet door `opmaakHtml`
    (`**vet**` blijft letterlijk staan).

**Afronden (§2)**
12. `doCompleteTask` met een leeg opmerkingveld schrijft niets en laat het venster open.
13. Die controle staat ná `blokkeerOffline`: offline meldt eerst offline.
14. Een klik naast het venster sluit niet als er tekst staat; het kruisje wel.
15. De `logEvent`-aanroep staat binnen `if(!afgerond)` — een tweede `_withRetry`-ronde schrijft
    geen tweede logregel. (Broncode-toets, zoals de bestaande `vormcontrole:`-toetsen.)
16. `afrondWaarden` zet de bulk-opmerking op index 9 (kolom J) voor elke taak.
17. Bulk schrijft `Afgerond op <datum> (bulk)` in F en de opmerking in G.
18. `_afZoekvelden` bevat `opmerking` en niet `toelichting`.
19. Een snelkeuze vult het veld en laat het bewerkbaar.

**Offerte (§3)**
20. `SECS['OFFERTE-TRAJECTEN'].breedtes` heeft acht elementen en de gewichtsom is 71.
21. `kolBreedtes` levert bij 1150/1440/1920 de tabelwaarden uit §3.1 (±1px).
22. De deadlinecel kapt niet af bij 1150 in alle drie de dichtheidsstanden — echte meting op
    `.dl-dat` en `.dl-bij`, niet op `.dl-2`.
23. De korte datum staat alleen op Offerte-trajecten; Oppakken toont nog de volle datum.
24. `offerteAannSamenvatting` bevat geen zichtbare labeltekst maar wel een `aria-label` met de
    volle zin.
25. De klikzone `.of-aann-tbl-tog` omvat de hele celinhoud (breedte ≈ celbreedte min opvulling).
26. Een lege offertewaarde levert een plaatshouder op, geen kale chevron.
27. Alle vijf tabbladen hebben de kop `Wie`.

**Groeperen (§4)**
28. `groepeerPerVve` groept alleen bij twee of meer taken; één taak blijft op zijn plek staan.
29. De groep staat op de plek van zijn urgentste lid; de volgorde binnen de groep blijft die van
    `filterNtd`.
30. Groeperen gebeurt op de getrimde, kleingeschreven code: `' 311129 '` en `'311129'` vormen
    één groep.
31. Twee rijen met hetzelfde taaknummer in één lijst leveren nog steeds beide koppen op
    (index-gebaseerd, geen sleutel-Map).
32. Rijen zonder `taakId` én zonder `_row` vallen niet allemaal in één groep.
33. Groeperen gebeurt binnen de blokken: een weggelegde taak komt nooit tussen de actieve.
34. Een groep die over een paginagrens valt, herhaalt zijn kop met `· vervolg`.
35. `colspan` van de kopregel telt de bulk-kolom mee in de selecteerstand.
36. Kolomkop-sortering zet de groepering uit.
37. `state._ntdZichtbaar` bevat na groeperen exact dezelfde objecten (permutatie).
38. De kopregel draagt geen `tabindex` en geen `data-row`.
39. Het aantal staat in de zichtbare tekst, niet alleen in `title`.

---

## 6. Uitrolvolgorde

1. Alles op branch `feat/vier-updates-2026-09`, tests groen (`?test=1`, `window._testResult`).
2. `APP_VERSION` naar `12.8` (config.js:8) **en** `sw.js:32`; `CACHE_VERSION` naar `cd-v155`
   (sw.js:25). Beide, anders blijft de service worker byte-identiek en draaien ingelogde sessies
   de oude modules en de oude `styles.css` door.
3. Merge naar `staging` → Vercel-testomgeving; **ingelogd doortesten** op de test-Sheet:
   afronden los, afronden in bulk, undo, de drie dossierstanden, de schakelaar 'Per VvE' met en
   zonder filter, op 1150/1440/1920 en in beide thema's.
4. `staging` → `main`; GitHub Pages en het PROD Apps Script volgen automatisch.
5. Tests opnieuw draaien **op de productie-URL**, niet lokaal.

Geen Sheet-verbouwing nodig: er komt geen kolom bij en er verandert niets aan een bestaand raster.

---

## 7. Aannames en risico's

| | |
|---|---|
| **Aanname** | Een verplichte opmerking levert bruikbare zinnen op en niet vier keer "ok". De snelkeuzes zijn daarvoor bedoeld; na een paar weken de inhoud van kolom J bekijken en zo nodig de teksten bijstellen. |
| **Risico** | Een typo in de nu verplichte opmerking heeft geen correctieweg: kolom J is nergens bewerkbaar en de logregel mag niet bewerkt worden (§1.3). Bewust geaccepteerd in deze ronde; een bewerkweg op kolom J is een los, klein vervolg. |
| **Aanname** | De tweedeling in de chat-context (§1.8) maakt de assistent beter, niet slechter. Te toetsen door na de uitrol een paar vragen te stellen die vandaag misgaan ("wie heeft dit opgepakt?" bij een VvE met veel afrondingen). |
| **Risico** | De vaste px-som van de offerte-tabel gaat van 580 naar 528 — lager dan nu, dus de flexibele kolommen krijgen juist méér. Elke px-kolom die er later bij komt gaat wél rechtstreeks van de VvE-naam en de opmerking af. |
| **Beperking** | Groeperen per VvE laat rijen verspringen bij andermans wijzigingen (§4.9). Daarom een schakelaar. |
| **Openstaand** | Variant C (handmatige groepen over VvE's heen) is bewust uitgesteld: dat vraagt kolom T en dus een Sheet-verbouwing op twee tabbladen. |
