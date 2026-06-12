# Ontwerp — VvE-dossier verrijken: dossier-logboek + beheerderskenmerken

Datum: 2026-06-12
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: eerst op `staging`, na akkoord merge naar `main`

## Aanleiding

De per-VvE-pagina (Fase 5, `src/render-vve.js`) toont alles van één VvE op één scherm,
maar de onderkant is grotendeels leeg en de rechterkolom toont alleen "Recente activiteit"
(de laatste 10 logregels). Twee dingen die het kantoor dagelijks mist:

1. **Een volwaardig dossier-logboek per VvE** waarin álle gebeurtenissen terug te vinden zijn,
   én waar je tijdens (bijvoorbeeld) een telefoongesprek met een eigenaar direct kunt
   vastleggen wat er besproken is — zodat alle collega's altijd kunnen terugzien wat zich
   heeft afgespeeld. Zo bouwen we per VvE een echt dossier op.
2. **Beheerderskenmerken** — bewerkbare feiten per VvE (zijn de balkons/kozijnen
   gemeenschappelijk?). Dit zijn veelgestelde, belangrijke vragen waar nu telkens uitzoekwerk
   in zit. Eén keer vastleggen, altijd snel terugvinden.

## Scope

Twee onderdelen op de per-VvE-pagina:

- **Deel A — Dossier-logboek** (volle breedte, onderaan). Bouwt voort op het bestaande
  `Logboek`-tabblad. **Frontend-only**, geen nieuwe opslag, geen Apps Script-wijziging.
- **Deel B — Beheerderskenmerken** (rechterkolom, vervangt "Recente activiteit"). Vereist
  een **nieuw tabblad `Kenmerken`** (één regel per VvE). Lezen/schrijven gaat rechtstreeks
  via de ingelogde gebruiker, zoals taken nu ook geschreven worden. Geen Apps Script nodig.

Buiten scope (mogelijke latere uitbreiding, expliciet niet nu):
- Filteren/zoeken op kenmerk via Ctrl+K (bv. "alle VvE's met balkons gemeenschappelijk").
- "Met wie"-filter over het hele logboek (bv. "alle contact met leveranciers"); de data wordt
  wél vastgelegd zodat dit later een kleine uitbreiding is.
- Bron per kenmerk (nu: één gedeelde Bron).

## Deel A — Dossier-logboek

### Plek & layout
- Nieuwe sectie over de **volle breedte onder** de bestaande twee-kolomsgrid op de VvE-pagina.
- Bovenin het invoerveld (composer), daaronder de volledige geschiedenis.
- De rechterkolom-sectie **"Recente activiteit" vervalt** (wordt vervangen door Deel B);
  het volledige logboek onderaan dekt die functie ruimer af.

### Composer (handmatig contactmoment vastleggen) — variant "tekst + soort + met wie"
- Tekstvak (textarea) voor de vrije omschrijving.
- **Soort** (verplicht, één keuze, chips): `Telefoon` · `E-mail` · `Gesprek` · `Notitie`.
- **Met wie** (dropdown): `Bewoner/eigenaar` · `Bestuur` · `Leverancier` · `Overig`.
- Knop **Vastleggen**.
- Sneltoets: Ctrl/Cmd+Enter legt vast (consistent met bestaande `histNoteKey`).

### Geschiedenis (weergave)
- Toont **alle** logregels van deze VvE (`D.logboek` gefilterd op `code`), nieuwste boven,
  gegroepeerd per dag ("Vandaag" / "Gisteren" / datum) — hergebruik van bestaande
  `logDayLabel` / `logTijd` / `avatarKleur` / `logZin`-stijl.
- **Filter** bovenin: `Alles` (standaard) / `Alleen contactmomenten` (alleen handmatige logs,
  d.w.z. `actie === 'Contact'`). Filterstatus alleen op de VvE-pagina, niet globaal.
- Handmatige contactmoment-regel toont: soort-chip (icoon + label), "‹naam› sprak met ‹wie›",
  en eronder de omschrijving als citaat.

### Opslag (hergebruik bestaand `Logboek`-tabblad, kolommen A:H)
Bestaande kolommen: A=timestamp, B=code, C=sectie, D=actie, E=veld, F=oudeWaarde,
G=nieuweWaarde, H=gebruiker. Een handmatig contactmoment wordt geschreven via de bestaande
`logEvent(code, sec, actie, veld, oudeWaarde, nieuweWaarde)`:

| Kolom | Veld          | Waarde bij contactmoment                          |
|-------|---------------|---------------------------------------------------|
| D     | actie         | `Contact`                                         |
| E     | veld          | soort (`Telefoon` / `E-mail` / `Gesprek` / `Notitie`) |
| F     | oudeWaarde    | met wie (`Bewoner/eigenaar` / `Bestuur` / `Leverancier` / `Overig`) |
| G     | nieuweWaarde  | de vrije omschrijving                              |
| C     | sectie        | leeg (VvE-breed, niet aan een taak gekoppeld)     |

Geen schemawijziging: het tabblad blijft A:H. `logZin()` krijgt een nieuwe `case 'Contact'`,
`actieBadge()` een nieuw item, en het filter herkent `actie==='Contact'` als "contactmoment".

### Optimistische update
Na schrijven: regel direct vooraan in `D.logboek` toevoegen (zoals `addTaskNote` nu doet) en
de VvE-pagina opnieuw renderen, zodat de gebruiker 'm meteen ziet (de 8s-poll bevestigt later).

## Deel B — Beheerderskenmerken

### Plek & weergave
- Kaart in de **rechterkolom**, op de plek van het vervallen "Recente activiteit".
- **Weergavemodus** (standaard): twee feiten + bron.
  - `Balkons gemeenschappelijk`: `Ja` / `Nee` / `Deels` / `Onbekend` (gekleurde pil)
  - `Kozijnen gemeenschappelijk`: idem
  - `Bron`: vrije tekst (verwijzing naar onderbouwing, bv. "splitsingsakte art. 17",
    "mail gemeente 03-2024"). Eén gedeeld veld voor het hele paneel.
- **Bewerkmodus** via potlood-knop: de twee feiten worden keuzelijstjes, Bron wordt een
  tekstvak; knoppen Opslaan / Annuleren. Onbekende/lege waarde = "Onbekend".

### Opslag — nieuw tabblad `Kenmerken`
Eén regel per VvE. Kolommen:

| Kolom | Veld          | Inhoud                                  |
|-------|---------------|-----------------------------------------|
| A     | code          | VvE-code (sleutel)                      |
| B     | balkons       | `Ja` / `Nee` / `Deels` / `Onbekend` / leeg |
| C     | kozijnen      | idem                                    |
| D     | bron          | vrije tekst                             |
| E     | gewijzigdDoor | naam (who) van laatste wijziging        |
| F     | gewijzigdOp   | ISO-timestamp van laatste wijziging     |

- **Lezen:** in `data.js loadAll` een `fetchSheet("Kenmerken").catch(()=>[])` toevoegen aan de
  `Promise.all`, geparsed door een nieuwe `parseKenmerken(rows)` naar `D.kenmerken`
  (array van `{_row, code, balkons, kozijnen, bron, gewijzigdDoor, gewijzigdOp}`), en
  meegenomen in de `_lastDHash`-vergelijking.
- **Schrijven (upsert op code):**
  - bestaat er al een regel voor de code → `writeRange("'Kenmerken'!A{_row}:F{_row}", waarden, 'PUT')`;
  - anders → `appendRange("'Kenmerken'!A:F", waarden)`.
  - via de bestaande retry/seriële-schrijf-aanpak (`_withRetry`, `pendingWrites`).
- **Optimistische update:** `D.kenmerken` lokaal bijwerken/aanvullen en de VvE-pagina opnieuw
  renderen; de poll bevestigt.
- Een pure helper `vveKenmerken(code, data)` levert het kenmerk-record (of een leeg default)
  voor de VvE — testbaar zonder DOM, in lijn met `vveOverzicht`.

### Wijziging ook in het logboek (audit)
Bij opslaan wordt **per gewijzigd veld** een logregel geschreven via `logEvent`, zodat het
dossier toont wie wanneer welk feit vastlegde/aanpaste:

| Kolom | Veld         | Waarde                                      |
|-------|--------------|---------------------------------------------|
| D     | actie        | `Kenmerk`                                   |
| E     | veld         | `Balkons` / `Kozijnen` / `Bron`             |
| F     | oudeWaarde   | vorige waarde                               |
| G     | nieuweWaarde | nieuwe waarde                               |

`logZin()` krijgt een `case 'Kenmerk'` → bv. "‹naam› wijzigde *Balkons* → Ja". Alleen velden
die echt veranderen worden gelogd (geen ruis bij ongewijzigd opslaan).

### Eenmalige setup
Het tabblad `Kenmerken` (met kopregel A1:F1) moet één keer worden aangemaakt in **beide**
spreadsheets: eerst de test-Sheet (`SID_TEST`, via staging), na akkoord de prod-Sheet (`SID`).
Geen Apps Script of trigger nodig — puur een leeg tabblad met kopregel.

## Architectuur / bestanden

- `src/render-vve.js` — logboek-sectie (composer + geschiedenis + filter) en kenmerken-kaart
  toevoegen; "Recente activiteit"-blok verwijderen; `vveOverzicht` houdt `logboek` al; nieuwe
  pure helper `vveKenmerken`.
- `src/render-overig.js` — `logZin`/`actieBadge` uitbreiden met `Contact` en `Kenmerk`.
- `src/data.js` — `Kenmerken` meeladen + `parseKenmerken` + opnemen in hash.
- `src/crud.js` (of een klein nieuw `src/kenmerken.js`) — `saveKenmerken(code, nieuw)` met
  upsert + audit-logregels + optimistische update; `addContactLog(code, soort, wie, tekst)`.
- `src/actions.js` — nieuwe `data-action`-handlers (contact vastleggen, kenmerken
  bewerken/opslaan/annuleren, logboekfilter wisselen) in het bestaande klik-registry
  (strikte CSP: geen inline handlers).
- `src/tests.js` — tests voor `vveKenmerken`, de upsert-logica, `logZin('Contact')`/
  `logZin('Kenmerk')` en het contactmoment-filter.
- Geen wijziging aan `apps-script/`.

## Testbaarheid

- Pure helpers (`vveKenmerken`, upsert-bepaling, `logZin`-cases) krijgen tests in de bestaande
  in-app testsuite (`?test=1`, `window._testResult`).
- Handmatig op staging (vereist login): contactmoment vastleggen + meteen zichtbaar, filter
  Alles/Contactmomenten, kenmerken bewerken+opslaan met audit-regel in het logboek, herladen
  bevestigt persistentie in het `Kenmerken`-tabblad.

## Risico's / aandachtspunten

- Het `Kenmerken`-tabblad moet bestaan vóór de eerste schrijfactie; `fetchSheet(...).catch(()=>[])`
  vangt het ontbreken bij lezen netjes op (leeg paneel), maar schrijven faalt tot het tabblad
  er is. Daarom is de eenmalige setup een harde voorwaarde vóór go-live per omgeving.
- Upsert leunt op een correct `_row`-nummer; bij parallelle schrijfacties geldt dezelfde
  seriële-wachtrij-bescherming als de bestaande taakschrijfacties.
- "Recente activiteit" verdwijnt — bewust, want het volledige logboek dekt het beter af.
