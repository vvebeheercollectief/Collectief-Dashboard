# Logboek: 'Bewerkt' eruit + mail-opmaak behouden — ontwerp

**Datum:** 2026-07-15
**Status:** goedgekeurd door gebruiker, klaar voor implementatieplan
**Versie:** 6.2 → 6.3 (cache cd-v57 → cd-v58)

## Aanleiding

Gebruikersverzoek in drie punten (batch 1 van een reeks):

1. 'Bewerkt'-regels vervuilen het logboek — eruit, ook met terugwerkende kracht.
2. Iets loggen zou moeten tellen als "taak aangeraakt".
3. Een geplakte mail komt als één bonk tekst in het logboek te staan.

## Wat het onderzoek opleverde

Twee van de drie punten bleken anders te liggen dan aangenomen. Beide conclusies zijn
geverifieerd op de echte productiedata (werkmap als xlsx geëxporteerd en lokaal geteld,
niet via een samenvattende tool).

### Punt 1 — omvang

| Actie | Aantal |
|---|---|
| **Bewerkt** | **395** |
| Opmerking | 211 |
| Aangemaakt | 180 |
| Afgerond | 148 |
| Aangevinkt | 93 |
| Auto-prioriteit | 44 |
| Weggelegd | 35 |
| Contact | 32 |
| Verwijderd | 16 |
| Behandelaar gewijzigd | 6 |
| Kenmerk | 6 |
| Teruggezet | 5 |
| Uitgevinkt | 4 |
| Opvolgdatum gewist | 2 |
| **Totaal (datarijen)** | **1177** |

De telling sluit exact op 1177 — elke rij is verantwoord, er zijn geen lege acties en geen
rijen zonder timestamp. 'Bewerkt' is exact 1 op de 3 logregels.

Geschreven op één plek: `logEvent(code,sec,'Bewerkt','','','')` in `src/crud.js:362`, bij
elke taak-opslag. Apps Script schrijft nooit 'Bewerkt' (wel 'Auto-prioriteit',
'Aangemaakt (sheet)', 'Aangemaakt via mail-intake'). De webhook `doPost`
(`Notifications.gs:493`) is wél een generieke doorgeefluik voor elke `data.actie` — reden
om naast het stoppen ook een leesfilter te houden.

Er bestaat géén enkele rij 'Herhaalregel bewerkt' (die actie wordt wel geschreven vanuit
`render-herhaal.js:96`), maar exact-match blijft verplicht zodat die nooit sneuvelt.

### Punt 1 × 2 — het stil-effect is gemeten, en verwaarloosbaar

`bepaalStil()` (`src/render-tabel.js:48`) en `dagenStil()` (`src/urgentie.js:16`) bepalen
"X dagen geen activiteit" via de nieuwste logregel per taak+sectie. 'Bewerkt' telt daarin
nu gewoon mee, dus het verwijderen ervan kón taken stil laten lijken.

Nagerekend op de echte data (peildatum 2026-07-15, drempel 4 dagen, alleen taken met
`inBehandeling === 'TRUE'` en niet weggelegd — dat zijn er 11 van de 76):

- **0 taken krijgen een nieuwe stille-taken-pill**
- 1 taak: pill wordt ouder (291011, OPPAKKEN: 26 → 37 dagen)
- 0 taken: pill verdwijnt

Oorzaak: het team schrijft vrijwel altijd een notitie én slaat daarna op, dus 'Opmerking'
en 'Bewerkt' staan op dezelfde dag. De notitie blijft als laatste activiteit staan.

### Punt 2 — de aanname klopte maar half

- Notities via de taak-popup (`addTaskNote`, `render-overig.js:521`) worden geschreven
  mét sectie → **tellen al mee** voor `bepaalStil`.
- Contact/notities via de VvE-pagina (`addContactLog`, `render-vve.js:89`) worden
  geschreven met een **lege sectie** → tellen voor géén enkele taak mee. Idem
  `kenmerken.js:58`. In de data: 82 logregels met lege sectie.

Aan de gebruiker voorgelegd met een concreet voorbeeld. **Besluit: niets doen.** De
oorspronkelijke wens (notities tellen mee) is al ingebouwd, en het gemeten stil-effect van
punt 1 is nul, dus er valt niets te compenseren.

### Punt 3 — geen plak-probleem maar een weergave-bug

De regeleinden wórden correct opgeslagen; dezelfde notitie toont in het VvE-dossier keurig
met witregels. Het verschil zit in de CSS:

| Weergave | Klasse | `white-space` | Resultaat |
|---|---|---|---|
| VvE-dossier + Logboek-pagina (`logItemHtml`, `render-overig.js:285`) | `.log-note` | `pre-wrap` | leesbaar |
| Taak-popup (`renderTaskHistory`, `render-overig.js:505`) | `.hist-change` | *ontbreekt* | **één bonk** |

`.hist-change` (`styles.css:462`) is bedoeld voor korte "veld: oud → nieuw"-regeltjes:
11px, grijs, geen `pre-wrap`. Voor een geplakte mail is dat onleesbaar.

Scope-besluit gebruiker: **alleen regeleinden en witregels**, geen rich text (vet, bullets,
links). Rich text zou HTML-opslag in de Sheet, een sanitizer en een nieuwe editor vragen —
aparte, veel grotere klus met een echt veiligheidsoppervlak.

## Ontwerp

### Punt 1 — 'Bewerkt' eruit

**1. Stoppen met schrijven.** `src/crud.js:362` verwijderen. De regel eronder
(`Behandelaar gewijzigd`) blijft.

**2. Filteren bij het inlezen.** `parseLogboek` (`src/render-overig.js`) laat rijen met
`actie === 'Bewerkt'` vallen. Eén plek, en daarmee weg uit: VvE-dossier, taak-popup,
Logboek-pagina, `bepaalStil`/`dagenStil`, én de context van de AI-chat
(`ai.js:45`, `dossier-chat.js:41`). Tevens vangnet voor de TEST-Sheet en voor losse
regels via de webhook.

> **Let op — `_row` mag niet verschuiven.** De huidige implementatie doet
> `.filter(...).map((r,i)=>({_row:i+2,…}))`: de index komt ná het filteren, dus een extra
> filter vóór de `map` zou elk `_row` laten opschuiven en het bewerken/verwijderen op de
> Logboek-pagina op de verkeerde rij laten landen. Het filter moet dus **ná** de `map`.
> Meteen goed doen: `_row` uit de ruwe index halen, dan is de functie ongevoelig voor
> lege rijen. (Vandaag zijn er 0 rijen zonder timestamp, dus dit bijt nu nog niet.)

**3. Dode code opruimen.** `actieBadge`-entry (`:195`), `logZin`-case (`:238`) en de
'Bewerkt'-tak in de oud→nieuw-regel (`:281`, waar 'Behandelaar gewijzigd' en 'Kenmerk'
blijven staan). Het filterknopje op de Logboek-pagina is al weg sinds cd-v25.

**4. Terugwerkende kracht.** Eenmalig backend-scriptje in de Sheet:
1. backup-tabblad van 'Logboek' (`Logboek backup 2026-07-15`);
2. exact-match `'Bewerkt'` in kolom D, van onder naar boven verwijderen;
3. draait onder `cd_withLock` — geen race met een collega die op dat moment werkt;
4. rapporteert het aantal verwijderde rijen ter verificatie (verwacht: 395 → 782 over).

Alleen op PROD (`SID_PROD`). TEST hoeft niet: het leesfilter dekt dat af.

### Punt 2

Geen wijziging.

### Punt 3 — regeleinden terug

In `renderTaskHistory` (`src/render-overig.js:505`) de notitie-regel `.hist-change` →
`.log-note`. Die klasse heeft al exact wat nodig is:
`font-size:13px; color:var(--txt); line-height:1.55; white-space:pre-wrap; word-break:break-word`.

De veld-regel op `:504` (`veld: oud → nieuw`) **blijft** `.hist-change` — daar is klein en
grijs juist goed. Geen inkorting/clamp: rijen mogen bij dit team meerekken met de tekst
(zie geheugen "Dashboard rijweergave").

## Tests

Toevoegen aan `src/tests.js` (nu 345+ tests, moeten allemaal blijven slagen):

- `parseLogboek` laat `'Bewerkt'` vallen;
- `parseLogboek` behoudt `'Herhaalregel bewerkt'` (exact-match-bewijs);
- `parseLogboek` geeft correcte `_row` ná het filteren (regressietest op de valkuil);
- `parseLogboek` geeft correcte `_row` bij een lege rij tussendoor;
- `dagenStil` rekent vanaf de notitie zodra 'Bewerkt' weggefilterd is — dit pint het
  gemeten gedrag vast. (`bepaalStil` zelf is niet los testbaar: die leest `D` rechtstreeks.
  `dagenStil` uit `urgentie.js` is de pure spiegel ervan en krijgt het logboek als argument.)

Verificatie los van de unittests: visueel in de preview (mail met witregels in taak-popup
én dossier), en na de opschoning een telling op de Sheet (782 regels over, 0 × 'Bewerkt').

## Uitrol

Route conform `reference_deploy_pipeline` en `feedback_staging_main_merge`:

1. tak `feat/logboek-bewerkt-eruit`, vertakt van **main** (dus zonder de geparkeerde
   spraakmemo op staging);
2. `APP_VERSION` 6.2 → 6.3 (`src/config.js`), `CACHE_VERSION` cd-v57 → cd-v58 (`sw.js`);
3. lokaal testen (preview + `?test=1`);
4. testen op staging/TEST;
5. feat → main als schone fast-forward; GitHub Pages verifiëren op
   `vvebeheercollectief.github.io/Collectief-Dashboard/`;
6. **pas na akkoord** het opschoon-scriptje op de PROD-Sheet draaien.

Volgorde is bewust: eerst de code live (die filtert 'Bewerkt' al weg, dus het resultaat is
meteen zichtbaar en terug te draaien), dán pas de onomkeerbare opschoning.

## Bewust niet

- **Rich text overnemen** (vet, bullets, links) — gebruiker koos expliciet voor alleen
  regeleinden. Aparte, grotere klus met sanitizer.
- **VvE-logs laten meetellen als "aangeraakt"** — voorgelegd, gebruiker koos "laat zoals
  het is". Het gemeten stil-effect is nul, dus geen noodzaak.
- **De lege-sectie-kwestie zelf** (82 regels) — blijft bestaan zoals hij is.
- **TEST-Sheet opschonen** — leesfilter dekt het af.
- **Notities inkorten/clampen** bij lange mails — strijdig met de vaste voorkeur dat rijen
  meerekken met de tekst.

## Risico's

| Risico | Weging |
|---|---|
| 395 regels definitief weg | Backup-tabblad vóór het verwijderen; punt 1 en 3 in de code zijn gewoon terug te draaien |
| `_row` verschuift → verkeerde rij bewerkt/verwijderd | Filter ná de `map`; expliciete regressietest |
| Race met een werkende collega tijdens opschoning | `cd_withLock` server-side |
| 'Herhaalregel bewerkt' sneuvelt | Exact-match, plus test |
