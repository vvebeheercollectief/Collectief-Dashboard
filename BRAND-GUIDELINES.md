# VvE Beheer Collectief — Huisstijl

Eén huisstijl voor de website, het dashboard, documenten en e-mail. Bijgewerkt oktober 2026 (dashboard v14.4).
De kleuren komen van de website ("Richting D"). Het dashboard gebruikt dezelfde kleuren, maar een eigen, rustige letter (zie §3).

Vervangt de eerdere versie met teal, DM Sans en Phosphor-iconen. Die is niet meer geldig.

## 1. Logo

Twee handen die elkaar vasthouden onder een dak, met de woorden VVE BEHEER COLLECTIEF.
Alle bestanden staan in `logo-pakket/` (zie de README daar).

| Variant | Gebruik |
|---|---|
| Donker op licht | Website, documenten, briefpapier |
| Wit op donker | Zijbalk dashboard, donkere kop- en voetbalk, e-mailhandtekening |
| Alleen icoon | Favicon, app-icoon |

- Vrije ruimte rondom het logo: minstens de hoogte van het huisje.
- Niet vervormen, kantelen of in andere kleuren zetten dan donker of wit.

## 2. Kleur

Weinig kleur, en kleur betekent altijd iets. Er is één accent (staalblauw) voor actie en selectie. Rood, amber en groen zijn alleen signalen.

### Basis

| Naam | Hex | Gebruik |
|---|---|---|
| Leisteen | `#222B36` | Tekst, zijbalk, donkere balken |
| Navy | `#1C242E` | Donkerste vlak (donkere modus, voetbalk website) |
| Papierwit | `#FBFCFD` | Vlakken, zachte achtergrond |
| Sectiegrijs | `#F5F7F9` | Paginaachtergrond |
| Lijn | `#E1E6EB` | Randen en scheidingslijnen |
| Gedempt | `#59616B` | Bijschriften, tweede tekst |
| Zwak | `#7A828C` | Pictogrammen, lege toestanden |

### Accent

| Naam | Hex | Gebruik |
|---|---|---|
| Staalblauw | `#4E6885` | Hoofdknop, actief tabblad, links, vinkjes |
| Staalblauw donker | `#3F566F` | Hover, tekst op lichte accenttint |
| Accenttint | `#EDF1F5` | Kolombalk in tabellen, geselecteerde filter |

### Signalen (alleen waar ze iets betekenen)

| Kleur | Hex | Betekenis |
|---|---|---|
| Rood | `#B91C1C` | Te laat, verwijderen |
| Amber | `#AE5008` | Binnenkort, in behandeling, gepland |
| Groen | `#047857` | Afgerond |

Contrast: tekst haalt minstens 4,5:1 en pictogrammen 3:1, in licht en donker. De zelftest van het dashboard controleert dit.

## 3. Typografie

| Waar | Letter |
|---|---|
| Website, documenten, print | Koppen **Source Serif 4**, tekst **Karla**, kleine labels **Jost** (hoofdletters, ruim gespatieerd) |
| Dashboard | De standaardletter van het toestel (SF Pro / Segoe UI / Roboto). Codes en datums in de standaard vaste-breedteletter. |
| Inlogscherm dashboard | Eigen gemerkt scherm (Hanken Grotesk + JetBrains Mono) |

Het dashboard is een werkinstrument met dichte tabellen. De systeemletter leest daar het rustigst. Bovendien zijn de kolombreedtes erop afgestemd: een andere letter maakt kolommen 30–35% breder of smaller.

### Maten in het dashboard

Zes lettergroottes en drie diktes; geen tussenmaten.

| px | Gebruik |
|---|---|
| 28 | Grote getallen (tellers) |
| 18 | Paginatitel |
| 15 | Kaarttitel, venstertitel |
| 13 | Tekst, tabellen, invoervelden, knoppen |
| 12 | Bijschriften, namen, labels in formulieren |
| 11 | Kolomkoppen (hoofdletters, 0,04em gespatieerd) |

Diktes: 400 (gewoon), 500 (nadruk), 600 (koppen, knoppen).

## 4. Vorm

- **Hoeken:** 4 px (klein), 6 px (knoppen, velden), 8 px (kaarten, vensters). De website gebruikt 4 px voor knoppen.
- **Schaduw:** kaarten krijgen alleen een lijn. Schaduw is er alleen voor wat zweeft: vensters, Ctrl+K, uitklapmenu's.
- **Afstanden:** stappen van 4 px (4, 8, 12, 16, 24, 32).

## 5. Ontwerpregels dashboard

Deze regels houden het dashboard rustig, ook bij nieuwe onderdelen.

1. **Geen pillen of gekleurde labels.** Status, namen, categorieën en "te laat" zijn gewone (eventueel gekleurde) tekst.
2. **Eén accent.** Tabbladen hebben geen eigen kleur. Alleen grafieken krijgen een reeks kleuren, omdat daar het onderscheid de inhoud is.
3. **Voortgang als vorm:** ALV-stappen zijn een gevuld rondje met vinkje of een lege ring. Status is een rondje dat per stap vult (leeg, ⅓, ⅔, vol). In de code: `voortgang()` en `vlagSvg()` in `src/util.js`.
4. **Iconen spaarzaam.** Wel in de zijbalk en op icoonknoppen in tabelrijen. Niet in vensterknoppen, filters of naast koppen. Eigen set in `src/icons.js`, met lijn en lichte vulling.
5. **Geen uitlegzinnen** naast titels en geen dubbele titels.
6. **Rij-acties zonder kaders.** Grijze icoontjes; het afrondvinkje in het accent.
7. **Verwijderen** is in een bewerkscherm rode tekst links. De bevestiging daarna heeft een stevige rode knop.

## 6. Donkere modus (dashboard)

Dezelfde regels met eigen waarden: pagina `#161C24`, vlakken `#1C242E`, tekst `#EEF1F4`, accent `#8FA6C2`. De zijbalk blijft leisteen `#222B36` in beide thema's, zodat hij in donker lichter is dan de pagina.

## 7. Documenten en e-mail

- Logo linksboven, contactgegevens rechtsboven.
- Koppen Source Serif 4 in leisteen; tekst Karla 11 pt in `#334155`; staalblauw voor lijnen en tabelkoppen.
- E-mailhandtekening: logo-icoon + naam in leisteen, scheidingslijn in staalblauw. Terugvalletter Arial.

## 8. Technisch (dashboard)

Alle kleuren en maten staan als variabelen bovenaan `styles.css` (`:root` en `[data-theme=dark]`). Gebruik altijd die variabelen en geen losse kleurcodes:

```css
--txt / --mut / --fnt        tekst, gedempt, zwak
--bg / --sur / --sur2        pagina, vlak, zacht vlak
--bor / --bor-input          lijnen
--ac / --ac-l / --ac-900     accent, tint, donker
--rd / --am / --gn           signalen
--r / --rs                   hoeken 8 / 6
--shm / --shl                schaduw voor zwevende delen
```

Websitebronnen: `https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Karla:wght@400;500;600;700&family=Jost:wght@300;400;500&display=swap`
