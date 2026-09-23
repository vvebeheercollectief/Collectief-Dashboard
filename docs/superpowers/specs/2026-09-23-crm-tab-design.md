# CRM: een zesde tabblad in "Nog Te Doen"

**Datum:** 2026-09-23
**Status:** ontwerp, goedgekeurd door gebruiker ("ja perfect, ik zeg gewoon doen")
**Branch:** `feat/crm-tab`, afgetakt van `main` op 12.7 / cd-v154
**Versie na uitrol:** APP_VERSION 13.0 / CACHE_VERSION cd-v157
**Mockup:** `mockups/mockup-crm-tab.html` (echte `styles.css`, echte rijopmaak uit de app)

## Aanleiding

De gebruiker: *"Nu zitten de CRM namelijk ook in het normale Oppakken tabblad. Hierdoor wordt
die lijst te lang en het is onoverzichtelijk hoe het met de CRM ervoor staat."*

CRM is hier: een vraag, klacht of melding van een eigenaar die op antwoord wacht. Op PROD staan
er vijf in Oppakken, herkenbaar aan "CRM" aan het begin van het actiepunt, vaak met de hele mail
erin geplakt.

## Beslissingen

| # | Vraag | Besluit |
|---|-------|---------|
| 1 | Alleen apart zetten, of meer? | **Apart + voortgangsstatus** (variant B) |
| 2 | Welke extra's? | **Alle vijf**: wachtteller, afzender + kort onderwerp, automatische deadline, sneller stil-signaal, soort vraag |
| 3 | Fases | **Vier**: Ontvangen → Opgepakt → Wacht op reactie → Beantwoord. Afronden = afgehandeld |
| 4 | Reactietermijn | **5 werkdagen** na ontvangst (aanname uit de mockup, bevestigd met "gewoon doen") |
| 5 | Kleur | **Roze**, de bestaande `--pk`-familie (licht én donker bestaan al). Groen = afgerond, teal = Subsidie |
| 6 | Plek in de tabs | **Laatste**, achter Subsidie-trajecten |
| 7 | CRM en Subsidie | **Volledig gescheiden** (gebruiker, expliciet): eigen fases, eigen kleur, eigen blok in de Sheet. De fase-module wordt geparametriseerd; de subsidiefases blijven byte-gelijk |

## Wat het wordt

Een zesde tabblad met dezelfde bediening als de andere vijf: zoeken, filteren, sorteren, bulk,
wegleggen, afronden, VvE-dossier, Ctrl+K. Kolommen:

| VvE Code | VvE | Vraag | Van | Fase | Wacht | Wie | (acties) |
|---|---|---|---|---|---|---|---|

- **Vraag** = label met de soort + het korte onderwerp.
- **Van** = afzender, met eventueel huisnummer.
- **Fase** = vier klikbare bolletjes, zelfde component als Subsidie maar in de sectiekleur.
- **Wacht** = dagen sinds ontvangst, met onder de streep "nog Xd" (amber) of "Xd te laat"
  (rood) t.o.v. de deadline. Zonder ontvangstdatum valt de cel terug op de gewone deadlinecel.
  Sorteren op deze kolom sorteert op deadline.
- **Klik op de rij** klapt een paneel open met de mail en de interne notitie (Opmerkingen).

Opmerkingen staat niet als kolom in de tabel: de ruimte gaat naar Vraag. Ze staat in het
uitklappaneel en in het bewerkscherm.

### Enige wijziging buiten het nieuwe tabblad

Het zoekveld in de kopbalk van Nog Te Doen gaat van 203 naar **140px**. Gemeten in de echte app
bij 1920px: de kopbalk had 8px speelruimte en een zesde tab kost 66px (64 + 2 tussenruimte). De
grens ligt bij 159px; 140 laat ~19px over voor een extra cijfer in een teller. Onder ±1850px
breekt de balk al af, zoals vandaag.

## Sheet-indeling

Nieuw blok `CRM` onderaan "Nog Te Doen" én onderaan "Afgerond", na SUBSIDIE-TRAJECTEN.

| Kolom | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| Kop | VvE Code | VvE | Onderwerp | Fase | Behandelaar | Deadline | Opmerkingen | In behandeling |
| Sleutel | `code` | `naam` | `onderwerp` | `crmFase` | `behandelaar` | `deadline` | `opmerkingen` | `inBehandeling` |

Precies acht sleutels (`afOff = Math.max(keys.length, 8)`). `crmFase` en niet `fase` (die
naam overschrijft `parseSections` met kolom O).

Vier nieuwe kolommen **achter S**, alleen door CRM-rijen gevuld:

| Kolom | T | U | V | W |
|---|---|---|---|---|
| Kop | Van | Ontvangen | Soort | Mail |
| Veld | `afzender` | `ontvangen` | `soort` | `mail` |

`parseSections` leest T..W voor elke rij (leeg bij niet-CRM). **Alleen CRM-rijen schrijven
voorbij S.** Zo raakt geen enkele schrijfactie van de andere vijf tabbladen de nieuwe kolommen,
ook niet op een blad dat nog niet verbreed is.

Het raster van "Nog Te Doen" gaat van 19 naar **23** kolommen (RASTER_MIN en
NTD_SORT_KOLOMMEN mee). "Afgerond" is al 26 breed.

## Gedrag

| Regel | Waarde | Reden |
|---|---|---|
| Deadline | ontvangen + 5 werkdagen (za/zo overgeslagen), automatisch in het venster | Niemand hoeft hem te typen; handmatig aanpassen blijft kan |
| `PRIO_REGELS` | hoog ≤2 dagen, midden ≤5 | Termijn is kort; zonder regel matcht het prioriteitsfilter nooit |
| `STIL_ESCALATIE_REGELS` | trap1 **3**, trap2 **7** | Afgesproken: na 3 dagen de behandelaar, na 7 ook Jer. Gelijk aan `CD_STIL_ESCALATIE_REGELS` |
| Soort | Vraag / Klacht / Schade / Financieel, standaard Vraag | Eén klik |
| Fase leeg of onbekend | telt als Ontvangen, crasht niet | Zelfde als Subsidie |
| Fase wijzigen | bolletje of Opslaan → logregel "Fase gewijzigd" | Beide wegen via één gedeelde functie (les uit Subsidie) |
| Verplaatsen uit CRM | Van, Ontvangen, Soort en Mail komen in de "dit vervalt"-lijst | Niets verdwijnt stil |

## Apps Script

- Sectielijsten krijgen `CRM` (Code.gs, Notifications.gs, Opvolging.gs, AutoPrioriteit.gs).
- Code.gs: kolomkoppen voor het blok, een eigen sorteerblok op kolom F, en het Subsidie-sorteerblok
  stopt bij de CRM-kop (anders sorteert Subsidie de CRM-rijen mee — dezelfde fout als LOD had).
- `NTD_SORT_KOLOMMEN` = 23, maar begrensd op `sheet.getMaxColumns()`: de PROD-code kan live zijn
  vóór het blad verbreed is, en een sortering buiten het raster gooit een fout.
- `cd_setupCrm()`: idempotent. Verbreedt "Nog Te Doen" tot 23 kolommen, zet het CRM-blok
  (kop + kolomkoppen incl. T..W) onderaan "Nog Te Doen" en "Afgerond", met de opmaak en de
  vinkje-validatie van het Subsidie-blok.
- `cd_setupCrm` draait één keer vanzelf vanuit de bestaande 5-minuten-sweep: op **TEST** meteen, op
  **PROD** pas als `src/crm-fase.js` aantoonbaar op GitHub Pages staat én dat al 15 minuten zo is
  (bijgesteld bij de uitrol op 2026-09-23, met toestemming van de gebruiker: zo is er geen handwerk
  in de editor nodig en blijft 'eerst de code, dan het blok' gegarandeerd).

## Uitrolvolgorde (dwingend)

1. Code naar `staging` (merge van `feat/crm-tab`) → Vercel-test + TEST-Apps Script via CI.
2. TEST-blok verschijnt binnen 5 minuten via de sweep. Controleren via de Sheets-koppeling.
3. Gebruiker test ingelogd op de staging-URL.
4. Na akkoord: **`feat/crm-tab` → `main`** (niet `staging` → `main`: staging bevat ook v12.9,
   waar de gebruiker later op terugkomt).
5. `cd_setupCrm()` draait vanzelf op PROD, 15 minuten nadat de nieuwe code live staat.
6. De vijf CRM-taken uit Oppakken verhuizen, via de verplaatsfunctie in het dashboard, en
   Van/Onderwerp invullen.

Stap 4 en verder niet autonoom: ze raken de dagelijkse omgeving van vier mensen.

## Bewust niet

| Punt | Besluit |
|---|---|
| Mailen vanuit het dashboard | Nee. Uitgaande post gaat altijd via TwinQ |
| Opmerkingen als kolom | Nee, ruimte gaat naar Vraag; staat in het uitklappaneel |
| Herhaalregels voor CRM | Nee, een vraag is eenmalig |
| Feestdagen in de werkdagentelling | Nee, alleen weekenden. Kan later |
| Tab-onderstreping in sectiekleur | Nee, zou de andere tabbladen ook raken |

## Testen

Nieuwe toetsen in `src/tests.js`, naast de bestaande suite:

- `parseSections` leest het CRM-blok, met `crmFase` uit D en T..W als afzender/ontvangen/soort/mail
- `SECS.CRM.keys` is precies 8 lang; geen verboden sleutelnaam
- CRM-fases: leeg/onbekend → stap 1; subsidiefases ongewijzigd
- `werkdagenNa`: over een weekend heen, vanaf vrijdag, vanaf zaterdag
- `berekenPrioriteit` op de grenzen 2 en 5
- `toevoegWaarden`, `serializeNtdUndo`, `afrondWaarden`: CRM-rij tot W, andere secties blijven tot S
- `verlorenVelden`: CRM → Oppakken noemt Van, Ontvangen, Soort en Mail
- Wachtcel: dagen, amber, rood, en terugval zonder ontvangstdatum
- Kopbalk op één regel bij 1920 met zes tabs (geometrie, via `tools/toetsen.py --breed 1920`)
