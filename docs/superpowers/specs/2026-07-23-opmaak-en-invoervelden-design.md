# Opmaak en invoervelden — ontwerp

**Datum:** 2026-07-23
**Status:** goedgekeurd door gebruiker

Vier losse verbeterpunten uit dagelijks gebruik. Punt 1 en 2 staan op zichzelf;
punt 3 en 4 zijn hetzelfde onderliggende probleem en krijgen één gedeelde oplossing.

## 1. Dubbele tekst op het inlogscherm

`index.html` toont boven de knop "Inloggen met Google" de regel
"Log in met je VvE Beheer Collectief account". Er bestaat geen VvE Beheer
Collectief-account — inloggen gaat via Google — dus de regel is zowel onjuist als
dubbelop met de knop eronder.

**Besluit:** de regel verdwijnt zonder vervanging. Het inlogscherm wordt
logo → knop → versienummer.

## 2. Logboekveld in het VvE-dossier is te ondiep

`#dos-tekst` staat op `rows="2"` (min-hoogte 44px). Bij meer dan twee regels zie
je een klein venster op je eigen tekst, wat lezen en corrigeren lastig maakt.

**Besluit:** het veld groeit mee met de inhoud. Startpunt ~3 regels, groeit tot
maximaal ~12 regels, daarna scrollt het van binnen.

Een vast dieper veld is afgewezen: het dossier is bewust zo gebouwd dat de pagina
zelf niet scrollt (drie panelen met elk een eigen scroll). Een altijd-hoog veld
kost dan permanent ruimte in het geschiedenis-paneel, ook als het leeg is.

Meegroeien geldt voor alle velden uit punt 3/4, zodat ze zich hetzelfde gedragen.

## 3 + 4. Opmaak in het logboekveld en in Bron

Beide velden zijn gewone `<textarea>`-elementen. Die kennen alleen platte tekst:
opmaakknoppen zijn er niet (punt 3) en geplakte opmaak uit Word of e-mail wordt
weggegooid (punt 4). De weergavekant escapet de tekst met `esc()` en toont hem
plat.

### Opslagvorm: tekens in de tekst, geen HTML

De opslag is een cel in een Google Sheet. Opmaak wordt daarom als leestekens in
de tekst zelf opgeslagen:

| Weergave | Opgeslagen |
|---|---|
| **vet** | `**vet**` |
| *schuin* | `_schuin_` |
| • opsommingsregel | `- opsommingsregel` |

Overwogen alternatief: HTML in de cel opslaan. Afgewezen omdat de Sheet dan
onleesbaar wordt voor een mens, omdat het opschonen van geplakte HTML een
doorlopende veiligheidsverplichting wordt, en omdat de bestaande volgorde
(escapen, dán opmaken) juist garandeert dat er nooit vreemde HTML in beeld komt.

Prijs van deze keuze: in de Sheet zelf zie je de sterretjes staan.

Dubbele sterretjes voor vet en liggende streepjes voor schuin zijn bewust
gekozen: bestaande notities met één sterretje (`3*4`, een handmatig getypt
opsommingsteken) veranderen daardoor niet van betekenis.

### Weergave

Eén pure functie zet opgeslagen tekst om naar veilige HTML, in deze volgorde:

1. `esc()` — alle tekens onschadelijk maken (ongewijzigd bestaand gedrag)
2. markeringen omzetten naar `<strong>`, `<em>` en `<ul><li>`

Omdat stap 1 vóór stap 2 komt, kan geen enkele geplakte of getypte invoer eigen
HTML de pagina in krijgen.

### Invoer

Onder elk veld komt een knoppenbalkje met **B**, *I* en een lijstknop.
Sneltoetsen: Ctrl/Cmd+B en Ctrl/Cmd+I. De knoppen werken op de selectie; zonder
selectie zetten ze een leeg paar markeringen neer met de cursor ertussen.

### Plakken

Bij plakken leest de app `text/html` van het klembord — dat zet elk
besturingssysteem daar naast de platte tekst neer. Vet, schuin en opsommingen
worden omgezet naar de markeringen hierboven; al het andere (kleuren,
lettertypen, tabellen, afbeeldingen) valt weg, want dat is in een Sheet-cel niet
houdbaar. Staat er geen HTML op het klembord, dan gedraagt plakken zich als nu.

### Toepassingsgebied

Vier plekken, allemaal met hetzelfde probleem:

1. de logboek-composer in het VvE-dossier (`#dos-tekst`)
2. het bewerkformulier van een logregel (`.log-edit-tekst`) — dat rendert zowel
   in het dossier als op de Logboek-pagina; het is dezelfde component
3. **Bron** onder de beheerderskenmerken (`#kmk-bron`)
4. het opmerkingenveld in de taak-popup (`#hist-note`)

Nummer 4 zat niet in de oorspronkelijke vraag, maar schrijft naar hetzelfde
logboek en wordt getoond via dezelfde `.log-note`. Zonder aansluiting zouden daar
letterlijke sterretjes verschijnen.

### AI-context

`ai.js` en `dossier-chat.js` sturen logboektekst als platte tekst naar het model.
De markeringen worden daar weggefilterd, zodat de assistent ze niet gaat
voorlezen of nabootsen.

## Architectuur

Eén nieuwe module `src/opmaak.js`:

| Naam | Soort | Taak |
|---|---|---|
| `opmaakHtml(tekst)` | puur | escapen + markeringen → veilige HTML |
| `htmlNaarMarkers(html)` | puur | klembord-HTML → markeringen |
| `zonderOpmaak(tekst)` | puur | markeringen eruit, voor AI-context |
| `pasToe(tekst,start,eind,soort)` | puur | knopdruk toepassen op een selectie |
| `initOpmaak()` | DOM | eenmalige delegatie: sneltoetsen, plakken, meegroeien |
| `groeiVelden(root)` | DOM | hoogtepas na elke render |

De vier pure functies zijn los testbaar. `initOpmaak` wordt één keer aangeroepen
bij het opstarten; `groeiVelden` na elke render, omdat de 8-secondenpoll de velden
opnieuw tekent en de meegroei-hoogte dan weg is.

Aanhaken gebeurt via een omhullend element `.opmaak-veld` rond textarea plus
knoppenbalk; de knoppen vinden hun eigen textarea via `closest()`. Zo werkt
dezelfde code voor alle vier de velden, ook als er twee tegelijk in beeld staan
(dossier en Logboek-pagina renderen allebei mee).

## Randgevallen

- **Bestaande notities.** Tekst met één sterretje of een los liggend streepje
  midden in een zin blijft ongewijzigd; alleen de expliciete patronen worden
  omgezet.
- **De 8-secondenpoll.** Die tekent het dossier opnieuw. Half getypte tekst wordt
  al bewaard en teruggezet; de meegroei-hoogte moet daarna opnieuw worden
  toegepast.
- **Zoeken in het commandopalet** filtert op de opgeslagen tekst. Een zoekterm
  die precies over een markering heen valt, vindt zijn regel niet meer. Zeldzaam
  genoeg om te accepteren.
- **Lege regels blijven behouden** — `.log-note` heeft `white-space:pre-wrap` en
  dat blijft zo, zodat geplakte e-mail zijn witregels houdt. Een opsommingsblok
  zet die regelafbreking binnen het blok uit.

## Testen

De drie pure functies krijgen tests in de bestaande suite (nu 581): omzetting
heen en weer, veiligheid (geen HTML-doorlaat), bestaande tekst blijft ongemoeid,
en opsommingen rond witregels. Daarna visuele controle via het bestaande
login-loze recept (`?test=1`), en pas dan naar productie.
