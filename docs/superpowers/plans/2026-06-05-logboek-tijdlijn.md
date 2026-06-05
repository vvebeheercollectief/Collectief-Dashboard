# Logboek-tijdlijn — Implementatieplan

**Goal:** Het logboek tonen als gegroepeerde activiteitentijdlijn met filters per collega en per actie, in plaats van een 8-koloms tabel.

**Architecture:** Alleen `index.html`. HTML van `page-logboek` aanpassen, CSS-blok toevoegen, `renderLogboek()` herschrijven + 3 helpers. Geen backend/Sheet-wijziging.

**Tech Stack:** Vanilla JS/CSS in single-file PWA. Bestaande helpers: `displayName`, `esc`, `renderPag`, `PG`, `D.logboek`.

---

### Task 1: HTML van page-logboek omzetten
**Files:** Modify `index.html` (`page-logboek`, ~659-692)
- [ ] Vervang de `<select id="f-actie-logboek">` door niets in de filter-bar (zoekveld blijft).
- [ ] Voeg onder `.card-hdr` twee chip-rijen toe: `#logboek-who` (Iedereen/Jer/Cihad/Gabos/Cihan) en `#logboek-act` (Alle acties/Afgerond/Bewerkt/Aangemaakt/Opmerkingen).
- [ ] Voeg een teller `#logboek-count` toe.
- [ ] Vervang `<div class="tbl-wrap"><table>…</table></div>` door `<div id="logboek-feed" class="log-feed"></div>`. Behoud `<div class="pag" id="logboek-pag">`.

### Task 2: CSS-blok voor de feed
**Files:** Modify `index.html` (CSS, bij overige logboek-CSS ~396)
- [ ] Voeg klassen toe: `.log-feed`, `.log-day` (sticky kopje), `.log-item` (+ tijdlijn-streepje), `.log-av` (avatar), `.log-line`, `.log-change` (oud→nieuw), `.log-note` (geel kader), `.log-time`, `.log-count`, en chip-stijl `.lchip`/`.lchip.on`/`.lchip .av`.
- [ ] Gebruik uitsluitend bestaande CSS-vars zodat dark mode klopt.

### Task 3: Helpers toevoegen
**Files:** Modify `index.html` (bij logboek-JS ~3118)
- [ ] `logDayLabel(iso)` → "Vandaag"/"Gisteren"/`toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'})`.
- [ ] `avatarKleur(naam)` → map Jer→ac, Cihad→pu, Gabos→pk, Cihan→am, anders navy.
- [ ] `logZin(r)` → natuurlijke zin per `r.actie` (Afgerond/Aangemaakt/Bewerkt/Opmerking + fallback), met `esc` en code-chip.

### Task 4: renderLogboek herschrijven
**Files:** Modify `index.html` (`renderLogboek`, ~3141-3165)
- [ ] Module-vars `logWho=''`, `logAct=''`.
- [ ] Filter op zoek (`#s-logboek`) + `logWho` (via `displayName(r.gebruiker)`) + `logAct` (`r.actie`).
- [ ] Teller `#logboek-count` = "X gebeurtenis(sen)".
- [ ] Pagineer (`PG`), groepeer zichtbare pagina per `logDayLabel`, render items in `#logboek-feed`.
- [ ] Lege staat als 0 resultaten. `renderPag` op `#logboek-pag` blijft.

### Task 5: Bindings & boot
**Files:** Modify `index.html` (boot ~1135-1136)
- [ ] Verwijder de `f-actie-logboek`-onchange-binding.
- [ ] `setupSearch('s-logboek', …)` blijft.
- [ ] Voeg klik-handlers toe op `#logboek-who` en `#logboek-act` (zet actieve chip, update `logWho`/`logAct`, `pgs.logboek=1`, `renderLogboek()`).

### Task 6: Verifiëren (headless)
- [ ] Server starten, voorbeeld-`D.logboek` injecteren via console, `renderLogboek()` aanroepen.
- [ ] Controleer: dag-groepering, zinnen, avatars, filters (collega/actie/zoek), teller, lege staat, dark mode.

### Task 7: Commit
- [ ] `git add index.html docs/...logboek...` en commit.
