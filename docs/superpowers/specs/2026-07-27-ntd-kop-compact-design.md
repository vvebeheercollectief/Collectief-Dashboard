# Compacte statkop op Nog Te Doen

Datum: 2026-07-27
Versie na oplevering: APP_VERSION 8.8 · CACHE_VERSION cd-v83

## Probleem

De Nog Te Doen-pagina begint met `.ntd-top-row`: een statbalk met vier grote
cijfers plus weeknummer, naast een voortgangskaart "Vergaderingen
uitgeschreven". Samen ongeveer 132px inclusief ondermarge. De informatie is
waardevol maar niet zo waardevol dat ze het bovenste kwart van het scherm mag
opeisen; de takenlijst eronder is waar het werk gebeurt.

Gemeten: een taakregel is ongeveer 39px. De statstrook kost dus ruwweg drie
zichtbare taakregels.

## Oplossing

De cijfers verhuizen naar de bestaande paginakop (`#hdr`), waar ze de
ondertitel "Openstaande taken en actiepunten" vervangen. Die ondertitel is
decoratie: ze vertelt niets wat de gebruiker niet al weet. De ruil kost nul
extra hoogte en levert de volle 132px op.

Week 30 en de vergaderbalk gaan naar een uitklappaneel achter een chevron in
diezelfde kop. Standaard dicht.

Twee van de vier cijfers worden filterknoppen.

## Gedrag

### Kop, ingeklapt (standaard)

Op `page-ntd` toont de kop achter de titel "Nog Te Doen" vier pillen:

| Pil | Waarde | Interactie |
|---|---|---|
| `76 open` | totaal open taken over alle vier de secties | geen — aflezen |
| `43 te laat` | taken over de deadline | knop, zet statusfilter `telaat` |
| `18 weggelegd` | taken met opvolgdatum in de toekomst | knop, zet statusfilter `weggelegd` |
| `2 af` | vandaag afgerond | geen — aflezen |

Daarachter de chevron-knop die het paneel opent.

"Open" filtert niet omdat filteren op alles geen filter is. "Afgerond vandaag"
filtert niet omdat die rijen uit `D.af` komen, niet uit `D.ntd` — de lijst
eronder kan ze niet tonen. Beide blijven platte tekst zonder knoprand, zodat
het verschil zichtbaar is.

Op alle andere pagina's blijft de kop ongewijzigd: titel plus ondertitel uit
`PAGE_META`.

### Kop, uitgeklapt

Onder de kop verschijnt één regel met Week 30 (plus de bestaande tooltip met
het ma–zo datumbereik) en daarnaast de voortgangsbalk "Vergaderingen
uitgeschreven" met `265 / 493` en de percentageregel.

De keuze open/dicht wordt bewaard in `localStorage` onder `ntd_kop_open`.
Standaardwaarde bij een lege sleutel is dicht.

### Filteren

Klik op "te laat" of "weggelegd" zet `state.ntdStatus` op respectievelijk
`telaat` of `weggelegd`. Nogmaals klikken op dezelfde pil wist het filter.
Klikken op de andere pil vervangt het filter — de twee sluiten elkaar uit.

De actieve pil krijgt een gevulde achtergrond en een ✕, zodat een lopend
filter zichtbaar is zonder dat je de lijst hoeft te lezen.

De cijfers in de pillen blijven de ongefilterde totalen tonen. Ze zijn de
navigatie, niet de uitkomst.

De tabtellers volgen het filter wel. Dit werkt automatisch omdat `renderNtd`
de tellers al berekent via `filterNtd(D.ntd[s], …, s)` per sectie. Met het
statusfilter erbij tonen de tabbladen hoe het totaal verdeeld is: 12 + 8 + 19
+ 4 telt op tot 43. Dit is de belangrijkste gedragsverandering om te
begrijpen — de gebruiker klikt op 43 en ziet niet 43 regels, maar de
verdeling over de tabbladen.

Het filter overleeft een tabwissel, want `state.ntdStatus` staat los van de
tabkeuze. Er is in dit dashboard geen "wis alle filters"-knop — `f-beh-ntd` en
`f-prio-ntd` worden ook alleen per stuk teruggezet. Het statusfilter volgt dat:
het blijft staan tot de gebruiker de pil opnieuw aanklikt. De gevulde pil met ✕
is daarom niet cosmetisch maar noodzakelijk; zonder die aanwijzing kan een
filter onopgemerkt blijven staan.

### Telefoon

Onder 560px verbergt `styles.css` al `.hdr-info p`. Op die breedte is er naast
hamburger en vijf icoonknoppen geen ruimte voor vier pillen. Daar zakt de
pillenrij naar een eigen slanke regel direct onder de kop, binnen `#page-ntd`.
De chevron blijft aan het einde van die regel staan.

## Techniek

### Bestanden

| Bestand | Wijziging |
|---|---|
| `index.html` | container voor de pillen in `.hdr-info`; `.ntd-top-row` omgebouwd tot uitklappaneel |
| `src/render-lijsten.js` | `renderNtdStats` rendert pillen in plaats van `.stat-strip`; weekblok verhuist naar het paneel; `filterNtd` krijgt statusparameter |
| `src/ui.js` | pillenrij tonen/verbergen bij paginawissel; ondertitel alleen vullen buiten NTD |
| `src/actions.js` | acties `ntd-stat` (filter) en `ntd-kop-toggle` (uitklap) |
| `src/state.js` | `ntdStatus` toevoegen aan de statedefinitie |
| `styles.css` | pilstijlen, paneelstijl, mobiele terugval onder 560px |
| `src/config.js` | `APP_VERSION` naar 8.8 |
| `sw.js` | `CACHE_VERSION` naar cd-v83 |
| `src/tests.js` | tests voor filter, wissen, onthouden, paginawissel |

### Bestaand patroon hergebruiken

`render-alv.js:38` heeft de klikbare stattegel al:

```js
`<button type="button" class="stat-item stat-klik${huidig===status?' aan':''}"
   data-action="alvo-stat" data-status="${status}"
   aria-pressed="${huidig===status}" title="Toon alleen ${cap}">`
```

De NTD-pillen volgen ditzelfde model: echte `<button>`, `data-action`,
`aria-pressed`, en de afhandeling in `actions.js` die het filter omzet en
opnieuw rendert. De chevron krijgt `aria-expanded` en `aria-controls` die naar
het paneel wijzen.

### Aandachtspunt: voortgangsbalk in een verborgen paneel

`renderNtdDonut` zet de breedte van `#ntd-progress-fill` in een
`requestAnimationFrame` zodat de balk vol loopt. Staat het paneel op
`display:none` bij het renderen, dan is het vullen al gebeurd tegen de tijd
dat de gebruiker opent — de animatie is dan onzichtbaar en de balk verschijnt
in één keer vol.

Aanpak: het vullen aanroepen op het moment dat het paneel opengaat, niet
alleen bij het renderen. Bij een paneel dat al open stond blijft het gedrag
zoals nu.

### Verwijderen

`#ntd-stats` en het gebruik van `.stat-strip` op de NTD-pagina vervallen.

Nagelopen wie wat nog gebruikt:

- `.stat-strip`, `.stat-item`, `.stat-val` — blijven. `#alvo-stats` en
  `#dash-stats` gebruiken ze nog.
- `.stat-week`, `.stat-week-cap`, `.stat-week-val` — uitsluitend gebruikt door
  het weekblok op regel 54 van `render-lijsten.js`, nergens anders. Die klassen
  verhuizen mee naar het uitklappaneel en mogen daar vrij hervormd worden; de
  mobiele `.stat-week`-regels onder 560px kunnen weg.
- `.ntd-top-row > .stat-strip` — weg, de strook zit daar niet meer in.

## Tests

Naast de bestaande suite (653 tests moeten groen blijven):

1. Klik op "te laat" zet `state.ntdStatus` op `telaat` en de tabtellers dalen
2. Nogmaals klikken wist het filter en de tellers keren terug
3. Klik op "weggelegd" vervangt een actief `telaat`-filter
4. De som van de tabtellers onder een actief filter is gelijk aan het getal in
   de pil
5. Chevron togglet het paneel en schrijft `ntd_kop_open`
6. Bij laden met `ntd_kop_open=1` staat het paneel open
7. Naar een andere pagina en terug: pillen alleen zichtbaar op NTD, ondertitel
   alleen zichtbaar buiten NTD
8. De pillen "open" en "af" zijn geen knoppen

## Bewust niet

- **De cijfers in de pillen meelaten bewegen met het filter.** Dan zou "43 te
  laat" bij een actief filter "43" blijven tonen terwijl de lijst 12 regels
  heeft, of naar 12 springen en de weg terug verbergen. Ongefilterde totalen
  houden is eerlijker.
- **"Afgerond vandaag" naar de Afgerond-pagina laten springen.** Een pil die
  eruitziet als de andere maar van pagina wisselt is een verrassing. Blijft
  aflezen.
- **De cijfers ook op de Vandaag-pagina tonen.** Buiten scope; die pagina
  heeft een eigen urgentiemotor.
- **Trends of verdeling per behandelaar in het uitklappaneel.** Overwogen en
  afgewezen: het paneel moet kort blijven, anders is de winst weg.
