# Vrijdagsoverzicht — Weekpresentatie (1–5 juni 2026)

**Datum spec:** 2026-06-05
**Type:** Interactieve web-presentatie (HTML-deck)
**Publiek:** Intern team (Jer, Cihad, Gabos, Cihan)
**Bron:** Collectief Dashboard 4.0 — Google Sheets backend (`1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw`)

## Doel

Een doorklik-presentatie die in één oogopslag laat zien wat het team deze werkweek
(ma 1 t/m vr 5 juni 2026) heeft gedaan: productiviteit, hoogtepunten, eerlijke
aandachtspunten/gebreken en een concreet actieplan voor komende week. Bedoeld om
vrijdag samen met het team door te nemen als "vrijdagsoverzicht".

Toon: open en transparant op de cijfers (namen en aantallen mogen zichtbaar), maar
conclusies neutraal verwoord — dus "werk is onevenwichtig verdeeld" i.p.v. een
persoon negatief uitlichten.

## Aanpak

### Data: bevroren momentopname
De volledige week wordt nu uit de Sheets gehaald, de cijfers worden uitgerekend en
als vaste JSON-data in het HTML-bestand gebakken. De deck is daarmee één
zelfstandig bestand: werkt overal/offline, geen inlog nodig, en representeert
precies "de stand van deze vrijdag". (Live laden uit Sheets is bewust afgewezen:
auth-gedoe + niet-reproduceerbaar.)

### Structuur: doorklik-deck
Volledig scherm, navigatie met pijltjes/spatie, klikbare voortgangs-dots en een
voortgangsbalk. Eén thema per slide.

### Stijl (huisstijl)
- Kleuren: Navy `#2B3544` / Navy-dark `#1E2530`, Teal-schaal (`#0D7377` primair,
  `#14B8A6`, `#5EEAD4`, `#CCFBF1`), functioneel groen/amber/rood.
- Font: DM Sans (400–800).
- Iconen: **inline SVG** in duotone-stijl (géén Phosphor web-font — die rendert niet).
- Achtergrond: zachte gradient-vlakken / sectie-afwisseling, **géén dot-grid**.
- Geen locatie-pills boven headings.

### Motion
- Slide-transities (fade/slide).
- Count-up animatie op hero-getallen.
- Chart.js-grafieken die intekenen bij binnenkomst van de slide.
- SVG voortgangsringen/-balken waar passend.
- Respecteert `prefers-reduced-motion`.

## Verhaallijn (10 slides)

1. **Titel** — "Vrijdagsoverzicht · Week 1–5 juni 2026", logo, animatie-intro.
2. **De week in cijfers** — hero-KPI's met count-up: acties gelogd · taken afgerond ·
   ALV-stukken verwerkt · nieuwe taken aangemaakt.
3. **Productiviteit per dag** — area/line-grafiek ma→vr, piekdag uitgelicht.
4. **Wie deed wat** — staafgrafiek acties per teamlid + donut van actietypes.
   Eerlijk op cijfers, conclusie neutraal ("werk onevenwichtig verdeeld").
5. **Waar ging het werk heen** — verdeling per sectie
   (Oppakken / Offerte-trajecten / ALV's / Vergaderverzoeken).
6. **Hoogtepunten** — concrete afgeronde trajecten uit de opmerkingen
   (bv. MJOP opnieuw uitgezet, offertes afgehandeld, notulen verstuurd).
7. **Gebreken & aandachtspunten** — data-gedreven: werkdruk-onbalans, backlog
   (openstaande taken), te-late taken, stille taken, dubbel/test-ruis in het logboek.
8. **Verbeterpunten** — wat we hieruit leren (beknopt, neutraal verwoord).
9. **Komende week — actieplan** — concrete, meetbare doelen.
10. **Afsluiting** — korte, motiverende slot.

## Databronnen & metrieken

Uit de Google Sheets (week-filter: timestamp/datum binnen 2026-06-01 t/m 2026-06-05):

| Metriek | Bron | Berekening |
|---|---|---|
| Acties gelogd | `Logboek` | Aantal regels met timestamp in de week (excl. `systeem` waar passend) |
| Taken afgerond | `Logboek` (Actie=`Afgerond`) + `Afgerond`-sheet | Tel afrond-acties in de week |
| ALV-stukken verwerkt | `Logboek` (Actie=`Aangevinkt`, Sectie=`ALVS`) | Tel aangevinkte stukken (Notulen/Begroting/Uitnodiging) |
| Nieuwe taken | `Logboek` (Actie=`Aangemaakt`) | Tel in de week |
| Activiteit per dag | `Logboek` | Groepeer op datum (ma–vr) |
| Acties per teamlid | `Logboek` (kolom `Gebruiker`) | Groepeer op gebruiker; `displayName`-mapping |
| Verdeling per sectie | `Logboek` (kolom `Sectie`) | Groepeer op sectie |
| Actietypes | `Logboek` (kolom `Actie`) | Groepeer op actie |
| Hoogtepunten | `Logboek` (Actie=`Opmerking`/`Afgerond` met tekst) | Selectie van inhoudelijke updates |
| Backlog open taken | `Nog Te Doen` | Totaal openstaand; te-laat = verstreken deadline; stil = geen activiteit ≥14 dagen |
| Dubbel/test-ruis | `Logboek` | Entries met "Test"/"Dubbel" + opeenvolgende identieke `Aangemaakt` |

Namen via de bestaande `displayName`/`EMAIL_NAMES`-logica uit het dashboard;
`systeem`-regels (auto-prioriteit) apart behandelen of uitsluiten.

## Te bouwen

Eén bestand: `vrijdagsoverzicht.html` in de repo-root van `collectief-dashboard/`,
met ingebakken `WEEK_DATA`-JSON. Chart.js via CDN (zoals het dashboard). DM Sans via
Google Fonts. Inline SVG-iconen.

## Out of scope (YAGNI)

- Geen live data-koppeling / inlog.
- Geen export naar PDF/PPTX (kan later, los).
- Geen historische week-vergelijking (alleen deze week).
- Geen wijzigingen aan het dashboard zelf of de Apps Script.

## Aannames

- "Deze week" = ma 1 t/m vr 5 juni 2026 (vandaag = vrijdag).
- Data wordt op bouwmoment opgehaald en is daarna bevroren in het bestand.
- Deck wordt lokaal in de browser geopend (geen deploy vereist; kan later wel).
