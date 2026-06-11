# Ontwerp Fase 4 — Opvolging & herhaling

**Datum:** 11 juni 2026
**Status:** goedgekeurd door gebruiker (ontwerp-gesprek deze sessie)
**Routekaart:** Fase 4 uit `2026-06-08-dashboard-routekaart-design.md` (Fase 3 is uitgesteld, niet geschrapt)
**Doel:** opvolging gebeurt vanzelf in plaats van uit het hoofd — niets glipt er meer doorheen.

---

## 1. Wat we bouwen (samenvatting)

Vier bouwstenen, samen één geheel:

1. **Taken wegleggen** — een opvolgdatum per taak ("aannemer gemaild, over 5 dagen checken"). De taak zakt gedempt naar een nieuwe groep "Weggelegd" onderaan de lijst en komt op de opvolgdatum vanzelf terug met een pil "Opvolgen vandaag".
2. **Herhaalregels** — terugkerende taken (kalender-gebonden én "X maanden na afronden") beheerd op een eigen pagina; het systeem zet de taak automatisch klaar, kort vóór de deadline.
3. **Escalatie van stille dossiers** — twee-traps meldingen (eerst behandelaar, daarna Jer) met drempels per categorie.
4. **Rijkere ochtend-samenvatting** — de bestaande 08:30-push per persoon wordt verrijkt met opvolgingen, stille dossiers en klaargezette terugkerende taken. Geen nieuw kanaal.

Keuzes uit het ontwerp-gesprek: alle drie herhaalvormen gewenst (kalender / na afronden / opvolging na contact); weggelegde taken gedempt onderaan (niet verbergen); twee-traps escalatie; drempels per categorie; digest via bestaande push; herhaalregels op een eigen scherm (aanpak A, met mockups bevestigd).

---

## 2. Bouwsteen 1 — Taken wegleggen (opvolgdatum)

### Gedrag
- Elke taak in "Nog Te Doen" krijgt een actie **Wegleggen** (in de rij én in de bewerkmodal) met snelkeuzes: **+3 dagen, +1 week, +2 weken, kies datum**.
- Een weggelegde taak verhuist naar de groep **"Weggelegd"** ónder de bestaande "In behandeling"-groep, gedempt weergegeven (zelfde patroon als in-behandeling: aparte groep, ongeacht deadline), gesorteerd op opvolgdatum, met grijze pil "Opvolgen <datum>".
- Op de opvolgdatum (of eerder bij handmatig "terughalen") doet de taak weer gewoon mee in de normale sortering, met een opvallende pil **"Opvolgen vandaag"**. In de volgorde krijgen deze taken voorrang direct ná het "Te laat"-blok (dus vóór de gewone prioriteit/deadline-sortering). De pil verdwijnt zodra de opvolgdatum wordt gewist of vernieuwd (opnieuw wegleggen), of de taak wordt afgerond.
- **De deadline wint altijd.** Een opvolgdatum ná de deadline geeft een waarschuwing bij het instellen. Passeert de deadline terwijl de taak weggelegd is (kan alleen als de gebruiker de waarschuwing negeerde of de deadline wijzigde), dan wordt de taak wakker en geldt de normale "Te laat"-weergave.
- Wegleggen en terughalen worden in het **Logboek** geregistreerd ("Jer heeft deze taak weggelegd tot 16 juni"), zodat het team ziet waaróm een dossier stil ligt.
- Weggelegde taken tellen **niet** mee als "stil" (bouwsteen 3) en de "Stil"-pil verschijnt er niet op.

### Data
- Nieuwe kolom **Opvolgdatum** op de taakrij in "Nog Te Doen". Nieuwe kolommen komen **ná kolom K** (de parser reserveert kolommen I–K via `afOff`, en de maandagbriefing leest A1:K95); beoogde indeling: **L = Opvolgdatum, M = Herhaal-ID, N = Escalatie-stempel** — identiek voor alle vier de secties. Exacte indices per sectie verifieert het implementatieplan tegen `parseSections`/`SECS`.
- Datumformaat: schrijven/lezen via bestaande `_parseAnyDate()`-conventies (Sheets geeft Nederlandse long-dates terug).

### Frontend
- `render-lijsten.js`: Weggelegd-groep + pillen; sortering: actieve taken (te laat → opvolgen vandaag → bestaande prio/deadline-volgorde) → In behandeling → Weggelegd (op opvolgdatum).
- Wegleggen-actie via het bestaande data-action-klik-systeem; schrijven via `backgroundWrite` (optimistisch, met rollback) zoals alle andere acties.
- `bepaalStil` slaat weggelegde taken over.

---

## 3. Bouwsteen 2 — Herhaalregels

### Gedrag
- Nieuwe dashboardpagina **"Herhaalregels"** (mockup goedgekeurd): tabel met alle regels — taak, VvE, behandelaar, frequentie, volgende deadline + "zichtbaar vanaf", status (Actief/Gepauzeerd) — plus knop "Nieuwe herhaalregel" en acties bewerken/pauzeren/verwijderen.
- **Frequenties:** elke week / maand / kwartaal / half jaar / jaar (kalender-gebonden, vaste volgende deadline), óf **"X maanden na afronden"** (volgende deadline wordt pas berekend op het moment van afronden).
- Per regel instelbaar: **dagen vooraf** (standaard 14) — zoveel dagen vóór de volgende deadline verschijnt de taak in "Nog Te Doen".
- De klaargezette taak is een **gewone taak**: sectie, VvE, behandelaar, deadline, automatische prioriteit. De behandelaar krijgt een pushmelding "Terugkerende taak klaargezet" en er komt een logboekregel.
- Bij **afronden** van een taak die uit een regel komt, berekent het systeem de volgende deadline en werkt de regel bij ("Volgende keer: …"). Bij "na afronden"-regels start de teller op de afronddatum.
- **Pauzeren** in plaats van weggooien: een gepauzeerde regel zet niets klaar maar blijft bewaard.
- Bedoeld voor de vaste cyclus van **tientallen** taken — niet voor bulk over alle 500 VvE's.

### Data
- Nieuw tabblad **"Herhaalregels"** in de spreadsheet (prod én test-Sheet). Kolommen (indicatief, plan werkt uit): Herhaal-ID, Omschrijving/actiepunt, Sectie, VvE-code, VvE-naam, Behandelaar, Frequentietype, Interval, Dagen vooraf, Volgende deadline, Status, Laatst klaargezet (idempotentie-stempel).
- Taken die uit een regel komen dragen het **Herhaal-ID** (kolom M) zodat afronden de juiste regel bijwerkt.

### Motor (Apps Script)
- **Eén schrijvende motor**: een dagelijkse Apps Script-trigger (rond 06:30, ná `cd_recalcPrioriteiten` 06:00 en vóór de 08:30-digest) zet taken klaar en werkt "Volgende deadline" bij. De frontend beheert alleen de regels (CRUD op het tabblad) en toont ze; hij zet zelf geen taken klaar — zo geen race tussen gebruikers en motor.
- Idempotent: "Laatst klaargezet"-stempel voorkomt dubbele taken (ook als de trigger een keer dubbel draait of een taak handmatig is verwijderd: binnen dezelfde cyclus wordt niets opnieuw klaargezet).
- Afronden-detectie: bij het afronden verhuist de rij naar "Afgerond" (bestaand mechanisme); de motor herkent het Herhaal-ID in "Afgerond" en plant de volgende keer. Verwijderen (niet afronden) van een klaargezette taak laat de regel met rust — de volgende cyclus komt gewoon weer.

---

## 4. Bouwsteen 3 — Escalatie van stille dossiers

### Gedrag
- "Stil" = geen menselijke logboek-activiteit op de taak (zelfde bron als de bestaande `bepaalStil`/"Stil Xd"-pil, die op 4 dagen blijft staan).
- Twee trappen, drempels per categorie:

| Categorie | Trap 1: push naar behandelaar | Trap 2: ook push naar Jer |
|---|---|---|
| Oppakken | 7 dagen stil | 14 dagen |
| Vergaderverzoeken | 14 dagen | 21 dagen |
| Offerte-trajecten | 21 dagen | 35 dagen |
| LOD | 30 dagen | 60 dagen |

- Elke trap meldt **één keer** per stilteperiode (geen dagelijkse spam). Komt er weer activiteit op de taak, dan resetten de trappen.
- **Trap 2-ontvanger:** Jer (`info@vvebeheercollectief.nl`), via de bestaande notificatiekanalen (`cd_notifyByExternalId`/`cd_notifyByTag` — push + Meldingen-sheet). Meerdere behandelaars ("Cihad, Jer") → trap 1 naar allen.
- **Uitsluitingen:** weggelegde taken tellen niet als stil; automatische meldingen/systeem-acties tellen niet als activiteit (anders reset het systeem zijn eigen stilteklok).

### Data & motor
- Escalatie-stempels (trap 1/trap 2 + datum) in kolom N op de taakrij, geschreven door dezelfde dagelijkse motor.
- Drempels in één config-tabel **`STIL_ESCALATIE_REGELS`** (frontend) + **`CD_STIL_ESCALATIE_REGELS`** (Apps Script) — gelijk houden, zelfde afspraak als `PRIO_REGELS`/`CD_PRIO_REGELS`.

---

## 5. Bouwsteen 4 — Rijkere ochtend-samenvatting

- De bestaande `cd_dailySummary` (08:30, per behandelaar) wordt uitgebreid met, voor zover van toepassing: **vandaag opvolgen** (wakker geworden weggelegde taken), **stille dossiers** (boven trap 1-drempel), **te laat**, en **vandaag klaargezette terugkerende taken**.
- Kort, en alleen versturen als er iets te melden is (bestaand gedrag respecteren).
- Geen nieuw kanaal; e-maildigest is bewust buiten scope (kan later alsnog).

---

## 6. Buiten scope (bewust)

- E-maildigest (alleen push-verrijking nu).
- Mail-intake / taak-sjablonen (= uitgestelde Fase 3).
- Bulk-herhalingen over alle VvE's tegelijk.
- Wijzigingen aan de maandagbriefing (blijft lokaal draaien zoals hij is; kan later de nieuwe velden meenemen).

## 7. Randgevallen

- Opvolgdatum in het verleden invoeren → niet toegestaan (melding).
- Opvolgdatum ná de deadline → waarschuwing; bewust doorzetten mag, maar bij het passeren van de deadline wordt de taak wakker als "Te laat".
- Taak met Herhaal-ID handmatig verwijderd → regel blijft staan; volgende cyclus zet gewoon opnieuw klaar.
- Regel gepauzeerd terwijl er al een taak klaarstaat → de klaargezette taak blijft (is een gewone taak); er komt alleen geen volgende.
- Sheet-rijen handmatig verplaatst/geplakt (bekend fenomeen) → motor zoekt op Herhaal-ID, niet op rijnummer.
- Test-Sheet mist het nieuwe tabblad/kolommen → motor faalt stil met logregel, geen crash van bestaande triggers (`cd_safeRun`-patroon).

## 8. Testen & uitrol

1. **Bouwen op `staging`** (test-link + test-Sheet + test-OneSignal): nieuwe kolommen + tabblad eerst in de test-Sheet.
2. **Unit-tests** uitbreiden in de bestaande `?test=1`-suite (62 tests): weglegd-sortering, wakker-worden-logica, deadline-wint-regel, escalatie-drempels per categorie, volgende-deadline-berekening (incl. maandgrenzen/schrikkeljaar), idempotentie-stempel.
3. **End-to-end op staging:** taak wegleggen → groep onderaan → datum bereiken (motor-simulatie) → "Opvolgen vandaag" + push; herhaalregel aanmaken → taak verschijnt op juiste dag → afronden → volgende keer ingepland; stilte forceren → trap 1 → trap 2; digest-inhoud controleren.
4. **GO van gebruiker** → merge naar `main` (GitHub Pages-productie + prod-Apps Script via CI) → kolommen/tabblad in de prod-Sheet aanmaken → triggers prod zetten → live-verificatie.

## 9. Open punten voor het implementatieplan

- Exacte kolomindices per sectie verifiëren tegen `parseSections` (afOff-gedrag) en de Afgerond-parsing; kolomkoppen in de Sheet zetten.
- Precieze plek van de nieuwe pagina in het menu + route (`PAGE_META`).
- Encoding van frequentie en stempels (leesbaar in de Sheet houden).
- Volgorde dagelijkse triggers en duur (Apps Script-quota) controleren.
