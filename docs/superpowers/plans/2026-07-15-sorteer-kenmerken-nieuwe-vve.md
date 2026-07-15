# Plan: sorteerbare kolomkoppen, kenmerken-dropdown & nieuwe VvE (v6.4)

Spec: `docs/superpowers/specs/2026-07-15-sorteer-kenmerken-nieuwe-vve-design.md`

## Stap 1 — Nieuwe VvE 311212 (data, geen code)
1. Rij invoegen op rij 344 van "ALV's overzicht" in PROD-Sheet (`1fnUs…isUw`) en TEST-Sheet (`1-6Q3…ljm4`), beide worksheetId 33878833: `311212 · VvE De La Reyweg 131 t/m 141 · FALSE · FALSE · FALSE · (leeg)`.
2. Teruglezen rij 343–346 ter controle (311211 → 311212 → 321003).

## Stap 2 — Kenmerken-dropdown (kenmerken.js, render-vve.js, tests.js)
1. `KENMERK_WAARDEN = ['Onbekend','Gemeenschappelijk','Individueel']`; normalisatie `Ja→Gemeenschappelijk`, `Nee→Individueel` in `parseKenmerken` (kolommen balkons/kozijnen).
2. render-vve.js: labels "Balkons"/"Kozijnen" (weergave + bewerkmodus); `KMK_PIL` → Gemeenschappelijk groen / Individueel accent; Onbekend grijs (default).
3. tests.js: bestaande kenmerken-tests bijwerken (Ja/Nee-invoer → nieuwe woorden verwacht) + expliciete normalisatie-tests.

## Stap 3 — Sorteerbare kolomkoppen (state.js, render-lijsten.js, render-tabel.js, actions.js, styles.css, tests.js)
1. state.js: `ntdSort:{key:null,asc:true}`.
2. render-lijsten.js: pure `sorteerNtd(rows,sort)` (groep leidend; code natuurlijk; deadline via parseDt, leeg onderaan; stabiel → ties houden standaardvolgorde) + `ntdSorteerKey(label)` ('VvE Code'→code, 'Deadline…'→deadline). In `renderNtd`: toepassen ná `filterNtd`, sorteerspec doorgeven aan `renderThead`.
3. render-tabel.js: `renderThead(id,cols,css,sort?)` — sorteerbare koppen als `<button class="th-sort" data-action="ntd-sorteer" data-key=…>` met pijl + `aria-sort` op de `<th>`; overige aanroepen (af-thead) ongewijzigd.
4. actions.js: `'ntd-sorteer'` — cyclus asc→desc→uit (andere kolom = reset naar asc), `pgs.ntd=1`, `renderNtd()`.
5. styles.css: `.th-sort` (erft th-typografie, hover/focus, `.th-pijl`).
6. tests.js: `VERWACHTE_ACTIES` + `'ntd-sorteer'`; unit-tests sorteerNtd (code ▲▼, deadline ▲▼, geen-deadline onderaan, groepsbehoud, key:null = ongewijzigd) + ntdSorteerKey.

## Stap 4 — Versie & verificatie
1. config.js `APP_VERSION='6.4'`; sw.js `CACHE_VERSION='cd-v59'`.
2. Preview (launch-config `dashboard`, poort 8123) + SW/caches opruimen + `?test=1` → `window._testResult` alles OK.
3. Committen in logische stappen; ff-merge naar `main`; push.

## Stap 5 — Livegang & migratie
1. Pages-build afwachten; prod-URL verifiëren met cache-buster (`sw.js` = cd-v59) + `?test=1` op live URL.
2. Kenmerken-migratie PROD (rijen 2–5, kolommen B/C: Ja→Gemeenschappelijk, Nee→Individueel) + zelfde op TEST; teruglezen.
3. Geheugen bijwerken (memory-bestand project + MEMORY.md).
