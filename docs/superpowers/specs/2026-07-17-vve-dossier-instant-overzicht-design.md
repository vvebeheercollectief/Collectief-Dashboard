# VvE-dossier — instant overzicht (richting C)

**Datum:** 2026-07-17
**Status:** goedgekeurd, klaar voor implementatieplan
**Mockups:** `mockups/mockup-dossier-herindeling.html` (3 richtingen), `mockups/mockup-dossier-C.html` (gekozen richting, uitgewerkt)
**Raakt:** `src/render-vve.js`, `src/render-overig.js` (`logItemHtml`), `styles.css`

## Aanleiding

Het VvE-dossier oogt rommelig en geeft geen instant overzicht. Concrete klachten en bevindingen:

1. De knop "Nieuwe taak" rechtsboven staat qua stijl los van de kerncijfer-tegels ernaast.
2. Drie van de vier kerncijfer-tegels tonen 0 of "—"; ze nemen de meeste kopruimte maar zeggen niets.
3. De takentabel laat een groot gat tussen de kolom "Deadline" en de rechterrand.
4. In "Laatst afgerond" staat een regel met lege taaknaam die alleen een datum toont — leest als een fout.
5. Het logboek domineert het scherm met herhaalde automatische regels ("Cihad — Aangevinkt 121027") en duwt taken en ALV uit beeld. De invoerbalk pakt altijd ruimte, ook als je niets wilt vastleggen.

## Uitgangspunt

Het dossier is een **naslagscherm** ("vertel me alles over deze VvE"), geen werkbak — taken afvinken gebeurt op de Vandaag-pagina. Vastgesteld met de gebruiker op 2026-07-17.

Gevolg: ALV-stand, geschiedenis en gebouwfeiten krijgen de hoofdrol; open taken worden rustiger maar blijven zichtbaar.

## Gekozen richting: C — drie panelen, geen paginascroll

Overwogen alternatieven:

- **A** — paspoort links (smal), tijdlijn rechts (breed). Afgevallen: minder "instant".
- **B** — feitenstrook van drie kaarten boven, tijdlijn op volle breedte eronder. Afgevallen: verspilt verticale ruimte vóór je bij de geschiedenis komt. Blijft wel bestaan als responsive vangnet van C.
- **C** — drie panelen naast elkaar, elk eigen scroll. **Gekozen.**

## Ontwerp

### 1. Paginahoogte

`#page-vve` wordt schermvullend: `display:flex; flex-direction:column; height:100%`. De kop is `flex-shrink:0`, de panelen-grid is `flex:1; min-height:380px`. Elk paneel is `overflow-y:auto; min-height:0`.

Dit werkt omdat `#content` al `flex:1; overflow-y:auto` is (styles.css:121). De pagina zelf scrollt dan niet meer.

Geverifieerd in de mockup: bij 1420×980 en bij 1366×768 is `#content.scrollHeight === clientHeight` (geen paginascroll) en past alles.

`min-height:380px` op de grid zorgt dat op zeer lage schermen de pagina alsnog scrollt in plaats van de panelen plat te drukken.

### 2. Kop

Links ongewijzigd: code-pil, naam, Budget-label, behandelaars.

Rechts: kerncijfers teruggebracht van vier naar **twee** tegels:

| Tegel | Waarde |
|---|---|
| open taken | `cijfers.open`, accentkleur |
| laatste activiteit | `cijfers.laatsteDagen` in dagen, of "—", grijs |

"te laat" en "weggelegd" vervallen als tegel en verschijnen als voetregel in het werkpaneel ("0 te laat · 0 weggelegd").

### 3. De + knop

Vervangt `<button class="btn btn-pri btn-sm">…Nieuwe taak</button>`.

- Nieuwe klasse `.kc-plus`, zelfde rij als de `.kc`-tegels, `align-items:stretch` zodat de hoogte meeloopt.
- Zelfde `border-radius:var(--r)`, `border:1px solid`, `box-shadow:var(--sh)` als `.kc`.
- Gevuld in `--ac` (huidige leiblauw), hover `--ac-900`.
- `min-width:52px`, alleen het +-icoon (18×18 SVG), geen tekst.
- Toegankelijkheid: `title` én `aria-label="Nieuwe taak voor deze VvE"`, plus zichtbare `:focus-visible`-outline. De `data-action="vve-taak-nieuw"` en `data-code`/`data-naam` blijven ongewijzigd.

### 4. Paneel 1 — Paspoort

ALV-blok (komende ALV + status, de drie vinkjes, "Laatst gehouden"), daaronder Gebouw-blok (Balkons, Kozijnen, Bron) met de bestaande Bewerken-knop en bewerkmodus.

Ongewijzigd qua gedrag; alleen de omlijsting wordt één paneel in plaats van twee losse `.vve-kaart`s.

### 5. Paneel 2 — Werk

Open taken, daaronder Laatst afgerond, met "0 te laat · 0 weggelegd" als voetregel. Weggelegde taken krijgen alleen een eigen kopje als ze bestaan.

De tabellen worden platte rijen (`.tk`) in plaats van `<table>` — dat haalt de loze ruimte weg die de vierkolomstabel veroorzaakte. Taaknaam met deadline rechts, categorie en behandelaar als kleine meta-regel eronder.

**Lege omschrijving (klacht 4):** `afRij` gebruikt nu `r.actiepunt||r.periode||r.agendapunten`. Als die alle drie leeg zijn, valt hij terug op de sectielabel uit `SECS[r._sec].label` met de tekst `"<Sectie> — geen omschrijving"` in gedempte cursief. Er wordt **geen** omschrijving verzonnen.

Klikgedrag op taakrijen (`data-action="taak-bewerken"`, `_rowCache`) blijft ongewijzigd.

### 6. Paneel 3 — Geschiedenis

Filters (Alles / Alleen contactmomenten) ongewijzigd. Daaronder de ingeklapte composer, daarna de scrollende tijdlijn.

**Composer ingeklapt:** standaard één regel met placeholder en een Vastleggen-knop. Klik erin → uitgeklapt met textarea, soort-chips en de wie-select. Blijft uitgeklapt zolang er tekst in staat.

Let op: de bestaande composer-behoud-logica in `renderVve()` (de 8s-poll re-rendert de pagina; half getypte tekst mag niet verdwijnen) moet blijven werken. De ingeklapte/uitgeklapte stand hoort dus ook in `state`, niet alleen in de DOM.

**Ruis dempen:** handmatige regels (`Opmerking`, `Contact`) blijven volwaardige `.log-item`s met avatar, soort-label en de notitietekst. Alle automatische acties worden gedempte `.log-mini`-regels met gekleurd stipje.

**Echte oorzaak van "Cihad — Aangevinkt 121027"** (gevonden tijdens planning, 2026-07-17):

Er bestaat al een pure helper `logZin(r)` in `render-overig.js` die per actie een nette zin maakt en die al getest is (tests.js:128-133). De volwaardige `.log-item`-tak van `logItemHtml` gebruikt die al. Maar `logZin` kent **geen** geval voor `Aangevinkt`/`Uitgevinkt` (die komen uit `render-alv.js:121`) en valt dus terug op zijn default:

```js
default: return `<b>${naam}</b> — ${esc(r.actie||'')} `+chip;
```

Dat is letterlijk de lelijke regel uit de klacht. Het is dus geen opmaakprobleem maar een ontbrekend geval.

Daarnaast dupliceert de `subtiel`-tak van `logItemHtml` de zin-logica met een eigen `isAf ? "rondde X af" : "maakte X aan"` — een tweede, armere zinnengenerator naast `logZin`.

Aanpak (DRY — één zinnengenerator, geen tweede erbij):

1. **`logZin` uitbreiden** met `Aangevinkt`/`Uitgevinkt` → "vinkte *Notulen* aan / uit" (veld = `ALVO_LABELS[field]`). Dit repareert de regel meteen óók op de Logboek-pagina.
2. **`logZin(r, {zonderCode})`** — optie om de code-chip weg te laten. In het dossier is de VvE-code redundant (je zít in dat dossier); juist die chip maakt de regel lang en rommelig. Default blijft mét chip, zodat de Logboek-pagina onveranderd blijft.
3. **De `subtiel`-tak van `logItemHtml` laten teruggrijpen op `logZin`** in plaats van eigen zinnen. Daarmee verdwijnt de duplicatie en kloppen alle acties automatisch.

De onbekend-terugval van `logZin` blijft bestaan: nooit een verzonnen zin, wel de ruwe actienaam.

`logItemHtml` is gedeeld met de Logboek-pagina (`render-overig.js:481`). Regressie-eis: die pagina moet er ná deze wijziging identiek uitzien, op de gerepareerde `Aangevinkt`-regel na.

**Bewerken/verwijderen blijft per regel.** Meerdere regels samenvatten tot één ("vinkte 2 punten af") gaat expliciet **niet** door: dan is een losse regel niet meer te verwijderen, en dat kan sinds v6.8 juist wel.

### 7. Responsive

| breedte | gedrag |
|---|---|
| ≥1240px | drie kolommen `300px 330px 1fr`, paginahoogte vast, panelen scrollen intern |
| 900–1240px | twee kolommen, tijdlijn eronder over volle breedte; `height:auto`, panelen `overflow:visible`, pagina scrollt normaal (= richting B) |
| <900px | één kolom, gestapeld (sluit aan op de bestaande breakpoint in styles.css:613) |

## Bewust niet in scope

- Het samenvatten/groeperen van opeenvolgende logregels (zie 6).
- Wijzigingen aan de Logboek-pagina zelf.
- Wijzigingen aan de Vandaag-pagina of aan hoe taken worden afgevinkt.
- Het opschonen van bestaande lege-omschrijving-rijen in de bron-Sheet; we vangen ze alleen netjes op in de weergave.

## Bekende prijs van deze keuze

Bij een VvE met weinig data (zoals 121027) zijn de panelen grotendeels leeg — zichtbaar in `mockup-dossier-C.html`. Dat is de bewuste prijs van "alles in beeld, geen paginascroll". Bij drukke VvE's lopen de panelen vol en scrollen ze intern.

## Testen

Tests draaien in de browser, niet via node: server starten en `index.html?test=1` openen; het resultaat staat in `window._testResult` (`tests.js:867`) als `"<n> OK, <n> FAIL"`.

- `vveOverzicht` is al puur en getest; de cijfers-logica verandert niet, alleen welke twee getoond worden.
- `logZin` uitbreiden → nieuwe asserts voor `Aangevinkt`/`Uitgevinkt`, voor `zonderCode`, en behoud van de bestaande asserts (tests.js:128-133).
- Terugval bij lege omschrijving → unittest op een nieuwe pure helper `afOmschrijving(r)`.
- De bestaande suite moet groen blijven (357 tests bij v6.7) — geen enkele bestaande assert mag sneuvelen.
- Handmatig: bewerken/verwijderen van een logregel, composer-behoud tijdens de 8s-poll, kenmerken-bewerkmodus, klik op taakrij, én de Logboek-pagina op regressie.

## Versie

`APP_VERSION` ophogen (7.0 → 7.1) en `CACHE_VERSION` in `sw.js` (cd-v65 → cd-v66).
