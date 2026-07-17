# Ontwerp — VvE-dossier: alles past op het scherm + logregels bewerken

Datum: 2026-07-17 · Status: goedgekeurd door gebruiker

## Aanleiding

Twee klachten van de gebruiker over de VvE-dossierpagina:

1. De pagina past niet op het scherm; de rechterkolom (ALV's + Beheerderskenmerken)
   valt eraf. "Ik wil niet links of rechts hoeven schuiven; past het niet, dan moet
   het er gewoon onder komen."
2. "We kunnen geen logs bewerken." Gewenst: een potlood dat bij hover verschijnt,
   zodat een fout gelogde regel te herstellen is.

## Onderzoek (bewijs, geen aanname)

Gereproduceerd op de echte code via de no-cache preview-server, met de app-schil
zichtbaar gemaakt (login-gate verborgen) en testdata geïnjecteerd via dynamische
module-import — zie `reference_lokaal_testen`.

**Layout.** Gemeten op `.vve-grid` bij een viewport van 1280 px:

| | vóór | ná proef-fix |
|---|---|---|
| `grid-template-columns` | `1499.36px 256.797px` | `596.9px 373.1px` (de bedoelde 1,6 : 1) |
| rechterkolom rechterrand | buiten beeld | 1250 (van 1280) → volledig zichtbaar |
| eigen schuifbalk tabel | — | geen |

Grondoorzaak: `.cell-txt` en `.cell-sm` staan op `white-space:nowrap` (styles.css
r209/r216). Een lange opmerking in "Laatst afgerond" mag daardoor niet afbreken, dus
de min-content-breedte van die tabel is enorm. Omdat een grid-item standaard
`min-width:auto` heeft, kan de linkerkolom niet krimpen onder die min-content →
het `1.6fr`-spoor groeit naar 1499 px en duwt de rechterkolom van het scherm.
`.tbl-wrap{overflow-x:auto}` vangt dit niet op, want de intrinsieke breedte wordt
nog steeds naar de grid-track doorgegeven.

**Logboek-pagina.** De bewerkfunctie wérkt daar al (sinds v6.1, 2026-06-24).
`renderLogboek` roept `logItemHtml(r, subtiel, true)` aan (render-overig.js r470);
potlood + prullenbak staan in de DOM en verschijnen bij hover — bevestigd met een
screenshot tijdens echte muis-hover. Ze zijn alleen slecht vindbaar: klein, grijs
(`color:var(--mut)`, 13px), uiterst rechts.

**Dossier-logboek.** Hier ontbreekt het echt: `dossierFeed` roept `logItemHtml(r)`
aan zónder `acties`-argument (render-vve.js r70). Dit is de enige echte bug van de twee.

**Meetvalkuil (vastgelegd voor later).** In de preview-tab worden geen frames
getekend: `requestAnimationFrame` vuurt nooit. CSS-overgangen tikken daardoor niet
door en `getComputedStyle(...).opacity` blijft op de beginwaarde staan, óók als
`:hover` wél matcht. Dat leek een bug maar was een artefact van de meetopstelling.
Conclusie: beoordeel hover-/overgangseffecten met een **screenshot**, niet met
`getComputedStyle`.

## Beslissingen (met gebruiker afgestemd)

- Lange tekst **breekt af naar de volgende regel**, rij wordt hoger. Sluit aan bij
  `feedback_dashboard_rijweergave` (rijen rekken bewust mee; clampen is fout).
  Alleen op de dossierpagina — "Nog Te Doen" houdt zijn compacte "…"-weergave.
- Dossier-logboek: **alleen eigen notities/contactmomenten** (`Opmerking`, `Contact`)
  krijgen potlood + prullenbak. Automatische regels (Afgerond, Aangemaakt, Kenmerk,
  Behandelaar gewijzigd, …) krijgen niets.
- **Logboek-pagina blijft ongewijzigd** in wat er mag: automatische regels houden daar
  hun prullenbak. Bewust anders dan het dossier: de Logboek-pagina is de
  opruim-/beheerplek, het dossier is de leesweergave. Niets wordt weggenomen.
- Knoppen blijven **rechts en op hover** (expliciet gevraagd), maar donkerder en iets
  groter zodat ze vindbaar zijn.

## Ontwerp

### 1. Layout (styles.css)

Toevoegen, gescopet op `#page-vve`:

```css
#page-vve .vve-grid>*{min-width:0}                 /* grid-item mag krimpen onder min-content */
#page-vve .cell-txt,#page-vve .cell-sm{white-space:normal;overflow-wrap:anywhere}
```

`min-width:0` is het vangnet: mocht er ooit één onbreekbaar lang woord in staan, dan
krijgt de tabel zijn eigen schuifbalk in plaats van dat de hele pagina scheefgaat.
`overflow-wrap:anywhere` zorgt dat zelfs een lange URL afbreekt, zodat ook dat vangnet
in de praktijk niet nodig is. Bestaande `@media(max-width:900px)` laat de rechterkolom
al onder de linker vallen — dat blijft.

### 2. Knoppen in het dossier-logboek (render-vve.js)

`dossierFeed` geeft per regel door of er acties mogen komen; hergebruikt de bestaande,
al geteste `logPaginaSoort`:

```js
html += logItemHtml(r, false, logPaginaSoort(r.actie) === 'normaal');
```

`logItemHtml` ondersteunt dit al (r266: `logItemHtml(r,subtiel,acties)`), inclusief het
openklappen van het bewerkformulier (r282). Geen nieuwe UI nodig.

### 3. Verversen na bewerken (render-overig.js)

`editLogboek`/`cancelLogboek`/`saveLogboek`/`deleteLogboek` roepen nu hard
`renderLogboek()` aan. Dat wordt paginabewust:

```js
function _rerenderLog(){
  if(document.getElementById('page-vve')?.classList.contains('active')) renderVve();
  else renderLogboek();
}
```

Dit introduceert een kringverwijzing render-overig ⇄ render-vve. Dat is in deze codebase
een bestaand, bewust patroon (render-vve ⇄ ui/kenmerken, crud ⇄ main): ES-modules lossen
dit op met live bindings, en de aanroep gebeurt pas op runtime. `renderVve` is bovendien
een gehoisde functiedeclaratie, dus bij aanroep gegarandeerd geïnitialiseerd.

### 4. Vindbaarheid (styles.css)

`.log-act-btn` van `color:var(--mut)` / `font-size:13px` naar een donkerder kleur en
iets groter. Hover-gedrag (`opacity:0` → `1`) blijft ongemoeid.

## Datastroom (ongewijzigd, hergebruikt)

Bewerken → `logEditWrite(actie,row,soort,wie,tekst)` bepaalt de cellen (Opmerking → kol G;
Contact → E:G) → `assertRowMatch` controleert dat kolom A nog dezelfde timestamp heeft →
`writeRange`. Verwijderen → `deleteDimension` op de Logboek-sheet + "Ongedaan maken"-toast.
Beide via `backgroundWrite` (optimistisch tonen, terugdraaien bij schrijffout).

## Foutafhandeling

Ongewijzigd overgenomen van de Logboek-pagina: lege tekst wordt geweigerd; mislukte
login → melding; schrijffout → rollback + rode toast; `assertRowMatch` voorkomt dat een
verschoven rij de verkeerde regel overschrijft; `_shiftRows` houdt rij-indexen kloppend.

## Testen

- Bestaand: 357 tests moeten blijven slagen (`?test=1`).
- Nieuw (pure functie, zonder DOM): `dossierFeed` exporteren en asserten dat een lijst
  met [Opmerking, Contact, Afgerond, Kenmerk] exact 2× `data-action="log-bewerken"` en
  2× `data-action="log-verwijderen"` oplevert — dus niets op de automatische regels.
- Handmatig in preview: dossierpagina bij 1280 px → rechterkolom volledig zichtbaar,
  `document.documentElement.scrollWidth <= innerWidth`, en een screenshot tijdens hover
  die het potlood toont (niet via `getComputedStyle`, zie meetvalkuil).

## Uitrol

Feature-tak vanaf `main` (staging bevat de geparkeerde spraakmemo — niet kaal mergen,
zie `feedback_staging_main_merge`), lokaal verifiëren, daarna fast-forward naar `main`
→ GitHub Pages. `APP_VERSION` 6.7 → 6.8 en `CACHE_VERSION` cd-v62 → cd-v63.

## Bewust niet

- De "…"-weergave met klik-uitklappen op Nog Te Doen blijft ongemoeid.
- Automatische regels blijven onbewerkbaar: er is geen eigen tekst om te bewerken;
  een systeemregel herschrijven zou een onwaar logboek opleveren.
