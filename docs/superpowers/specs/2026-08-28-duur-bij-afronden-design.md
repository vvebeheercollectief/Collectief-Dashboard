# Duur bij afronden — ontwerp

**Datum:** 2026-08-28
**Uitgangsversie:** v12.2 / cd-v149
**Aanleiding:** het dashboard telt *taken*, niet *belasting*. Een telefoontje van vijf minuten
weegt in elk overzicht even zwaar als een ALV-avond. Daardoor is "wie heeft het te druk" een
gevoel en geen cijfer, en is "welke VvE kost onevenredig veel tijd" helemaal niet te
beantwoorden. Zonder een maat voor tijd is elk capaciteitsbeeld dat we bouwen een telling van
regels.

**Bedrijfsvraag die hieronder ligt** (gesprek 28-08-2026): capaciteit en pieken, en op termijn
rendement per VvE. Rendement is bewust geparkeerd — de beheervergoeding staat in Twinq en de
gebruiker wil daar nu geen tijd in steken. Zodra deze meting een halfjaar draait, is die
Twinq-export pas de moeite waard, en hoeft er dan niets meer gemeten te worden.

---

## 1. Wat er verandert

### 1.1 Eén veld erbij in het afrondvenster

Het venster **"Taak afhandelen"** (`#complete-bg`, index.html r.699) heeft nu twee velden:
*Afgerond op* en *Opmerking*. Daar komt er één bij, als laatste:

```
HOE LANG DUURDE DIT?  optioneel
[ 5m ] [ 15m ] [ 30m ] [ 1u ] [ 2u+ ]
```

Vijf knoppen in een raster van vijf gelijke kolommen, in de opmaak van de bestaande `.fld`.
Eén klik kiest; nog een klik op dezelfde knop trekt de keuze weer in.

Gemeten in de mockup: het venster groeit van **329 naar 400 pixels** (71 erbij). Het blijft
daarmee ruim binnen `max-height:70vh` van `.modal-body`.

### 1.2 Geen voorselectie

Er staat **niets voorgeselecteerd**. Dat is een bewuste keuze en het corrigeert een
tegenstrijdigheid uit de eerste mockup, waarin zowel "30 min staat voorgeselecteerd" als
"overslaan mag" stond. Die twee kunnen niet allebei: als de voorselectie meegeschreven wordt,
krijgt élke taak een verzonnen half uur en meten we onze eigen aanname in plaats van het werk.

De gebruiker heeft gekozen dat overslaan moet kunnen. Dus: **niets aangeklikt = niets
opgeslagen**, en die taak telt niet mee in enige berekening.

Verwachte vulgraad: 60–80%. Dat is genoeg voor "wie heeft het te druk" (je vergelijkt personen
over honderden taken) en niet genoeg voor "wat kostte VvE 310884 precies" (te weinig taken per
VvE om gaten weg te middelen). Elk scherm dat deze cijfers straks toont, moet daarom de
vulgraad erbij tonen.

### 1.3 Waarden

De knop schrijft een **aantal minuten** weg, niet het opschrift:

| Knop | Opgeslagen |
|---|---|
| 5m | `5` |
| 15m | `15` |
| 30m | `30` |
| 1u | `60` |
| 2u+ | `120` |

`2u+` is een ondergrens, geen meting. Alles boven de twee uur wordt als 120 geteld; een
optelling van deze kolom is dus altijd een **onderschatting**. Dat is acceptabel en moet in de
toelichting van elk toekomstig overzicht staan.

### 1.4 Waar de vraag wél en niet komt

**Wel** — alle wegen die `completeTaskRow` (crud.js r.1078) gebruiken, want die openen
allemaal hetzelfde venster:
- het ✓/Afronden-knopje op een taakrij
- afronden vanuit het bewerkscherm
- afronden vanuit het VvE-dossier

**Niet** — `bulkAfronden` (bulk.js r.273). Dat kent geen venster, en het is meestal opruimwerk.
Twaalf keer "30m" vervuilt de meting meer dan dat het oplevert. Bulk-afgeronde taken houden dus
een lege duur.

**Niet** — taken die door een automatisme worden afgerond (herhaalregels, Apps Script).

---

## 2. Opslag

### 2.1 Kolom M van 'Afgerond'

De rij die `afrondWaarden` (crud.js r.1117) bouwt heeft een vaste indeling:

```
A..H sectievelden · I afronddatum · J toelichting · K subcategorie · L herhaalId
M..P LEEG · Q taakId · R bundelId · S bundelVolg
```

`M` t/m `P` zijn leeg. De duur gaat naar **kolom M** (index 12). Q/R/S schuiven niet op — die
liggen op dezelfde index als in 'Nog Te Doen' en `parseSections` leest beide tabbladen met
dezelfde vaste posities.

`afrondWaarden` krijgt er een parameter `duurMin` bij en zet die op positie 12 in plaats van de
eerste lege string. De functie is puur en al los getest; de bestaande toetsen die de
kolomindeling vastleggen moeten meeverhuizen.

### 2.2 Eén schrijfactie, geen tweede

De duur gaat mee in dezelfde `values`-array die toch al wordt weggeschreven. Er komt dus
**geen tweede write** en geen terugkomen op een al ingevoegde regel. Dat is de reden dat dit
ontwerp in het venster zit en niet in de melding erna: die variant zou de app achteraf laten
terugkeren naar een rij die intussen verschoven kan zijn.

### 2.3 Kopkolom

Kolom M krijgt op **beide** Sheets (TEST en PROD) de kop `Duur (min)` op elke sectiekoprij van
'Afgerond'. De rijnummers eerst opzoeken en niet overnemen uit eerdere notities: die getallen
(2/22/42/81/99 en 2/17/35/67/83) horen bij 'Nog Te Doen', verschillen per Sheet, en 'Afgerond'
heeft een eigen indeling. Zonder kop breekt er niets — `parseSections` herkent koprijen op
inhoud — maar dan is de kolom in de Sheet zelf naamloos.

### 2.4 Ongedaan maken

Bij een undo gaat de rij terug naar 'Nog Te Doen'. `serializeNtdUndo` kent kolom M niet en
hoeft dat ook niet: 'Nog Te Doen' heeft geen duurkolom. De gemeten duur verdwijnt mee met de
archiefregel — correct, want de taak is niet afgerond.

---

## 3. Lezen

`parseSections` (data.js r.~956) leest voor het archief `afOff = max(keys.length, 8)`, dus
`I = afOff`, `J = afOff+1`, `K = afOff+2`. Daar komt bij:

```
entry.duurMin = getal uit row[afOff+4]  (kolom M), of null
```

Een lege cel, een niet-getal of een waarde ≤ 0 wordt `null` — niet `0`. Het verschil tussen
"niet gemeten" en "nul minuten" moet hard blijven, anders trekt elke latere optelling het
gemiddelde omlaag met taken die niemand heeft ingevuld.

Legacy-rijen (de 5-koloms mei-rijen, zie het projectgeheugen) hebben geen kolom M en leveren
dus `null`. Dat is goed.

---

## 4. Wat hier nadrukkelijk NIET in zit

Er komt in deze stap **geen scherm dat de cijfers toont**. Dat is geen omissie maar de
volgorde: een capaciteitsoverzicht op twee weken meetgegevens is misleidender dan geen
overzicht. Eerst zes tot acht weken meten, dán kijken wat er staat en pas dán ontwerpen.

Ook niet in deze stap:
- rendement per VvE (wacht op de Twinq-vergoedingen, bewust geparkeerd)
- het samengevoegde Analyse-scherm (Analytics + Dashboard) — apart traject, mockups liggen klaar
- de mail-intake (ligt gebouwd in `apps-script-klaarstaand/`, wacht op de gebruiker)

---

## 5. Toetsen

Nieuw, in `src/tests.js`:

1. `afrondWaarden` met `duurMin=30` zet `30` op index 12 en laat Q/R/S op 16/17/18 staan.
2. `afrondWaarden` zonder duur zet `''` op index 12 — niet `0`, niet `null`.
3. `afrondWaarden` blijft 19 waarden lang, voor elke sectie (OPPAKKEN t/m SUBSIDIE-TRAJECTEN).
4. `parseSections` leest `duurMin` uit kolom M als getal.
5. `parseSections` geeft `null` bij een lege cel, bij tekst, bij `0` en bij een negatieve waarde.
6. `parseSections` geeft `null` voor een legacy-rij van 5 kolommen.
7. Het knoprooster: een tweede klik op dezelfde knop trekt de keuze in (geen waarde meer).
8. Bulk-afronden schrijft een lege kolom M.

Draai `tools/syntaxcheck.js` vóór de testronde.

---

## 6. Aannames en risico's

| | |
|---|---|
| **Aanname** | Het team klikt vaak genoeg. Niet te toetsen vooraf; na zes weken de vulgraad meten en dán pas beslissen of dit iets waard is. |
| **Risico** | Als de vulgraad onder ~50% blijft, is het capaciteitsbeeld niet betrouwbaar en moeten we of overstappen op de opvallender variant (de vraag in de rij zelf), of het idee laten vallen. |
| **Risico** | `2u+` als plafond onderschat lange trajecten structureel. Bewust geaccepteerd; een vrij invulveld zou de klik-in-één-tel om zeep helpen. |
| **Beperking** | Lange trajecten (offertes, subsidies) lopen maanden met veel losse handelingen, en krijgen pas bij afronding één duur. De weekbelasting wordt daardoor lumpig toegerekend. Over een langere periode middelt dat uit; voor een weekbeeld is het een bekende vertekening. |

---

## 7. Uitrolvolgorde

1. Kopkolom M op TEST zetten.
2. Code naar `staging` → automatisch naar het TEST-script; ingelogd doortesten.
3. Kopkolom M op PROD zetten (kan vooruit — een lege kolom M breekt niets).
4. `staging` → `main`, Pages en het PROD-script volgen automatisch.
5. `APP_VERSION` en de cachesleutel `cd-vNN` ophogen.
