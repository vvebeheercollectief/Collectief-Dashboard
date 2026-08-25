# Klaarstaande Apps Script-code (wordt NIET uitgerold)

Deze map wordt met opzet **niet** meegenomen door de automatische uitrol. De uitrol duwt alleen
`apps-script/` naar het live script (zie `.github/workflows/apps-script-deploy.yml`, `rootDir` staat
daarop ingesteld). Wat hier staat is af, maar wacht op een beslissing.

## Mailintake.gs — de mail-intake-motor (Deel C)

**Wat het is.** De laatste ontbrekende schakel van de mail-intake: iets dat elke paar minuten de
post op info@ leest, met Claude bepaalt over welke VvE het gaat en wat er moet gebeuren, en er een
taak van maakt. Het aanmaken zelf (Deel A) en de regels (Deel B, `beheer-playbook.md`) waren al af
en staan al live.

**Waarom het hier staat en niet in `apps-script/`.** Zodra er code in het live script staat die
Gmail aanraakt, vraagt Google om nieuwe toestemming. Tot iemand die geeft, kunnen de automatische
taken die er nu draaien (deadline-meldingen, sortering, afronden-in-de-Sheet) op een
autorisatiefout stuklopen. Dat risico hoort niet bij een gewone uitrol te horen; het hoort bij een
moment dat jij kiest.

## Wat er in de nacht van 25 augustus 2026 aan is verbeterd (v11.0)

De doorlichting vond drie dingen in deze klaarstaande code. Ze zijn alle drie gerepareerd, dus wat
hier staat is beter dan wat er lag — maar het is nog steeds niet uitgerold.

1. **Onherkende post ging elke ronde opnieuw door het AI-model.** Een mail waarin geen VvE
   herkend werd bleef ongelabeld staan (zodat een mens hem ziet) en kwam daardoor bij élke ronde
   terug. Bij een trigger van vijf minuten is dat ruim 280 keer per dag, per bericht, met het hele
   playbook en 400 VvE-namen als invoer — uit hetzelfde prepaid-tegoed waar de dossier-chat op
   draait. Er is nu een tweede label `intake-bekeken`: het bericht blijft gewoon in de inbox staan,
   maar deze motor slaat hem over. Daarnaast een harde dagrem van 150 modelaanroepen.
2. **Een mislukt label kon een dubbele taak opleveren.** De volgorde was: taak aanmaken → labelen.
   Ging het labelen mis, dan stond er wél een taak en geen label, en maakte de volgende ronde
   dezelfde taak nog een keer. Nu wordt er eerst gelabeld en daarna pas aangemaakt; lukt het
   aanmaken dan niet, dan komt daar een zichtbare regel over in het Logboek.
3. **De mailtekst stond onafgeschermd in de instructie aan het model.** Een afzender kon onderaan
   zijn mail zijn eigen `=== OPDRACHT ===` zetten met een kant-en-klaar antwoord eronder, en dan
   volgde het model de laatste opdracht die het las — met een taak in jullie werklijst als gevolg.
   De opdracht staat nu in het `system`-veld (dus buiten het bericht), de mailtekst zit ingesloten
   tussen een per ronde willekeurig kenmerk, en nagemaakte scheidingsregels worden onschadelijk
   gemaakt.

## Aanzetten — de stappen op een rij

1. **Kijk eerst of er post te lezen valt.** Ga naar gmail.com en log in als
   `info@vvebeheercollectief.nl`. Zie je daar jullie eigen postvak met de mail van vandaag? Dan kan
   het. Zie je een melding dat Gmail niet aanstaat, dan komt de post ergens anders binnen en is er
   eerst een doorstuurregel (of Google Workspace) nodig. Zonder postvak kan deze motor niets.
2. Verplaats `Mailintake.gs` naar de map `apps-script/` en push naar `staging` (dus eerst de
   TEST-omgeving, niet productie).
3. Open het TEST-script, draai `test_mailIntakeProef` één keer met de hand en geef toestemming
   wanneer Google erom vraagt.
4. Zet in Projectinstellingen → Scripteigenschappen:
   - `ANTHROPIC_API_KEY` — een sleutel mét uitgavenplafond.
   - `BEHEER_PLAYBOOK` — de volledige inhoud van `beheer-playbook.md`.
   - `MAILINTAKE_AAN` — eerst op `proef`.
5. Laat hem een week op `proef` staan. Hij maakt dan niets aan; in Uitvoeringen staat per mail wat
   hij zou hebben gedaan. Dat is het moment om te zien of de VvE-herkenning klopt.
6. Klopt het? Zet `MAILINTAKE_AAN` op `ja` en hang een tijd-trigger op `cd_mailIntakeRonde`
   (elke 5 minuten). Pas dán gebeurt er echt iets.

## Vijf dingen die er eerst uit moesten (gedaan)

Een tweede lezer heeft dit bestand nagelopen vóórdat het ergens heen ging. Vijf punten, waarvan één
fataal:

1. **De taak werd niet aangemaakt, maar de mail wél afgevinkt.** De aanroep om het blad even op slot
   te zetten kreeg een argument te weinig; die fout werd intern opgevangen, dus er kwam geen taak —
   terwijl de logboekregel en het label 'verwerkt' er wél kwamen. De mail zou dan uit de inbox
   verdwijnen en nooit terugkomen.
2. **Het slot kan gewoon bezet zijn.** Ook na die reparatie geeft de sloth-functie stil niets terug
   als het blad tien seconden bezet blijft. Nu wordt de uitkomst gecontroleerd: geen taak = geen
   label, dan blijft de mail staan.
3. **Het model kon een VvE-code verzinnen.** Die wordt nu getoetst tegen de echte lijst; een
   onbekende code levert geen taak op en laat de mail staan.
4. **Niemand zou merken dat de robot iets had neergezet.** Er komt nu een regel in het
   Meldingen-tabblad. Bewust geen pushbericht per mail: bij tien taken per ronde is dat geen signaal
   meer maar ruis.
5. **De logregel stond op naam van "Iemand".** Nu staat er 'mail-intake' bij, zodat in het logboek en
   het VvE-dossier te zien is dat de robot het deed.

## Wat versie 1 bewust niet doet

- **Geen concept-antwoorden.** Het playbook heeft er sjablonen voor, maar mail schrijven namens
  het kantoor is een eigen brok met een eigen risico. Eerst alleen taken.
- **Alleen Oppakken en LOD.** Vergaderverzoeken, offertes en subsidies bewaren hun omschrijving in
  een andere kolom. Die weg is nu wél gerepareerd (`CD_OMSCHRIJVING_COL` in `Notifications.gs`),
  maar nog niet met echte post beproefd. Alles wat daarop lijkt wordt een Oppakken-taak met
  `🔎 controleren` ervoor — zichtbaar, zodat niemand hoeft te raden waarom hij daar staat.
- **Een mail waarvan de VvE niet herkend wordt, blijft gewoon staan** — geen taak, geen label. Dan
  ziet een mens hem nog.
