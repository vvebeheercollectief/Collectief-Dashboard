# Dashboard-chat met zoekfilters — ontwerp (2026-10-08)

Goedgekeurd door de beheerder in drie delen (chat, 8 oktober 2026). Vervolg op de dossier-chat
(`docs/superpowers/specs/2026-06-18-dossier-chat-agent-design.md`).

## Doel
De AI-chat werkt over het hele dashboard in plaats van over één VvE. Een VvE kiezen wordt
optioneel: gekozen = extra filter op alle zoekopdrachten. Vragen die moeten kunnen (alle vier
gekozen): overzicht ("wat is te laat bij Cihad"), zoeken in het logboek, ALV's en offertes,
tellen en vergelijken.

## Gekozen aanpak: zoekfilters in de browser (tool use)
Gemeten op 8-10-2026: de hele Sheet is ±165k tokens (Logboek ±99k). Alles meesturen kost
1-10 cent per vraag en telt slecht. Daarom krijgt Claude zes filters (tools); het dashboard voert
ze uit op de al geladen gegevens (`D`) — geen extra Sheets-leesverzoek — en alleen het resultaat
gaat naar Claude.

| Tool | Bron | Belangrijkste filters |
|---|---|---|
| `zoek_taken` | `D.ntd` (alle tabbladen) | tabblad, behandelaar, VvE, te laat, weggelegd, deadline-periode, zoekwoord, groeperen |
| `zoek_afgerond` | `D.af` | tabblad, behandelaar, VvE, periode, zoekwoord, groeperen |
| `zoek_alvs` | `D.alvo` + `D.alfa` | status, VvE, budget, periode afgerond |
| `zoek_offertes` | `D.ntd['OFFERTE-TRAJECTEN']` | VvE, behandelaar, min. dagen open, binnen (geen/deels/alle) |
| `zoek_logboek` | `D.logboek` | zoekwoord, VvE, periode, soort, medewerker |
| `vve_dossier` | `dossierContextTekst` | VvE-code |

Vaste regels: het filter telt (elk resultaat begint met het exacte aantal), hoogstens 25 regels
per resultaat, alleen de nuttige kolommen.

## Stroom
1. Browser → proxy (`modus:'zoek'`): systeeminstructie (vast, cachebaar) + gesprek. Datum en
   gekozen VvE staan in de vraag zelf, niet in de systeeminstructie (anders breekt de cache).
2. Proxy voegt de vaste tools (`zoek-tools.js`, gedeeld met de frontend zoals `allowed-emails.js`),
   model, effort en `max_tokens` toe en geeft `{content, stop_reason}` terug.
3. Bij `tool_use` voert de browser de filters uit en stuurt `tool_result`s terug (append-only, de
   thinking-blokken onveranderd mee). Hoogstens 4 zoekrondes; de 5e aanroep gaat met
   `tool_choice: none` en de opdracht te antwoorden met wat er is.
4. Na het antwoord bewaart het gesprek alleen vraag + antwoord (geen zoekresultaten).

## Kosten en remmen
Model `claude-haiku-5-5`, effort `low`, top-level `cache_control` (tools + systeem + lopende ronde).
Schatting 3k-6k tokens per vraag (±0,05 cent), zware vraag ±15k. Proxy pint model/tools/limieten;
invoergrenzen op aantal berichten en totale omvang. Tegoed blijft het harde plafond.

## Fouten
Niets gevonden → zeggen, niet verzinnen (bestaande anti-statusinversieregels blijven). Gegevens
nog niet geladen → melding, geen aanroep. Weigering/proxyfout → duidelijke melding. Rondes op →
antwoord met voorbehoud.

## Interface
Titel "Vraag over het dashboard"; VvE-veld optioneel met wisknop; voorbeeldvragen zonder VvE;
VvE-codes in antwoorden klikbaar (`vveCodeSpan`); tijdens zoeken "zoekt in …" zichtbaar.

## Testen en uitrol
Toetsen op elk filter (telling, VvE-filter, 25-regelgrens) en op de lus met een nep-proxy.
Daarna staging, ingelogde test door de beheerder, dan main als v15.0.
