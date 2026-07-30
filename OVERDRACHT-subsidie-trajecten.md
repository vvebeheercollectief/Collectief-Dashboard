# Subsidie-trajecten — waar we staan

**Voor:** Jer · **Bijgewerkt:** 30 juli 2026
**Korte versie:** het draait op productie. Er staan nog twee dingen open, allebei van jou.

---

## Live op productie

- **Versie 10.1 / cache cd-v96** op [vvebeheercollectief.github.io/Collectief-Dashboard](https://vvebeheercollectief.github.io/Collectief-Dashboard/)
- Apps Script is meegedeployed via de CI (run geslaagd)
- **901 tests groen**, nul fouten
- Sheet "Nog Te Doen": blokkop rij **103**, kolomkoppen rij **104**, rooster 163 rijen
- Sheet "Afgerond": blokkop rij **230**, kolomkoppen rij **231**
- De vier losse aantekeningen in kolom B zijn verwijderd (op jouw verzoek)

De uitrolvolgorde is aangehouden: eerst de code live en geverifieerd, daarna pas het blok in de Sheet. Zo heeft niemand ook maar even "SUBSIDIE-TRAJECTEN" tussen de LOD-taken zien staan.

De opmaak van het blok is niet nagebouwd maar letterlijk uit jouw kopie-Sheet gekopieerd, inclusief kleuren en vinkvakjes.

---

## Wat nog van jou is

**De omschrijving per traject.** In kolom "Subsidie" staat nu overal `Subsidieaanvraag`. Vervang dat door waar het echt over gaat ("SVVE isolatie", "gemeente dakisolatie") — zes velden, zo gedaan. Het oorspronkelijke actiepunt is niet weggegooid: dat staat nu bij Opmerkingen.

**De fase nalopen.** Ik heb 311059 op *Voorbereiden* gezet (die is net aangemeld via de aanmeldlink) en de andere vijf op *In behandeling*, omdat er bij alle vijf "in afwachting van subsidie" stond. Klopt dat niet, dan is het één klik op een bolletje.

---

## De zes verhuisde trajecten

| VvE | Fase | Rij |
|---|---|---|
| 381105 · Schlegelstraat 18-20-22 | In behandeling | 99 |
| 311028 · Naarderstraat 107 t/m 117 | In behandeling | 100 |
| 381017 · Van Musschenbroekstraat 31/33/35 | In behandeling | 103 |
| 311059 · Nunspeetlaan 355 t/m 365 | Voorbereiden | 101 |
| 311122 · Harderwijkstraat 161-163-165 | In behandeling | 104 |
| 301042 · Steijnlaan 189/191/193 | In behandeling | 102 |

Deze vijf blijven bewust staan waar ze staan, omdat subsidie daar alleen als *mogelijkheid* wordt genoemd: 361023 (Troelstrakade), 301074 (Herman Costerstraat), 311198 (Hoenderloostraat), 381025 (Pasteurstraat 85), 301065 (Kaapstraat). Blijkt er later een echt traject uit te komen, dan zet je bij die taak de subcategorie op *Subsidie-trajecten* en verschijnt hij onderaan het subsidie-tabblad in het lijstje "Ook hier" — zonder uit zijn eigen scherm te verdwijnen.

---

## Twee dingen die ik onderweg heb gevonden en gerepareerd

**Een gat bij het toevoegen.** Zoals hierboven beschreven: stond het sectieblok nog niet in de Sheet, dan belandde een nieuwe taak middenin Oppakken zonder dat iemand het merkte. Dat gold voor élke nieuwe sectie, niet alleen deze. Nu een duidelijke weigering.

**Een sorteerfout die op de loer lag.** LOD was altijd het laatste blok in de Sheet en werd gesorteerd als "alles onder de LOD-kop". Met een blok eronder zou LOD de subsidierijen mee gaan sorteren. Dat is nu netjes begrensd, en het subsidieblok krijgt zijn eigen sortering op deadline.

**Opgeruimd:** `SEC_ICONS` en `SEC_THEMES` waren restanten die nergens meer gebruikt werden. Weg, in plaats van er een vijfde icoon in te hangen dat toch niet getoond wordt.

---
