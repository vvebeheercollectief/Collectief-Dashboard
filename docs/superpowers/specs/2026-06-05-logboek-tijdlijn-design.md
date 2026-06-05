# Spec — Logboek-redesign (activiteitentijdlijn)

**Datum:** 2026-06-05
**Project:** [[Collectief Dashboard 4.0]] — `index.html`
**Status:** Goedgekeurd ontwerp (mockup `mockup-logboek.html` akkoord bevonden)

## Doel

Het logboek leest nu als een spreadsheet met acht kolommen waarin je horizontaal
moet scrollen. Hetzelfde verhaal wordt veel sneller te scannen als een rustige
**tijdlijn** waarin elke regel een zin is: *wie* deed *wat* bij *welke VvE*. De
onderliggende data en de Google Sheet veranderen niet — alleen de weergave.

## Gedrag

- **Tijdlijn gegroepeerd per dag**: kopjes "Vandaag", "Gisteren", anders weekdag +
  datum (bv. "Woensdag 3 juni").
- **Per item** een gekleurde initiaal-avatar van de collega, gevolgd door een zin:
  - Afgerond → "**Jer** rondde `0142` af — Lekkage kelderberging"
  - Aangemaakt → "**Jer** maakte een nieuwe taak bij `0311` — …"
  - Bewerkt → "**Cihad** wijzigde deadline bij `0203`" + een regel `oud → nieuw`
  - Opmerking → "**Gabos** noteerde bij `0087`" + de notitie in een geel kader
  - Overige acties (Verwijderd, Teruggezet, Behandelaar gewijzigd) → nette
    fallback-zin met de bestaande actie-naam.
- **Filters** (snel, één klik):
  - **Per collega**: chips "Iedereen / Jer / Cihad / Gabos / Cihan".
  - **Per soort actie**: chips "Alle acties / Afgerond / Bewerkt / Aangemaakt /
    Opmerkingen".
  - **Vrij zoeken**: het bestaande zoekveld blijft (zoekt over alle velden).
- **Teller**: "X gebeurtenissen" boven de lijst.
- **Paginering**: blijft werken (bestaande `PG` + `renderPag`); de dag-kopjes
  worden binnen de getoonde pagina geplaatst.
- **Lege staat**: vriendelijke "Niets gevonden met deze filters."

## Techniek

- Vervang in `page-logboek` de `<table>` door een feed-container
  `<div id="logboek-feed" class="log-feed">`, en voeg twee chip-rijen toe
  (collega's + acties). Het bestaande zoekveld `#s-logboek` blijft.
- De `<select id="f-actie-logboek">` vervalt; de boot-binding op die select
  (regel ~1136) wordt vervangen door chip-handlers.
- `renderLogboek()` wordt herschreven: filtert op zoek + collega + actie, pagineert
  de platte lijst, groepeert de zichtbare pagina per dag, en rendert de feed.
- Nieuwe helpers:
  - `logDayLabel(iso)` → "Vandaag"/"Gisteren"/weekdag+datum.
  - `logZin(r)` → de natuurlijke zin per actie-type (gebruikt `displayName`).
  - `avatarKleur(naam)` → vaste kleur per bekende collega, anders navy.
- Filterstatus in twee module-variabelen `logWho`, `logAct` (default leeg = alles).
- Alle kleuren via bestaande CSS-variabelen (`--sur2`, `--bor`, `--mut`, `--txt`,
  sectiekleuren) zodat **dark mode** meteen klopt.
- `renderTaskHistory` (per-taak logboek in de bewerkmodal) blijft ongewijzigd.

## Niet-doelen
- Geen wijziging aan wat er wordt gelogd of aan de Sheet-structuur.
- Geen export/CSV, geen datumbereik-kiezer (kan later).
- De oude tabel keert niet terug als aparte weergave (tijdlijn vervangt 'm).

## Testplan
1. Render met voorbeelddata (headless via console-injectie van `D.logboek`):
   dag-groepering, zinnen per actie-type, avatars kloppen.
2. Filter per collega → alleen die persoon; per actie → alleen dat type;
   combinatie collega+actie+zoeken werkt samen; teller klopt.
3. Lege filter → lege-staat-tekst.
4. Dark mode: contrast en kleuren correct.
5. Paginering bij >PG items.
