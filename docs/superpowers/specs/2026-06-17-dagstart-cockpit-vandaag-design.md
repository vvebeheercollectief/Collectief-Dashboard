# Ontwerp — Dagstart-cockpit "Vandaag": van losse bakken naar één persoonlijk startscherm

Datum: 2026-06-17
Status: goedgekeurd ontwerp, klaar voor implementatieplan
Branch-werkwijze: nieuwe feature-branch `feat/dagstart-cockpit` vanaf `main` (main == staging op
dit moment). Implementatie op de branch, na akkoord van de beheerder netjes integreren — geen
kale staging→main merge (zie [[feedback_staging_main_merge]] — eerst diffen/cherry-picken).

## Aanleiding

Naloop-ronde van het dashboard (2026-06-17). De beheerder gaf aan dat de dagelijkse frictie
**niet** in intake of opvolging zit (die motoren draaien goed), maar in twee dingen:

1. **Dagstart** — er is geen persoonlijke "dit doe ik vandaag"-lijst. Iedereen zoekt zelf in de
   vier bakken (Oppakken, Vergaderverzoeken, Offerte-trajecten, LOD) wat van hem is en wat het
   urgentst is.
2. **Rapporteren/communiceren** naar buiten kost handwerk. → Apart vervolgproject (fase 2, zie
   onderaan). Dit document beschrijft alléén de dagstart (fase 1).

Wat al bestaat maar net niet in de juiste vorm:
- De **maandagbriefing** (auto-PDF, ma 07:30) geeft al een plan-van-aanpak per persoon — maar
  alleen op maandag, alleen voor Jer & Cihad, en als losse PDF buiten het dashboard.
- **Auto-prioriteit** zet wel een prioriteit, maar kijkt puur naar de deadline. "Urgentie" is
  meer dan "deadline".
- De **Dashboard-pagina** (`buildDash`) toont nu kantoor-totalen + "recent afgerond" — niet
  persoonlijk en niet urgentie-gedreven.

## Doel

Eén **persoonlijk dagstart-scherm** ("Vandaag") dat de beslissing voor je maakt: wat moet ík
vandaag eerst doen, en wat mag het kantoor niet laten doorslippen — live in het dashboard, voor
alle vier de teamleden, elke dag (niet alleen maandag).

**Kernkeuzes (brainstorm 2026-06-17, door beheerder bevestigd via mockups):**
- Richting **A** ("Dagstart-cockpit") gekozen boven B (alleen motor) en C (communicatie); C volgt
  als losse fase 2.
- De cockpit komt op de **bestaande Dashboard-pagina**: cockpit bovenaan, de huidige
  kantoor-totalen + "recent afgerond" schuiven eronder (niets gaat verloren).
- Persoonlijk én kantoorbreed: kleine toggle **"Mijn / Iedereen"**, met een **"Niet
  toegewezen"**-bak voor taken zonder behandelaar.
- Geen Sheet- of Apps Script-wijzigingen: puur frontend, hergebruik van bestaande velden.

## Gekozen ontwerp

### 1. Architectuur — twee geïsoleerde units

- **`src/urgentie.js`** — nieuwe *pure* module (geen DOM, volledig unit-testbaar). Bundelt de nu
  versnipperde regels tot één score per taak:
  - `urgentieScore(taak, sec, {vandaag, logboek})` → `{score: 0–100, reden: string, kleur}`.
  - Gewichten (eerste opzet, fijnregelen tijdens implementatie via tests):
    - **Te laat** (deadline verstreken): dominante term — komt altijd bovenaan.
    - **Deadline nadert**: oplopend naar de sectie-drempel uit `PRIO_REGELS`
      (Oppakken 7/14, Vergader 14/21, Offerte 21/42, LOD 90/240).
    - **Dagen stil**: oplopend vanaf `STIL_DREMPEL_DAGEN` (4), escaleert via
      `STIL_ESCALATIE_REGELS` (trap1/trap2 per sectie).
    - **Opvolgen vandaag** (`opvolgStatus().vandaag`): vaste opslag.
    - **LOD-gewicht**: officiële termijn weegt extra zwaar.
  - `reden` is de zwaarst wegende term in mensentaal ("officiële LOD-termijn", "nog 2 dagen",
    "16 dagen stil", "opvolgen vandaag").
  - Aggregatoren voor de kantoorbrede strook (hergebruik `offerteBriefingFeiten`, uitgebreid met
    LOD-termijnen-die-naderen en taken ≥ trap2 stil).
- **`src/render-vandaag.js`** — schildert de cockpit uit `urgentie.js` + `state.currentUserEmail`.
  Blijft los van `buildDash`, zodat beide modules klein en gefocust blijven.

Bestaande hergebruikte helpers: `berekenPrioriteit`, `bepaalStil` (dagen-stil uit Logboek),
`opvolgStatus`, `displayName`/`EMAIL_NAMES` (e-mail → naam), de bestaande row-acties
`taak-bewerken` / `taak-wegleggen` / `taak-afronden` / `vve-open`.

### 2. Wat de cockpit toont (boven → onder)

1. **Begroeting** — "Goedemorgen, <naam>" + datum + "N taken voor jou vandaag".
   Naam via `displayName(state.currentUserEmail)`.
2. **Kantoorbrede "let op"-strook** — geaggregeerde signalen als chips, bv.:
   - LOD-termijn nadert (rood),
   - N taken liggen > trap2 stil (oranje),
   - N offertes klaar te gunnen / nu-opvolgen (info).
3. **"Doe dit eerst" — top-3** van *jouw* urgentste taken: actiepunt, VvE, reden + deadline.
   Klik → opent de taak (bewerken) of het VvE-dossier.
4. **"Verder vandaag · jouw lijst"** — de rest van jouw taken, op urgentie aflopend gesorteerd.
5. **Toggle "Mijn / Iedereen"** — schakelt naar het kantoorbrede beeld, inclusief een
   "Niet toegewezen"-bak.
6. **Daaronder (ongewijzigd)** — de bestaande kantoor-totalen (`dash-stats`), hero-donut en
   "recent afgerond"-tabel uit `buildDash`.

"Mijn taak" = `behandelaar` bevat `displayName(currentUserEmail)` (behandelaar kan meerdere
namen bevatten, gesplitst op `,` of `/`).

### 3. Wiring

- `main.js`-routing: de Dashboard-pagina rendert eerst `renderVandaag()`, daarna de bestaande
  `buildDash()`-inhoud eronder.
- `loadAll()` ververst de actieve Dashboard-pagina al via `buildDash()`; daar `renderVandaag()`
  naast hangen, zodat de cockpit live meebeweegt met nieuwe data.

## Eerlijke kanttekeningen (vastgelegd, geen verrassingen achteraf)

- **"Dagen stil"** komt uit het Logboek (`bepaalStil`) en bestaat nu alleen voor taken
  *in behandeling*, gekoppeld op VvE-code + sectie (niet de exacte taak). De cockpit erft die
  beperking — prima voor v1, maar geen perfecte precisie bij meerdere taken van één VvE.
- **Persoonlijke lijst** werkt alleen als `behandelaar` is ingevuld. Lege taken vallen in de
  "Niet toegewezen"-bak, niet in iemands "Mijn".
- **Geen backend-werk**: geen nieuwe Sheet-kolommen, geen nieuwe Apps Script-triggers. We
  hergebruiken bestaande velden (`esc`, deadline, Logboek).

## Wat we bewust NIET doen (YAGNI)

- Geen automatische werkverdeling/toewijzing tussen teamleden (was geen pijn).
- De **maandagbriefing-PDF** blijft zoals hij is; de cockpit is de live in-app versie. Of we de
  PDF later vervangen/uitbreiden is een aparte afweging.
- Geen "alles-in-één-oogopslag" mega-overzicht (was niet de gekozen pijn).

## Testen & robuustheid

- `urgentie.js` krijgt unit-tests in `tests.js`: volgorde te-laat > stil > deadline; lege
  deadline; lege behandelaar; leeg logboek; LOD-voorrang; toggle Mijn/Iedereen/Niet-toegewezen.
- Cockpit degradeert netjes:
  - geen taken → vriendelijke lege staat ("Niks dringends — mooi!");
  - `currentUserEmail` onbekend → toont kantoorbreed;
  - leeg Logboek → geen stil-signaal i.p.v. een fout.

## Vervolg — fase 2 (apart spec→plan→implementatie)

**Communicatie-assistent per VvE** (richting C): op een VvE-dossier één knop "Stel bestuursupdate
op" die uit Logboek + dossier + AI-hulp een verzendklare terugkoppeling (mail/PDF) opbouwt. Pakt
de tweede pijn (rapporteren/communiceren) aan. Krijgt een eigen ontwerp wanneer fase 1 staat.
