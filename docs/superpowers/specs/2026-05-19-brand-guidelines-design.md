# VvE Beheer Collectief — Brand Guidelines

Volledige huisstijl voor alle uitingen van VvE Beheer Collectief: dashboard, documenten, website, e-mailhandtekeningen en visitekaartjes.

## 1. Logo

**Primair logo:** handdruk-in-huisvorm icoon + "VVE BEHEER COLLECTIEF" tekst.

### Varianten

| Variant | Gebruik | Kleuren |
|---|---|---|
| Primair | Briefpapier, website, documenten | Navy `#2B3544` op witte achtergrond |
| Omgekeerd | Sidebar, donkere headers, e-mailhandtekeningen | Wit op navy of teal achtergrond |
| Icoon-only | Favicon, app-icoon, kleine toepassingen | Navy of wit, afhankelijk van achtergrond |

### Regels

- Minimale vrije ruimte rondom het logo: gelijk aan de hoogte van het huisje-icoon
- Nooit vervormen, kantelen, of in andere kleuren dan navy/wit/teal gebruiken
- Het "VBC" vierkant in het dashboard wordt vervangen door het echte logo-icoon

## 2. Kleurenpalet

### Primaire kleuren (afgeleid van het logo)

| Kleur | Hex | Gebruik |
|---|---|---|
| Navy | `#2B3544` | Tekst, sidebar, headers, logo |
| Navy donker | `#1E2530` | Dark mode, hover-states |
| Wit | `#FFFFFF` | Achtergronden, kaarten |
| Lichtgrijs | `#F0F2F5` | Pagina-achtergrond |

### Accentkleur (teal-schaal)

| Tint | Hex | Gebruik |
|---|---|---|
| Teal 900 | `#064E50` | Hover op primaire knoppen |
| Teal 700 | `#0D7377` | Primaire knoppen, actieve navigatie, links |
| Teal 500 | `#14B8A6` | Secundaire highlights |
| Teal 300 | `#5EEAD4` | Lichte accenten |
| Teal 100 | `#CCFBF1` | Badges, lichte achtergronden |

### Functionele kleuren (status)

| Kleur | Hex | Gebruik |
|---|---|---|
| Groen | `#059669` | Succes, afgerond |
| Amber | `#D97706` | Waarschuwing, deadline |
| Rood | `#DC2626` | Fout, verlopen |
| Grijs | `#64748B` | Inactief, muted tekst |

## 3. Typografie

**Font:** DM Sans (Google Fonts, gratis)

Gekozen vanwege de subtiel rondere vormen die warmte en toegankelijkheid geven, terwijl het strakke snit professioneel blijft. Past bij de gewenste uitstraling: krachtig en vertrouwd, met een vleugje toegankelijkheid.

### Scherm (dashboard, website)

| Toepassing | Gewicht | Grootte |
|---|---|---|
| Koptekst H1 | 800 (Extra Bold) | 24px |
| Koptekst H2 | 700 (Bold) | 18px |
| Koptekst H3 | 600 (Semi Bold) | 15px |
| Body tekst | 400 (Regular) | 14px |
| Labels/badges | 700 (Bold) | 11px, uppercase, letter-spacing 0.05em |
| Kleine tekst | 400 (Regular) | 12px |

### Print (brieven, offertes, notulen)

- Body tekst: DM Sans Regular, 11pt, donkergrijs `#334155`
- Kopteksten: DM Sans Bold, navy `#2B3544`
- Accentkleur teal voor highlights, tabelheaders en kaders

## 4. Iconografie

**Bibliotheek:** Phosphor Icons, duotone stijl

Gekozen vanwege de combinatie van stevigheid (professionaliteit) en warmte (duotone teal-accent). Vervangt de huidige emoji-iconen die per apparaat verschillen.

### Dashboard navigatie-iconen

| Sectie | Icoon |
|---|---|
| Nog te doen | `ClipboardText` duotone |
| Afgerond | `CheckCircle` duotone |
| ALV's overzicht | `CalendarBlank` duotone |
| Logboek | `BookOpen` duotone |
| Meldingen | `Bell` duotone |
| Statistieken | `ChartBar` duotone |
| Ontwikkeling | `Gear` duotone |

### Kleurgebruik iconen

- **Sidebar (donkere achtergrond):** wit, actief item in teal-achtergrond
- **Lichte achtergrond:** teal `#0D7377` op teal 100 `#CCFBF1` achtergrond
- **Functioneel:** statuskleuren (groen/amber/rood) voor relevante context

### In knoppen

- Icoon links van de tekst, 16px groot
- Zelfde kleur als de knoptekst

## 5. Toepassingsregels

### Dashboard

- Sidebar: navy `#2B3544` achtergrond, actieve navigatie in teal `#0D7377`
- Knoppen primair: teal achtergrond, witte tekst
- Knoppen secundair: transparant met teal border
- Stat-kaarten: teal accent-balk bovenaan
- Badges: teal 100 achtergrond met teal tekst voor "in behandeling"
- Dark mode: navy donker `#1E2530` als basis, teal ongewijzigd

### Documenten (brieven, offertes, notulen)

- Logo linksboven, contactgegevens rechtsboven
- Kopteksten in DM Sans Bold, navy kleur
- Teal als accentkleur voor lijnen, tabelheaders en kaders
- Body tekst in DM Sans Regular, 11pt, donkergrijs `#334155`

### E-mail & handtekeningen

- Logo-icoon + naam in navy
- Teal accent voor scheidingslijnen
- DM Sans als primair font, Arial als websafe fallback

### Visitekaartjes & print

- Voorkant: logo gecentreerd op wit, teal lijn als accent
- Achterkant: navy achtergrond, witte tekst, contactgegevens

## 6. Technische referentie

### CSS Custom Properties (dashboard)

```css
:root {
  /* Primair */
  --navy: #2B3544;
  --navy-dark: #1E2530;
  --white: #FFFFFF;
  --gray-bg: #F0F2F5;

  /* Accent (teal) */
  --teal-900: #064E50;
  --teal-700: #0D7377;
  --teal-500: #14B8A6;
  --teal-300: #5EEAD4;
  --teal-100: #CCFBF1;

  /* Functioneel */
  --green: #059669;
  --amber: #D97706;
  --red: #DC2626;
  --muted: #64748B;

  /* Typografie */
  --font: 'DM Sans', sans-serif;
}
```

### Externe bronnen

- Font: `https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap`
- Iconen: `https://unpkg.com/@phosphor-icons/web@2.1.1` (of npm: `@phosphor-icons/web`)
