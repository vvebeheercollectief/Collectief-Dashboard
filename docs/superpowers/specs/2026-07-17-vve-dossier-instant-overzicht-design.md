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

Dit vereist uitbreiding van `logItemHtml` in `render-overig.js`. De `subtiel`-tak kent nu maar twee zinnen: `isAf ? "rondde X af" : "maakte X aan"`. Voor andere acties zou daar dus ten onrechte "maakte X aan" komen te staan. Nodig zijn nette zinnen voor minimaal:

| actie | zin |
|---|---|
| `Afgerond` | rondde *taak* af |
| `Aangemaakt` | maakte een taak aan → *behandelaar* |
| `Aangevinkt` / `Uitgevinkt` | vinkte *Notulen* aan / uit |
| `Kenmerk` | wijzigde *Balkons* |
| `Behandelaar gewijzigd` | wees *taak* toe aan *X* |
| `Verwijderd` | verwijderde *taak* |
| `Teruggezet` | zette *taak* terug |
| onbekend | val terug op de bestaande volwaardige `.log-item` — nooit een verzonnen zin |

`logItemHtml` is gedeeld met de Logboek-pagina (`render-overig.js:481`). De uitbreiding mag het gedrag daar niet veranderen: die pagina roept aan met `subtiel = logPaginaSoort(actie)==='subtiel'`, wat alleen `Afgerond`/`Aangemaakt` raakt — precies de twee zinnen die al bestaan. De nieuwe zinnen komen er dus bij zonder de bestaande te wijzigen.

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

- `vveOverzicht` is al puur en getest; de cijfers-logica verandert niet, alleen welke twee getoond worden.
- Nieuwe pure helper voor de log-zinnen → unittest per actie-soort, inclusief de onbekend-terugval.
- Terugval bij lege omschrijving → unittest op `afRij`-helper.
- De bestaande dossiersuite moet groen blijven (357 tests bij v6.7).
- Handmatig: bewerken/verwijderen van een logregel, composer-behoud tijdens de 8s-poll, kenmerken-bewerkmodus, klik op taakrij.

## Versie

`APP_VERSION` ophogen (7.0 → 7.1) en `CACHE_VERSION` in `sw.js` (cd-v65 → cd-v66).
