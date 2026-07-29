# Proef fase 4 — welk merkteken blijft bij zijn taak?

**Gemeten:** 2026-07-29, op de TEST-Sheet (`1-6Q36…ljm4`), via het staging-dashboard v9.5 met het
eigen OAuth-token van de app. Alles op een wegwerp-tabblad `PROEF-fase4`; geen enkel bestaand
tabblad is aangeraakt. Het tabblad is na afloop verwijderd — de TEST-Sheet staat weer op zijn
oorspronkelijke elf tabbladen.

**Opzet:** acht rijen, elk met een sleutel in kolom A (`V1`…`V8`), een sorteerbare tekst in
kolom C (`taak-1`…`taak-8`), een nummer in de verborgen kolom Q (`Q1`…`Q8`) én een
DeveloperMetadata-record op de rij-dimensie (`M1`…`M8`, sleutel `proef_tid`,
zichtbaarheid `DOCUMENT`). Vóór elke meting werd het tabblad weggegooid en opnieuw opgebouwd,
zodat de metingen elkaar niet konden vervuilen.

**Meetregel:** rij `V3` hoort `Q3` én `M3` te dragen. Elke andere combinatie is fout.

## Uitkomst

| | Bewerking | Kolom Q | DeveloperMetadata |
|---|---|---|---|
| O1 | `insertDimension` bóven de rij (`inheritFromBefore:true`) | ✅ 8/8 | ✅ 8/8 |
| O2 | `deleteDimension` van een rij erboven | ✅ 7/7 | ✅ 7/7 |
| O3 | `sortRange` over **A:I** — precies wat `sorteerOfferteTrajecten` doet | ❌ **0/8** | ❌ **0/8** |
| O3b | `sortRange` over **A:J** | ❌ 0/8 | ❌ 0/8 |
| O3c | `sortRange` over **A:P** (Q er net buiten) | ❌ 0/8 | ❌ 0/8 |
| O4 | `sortRange` over **A:Q** (volledige databreedte) | ✅ 8/8 | ✅ 8/8 |
| O4b | `sortRange` over **A:T** (hele raster) | ✅ 8/8 | ✅ 8/8 |
| O5 | `cutPaste` van een hele rij naar een andere regel | ✅ 8/8 | ❌ **7/8** |
| O6 | Drive-kopie van het hele bestand (de back-up uit fase 1) | ✅ 8/8 | ✅ 8/8 |
| H1 | Erft een ingevoegde rij de Q-waarde van de rij erboven? | nee — leeg | — |
| H2 | Erft een ingevoegde rij de metadata van de rij erboven? | — | nee — geen record |

## Wat er anders liep dan verwacht

**1. Sorteren breekt niet één mechanisme, maar allebei — of geen van beide.** De verwachting
vooraf was dat een verborgen kolom Q zou wegzakken bij een sortering en dat metadata zou
meeschuiven. Dat klopt niet. Wat telt is de **breedte van het sorteerbereik**, niet het
mechanisme:

- Dekt het sorteerbereik **niet** alle kolommen waar data in staat (A:I, A:J, A:P), dan
  herschikt Sheets alleen de celwaarden binnen dat bereik. De rij-dimensie blijft fysiek staan.
  Kolom Q blijft liggen én de metadata blijft liggen. Beide raken los van hun taak, alle acht.
- Dekt het sorteerbereik **wel** de volledige databreedte (A:Q of breder), dan verhuizen de
  rijen zelf. Kolom Q gaat mee én de metadata gaat mee. Beide blijven correct, alle acht.

De grens ligt exact bij de laatste gevulde kolom: A:P faalt, A:Q slaagt.

Dit is de belangrijkste uitkomst van de proef, want het schrapt de veronderstelde tegenstelling
uit de spec. Het verbreden van `sorteerOfferteTrajecten` van negen naar de volle breedte is
**geen kostenpost van kolom Q** — het is een voorwaarde voor allebei.

**2. Knippen en plakken is het enige echte verschil.** Bij een `cutPaste` van een hele rij
verhuist kolom Q mee (de waarde zit in het geknipte bereik), maar de metadata blijft achter op de
oude rij-index. Die achterblijver verdwijnt niet: hij hangt daarna als weesrecord aan een lege
regel. Van de acht records klopten er nog zeven; het achtste hoorde bij niemand meer.

Dit is precies de bewerking die in fase 0, taak 0.4 moest worden opgeruimd — een met de hand
verplaatste rij. Het is dus geen theoretisch scenario.

**3. Het open risico rond de back-up is dicht.** Voor `makeCopy` was geen enkele documentatie te
vinden. De meting laat zien dat een Drive-kopie álle acht metadata-records meeneemt, mét de
juiste rij-indexen, en uiteraard ook kolom Q. Een herstel uit de back-up van fase 1 levert dus
taken mét identiteit op, welk mechanisme er ook gekozen wordt.

**4. Geen risico op dubbele nummers bij invoegen.** Een `insertDimension` met
`inheritFromBefore:true` erft opmaak en validatie, maar géén celwaarde in Q en géén
metadata-record. De nieuwe rij komt schoon binnen.

## Aanbeveling

**Kolom Q**, met het sorteerbereik van `sorteerOfferteTrajecten` verbreed naar de volle
databreedte.

De twee mechanismen gedragen zich op zes van de zeven bewerkingen identiek. Op de zevende —
knippen en plakken — wint kolom Q, en dat is nou juist de bewerking die in dit bestand
aantoonbaar voorkomt. Daar komt bij dat kolom Q zichtbaar is en met de hand te repareren, gratis
meekomt in de bestaande poll (de leesweg haalt hele tabbladen op, zonder kolombegrenzing) en geen
extra leesverzoek per poll kost, terwijl metadata onzichtbaar is, alleen via een tweede
API-aanroep te lezen valt, en in dit project nog nooit is gebruikt.

Metadata heeft één voordeel dat kolom Q niet heeft: schrijven zonder de rij-index te kennen, via
`values:batchUpdateByDataFilter`. Dat is echte winst — maar hij weegt niet op tegen een merkteken
dat een handmatig geplakte rij niet overleeft, terwijl juist zulke rijen de aanleiding voor deze
hele fase waren.

**Wat de gebruiker hierover moet besluiten, staat in taak 4.1 stap 5 van het plan.** Twee van de
drie vragen zijn door deze proef feitelijk beantwoord; de derde (mag het raster van productie van
16 naar 17 kolommen) blijft open.
