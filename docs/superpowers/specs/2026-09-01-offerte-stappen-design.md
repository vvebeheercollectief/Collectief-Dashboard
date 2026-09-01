# Ontwerp: Offerte-trajecten als stappenroute (aannemers in het scherm, opvolgdatum, auto-subtaak)

Datum: 2026-09-01 · Status: ontwerp goedgekeurd door gebruiker (mockup-dialoog), wacht op bouwplan

## Waarom

Drie klachten over het tabblad Offerte-trajecten, in één samenhangend ontwerp:

1. De stap "offertes voorleggen aan eigenaren" wordt nu handmatig aangemaakt en soms vergeten.
2. De tellers "Offertes ontvangen/aangevraagd" (bewerkscherm, kolom D) en de aannemerslijst
   (tabelpaneel, kolom P) zijn twee losse werelden: een vinkje "binnen" verandert de teller in het
   bewerkscherm niet, en de koppeling die er is (reconcileOffertes) werkt maar één kant op.
3. De deadline betekent bij deze categorie "uiterlijk dan aanvragen". Zodra de aanvraag is uitgezet
   staat het traject tóch rood "te laat" — terwijl de echte vraag dan is: "wanneer check ik of ze
   binnen zijn?"

## Besluiten (met de gebruiker genomen, 2026-09-01)

| # | Vraag | Besluit |
|---|-------|---------|
| 1 | Oude −/+ tellers in het scherm | **Helemaal vervangen** door de aannemerslijst; rijen zonder namen tonen hun oude kolom-D-getal tot er namen staan |
| 2 | Moment van deadline → opvolgdatum | **Vanzelf** zodra "Datum aangevraagd" wordt ingevuld (voorstel zichtbaar en aanpasbaar vóór opslaan) |
| 3 | Opvolgtermijn | **Getrapt: eerste keer +3 weken** (vanaf datum aangevraagd), daarna bij elke keer opvolgen **+2 weken** |
| 4 | 31 bestaande al-aangevraagde trajecten | **In één keer omzetten**: opvolgdatum = vandaag + 2 weken (die zitten al voorbij hun eerste ronde) |
| 5 | Automatische stappen | **Eén subtaak**: "Offertes voorleggen aan eigenaren" |
| 6 | Moment van aanmaken subtaak | **Direct bij het aanmaken** van het traject |
| 7 | Bestaande trajecten ook een subtaak? | **Ja, meteen erbij** (weggevouwen onder het traject) |
| 8 | Opmaak | **Bestaande dashboard-stijl**: zelfde modal-velden, pillen, panelen, kleuren en iconen — geen nieuwe visuele taal (expliciete wens gebruiker) |

## Deel 1 — Aannemers in het aanmaak-/bewerkscherm

### Gedrag

- In het formulierblok van Offerte-trajecten (`#fg-off`) verdwijnt het stepperblok
  "Offertes ontvangen / aangevraagd" (`#m-off-recv`/`#m-off-total`, index.html:581-612).
- Ervoor in de plaats komt het blok **"Aangevraagd bij"**: dezelfde aannemerslijst als het
  uitklappaneel in de tabel — naam per regel, klikbare status-pil (✓ binnen / nog niet),
  verwijder-kruisje, toevoeg-invoerveld + "+ Toevoegen". Zichtbaar bij toevoegen én bewerken.
- Het is letterlijk dezelfde gegevensbron (kolom P): een vinkje in het paneel zie je in het
  scherm terug en andersom. UI-componenten en wasstraat (geen `|`/regelovergang in namen)
  hergebruiken uit src/offerte-aannemers.js en src/render-offerte.js.

### Opslag

- Bron van waarheid blijft **kolom P**, bestaand formaat "Naam|1" / "Naam|0" per regel
  (parseAannemers/serializeAannemers, src/util.js:549-558). Geen nieuwe kolommen.
- **Toevoegen**: de lijst gaat mee in dezelfde atomaire nieuwe-rij-write
  (toevoegWaarden vult voortaan P i.p.v. hem leeg te laten, src/crud.js:737-750).
- **Bewerken**: de modal werkt op een werkkopie; bij Opslaan gaan lijst-wijzigingen als
  **aparte schrijfactie naar kolom P** ná de A..K-write, in dezelfde seriële wachtrij — het
  bestaande patroon van 'Hoort bij'/koppelTaak (src/crud.js:1491-1501). De bewerk-write zelf
  blijft strikt A..K (src/crud.js:1462-1465); P nooit daarin meenemen.
- Per-klik-schrijven (zoals het tabelpaneel doet) geldt in de modal **niet**: Annuleren moet
  alles terugdraaien, dus pas schrijven bij Opslaan.

### Teller wordt afgeleid

- Nieuwe regel: **heeft een traject een aannemerslijst, dan telt alléén de lijst**
  (X = aantal binnen, N = lijstlengte). Kolom D wordt dan genegeerd in de weergave.
  Zonder lijst: kolom D tonen zoals nu (legacy).
- reconcileOffertes (src/util.js:570-576) verandert dus van "D is ondergrens, Math.max"
  naar "lijst aanwezig → lijst wint volledig; lijst leeg → D". Daarmee kan een vinkje ook weer
  omlaag tellen (dat kon door de ondergrens niet — bewust gedrag dat nu vervalt).
- Kolom D wordt door de modal **nooit meer geschreven** (het `uitVeld`/onvertaalbaar-vangnet
  vervalt daarmee vanzelf voor dit veld). Uitzondering blijft **afronden**: de archiefrij krijgt
  zoals nu de beste teller mee (uit de lijst indien aanwezig, anders D), want kolom P gaat niet
  mee naar het archief (src/crud.js:1144-1162).
- Voortgangsbalkje (offProg) en samenvatting "Aannemers · X van N binnen" in de tabel blijven,
  maar rekenen uit de lijst zodra die er is.
- Let op de bestaande valkuil: `r.offertes` is na verrijking niet de Sheet-waarde
  (_verrijkOfferteRij / `_offertesManual`, src/render-offerte.js:98-107) — de versimpelde
  regel hierboven moet dat mechanisme mee-opruimen, niet ernaast gaan staan.

## Deel 2 — Deadline wordt opvolgdatum na "aangevraagd"

### Toestand

- Een traject geldt als **aangevraagd** wanneer "Datum aangevraagd" (kolom C) gevuld en
  parsebaar is (_parseAnyDate). Geen nieuwe kolom; kolom O (oude fase) blijft ongebruikt.

### In het scherm

- Gaat `m-daang` van leeg → gevuld (bij aanmaken of bewerken), dan verschijnt onder het
  deadline-veld een voorstelblok in de bestaande stijl:
  "Aanvraag is uitgezet — de deadline wordt een opvolgdatum: [datum aangevraagd + 21 dagen]",
  met aanpasbaar datumveld. Bij Opslaan komt die datum in **kolom F** (het deadline-veld zelf).
- Was de datum aangevraagd al gevuld bij het openen, dan heet het F-veld gewoon
  **"Opvolgdatum"** (labelwissel) en verschijnt er geen blok.
- Het bestaande deadline-voorstel voor deze sectie (DEADLINE_VOORSTEL offerte = 14d) blijft
  alleen gelden zolang er nog níet is aangevraagd.

### In de tabel

- deadlineCel (src/render-tabel.js:251-261) krijgt voor OFFERTE-TRAJECTEN een extra vorm.
  Bij aangevraagd: regel 1 = de datum (zoals nu), regel 2 = "opvolgen · nog Xd" (rustig),
  "opvolgen · vandaag" of "opvolgen · Xd over" — verstreken kleurt **amber** (bestaande
  .dl-2.bijna-stijl), **nooit rood "te laat"**. Exacte bewoording mag bij de bouw nog
  gefinetuned worden.
- Aangevraagde trajecten tellen **niet meer mee** in de rode "te laat"-pil en krijgen geen
  row-telaat-klasse; de plekken die berekenPrioriteit(...).teLaat lezen krijgen voor deze
  sectie een aangevraagd-uitzondering (telling render-lijsten.js:27-64, filterpil :470-473,
  rij-klasse render-tabel.js:404-411, sortering laat de datum-sortering op F intact).
- Wegleggen/snooze (kolom L) blijft er los naast bestaan, ongewijzigd.

### Opvolgen-knop

- In het aannemers-uitklappaneel komt een knop **"Opgevolgd · +2 weken"** (bestaande
  knopstijl): zet kolom F op vandaag + 14 dagen via een eigen schrijfweg
  (blokkeerOffline → ensureToken → optimistisch + renderAll → backgroundWrite met
  assertRowMatch + rollback, patroon src/snooze.js:78-101), schrijft een logboekregel
  "Opgevolgd" (logEvent) en toont de gebruikelijke undo-toast.

### Eenmalige omzetting bij livegang

- Alle open OFFERTE-rijen met datum aangevraagd gevuld → kolom F = vandaag + 14 dagen.
- Uitvoering via een eenmalige migratieroutine in de app zelf (zelfde schrijfwegen/guards),
  niet via losse Sheet-bewerkingen; Sheets-MCP blijft alleen-lezen (memory-les v6.4).

## Deel 3 — Automatische subtaak "Offertes voorleggen aan eigenaren"

### Bij een nieuw traject

- submitTask maakt bij een nieuw offerte-traject de traject-rij aan **mét bundelkolommen
  al gevuld**: R (bundelId) = eigen taakId, S (bundelVolg) = '0' (nulVeilig!).
- Direct daarna, als tweede beurt in dezelfde seriële wachtrij, wordt de subtaak-rij
  aangemaakt in sectie **OPPAKKEN**: actiepunt "Offertes voorleggen aan eigenaren",
  zelfde VvE-code/naam en behandelaar, **geen deadline** (conform bestaand subtaak-gedrag:
  geen deadline-voorstel, src/crud.js:115-119), R = traject-taakId, S = '10'.
  TaakId's binnen de actie ontdubbelen met het uniekTaakId-idioom (src/crud.js:1614-1617).
- Faalt de tweede write, dan blijft een gewoon traject over: één lid met een bundelId is
  géén bundel (isBundel eist ≥2, src/bundel.js:118) en rendert als normale rij — onschadelijk,
  bestaande fouttoast meldt het.
- De subtaak verschijnt door de bestaande bundel-rendering vanzelf in het uitklappaneel
  onder het traject: bouwBundelIndex kijkt sectie-overstijgend. Absorptie uit de vlakke
  lijst (wordtGeabsorbeerd, src/bundel.js:178-184) werkt daarentegen alléén binnen
  hetzelfde tabblad — de kop staat in Offerte-trajecten, dus de subtaak blijft in
  Oppakken gewoon als rij staan, mét bundel-merkje, én verschijnt in het paneel onder
  het traject. Dat is precies de bedoeling: in Oppakken is hij afvinkbaar werk.
- **Niet** aanmaken wanneer de nieuwe taak zelf al een subtaak is (state._nieuwBundel gezet)
  — structuur blijft één laag diep (magKoppelen-regel). Bij "Ook voor andere VvE's" krijgt
  **elk** aangemaakt traject zijn eigen subtaak.
- Afronden van een traject met open subtaak: bestaande bundelWaarschuwing
  (src/bundel.js:327-359) dekt dit al.

### Bestaande trajecten (eenmalig)

- Voor elk open offerte-traject dat nog geen open subtaak "Offertes voorleggen aan eigenaren"
  heeft: kop R/S zetten (en een taakId toekennen als kolom Q nog leeg is — zoals koppelTaak
  dat doet, nooit een bestaande Q overschrijven) + subtaak-rij aanmaken.
- Bundels staan standaard dichtgevouwen (state.bundelOpen), dus de lijst oogt niet voller.

## Wat er expliciet NIET verandert

- Geen nieuwe kolommen in de Sheet; kolomposities A..S blijven exact gelijk.
- Wegleggen/snooze, herhaalregels, bulk-acties, ALV's, andere tabbladen: ongemoeid.
- Kolom O (oude offerte-fase) blijft ongebruikt zoals sinds v6.2.
- Geen opvolg-"motor" of Vandaag-paneel — dat is in v6.2 bewust teruggedraaid en komt niet terug.

## Aandachtspunten voor het bouwplan

- Schrijfweg-conventie overal aanhouden: blokkeerOffline → ensureToken → optimistisch +
  renderAll → backgroundWrite met assertRowMatch/assertRowsMatch en rollback; invoeg-ankers
  altijd ín de writeFn berekenen; idempotentie-vlaggen bij insert/delete (429-retry).
- clearModal/closeModal wissen vlaggen op elke sluitweg — nieuwe modal-status (werkkopie
  aannemers, opvolg-voorstel) daar netjes in meenemen.
- toevoegWaarden exact kolom-voor-kolom houden: één lege string te weinig schuift R/S op.
- Apps Script meelopen: Notifications.gs/Opvolging.gs controleren op aannames over kolom D/F
  bij OFFERTE-rijen (stil-signaal, herinneringsmails).
- tests.js uitbreiden (veldlabels, nieuwe rendering, teller-afleiding, subtaak-aanmaak);
  APP_VERSION en cache cd-vNN ophogen (vaste werkwijze).
- Eerst code live, dán de twee eenmalige omzettingen draaien (les van de subsidie-uitrol:
  volgorde code vóór Sheet-blok).
