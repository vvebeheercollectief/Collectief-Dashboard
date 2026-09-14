---
name: vve-onboarding
description: "Gebruik deze skill zodra een nieuwe VvE akkoord geeft op het beheer en het dossier moet worden opgestart. Triggers: \"nieuwe VvE\", \"onboarding\", \"VvE akkoord\", \"beheer overnemen\", \"beheerwissel\", \"VvE opstarten\", \"overdracht oude beheerder\"."
---

# VvE Onboarding — nieuwe VvE opstarten

De vaste procedure van VvE Beheer Collectief vanaf het moment dat een VvE akkoord
geeft tot het dossier is overgedragen aan de vaste beheerder. Dit bestand is de
bron; `docs/onboarding-nieuwe-vve.html` is dezelfde procedure in huisstijl voor
intern gebruik. **Wijzig je iets, werk dan beide bij.**

> **Status: v0.9 — nog niet compleet.** De blokken gemarkeerd met ⚠️ zijn nog niet
> vastgesteld. Kom je daar in de praktijk tegenaan, vul dan niets zelf in maar
> vraag het aan het team.

## Rolverdeling

| Fase | Wie |
|------|-----|
| Onboarding (fase 1 t/m 5) | Gabos en Cihan |
| Dossier na afronding | Cihad en Jer |

De onboarding is pas klaar ná het interne overdrachtsgesprek. Tot dat moment
blijven Gabos en Cihan eigenaar van alle openstaande stappen.

## Fase 1 — Akkoord vastleggen

1. **Beheerovereenkomst ter ondertekening** naar het bestuur; retour ontvangen en
   de **ingangsdatum van het beheer** vastleggen. Die datum is het anker voor de
   rest van de planning.
2. **Bevestiging naar het bestuur** met de vervolgstappen en de planning.
3. **VvE aanmaken in Twinq**, zodat alles vanaf dag 1 in het systeem loopt.

## Fase 2 — Oude beheerder

- **De VvE zegt zelf op bij de oude beheerder.** Wij versturen de opzegging niet
  namens de VvE. Wij leveren desgewenst een voorbeeldbrief en bewaken de
  opzegtermijn en de einddatum.
- ⚠️ **Nog vast te stellen:** opvragen van het overdrachtsdossier (notulen,
  contracten, MJOP, jaarstukken, eigenarenlijst, polissen), de financiële
  overdracht (banksaldo, reservefonds, debiteuren/crediteuren, lopende incasso's)
  en of er een overdrachtsgesprek met de oude beheerder plaatsvindt.

## Fase 3 — Inrichting

- **Verzekeringen en lopende leverancierscontracten** controleren en overzetten of
  heronderhandelen.
- ⚠️ **Nog vast te stellen:** bankrekening en incasso van de servicekosten,
  eigenaren- en debiteurenadministratie, en het overnemen van begroting en MJOP.

## Fase 4 — Documenten

Alles richting eigenaren gaat via **Twinq — "Berichten namens VvE"**, nooit via
Gmail (zie skill `vve-bericht-versturen`).

**Naar het bestuur**

| Document | Inhoud |
|----------|--------|
| Beheerovereenkomst | Diensten, tarieven, ingangsdatum, opzegtermijn |
| Welkomstbrief | Contactgegevens, wie de beheerder is, bereikbaarheid |
| Uitleg Twinq-portaal | Bestuurstoegang: dossier, facturen, meldingen, documenten |

**Naar de individuele eigenaren**

| Document | Inhoud |
|----------|--------|
| Aankondiging beheerwissel | Dat wij het beheer overnemen, per welke datum, met contactgegevens |
| Portaaltoegang | Uitnodiging/inloggegevens voor het eigenarenportaal in Twinq |
| Betaalinstructie | Bankgegevens, bijdrage per maand en betaalmoment |

**Timing:** het eigenarenbericht gaat pas eruit **ná de overdracht door de oude
beheerder**, zodat het bericht compleet en kloppend is. Niet eerder versturen,
ook niet op verzoek — een half bericht levert dubbele vragen op.

## Fase 5 — Overdracht en afronding

1. **Startnotitie in het VvE-dossier**: bijzonderheden, gemaakte afspraken en wat
   er nog loopt.
2. **Intern overdrachtsgesprek**: Gabos en Cihan dragen het dossier over aan
   Cihad en Jer.
3. **De onboarding is afgerond ná dat gesprek.** Niet eerder — ook niet als alle
   losse stappen al afgevinkt zijn.

## Doorlooptijd

Richttermijn **4 weken** vanaf akkoord, met de **ingangsdatum van het beheer** als
leidend moment. Geen harde norm: de bewaking zit op de losse stappen, niet op de
totale doorlooptijd. Loopt een stap vast (meestal de overdracht door de oude
beheerder), meld dat in het wekelijks overleg in plaats van de termijn op te rekken.

## Bewaking

- **Collectief Dashboard** — lopende onboardings met deadline per stap.
  ⚠️ Hiervoor komt een apart tabblad; dat is nog niet gebouwd.
- **Actiepunten in Twinq** — per VvE, via de skill `vve-actiepunten`.
- **Wekelijkse bespreking** — lopende onboardings staan vast op de agenda.

## Open punten (v0.9)

1. Stappen richting de oude beheerder: dossieropvraag, financiële overdracht,
   overdrachtsgesprek.
2. Inrichting: bankrekening en incasso, eigenaren- en debiteurenadministratie,
   begroting en MJOP.
3. Onboarding-tabblad in het Collectief Dashboard.
4. Doorlooptijd: de richttermijn van 4 weken is een werkaanname en nog niet
   definitief bevestigd.
