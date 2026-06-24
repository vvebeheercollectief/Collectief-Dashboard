# Logboek-regels bewerken & verwijderen

**Datum:** 2026-06-24
**Tak:** `feat/logboek-bewerken` (vertakt van `main`, zodat de geparkeerde spraakmemo-functie niet meelift)
**Doel:** Op de Logboek-pagina logregels kunnen bewerken en verwijderen.

## Aanleiding

Op de Logboek-pagina kun je nu alleen lézen. Het team wil typefouten in notities/contacten kunnen
corrigeren en foutieve regels kunnen opschonen, zonder de Google Sheet handmatig open te hoeven.

## Datamodel (bestaand)

Het Logboek staat in het Sheet-tabblad **`Logboek`**, kolommen A–H. `parseLogboek()` in
[`src/render-overig.js`](../../../src/render-overig.js) zet elke rij om naar een object met het
echte sheet-rijnummer in `_row` (2-gebaseerd, header overgeslagen):

| kol | veld           | inhoud                                            |
|-----|----------------|---------------------------------------------------|
| A   | `timestamp`    | ISO-tijdstempel                                   |
| B   | `code`         | VvE-code                                          |
| C   | `sectie`       | sectie                                            |
| D   | `actie`        | Opmerking / Contact / Afgerond / Aangemaakt / …   |
| E   | `veld`         | bij Contact = **soort** (Telefoon/E-mail/…)       |
| F   | `oudeWaarde`   | bij Contact = **met wie** (Bewoner/Bestuur/…)     |
| G   | `nieuweWaarde` | bij Opmerking/Contact = de **tekst** zelf         |
| H   | `gebruiker`    | auteur                                            |

`renderLogboek()` toont alleen regels waarvoor `logPaginaSoort(actie)` niet-null is:
- **`normaal`** → `Opmerking`, `Contact` (volwaardige `log-item`-regel, eigen typewerk)
- **`subtiel`** → `Afgerond`, `Aangemaakt*` (dunne `log-mini`-regel, automatisch)

De Sheet is in normaal gebruik **append-only**: nieuwe regels komen onderaan, dus bestaande
`_row`-nummers blijven stabiel zolang er niets boven wordt verwijderd.

## Beslissingen (met gebruiker afgestemd)

1. **Bereik:** notitie- en contactregels zijn **bewerk- én verwijderbaar**; automatische
   `afgerond`/`aangemaakt`-regels zijn **alleen verwijderbaar** (bewerken heeft daar geen betekenis).
2. **Rechten:** iedereen die is ingelogd mag bewerken/verwijderen (klein, vertrouwd team).
3. **Verwijderen:** regel verdwijnt direct uit de Sheet, met een **"Ongedaan maken"**-toast van een
   paar seconden — net als bij het verwijderen van een taak.

## Ontwerp

### 1. Acties per regel

Elke Logboek-regel krijgt rechts kleine, subtiele icoonknopjes (stijl van de bestaande
icoon-only-acties uit het Operator-ontwerp):

- **Notitie/contact** (`log-item`) → ✎ Bewerken + 🗑 Verwijderen
- **Automatisch** (`log-mini`) → alleen 🗑 Verwijderen

Desktop: zichtbaar bij hover over de regel. Mobiel: altijd aanwezig, gedempt.
De knoppen dragen het sheet-rijnummer mee (`data-row`) zodat de juiste regel geraakt wordt;
verwijzen naar `D.logboek`-entries gebeurt via een lookup op `_row` (niet op displayvolgorde).

### 2. Bewerken (alleen notitie/contact)

Klik ✎ → de regel klapt *ter plekke* open in een klein bewerkveld (geen apart venster):

- **Opmerking:** één tekstveld (kolom G).
- **Contact:** soort-keuze (chips, `CONTACT_SOORTEN` = Telefoon/E-mail/Gesprek/Notitie, kolom E)
  + "met wie"-keuze (dropdown: Bewoner/eigenaar, Bestuur, Leverancier, Overig, kolom F)
  + tekstveld (kolom G). Dezelfde keuzes als de contact-composer op de VvE-pagina.

Knoppen **Opslaan** / **Annuleren**. Bij Opslaan:
- Lege tekst wordt geweigerd (zoals bij het toevoegen van een notitie).
- De gewijzigde cellen worden weggeschreven naar de Sheet (kolommen E–G van die rij,
  één `writeRange` met `valueInputOption=USER_ENTERED`).
- `D.logboek` wordt ter plekke bijgewerkt en de pagina opnieuw gerenderd.
- `timestamp` (A) en `gebruiker` (H) blijven ongewijzigd.
- Bewerken verandert het rij-aantal niet, dus `_row`-nummers blijven kloppen.

### 3. Verwijderen (notitie/contact + automatisch)

Klik 🗑 → geen extra bevestigingsdialoog (de undo-toast is het vangnet, net als bij taken):

- **Optimistisch:** de regel wordt direct uit `D.logboek` gehaald en de pagina opnieuw gerenderd.
- **Achtergrond:** vóór het echte verwijderen controleert het systeem dat rij `_row` nog steeds de
  bedoelde regel is (tijdstempel in kolom A komt overeen) — bescherming tegen een verschoven rij als
  er net iets is bijgekomen. Dit volgt het bestaande `assertRowsMatch`/`assertRowMatch`-patroon.
- Verwijderen gebeurt met `deleteDimension` op de `sheetId` van het Logboek-tabblad
  (via `getSheetIds()`), idempotent afgeschermd zoals bij `deleteTaskRow`.
- **Rij-verschuiving:** na verwijderen van rij R schuiven alle `D.logboek`-entries met `_row > R`
  één omlaag (`_row -= 1`). Een kleine helper `_shiftLogboekRows(fromRow, delta)` analoog aan
  `_shiftNtdRows` houdt de nummering kloppend.
- **Toast:** `showUndoToast('🗑️ Logregel verwijderd', <korte omschrijving>, undo)`.
- **Ongedaan maken:** voegt de rij terug in (`insertDimension` op positie R + `writeRange` van de
  acht oorspronkelijke kolomwaarden), draait de lokale `_row`-verschuiving terug en zet de entry
  terug in `D.logboek`. Volgt het bestaande undo-patroon van `deleteTaskRow`.

> **Belangrijk gedrag:** het verwijderen van bv. een *"afgerond"*-regel haalt **alleen de logregel**
> weg. De onderliggende taak verandert niet (komt niet terug, wordt niet heropend). Het is puur het
> opschonen van het logboek.

### 4. Bouwstenen & raakvlakken

- **Nieuw/uitgebreid in `src/render-overig.js`:** actieknopjes in `logItemHtml()`, een
  `editLogEntry(row)` (open/opslaan/annuleren) en `deleteLogEntry(row)`; `_shiftLogboekRows`.
- **Schrijf-helpers (bestaand) in `src/api.js`:** `writeRange` (cel-update), `assertRowsMatch`
  (rij-bescherming). Voor delete/insert het `batchUpdate`+`getSheetIds`-patroon uit `src/crud.js`.
- **Actie-dispatch:** nieuwe `data-action`-waarden (`log-bewerken`, `log-opslaan`,
  `log-annuleren`, `log-verwijderen`) aangehaakt op de bestaande centrale click-listener.
- **Geen wijziging** aan het Sheet-schema; het bestaande `Logboek`-tabblad (A:H) volstaat.

### 5. Foutafhandeling

- Niet ingelogd / token verlopen → `ensureToken()`; bij mislukken nette melding, geen wijziging.
- Schrijffout bij opslaan → melding "kon niet worden opgeslagen", de bewerkmodus blijft open zodat
  niets stil verdwijnt (zoals bij `addTaskNote`).
- Schrijffout bij verwijderen → optimistische verwijdering wordt teruggedraaid en de regel komt
  terug (rollback-callback van het background-write-patroon).
- Transient fouten (429/5xx) → `_withRetry` (max 2 herkansingen, backoff), bestaand.

## Testen

Uitbreiden van [`src/tests.js`](../../../src/tests.js):
- `_shiftLogboekRows` verschuift de juiste entries omhoog/omlaag.
- Bewerken werkt het juiste object bij (E/F/G) en laat A/H ongemoeid.
- Lege tekst bij opslaan wordt geweigerd.
- Verwijderen haalt de juiste entry weg en undo zet 'm exact terug (incl. `_row`-herstel).
- Automatische regels krijgen wél een verwijder-, géén bewerkknop (`logPaginaSoort`-tak).
- Volledige bestaande testset blijft groen.

## Uitrol

- Bouwen op `feat/logboek-bewerken` (vanaf `main`).
- `APP_VERSION` ophogen in `src/config.js` (nu `6.8` → volgende) en `CACHE_VERSION` in `sw.js`
  (nu `cd-v62` → volgende).
- Na akkoord: merge naar `main` → CI deployt automatisch naar PROD. Spraakmemo blijft op `staging`,
  gaat niet mee.

## Bewust buiten scope (YAGNI)

- Geen aparte "wie schreef het"-rechtencheck (iedereen ingelogd mag).
- Geen bewerken van automatische regels (alleen verwijderen).
- Geen bewerken van de auteur of het tijdstempel van een regel.
- Geen meta-logregel bij verwijderen (gekozen: stil weg, met undo-vangnet).
