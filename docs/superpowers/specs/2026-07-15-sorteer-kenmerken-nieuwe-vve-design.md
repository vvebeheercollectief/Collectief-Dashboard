# Ontwerp: sorteerbare kolomkoppen, kenmerken-dropdown & nieuwe VvE

**Datum:** 2026-07-15 · **Status:** goedgekeurd door gebruiker (chat) · **Versie:** 6.4 / cd-v59

Drie gebruikerswensen in één release:

## 1. Sorteerbare kolomkoppen op 'Nog te doen'

De kolomkoppen **VvE Code** en **Deadline** (elke variant: "Deadline", "Deadline uitschr.", "Deadline LOD") worden klikbare knoppen op alle vier de tabbladen (Oppakken, Vergaderverzoeken, Offerte-trajecten, LOD).

- **Klikcyclus per kolom:** 1e klik = oplopend (▲), 2e klik = aflopend (▼), 3e klik = terug naar de standaardvolgorde (de bestaande slimme sortering uit `filterNtd`). Klik op de ándere kolom = die kolom meteen oplopend.
- **Groepen blijven leidend:** de blokken actief → "In behandeling" → "Weggelegd" blijven intact; er wordt bínnen de blokken gesorteerd. (De blok-indeling per paginaslice in `renderTbody` blijft daardoor kloppen.)
- **VvE-code:** natuurlijke sortering (`localeCompare` met `numeric:true`), zodat 21002 < 110001.
- **Deadline:** via `parseDt`; taken **zonder deadline altijd onderaan**, in beide richtingen.
- **Zichtbaar & toegankelijk:** pijl-indicator in de kop, `aria-sort` op de `<th>`, echte `<button>` (toetsenbord-bedienbaar), focus-stijl.
- Sorteren zet de paginering terug naar pagina 1. De keuze blijft staan bij tabblad-wissel binnen de pagina (elke tab heeft beide kolommen); geen localStorage-persistentie.
- Afgerond-tabel en andere pagina's: bewust ongewijzigd (niet gevraagd).

**Onderdelen:** `state.ntdSort {key:null|'code'|'deadline', asc}` (state.js) · pure functie `sorteerNtd(rows, sort)` + kopsleutel-helper (render-lijsten.js) · `renderThead` krijgt optionele sorteer-parameter (render-tabel.js) · actie `ntd-sorteer` (actions.js) · `.th-sort`-CSS (styles.css).

## 2. Beheerderskenmerken: Gemeenschappelijk / Individueel

Was: "Balkons gemeenschappelijk" met Ja/Nee/Deels/Onbekend. Wordt:

- Labels: **"Balkons"** en **"Kozijnen"**; dropdown-keuzes: **Onbekend / Gemeenschappelijk / Individueel** ('Deels' vervalt — door gebruiker bevestigd, wordt nergens gebruikt).
- **Legacy-normalisatie bij inlezen** (parseKenmerken): Ja → Gemeenschappelijk, Nee → Individueel; andere waarden ongemoeid. Zo blijft een niet-gemigreerde rij correct leesbaar en schrijft de eerstvolgende opslag de nieuwe woorden.
- Pill-kleuren weergavemodus: Gemeenschappelijk = groen, Individueel = leiblauw (accent), Onbekend = grijs.
- **Eenmalige datamigratie** in de Sheet-tab 'Kenmerken' (PROD 4 rijen + TEST): Ja → Gemeenschappelijk, Nee → Individueel; lege cel (= Onbekend) blijft leeg.
- Opslaan blijft: 'Onbekend' wordt als lege cel weggeschreven; audit-regels in het Logboek tonen voortaan de nieuwe woorden (historie blijft zoals gelogd).

## 3. Nieuwe VvE: De La Reyweg 131 t/m 141

- VvE-code **311212** (door gebruiker aangeleverd; past in de 311xxx-reeks waar ook de andere De La Reyweg-VvE's staan).
- Nieuwe rij in tab **"ALV's overzicht"** (= het VvE-register waar zoekveld, taakmodal en per-VvE-pagina uit putten), ingevoegd op de gesorteerde plek (rij 344, tussen 311211 en 321003), in PROD én TEST-Sheet.
- Waarden: code, naam **"VvE De La Reyweg 131 t/m 141"**, Uitnodiging/Notulen/Begroting = FALSE, Opmerkingen leeg. Geen codewijziging nodig.

## Test & uitrol

Testsuite lokaal (no-cache-server, `?test=1`) — baseline (345) + nieuwe tests voor sorteerNtd, kopsleutels, actie-registratie en kenmerken-normalisatie. Uitrol: feat-branch → ff naar `main` (staging blijft geparkeerd spraakmemo-terrein; geen kale merge). Verificatie op de echte prod-URL met cache-buster + testsuite op live URL.
