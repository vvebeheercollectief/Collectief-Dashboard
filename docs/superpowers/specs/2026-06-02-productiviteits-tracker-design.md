# Productiviteits-tracker — Analytics herontwerp

**Datum:** 2026-06-02
**Status:** Concept (akkoord op design, nog geen implementatie-plan)
**Pagina:** Analytics (`#page-analytics`) in `index.html`

## 1. Doel

Geef het team in één oogopslag inzicht in geleverde output per dag/week/maand/kwartaal,
met vergelijking ten opzichte van de vorige periode. Drie metrics: notulen verstuurd,
ALV's volledig afgerond, taken afgerond (team-totaal + per behandelaar).

De huidige Analytics-pagina lost dit niet op: de "Notulen verstuurd"-grafiek is een
placeholder (gebruikt dezelfde bron als "Vergaderingen"), trend-vergelijking ontbreekt,
periode "Dag" ontbreekt, en de layout is een vlakke 2×2 grid zonder hiërarchie.

## 2. Scope

**In scope:**
- Herontwerp van de Analytics-pagina als productiviteits-tracker met drie zones
  (KPI-tegels, hoofdgrafiek, leaderboard).
- Trend-indicator (pijl + % + sparkline) per KPI.
- Periode-keuze: Dag / Week / Maand / Kwartaal — globaal, stuurt alle drie zones.
- Hoofdgrafiek met combo bar+line (huidige reeks + voorafgaande reeks als referentie).
- Leaderboard met de vier behandelaars (Jer, Cihad, Gabos, Cihan).
- Verhuizing van de twee bestaande donut-charts ("Voortgang per status",
  "Begroting doorgezet") naar de Dashboard-pagina.

**Niet in scope (YAGNI):**
- Export (CSV/PDF).
- Vrije datum-range picker.
- Doelen/targets per persoon.
- Notificaties bij trend-daling.
- Jaar-op-jaar vergelijking als aparte periode.

## 3. Databronnen

Geen nieuwe Google Sheets nodig. Hergebruik bestaande data uit `D`:

| Metric | Bron | Datumveld | Filter |
|---|---|---|---|
| Notulen verstuurd | `D.alvo` | `r.notulen` | Alleen rijen waarvoor notulen-datum gevuld is |
| ALV's afgerond | `D.alfa` | `r.datum` | Alle rijen (elke rij = afgeronde ALV) |
| Taken afgerond (totaal) | `D.af` (alle SKEYS) | `r.datum` | Alle rijen, alle subcategorieën |
| Taken afgerond per persoon | `D.af` | `r.datum` | Groeperen op `r.behandelaar` |

Datum-parsing **altijd** via bestaande `_parseAnyDate()` — Google Sheets retourneert
Nederlandse long-dates ("21 mei 2026") en gemixte formaten.

Behandelaar-namen via bestaande `displayName(email)` / `EMAIL_NAMES`-mapping.
Onbekende of lege behandelaar wordt onder "Onbekend" gegroepeerd en niet in
het leaderboard getoond.

## 4. Layout

Drie zones, verticaal gestapeld:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Productiviteit                  [Dag] [Week] [Maand•] [Kwartaal]   │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─KPI 1────────┐ ┌─KPI 2────────┐ ┌─KPI 3────────┐ ┌─KPI 4────────┐ │
│ │ Notulen      │ │ ALV's        │ │ Taken        │ │ Per persoon  │ │
│ │ verstuurd    │ │ afgerond     │ │ afgerond     │ │              │ │
│ │   18         │ │    7         │ │   43         │ │ Jer    12    │ │
│ │ ↑ +28%       │ │ ↓ −12%       │ │ ↑  +5%       │ │ Cihad   9    │ │
│ │ ╱╲_╱─╲_╱     │ │ ─╲_╱─╲_      │ │ ╱╲╱╲_╱╲      │ │ Gabos  14    │ │
│ │ (sparkline)  │ │ (sparkline)  │ │ (sparkline)  │ │ Cihan   8    │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│  Hoofdgrafiek                  [Notulen] [ALV's•] [Taken]           │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  combo: balken = laatste 12 periodes,                         │  │
│  │         lijn  = de 12 periodes daarvoor (verschoven referentie)│  │
│  └───────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│  Leaderboard — Taken afgerond deze maand                            │
│  #  Behandelaar    Deze maand    Vorige maand    Trend              │
│  1  Gabos          14            10               ↑ +40%            │
│  2  Jer            12            13               ↓  −8%            │
│  3  Cihad           9             6               ↑ +50%            │
│  4  Cihan           8             8               ─   0%            │
└─────────────────────────────────────────────────────────────────────┘
```

- Globale periode-toggle bovenaan stuurt **alle drie** zones synchroon.
- KPI 4 ("Per persoon") is anders dan 1–3: vier mini-balkjes met getal i.p.v.
  één groot getal + sparkline. Bij klik op een naam: alle zones filteren op die
  persoon. *(Future enhancement, niet in v1.)*
- Hoofdgrafiek heeft eigen metric-toggle (welke van de drie metrics tonen);
  periode komt van de globale toggle.
- Hoofdgrafiek toont **laatste 12 periode-buckets** als balken; daar overheen
  een dunne lijn van de **12 buckets daarvoor** (verschoven), zodat je in één
  beeld ziet hoe deze cyclus zich verhoudt tot de vorige van gelijke lengte.
- Leaderboard-titel verandert mee met geselecteerde periode ("deze maand",
  "deze week", etc.).

## 5. Trend-berekening

Voor elke metric:

1. Bouw bucket-serie van laatste *N* periodes (sparkline gebruikt 8, KPI-getal
   gebruikt de laatste, leaderboard gebruikt laatste 2).
2. `huidig` = aantal in laatste bucket. `vorig` = aantal in voor-laatste bucket.
3. `deltaPct = round((huidig − vorig) / max(vorig, 1) × 100)`.
4. Richting + kleur:
   - `huidig > vorig` → `↑` groen (`--gn`).
   - `huidig < vorig` → `↓` rood (`--rd`).
   - `huidig === vorig` → `─` grijs (`--mut`).
5. Edge case: `vorig === 0 && huidig > 0` → toon `↑ nieuw` (label, geen percentage).
6. Edge case: `vorig === 0 && huidig === 0` → toon `─ 0%`.

## 6. Bucket-helpers

```js
bucketKey(date, period) → string   // sorteerbare sleutel
bucketLabel(key, period) → string  // leesbaar label
```

| Periode  | Key voorbeeld   | Label voorbeeld |
|----------|-----------------|-----------------|
| dag      | `'2026-06-02'`  | `'2 jun'`       |
| week     | `'2026-W22'`    | `"W22 '26"`     |
| maand    | `'2026-06'`     | `"Jun '26"`     |
| kwartaal | `'2026-Q2'`     | `"Q2 '26"`      |

Hergebruik bestaande `getWeekNum()` voor ISO-weeknummers.

## 7. Componenten

Nieuwe/herziene functies binnen het bestaande `// ANALYTICS`-blok:

| Functie | Verantwoordelijkheid |
|---|---|
| `bucketKey(date, period)` | Datum → bucket-sleutel |
| `bucketLabel(key, period)` | Sleutel → leesbaar label |
| `seriesByPeriod(rows, dateField, period, n)` | Array `[{key, label, count}]` voor laatste *n* buckets |
| `seriesPerPersonByPeriod(rows, period, n)` | Dict `{persoon: [{key, label, count}]}` |
| `computeTrend(series)` | `{huidig, vorig, deltaPct, dir, label}` |
| `renderKpiTile(id, opts)` | Tegel: titel, getal, pijl+%, sparkline |
| `renderKpiPersonTile(id, period)` | KPI 4 (per-persoon variant) |
| `renderSparkline(canvas, values, color)` | Mini-line zonder assen/labels |
| `renderHeroChart(metric, period)` | Combo bar+line hoofdgrafiek |
| `renderLeaderboard(period)` | Tabel met 4 behandelaars + trend |
| `buildAnalytics()` | Herschreven: orchestreert al bovenstaande |

**State** (globaal binnen Analytics):
- `anaPeriod: 'dag' | 'week' | 'maand' | 'kwartaal'` (default `'maand'`).
  Wordt één string in plaats van het huidige dict-per-chart.
- `anaMetric: 'notulen' | 'alvs' | 'taken'` (default `'alvs'`).

## 8. HTML-wijzigingen

**In `<div id="page-analytics">`:**
- Verwijder huidige inhoud (2×2 grid + bestaande charts).
- Voeg toe: globale periode-bar, 4 KPI-cards-grid, hoofdgrafiek-card,
  leaderboard-card.

**In `<div id="page-dash">`:**
- Voeg de twee donuts toe (`chart-status`, `chart-begroting`) onder de
  bestaande "Open taken per categorie"-chart of als extra rij.
- `buildDash()` krijgt de twee `buildDonut(...)`-calls die nu in
  `buildAnalytics()` staan.

## 9. CSS

Nieuwe klassen, allemaal via bestaande CSS-variabelen (`--ac`, `--gn`, `--rd`,
`--mut`, `--sur`, etc.) zodat dark mode automatisch werkt:

- `.period-bar` (globaal bovenaan Analytics)
- `.kpi-grid` (4-koloms responsive grid)
- `.kpi-tile` (card met getal, trend, sparkline)
- `.kpi-trend.up` / `.kpi-trend.down` / `.kpi-trend.flat`
- `.kpi-person-row` (mini-balk + naam + getal)
- `.sparkline` (canvas wrapper, vaste hoogte ~40px)
- `.metric-toggle` (knoppen-rij in hoofdgrafiek-header)
- `.leaderboard-tbl` (tabel-styling)

Brand-conform: Navy/Teal, DM Sans, Phosphor duotone iconen. Geen dot-grids,
geen pill-badges boven headings.

## 10. Foutafhandeling & edge cases

- **Lege data in periode:** toon `0`, trend `─ 0%`, sparkline = vlakke
  baseline (geen errors).
- **Vorig = 0, huidig > 0:** toon `↑ nieuw` zonder percentage.
- **Onbekende behandelaar:** uitgesloten van leaderboard, telt wel in totaal.
- **Datum-parsing:** uitsluitend via `_parseAnyDate()`. Geen `new Date(string)`
  direct.
- **Polling-refresh (8s):** bestaande haak in render-flow draait
  `buildAnalytics()` automatisch — geen extra code.
- **Dark mode:** alle kleuren via CSS-variabelen; sparkline leest huidige
  theme-variant.
- **Chart.js cleanup:** elke render moet `charts[id].destroy()` aanroepen
  voor de oude chart (bestaande patroon).

## 11. Acceptatie-criteria (handmatige test)

1. Periode wisselen (Dag → Week → Maand → Kwartaal): KPI-tegels,
   hoofdgrafiek én leaderboard updaten synchroon.
2. Metric wisselen in hoofdgrafiek (Notulen → ALV's → Taken): grafiek wisselt,
   KPI-tegels blijven onveranderd.
3. Taak afronden in "Nog Te Doen" → binnen 8s verschijnt +1 in Taken-tegel
   en de juiste leaderboard-rij stijgt.
4. Trend-pijlen kloppen: bij meer dan vorige periode `↑` groen, minder `↓`
   rood, gelijk `─` grijs.
5. Dark mode: alle tegels, grafieken, tabel goed leesbaar.
6. Lege state (geen data in geselecteerde periode): geen JS-errors, alle
   getallen tonen `0`.
7. Op Dashboard staan nu de twee donut-charts (verhuisd vanuit Analytics).

## 12. Open vragen

Geen — alle ontwerp-keuzes zijn vastgesteld in de brainstorm-sessie.
