# Collectief-Dashboard

Interne werklijst van VvE Beheer Collectief. Sinds **v16.0** (november 2026) bewust klein:

| Scherm | Wat | Opslag in de Google Sheet |
| --- | --- | --- |
| Mijn taken | Eigen to-dolijst per account; collega's kunnen meekijken (alleen inzien) | tabblad `Mijn taken` (maakt het dashboard zelf aan) |
| LOD | Gedeelde lijst, afronden gaat naar `Afgerond` | blok `LOD` in `Nog Te Doen` |
| Subsidies | Gedeelde lijst met vijf fases | blok `SUBSIDIE-TRAJECTEN` in `Nog Te Doen` |
| ALV's | Vier vinkjes per VvE, nieuwe ronde met archief | `ALV's overzicht` |
| ALV-archief | Afgeronde vergaderingen | `ALV's afgerond` |

De oude blokken (Oppakken, Vergaderverzoeken, Offerte-trajecten, CRM) staan nog als archief in de
Sheet; het dashboard toont ze niet en wijzigt ze niet. Meldingen en automatische mails staan uit
(zie `apps-script/README.md`).

**Code** (`src/`): `main.js` (opstarten, klikken) · `taken.js` · `dossiers.js` · `alv.js` ·
`data.js` (laden, verversen, opslaan in volgorde) · `parse.js` (Sheet → objecten, puur) ·
`api.js` (Sheets-API) · `auth.js` (Google-inlog) · `ui.js` · `vve.js` · `util.js` · `config.js`.
Elke wijziging zoekt de rij vlak vóór het schrijven opnieuw op (ID of taaknummer) en schrijft
niet als een collega hem intussen veranderde.

## Meekijk-simulatie (`simulatie/`)

`simulatie/index.html` is een losse pagina voor besturen: je kijkt hoe een melding, factuur, vraag of
ledenvergadering door het kantoor loopt, met schuifjes voor drukte en bezetting. Eén bestand, zonder
inlog en zonder koppeling met de Sheet; alle VvE's, bedragen en doorlooptijden zijn verzonnen. De
pagina volgt de externe huisstijl (leisteen, kobalt, Albert Sans), niet die van het dashboard. Ze
hoort niet bij het dashboard: ze staat niet in de bouwlijst (`tools/bouw.mjs`) en is uitgesloten in
`_config.yml` en `.vercelignore`.

## Minimumversie (`versie.json`)

`versie.json` in de root bevat `{"minimaal":"X.Y"}`. Een open tabblad met een `APP_VERSION`
(src/config.js) lager dan `minimaal` mag niet meer opslaan: lezen werkt gewoon, schrijven wordt
geweigerd met een vaste balk "Herlaad om weer te kunnen opslaan" (src/versie.js). Het bestand komt
nooit uit een cache (sw-strategie.js: 'live'); lukt het ophalen niet, dan wordt er niets geblokkeerd.

**Wanneer ophogen:** alleen bij een release die het SCHRIJFGEDRAG of de KOLOMINDELING van de Sheet
verandert (nieuwe/verschoven kolommen, andere waarden in een cel, een andere manier van invoegen of
archiveren). Zet `minimaal` dan op de versie van díe release, en pas nadat die release live staat.
Bij een gewone release (opmaak, teksten, leeswerk) blijft hij staan.

**Nooit hoger dan de huidige `APP_VERSION`** — dan blokkeert elke client zichzelf. De zelftest
(src/tests.js) controleert dat. Let op: de rem werkt alleen in tabbladen die hem zelf kennen
(v13.4 en later); tabbladen met een oudere versie lezen `versie.json` niet.

## Bouwen en testen (sinds v15.6)

- **Vercel** draait `node tools/bouw.mjs`: alleen de bestanden op de allowlist gaan verkleind naar
  `dist/`. Een nieuw publiek bestand moet daar dus bij.
- **Zelftest**: `npm run zelftest` (lokaal, met Playwright) of automatisch bij elke push via
  GitHub Actions. Draait de volledige `?test=1`-suite op de bron tegen een nagebootste Sheet
  (`tools/nepsheet.mjs`), bouwt, en doet een rooktest van de build. `src/tests.js` staat niet in
  de productiebuild.
