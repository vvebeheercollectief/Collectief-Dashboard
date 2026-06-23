# Ontwerp — Spraakmemo's per taak

- **Datum:** 2026-06-23
- **Status:** Ontwerp ter goedkeuring
- **Auteur:** Claude + Jer
- **Type:** Nieuwe functie (Collectief Dashboard)

## 1. Aanleiding & doel

Bij overdracht van werk (collega op vakantie, een ander neemt over) ontbreekt vaak de
context van een taak. Doel: een teamlid kan **vanaf de telefoon (of PC)** een korte
**spraakmemo** achterlaten op een specifieke taak/item, zodat de collega die het overneemt
hoort hoe het in elkaar zit. De overnemer kan terug-inspreken.

## 2. Vastgelegde keuzes

| # | Keuze | Besluit |
|---|---|---|
| 1 | Soort memo | **Alleen audio** (opnemen + terugluisteren). Geen tekst-transcriptie. |
| 2 | Aantal per item | **Meerdere** memo's per item (lijst, nieuwste boven, met wie + wanneer). Iedereen mag toevoegen → ook terug-inspreken. |
| 3 | Melding | **Push naar de behandelaar** van het item (niet naar de inspreker zelf). Hergebruikt het bestaande meldingssysteem. |
| 4 | Bewaren | **Automatisch opruimen na 30 dagen.** Plus: bij **afronden** een vinkje "memo's direct verwijderen" (aan = meteen weg, uit = nog 30 dagen). |
| 5 | Reikwijdte | **Alle werk-lijsten:** Nog Te Doen (Oppakken, Vergaderverzoeken, Offerte-trajecten, LOD), ALV's overzicht, ALV's afgerond, Ontwikkeling. **Niet** op Logboek/Kenmerken/Herhaalregels (geen taken). |
| 6 | Opslag | **Aanpak A:** privé in jullie eigen Google Drive via een nieuw, token-beveiligd Apps Script "memo-loket". Geen extra OAuth-toestemming, geen derde partij. |

## 3. Reikwijdte

**In scope:**
- Opnemen van audio in de browser (telefoon en PC), max. 2 minuten per memo.
- Veilig opslaan in één centrale Drive-map (eigendom bedrijfsaccount).
- Lijst van memo's per item, afspelen, terug-inspreken, verwijderen.
- Teller-badge op items die memo's hebben.
- Push + in-app melding naar de behandelaar bij een nieuw memo.
- Automatisch opruimen (30 dagen) + directe verwijdering via afrond-vinkje.

**Niet in scope (bewust, YAGNI):**
- Automatische tekst-uitwerking (transcriptie) van de spraak.
- Memo's op Logboek, Kenmerken, Herhaalregels.
- Bewerken van een bestaand memo (wel verwijderen).
- Memo's op afgeleide weergaven (Vandaag/Analytics) — die tonen wél de badge van het onderliggende item.

## 4. Architectuur

```
[Browser PWA]                         [Apps Script "memo-loket"]            [Google Drive]
  MediaRecorder  --uploadmemo-------->  doPost: token→tokeninfo→aud→allowlist  --> map "Spraakmemo's/"
  (audio + token)                       schrijft Drive-bestand                     (bedrijfsaccount)
                                        + rij in tab "Spraakmemo's"
                                        + meldings-event (push behandelaar)
  <audio>        <--getmemo (base64)--  doPost: leest Drive-blob, geeft base64
  afronden+vink  --deletememo--------->  doPost: trasht bestanden + rijen
                                        [tijd-trigger dagelijks] cd_cleanupMemos: >30 dagen weg
```

- **Front-end:** neemt op, uploadt, leest de metadata-tab (via de bestaande Sheets-API), toont
  lijst + badge, speelt af.
- **Memo-loket (Apps Script):** één publiek web-app-endpoint (`doPost`) met **token-auth**, dat de
  Drive-opslag, metadata en melding centraal en als bedrijfsaccount afhandelt.
- **Opslag:** audio in Drive (centraal, bedrijfseigendom); metadata in een Sheet-tab; identiteit
  via een verborgen ID per item.

## 5. Beveiliging (memo-loket)

Spiegelt exact `api/chat.js`:
1. Front-end stuurt het Google **OAuth access-token** mee in de POST-body (Apps Script web-apps
   geven request-headers niet door, dus via de body).
2. Loket valideert via `https://oauth2.googleapis.com/tokeninfo?access_token=…` (weigert
   verlopen/ongeldig token).
3. Controleert `aud` === de dashboard-client-id (`clientId` uit `config.js`) → blokkeert tokens
   van andere OAuth-apps (confused-deputy).
4. Controleert `email` ∈ `ALLOWED_EMAILS`.
5. Pas daarna: Drive-schrijven / -lezen / -verwijderen.

Geen gedeeld secret in de (publieke) front-end. Web-app gedeployed als "uitvoeren als eigenaar,
toegang: iedereen" — de token-controle is het slot. Dit staat naast de bestaande
`CD_WEBHOOK_SECRET`-route (mail-intake), die ongewijzigd blijft.

## 6. Identiteit van een item (koppeling memo ↔ taak)

Items hebben nu geen stabiel ID; rijen verschuiven en teksten kunnen wijzigen. Daarom krijgt elk
item waarop een memo wordt achtergelaten **eenmalig (lazy) een onzichtbaar ID** in een vaste,
verborgen kolom per lijst:

| Lijst (sheet) | Data vanaf rij | ID-kolom (0-based index) |
|---|---|---|
| Nog Te Doen | secties, zie parser | **Q** (16) |
| ALV's overzicht | rij 3 | **G** (6) |
| ALV's afgerond | rij 2 | **D** (3) |
| Ontwikkeling | rij 2 | **G** (6) |

- ID-vorm: `IT-<base36 tijd>-<4 random>` (uniek, kort, geen botsing). Memo's hebben een eigen
  `M-…`-ID (kol B); een item heeft een `IT-…`-ID (kol F) — bewust verschillende prefixen.
- **Lazy toekenning:** bij het eerste memo op een item leest de front-end het ID-veld; is het leeg,
  dan genereert hij er een en schrijft die in de ID-kolom van die rij (`writeRange` + bestaande
  `assertRowMatch`-bescherming tegen verschoven rijen). Daarna verwijst het memo ernaar.
- Een memo-metadata-rij bewaart **zowel** het ID **als** de natuurlijke sleutel (lijst + code +
  taaktekst-snapshot) als vangnet voor weergave.
- Bij afronden/verplaatsen naar een "afgerond"-tab gaat het ID verloren (die tabs hebben de kolom
  niet); de memo's blijven in de metadata-tab en worden door de 30-dagen-opruiming (of het
  afrond-vinkje) afgehandeld.

**Aandachtspunten per lijst:**
- ALV's overzicht heeft checkbox-kolommen (C/D/E) waarop `onEdit` (`verplaatsALV`, kolom 4) reageert
  en stat-/totaalrijen onderaan. ID in kolom G raakt die triggers niet; ID's worden alleen
  toegekend aan echte items (rij met geldige code), niet aan stat-rijen.
- Grid-breedte moet de ID-kolom bevatten (zie §12). Net als bij de offerte-uitbreiding eerst het
  grid verbreden, anders faalt de schrijfactie.

## 7. Datamodel — tab "Spraakmemo's"

Nieuw tabblad, één rij per memo:

| Kol | Veld | Voorbeeld |
|---|---|---|
| A | Timestamp (ISO) | `2026-06-23T09:12:04.000Z` |
| B | MemoID (uniek) | `M-lt3x9-a4f2` |
| C | Lijst (sheet-sleutel) | `NTD` / `ALVO` / `ALFA` / `ONTW` |
| D | VvE-Code | `VVE-0142` |
| E | Sectie (bij NTD) | `OPPAKKEN` |
| F | ItemID (verborgen ID v/h item) | `IT-lt3x9-a4f2` (uit §6) |
| G | Itemtekst-snapshot | `Lekkage kelder onderzoeken` |
| H | Ingesproken door | `Jer` |
| I | Drive-File-ID | `1AbC…` |
| J | Duur (sec) | `7` |
| K | MIME-type | `audio/webm` of `audio/mp4` |
| L | Status | leeg = actief / `VERWIJDERD` |

De **audio zelf** staat in Drive, niet in de Sheet (Sheet-cellen zijn te klein voor audio).

## 8. Dataflow per scenario

**Opnemen & versturen:**
1. Gebruiker tikt op de microfoon-knop bij een item → `getUserMedia` → `MediaRecorder`.
2. Stop (of 2 min) → audio-blob. ID van het item gegarandeerd (lazy, §6).
3. POST naar loket: `{action:'uploadmemo', token, list, code, sectie, itemID, snapshot, duur, mime, audioB64}`.
4. Loket: auth → Drive-bestand in map "Spraakmemo's" → rij in tab "Spraakmemo's" → meldings-event.
5. Front-end: optimistische toevoeging aan de lijst + toast "Memo verstuurd".

**Melding:** loket roept dezelfde meldingskern aan als de andere events
(`cd_processNotifEvent`), nieuw event `newmemo`: push **alleen** naar de behandelaar(s) van het item
(`cd_notifyByExternalId`), niet naar de inspreker (`actor`), en schrijft een rij in "Meldingen" zodat
de in-app-toast bij de juiste persoon verschijnt. Nieuw type `n_memo` (icoon/kleur + voorkeurstoggle).

**Afspelen:** front-end vraagt `getmemo` (op aanvraag) → loket geeft base64 → front-end maakt
`Blob` + object-URL → `<audio>`. Object-URL wordt per sessie gecachet (niet bij elke render
opnieuw ophalen). Privé: geen openbare Drive-links.

**Afronden:** bestaande afrond-actie + checkbox "memo's direct verwijderen".
- Aangevinkt → front-end roept `deletememo` aan voor dit item (loket trasht Drive-bestanden +
  markeert/verwijdert metadata-rijen).
- Niet aangevinkt → niets extra's; de 30-dagen-trigger ruimt later op.

**Opruimen:** dagelijkse Apps Script tijd-trigger `cd_cleanupMemos`: voor elke metadata-rij ouder
dan 30 dagen → Drive-bestand naar prullenbak + rij verwijderen. Centraal bedrijfseigendom maakt dit
betrouwbaar (geen rechten-probleem).

## 9. UI / UX

- **Microfoon-knop** bij elk item: in de uitgeklapte taakregel (PC, bestaande
  `state.expandedRows`-uitklap) én op de telefoon-/per-VvE-weergave. Zichtbaar, niet verstopt.
- **Teller-badge** (mic-icoon + aantal) op items met memo's, in één oogopslag zichtbaar in de
  lijst. Hergebruikt de bestaande icoon-stijl (inline SVG, conform `DASH_ICONS`).
- **Memo-lijst** in de uitklap: per memo avatar/initialen + naam + datum/tijd + audiospeler
  (afspeel/pauze, voortgangsbalk, duur) + verwijderknop. Onderaan "Memo inspreken".
- **Opname-paneel:** microfoon-knop, lopende teller, golfvorm-indicatie, "stoppen & versturen".
- **Afrond-modal:** checkbox "Spraakmemo's van deze taak direct verwijderen" met wisselende
  helptekst (30 dagen ↔ direct verwijderd), zoals in de goedgekeurde animatie.
- **Stijl:** leiblauw accent (`--ac` #4a5b7a), IBM Plex, bestaande knop-/badge-klassen. Geen badges
  boven headings; geen dot-grid. Toegankelijk (knoppen = echte `<button>`, aria-labels, focus).
- **Mobiel:** opnemen werkt op iOS Safari en Android Chrome (zie §11).

## 10. Front-end opbouw

Nieuw, op zichzelf staand module: **`src/spraakmemo.js`** (≈ recorder + player + upload + render),
met kleine, geïsoleerde verantwoordelijkheid en testbare pure helpers. Integratiepunten:

- `src/data.js` `loadAll`: extra `fetchSheet('Spraakmemo's')` in de `Promise.all`; `D.memos`
  vullen (geparset + gegroepeerd per `list|itemID`); opnemen in de render-hash.
- Parsers (`parseSections`, `parseAlvo`, `parseAlfa`, `parseOntw`): lees het ID-veld uit de
  ID-kolom per lijst; zet op het item-object (`itemId`).
- Render (`render-tabel.js` / `render-lijsten.js` / `render-vve.js` / `render-overig.js`/ALV):
  badge + uitklap-sectie aanroepen vanuit `spraakmemo.js`.
- `src/api.js`: nieuwe helper `callMemoLoket(action, payload)` (POST naar `APPS_SCRIPT_URL` met
  token), met `_withRetry` voor transient fouten.
- `src/config.js`: `APPS_SCRIPT_URL_PROD/TEST`, `MEMO_MAX_SEC = 120`, `MEMO_RETENTIE_DAGEN = 30`.
- `src/crud.js` afrond-pad: bij checkbox → `deletememo` aanroepen ná succesvolle afronding.
- `APP_VERSION` ophogen (zichtbaar) bij livegang.

## 11. Foutafhandeling & randgevallen

- **Geen mic-toestemming / geblokkeerd:** nette uitleg, geen crash; knop teruggezet.
- **Upload mislukt (netwerk/401):** toast "niet verzonden — probeer opnieuw"; opname-blob blijft
  in geheugen zodat opnieuw versturen kan; bij 401 token verversen (bestaand `ensureToken`).
- **iOS Safari:** `MediaRecorder` levert daar `audio/mp4`; kies mime via
  `MediaRecorder.isTypeSupported` (webm/opus → mp4/aac fallback). MIME wordt opgeslagen (kol K) zodat
  afspelen het juiste type gebruikt.
- **Item hernoemd:** memo blijft gekoppeld via het verborgen ID.
- **Te lange opname:** stopt automatisch op 120 s.
- **Verschoven rij bij ID-schrijven:** `assertRowMatch` vangt het af (resync, nette melding).
- **Loket onbereikbaar:** afspelen/opnemen faalt met duidelijke melding; rest van het dashboard
  blijft werken.

## 12. Sheet-/grid-wijzigingen (TEST én PROD)

- Tab **"Spraakmemo's"** aanmaken (kolommen A–L, §7) in beide Sheets.
- Grid verbreden zodat de ID-kolom bestaat: Nog Te Doen ≥ 17 kol (Q), ALV's overzicht ≥ 7 (G),
  ALV's afgerond ≥ 4 (D), Ontwikkeling ≥ 7 (G).
- Drive-map **"Spraakmemo's"** aanmaken onder het bedrijfsaccount; map-ID in Script Properties.
- Dagelijkse tijd-trigger voor `cd_cleanupMemos` instellen.

## 13. Privacy / AVG

Audio + metadata blijven in jullie eigen Google Workspace (Drive + Sheet). Geen derde partij,
geen training op de data. Afspelen alleen voor ingelogde teamleden (allowlist via het loket). Memo's
worden binnen 30 dagen (of direct bij afronden) verwijderd → dataminimalisatie.

## 14. Testen

- **Unit (`src/tests.js`-stijl):** parser leest ID-kolom; groepering memo's per item; teller per
  item; ID-generator (vorm/uniek); helptekst-logica afrond-vinkje; payload-bouw upload; mime-keuze.
- **Backend:** `cd_processNotifEvent('newmemo')` stuurt naar behandelaar, niet naar actor;
  `cd_cleanupMemos` selecteert >30 dagen correct; auth weigert verkeerde `aud`/onbekende e-mail.
- **Handmatig (staging):** opnemen op telefoon (iOS + Android) → afspelen op PC; melding bij
  behandelaar; terug-inspreken; afronden met/zonder vinkje; 30-dagen-opruiming (met verlaagde
  drempel testen).

## 15. Deployment

- Front-end + `api/` via bestaande CI (staging→TEST, main→PROD).
- Apps Script via bestaande clasp/CI-deploy; **web-app-deployment-URL** noteren en in
  `config.js` zetten (`APPS_SCRIPT_URL_*`).
- Volgorde: Sheets/grid/Drive-map klaarzetten → backend → front-end → versie ophogen → verifiëren op
  staging → cherry-pick/merge naar main.

## 16. Risico's / open punten

- Eerste keer toekenning ID schrijft naar de werk-sheet: getest via `assertRowMatch`, maar extra
  let op bij ALV-checkbox-triggers.
- Afspelen via base64-loket voegt latency toe; voor korte memo's verwaarloosbaar, met sessie-cache.
- Web-app-URL moet per (her)deployment kloppen in config.
