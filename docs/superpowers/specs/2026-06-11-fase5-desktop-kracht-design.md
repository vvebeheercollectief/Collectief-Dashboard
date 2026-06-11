# Ontwerp Fase 5 — Desktop-kracht & overzicht

**Datum:** 11 juni 2026
**Status:** goedgekeurd door gebruiker (ontwerp-gesprek deze sessie, met 4 mockups bevestigd)
**Routekaart:** Fase 5 uit `2026-06-08-dashboard-routekaart-design.md` (Fase 3 blijft uitgesteld)
**Doel:** sneller werken en beter overzicht op desktop — het telefoontje-scenario wordt twee toetsen + één klik.

---

## 1. Wat we bouwen (samenvatting)

Vier losse bouwstenen, in deze bouwvolgorde (elk stuk apart te bekijken op staging):

1. **Per-VvE overzichtspagina** — alles van één VvE op één scherm (mockup Variant A: twee kolommen, niets weggeklapt).
2. **Ctrl+K-commandocentrum** — één venster dat door álles tegelijk zoekt (VvE's, open taken, afgerond, logboek) plus acties; ook bereikbaar via een zoekknop in de bovenbalk.
3. **Bulk-acties** — taken selecteren met vinkjes en in één keer afronden / aan iemand geven / wegleggen / deadline verschuiven / verwijderen.
4. **Chart.js lazy-load** — de grafieken-bibliotheek pas laden op de statistiekpagina (sneller opstarten).

Keuzes uit het ontwerp-gesprek: alle vier de Fase 5-brokken in één ronde; per-VvE-pagina voor zowel snel opzoeken (telefoontje) als dossier-onderzoek; zoeken en sneltoetsen samengevoegd in één Ctrl+K-commandocentrum dat overal doorheen zoekt; vijf bulk-acties incl. verwijderen, teller bovenin (niet in de actiebalk).

**Geen wijzigingen aan de Google Sheet of Apps Script** — alles draait op gegevens die de frontend al binnenhaalt (`D`). Mockups: `mockup-vve-pagina.html` (Variant A), `mockup-commandocentrum.html`, `mockup-bulk-acties-v2.html` (lokaal, in `.vercelignore`-stijl niet voor productie nodig).

---

## 2. Bouwsteen 1 — Per-VvE overzichtspagina

### Gedrag
- Nieuwe pagina (route `vve`), zelfde patroon als de Herhaalregels-pagina uit Fase 4. Géén vast item in de zijbalk: je komt er via het commandocentrum of door op een VvE-code te klikken; de paginatitel toont code + naam.
- **Kop:** VvE-code (pill), naam, behandelaars (afgeleid uit open taken), en vier kerncijfers: open taken · te laat · weggelegd · dagen sinds laatste activiteit (uit logboek).
- **Linkerkolom (het werk):**
  - *Open taken* — alle openstaande taken van deze VvE uit de vier categorieën samen, met categorie-badge, behandelaar en deadline/te-laat-pil; gesorteerd volgens de bestaande lijst-sortering. Klik = bestaande bewerkmodal (`openModal(true, rowData)`).
  - *Weggelegd* — weggelegde taken (opvolgdatum, Fase 4) gedempt met "terug op"-pil.
  - *Laatst afgerond* — de 5 nieuwste afgeronde taken + knop "alle N tonen" die de rest uitklapt.
- **Rechterkolom (het dossier):**
  - *ALV's* — geplande ALV uit `D.alvo` (status/vlaggen) + laatst gehouden ALV uit `D.alfa`.
  - *Recente activiteit* — de laatste 10 logboek-regels van deze VvE als mini-tijdlijn (zelfde zinnen als de logboek-pagina via `logZin`, met avatar en relatieve tijd).
- **Klikbare VvE-codes:** overal waar een VvE-code als pill staat (taakrijen op de NTD- en Afgerond-lijsten) wordt die klikbaar → per-VvE-pagina. De code-pill krijgt hover-stijl zodat zichtbaar is dát hij klikbaar is.
- Bezochte VvE's worden onthouden in `localStorage` (`recentVves`, laatste 3) voor de lege staat van het commandocentrum.

### Techniek
- Nieuwe module `src/render-vve.js`: `openVvePagina(code)` (zet `state.vveCode`, rendert, `goTo('vve')`) + `renderVve()` (her-render bij polling-refresh). Pure helper `vveOverzicht(code, D)` (verzamelt taken/cijfers/ALV's/logboek) apart exporteren voor tests.
- `index.html`: container `#page-vve`; `src/config.js`: `PAGE_META`-entry (titel wordt dynamisch overschreven met code+naam).
- Nieuwe data-action `vve-open` in `src/actions.js`; code-pills in `render-lijsten.js` krijgen `data-action="vve-open" data-code="…"`.
- `goTo('vve')` zonder zijbalk-item: gecontroleerd dat `.ni`-toggling geen item nodig heeft (geen item = geen highlight, geen fout).
- Render-verversing: `renderAll()` roept ook `renderVve()` aan wanneer de vve-pagina actief is, zodat de 8s-poll de pagina vers houdt.

---

## 3. Bouwsteen 2 — Ctrl+K-commandocentrum

### Gedrag
- **Openen:** `Ctrl+K` (Windows) / `Cmd+K` (Mac) of de nieuwe zoekknop (vergrootglas) in de bovenbalk. **Sluiten:** `Esc`, klik buiten het venster, of een keuze maken.
- Eén zoekveld dat bij elke toetsaanslag door alles tegelijk zoekt (hoofdletter-ongevoelig, deelwoord-match), resultaten gegroepeerd:
  1. **VvE's** (code óf naam matcht; uit `D.alvo`) — toont code, naam + mini-samenvatting (x open · y te laat · laatste activiteit). Enter/klik → per-VvE-pagina. Max 3.
  2. **Open taken** (omschrijving, code of naam matcht; alle 4 secties) — met te-laat/deadline-pil. Klik → bewerkmodal. Max 5.
  3. **Afgerond** (zelfde matching op `D.af`) — met afrond-datum. Klik → per-VvE-pagina van die VvE. Max 3.
  4. **Logboek** (zoekt in actie/veld/waarden/notities) — toont de logzin. Klik → per-VvE-pagina. Max 3.
  5. **Acties** — altijd onderaan: "Nieuwe taak aanmaken met '…'" (opent bestaande taakmodal, omschrijving voorgevuld via `prefillNieuweTaak`-patroon), "Ga naar statistieken", "Ga naar herhaalregels", "Ga naar logboek".
- **Lege staat** (nog niets getypt): snelkoppelingen (Nieuwe taak, Statistieken, Herhaalregels) + de 3 laatst bezochte VvE's uit `recentVves`.
- **Bediening:** ↑/↓ door alle resultaten heen (groepsgrenzen over), Enter opent de selectie, muisklik werkt ook; eerste resultaat is voorgeselecteerd.

### Techniek
- Nieuwe module `src/palette.js` met pure zoekfunctie `zoekAlles(query, D)` → `{vves, taken, afgerond, logboek}` (apart exporteren voor tests) en UI-laag (`openPalette`/`closePalette`/render).
- Modal-markup `#pal-bg` in `index.html` (zelfde overlay-patroon als bestaande modals); resultaat-items via data-action (`pal-kies`).
- Eén globale `keydown`-listener in `main.js`: Ctrl/Cmd+K → open (preventDefault, ook als focus in een invoerveld staat), Esc → sluit palette indien open. Pijltjes/Enter-afhandeling alleen binnen het palette (listener op het zoekveld).
- Topbar-knop `#zoek-btn` naast de bestaande knoppen (`#ai-btn`-patroon), inline-SVG-icoon (géén Phosphor-font, conform iconen-les).
- Prestatie: zoeken is puur in-memory over `D` (bij hun schaal ruim snel genoeg); geen debounce nodig, hooguit 100 ms.

---

## 4. Bouwsteen 3 — Bulk-acties

### Gedrag
- Op de "Nog Te Doen"-takenlijsten (alle vier de secties) komt naast de bestaande lijst-knoppen een knop **"Selecteren"**. Aan: vinkjes vóór elke rij + teller ("3 geselecteerd") bovenin naast de knop; onderin schuift een donkere actiebalk in beeld (sticky).
- **Vijf acties in de balk:** ✓ Afronden · 👤 Aan iemand geven (keuzemenu: behandelaars) · 🔕 Wegleggen (snelkeuzes +3d/+1w/+2w/kies datum, zelfde als Fase 4-snooze) · 📅 Deadline (datumkiezer) · 🗑 Verwijderen (eerst één bevestiging "N taken verwijderen?").
- Selectie geldt per sectie (de lijst waar je 'm aanzet). Esc of ✕ in de balk zet de selecteer-stand uit en wist de selectie.
- **Eén undo-toast per bulk-actie** ("3 taken afgerond — Ongedaan maken") die de hele groep terugdraait, zelfde patroon als de bestaande undo bij verwijderen.
- Optimistisch zoals alles: UI werkt direct bij, schrijven loopt op de achtergrond. Mislukt het opslaan halverwege, dan wordt de hele groep teruggedraaid (rollback) met rode fout-toast.

### Techniek
- Nieuwe module `src/bulk.js`: selectie-state (`Set` van rij-referenties), `renderBulkbalk()`, en per actie een functie die de **bestaande** CRUD-routines hergebruikt (afronden/wegleggen/deadline/herverdelen/verwijderen) — geserialiseerd via `backgroundWrite`/`_writeChain`, met verzamelde undo-data per groep.
- Belangrijk aandachtspunt (uit Fase 2-lessen): bulk-schrijfacties verwerken rijen **van onder naar boven** (hoogste `_row` eerst) zodat `_shiftNtdRows`-rij-indexverschuivingen kloppen.
- Data-actions: `bulk-toggle` (stand aan/uit), `bulk-vink` (rij), `bulk-actie` (balk-knoppen).
- Bulk staat alléén op de NTD-lijsten (niet op Afgerond/ALV's/per-VvE-pagina) — bewuste YAGNI-keuze.

---

## 5. Bouwsteen 4 — Chart.js lazy-load

- De vaste `<script src="…chart.umd.min.js">` in `index.html` vervalt.
- `src/render-analytics.js` krijgt `ensureChartJs()`: een promise die het script eenmalig dynamisch laadt (gecachet) en waarop `renderAnalytics()` wacht vóór het tekenen; korte "grafieken laden…"-placeholder bij de allereerste keer.
- Thema-wissel (charts destroy/recreate in `ui.js`) blijft werken omdat dat pad alleen draait als de charts al bestaan.

---

## 6. Testen & uitrol

- **Testsuite (`?test=1`) breidt uit** met o.a.: `zoekAlles()` (matching op code/naam/trefwoord, groepering, max-aantallen, lege query), `vveOverzicht()` (kerncijfers: open/te laat/weggelegd/laatste activiteit, checkbox-erfenis-waarden via `_f4v`), bulk-helpers (volgorde hoog→laag `_row`, undo-data opbouw), actions-registry-telling (nieuwe acties erbij), en een rooktest dat `#page-vve` + `#pal-bg` bestaan.
- **Uitrol:** bouwen op `staging` → test-link met TESTOMGEVING-balk → gebruiker test → GO → merge naar `main` (GitHub Pages). Geen Apps Script-wijzigingen, dus geen editor-stappen.
- Handmatig na te lopen op staging: Ctrl+K op Mac/Windows-toetsenbord, klikbare code-pills, bulk-undo-toast, eerste bezoek statistiekpagina (lazy-load), donkere modus op de nieuwe pagina/modals.

---

## 7. Bewust níet in deze fase (YAGNI)

| Idee | Waarom niet |
|---|---|
| URL-deeplinks per VvE (`#vve=2114`) | Dashboard heeft geen URL-routing; intern navigeren volstaat. Later toevoegbaar. |
| Bulk op Afgerond/ALV-lijsten of per-VvE-pagina | Het werk gebeurt op de NTD-lijsten; elders is de behoefte niet aangetoond. |
| Fuzzy/typo-tolerant zoeken | Deelwoord-match is voorspelbaar en snel; fuzzy maakt resultaten onverklaarbaar. |
| Meer losse sneltoetsen (N=nieuw, G=ga naar…) | Gebruikerskeuze: alles via één Ctrl+K-ingang; losse letters botsen met invoervelden. |
| Zoeken in Ontwikkeling/Meldingen | Niet gevraagd; groepen blijven behapbaar. |
