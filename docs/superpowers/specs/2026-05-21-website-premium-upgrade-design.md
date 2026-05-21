# Website Premium Upgrade — Design Spec

## Context

VvE Beheer Collectief website mockup B ("Warm premium") is gekozen als basis, maar mist professionaliteit en luxe uitstraling. De gebruiker omschrijft het huidige design als "simpel, goedkoop en kinderlijk." Gewenste sfeer: accountantskantoor/adviesbureau — zakelijk, gestructureerd, betrouwbaar, maar niet koud of intimiderend.

## Scope

Twee visuele varianten van mockup B uitwerken als losse HTML-bestanden:
- **Design X** (`website-mockup-X.html`): Zakelijk verfijnd (benadering 1 + 2 + discipline uit 3)
- **Design Y** (`website-mockup-Y.html`): Warm gelaagd (benadering 1 + 2)

Beide upgraden mockup B naar premium niveau. Gebruiker kiest daarna definitieve richting.

## Gedeelde upgrades (X en Y)

### Typografie
- Hero h1: 52-54px (was 46px)
- Section titles: 34-36px (was 32px)
- Body: 15px (was 14px)
- Section labels: letter-spacing 0.14em (was 0.12em)
- Alle gewichten behouden (DM Sans 400-800)

### Spacing
- Sectiepading: 100-120px verticaal (was 80px)
- Container max-width: 1140px (ongewijzigd)
- Meer interne padding in kaarten: 36-40px (was 32px)

### Kaarten
- Border-radius: 6-8px (was 14-16px)
- Diepere schaduwen: `0 8px 40px rgba(43,53,68,.08)` basis, `0 16px 56px rgba(43,53,68,.12)` hover
- Hover-effect: translateY(-6px) met schaduw-groei

### Navbar
- Hoogte: 72px (was 64px)
- Logo icon: 40px (was 36px)
- Nav links font-weight: 500 met hover underline-effect (2px teal lijn onder actief item)
- Scroll-state: compactere schaduw + lichte achtergrond-transitie

### Footer
- Identiek voor X en Y
- 5-kolom grid: logo (180px) + 4 content-kolommen
- Logo: `logo-sidebar.png` 100px breed
- Meer padding: 72px top (was 60px)

### Technisch
- IntersectionObserver scroll-animaties (fade-up)
- Smooth scroll anchor links
- Responsive breakpoints: 900px, 480px
- DM Sans via Google Fonts
- Phosphor Icons duotone via unpkg CDN

---

## Design X: "Zakelijk verfijnd"

### Filosofie
Navy als dominante kleur. Teal spaarzaam: alleen CTA-knoppen, hover-states, en de CTA-sectie. Strak, gestructureerd, meer negatieve ruimte. De discipline van een groot adviesbureau.

### Kleurgebruik
- **Navy** `#2B3544`: hero, werkwijze, nummers, iconen, badges, tekst
- **Teal** `#0D7377`: alleen CTA-knoppen, hover-states, CTA-sectie achtergrond, top-border stats-card
- **Creme** `#F5F0EB`: diensten-sectie, referenties-sectie (rustpunten)
- **Wit** `#FFFFFF`: waarom-wij sectie, stats-card, kaarten

### Sectie-specificaties

#### Hero (navy)
- Achtergrond: navy `#2B3544`
- Subtiel geometrisch patroon: cirkels in 5% opacity (`rgba(255,255,255,.05)`) als decoratie
- H1: 54px, wit, font-weight 800
- Subtekst: `#94a3b8`, 17px
- Badge boven h1: navy-light achtergrond (`rgba(255,255,255,.08)`), witte tekst, 6px radius
- CTA-knop: teal achtergrond (enige teal in hero)
- Secundaire knop: wit met navy tekst
- Rechts: creme stats-card met 3 kerngetallen (navy icoon-achtergronden)

#### Stats-card (wit, floating)
- Zweeft over hero met `margin-top: -56px`
- Max-width: 1000px
- Border-radius: 8px
- Box-shadow: `0 12px 48px rgba(43,53,68,.1)`
- Dunne teal top-border: `border-top: 3px solid var(--teal)`
- **Nummers in navy** (niet teal) — font-size 40px, weight 800
- Labels: `#64748B`, 13px
- Scheidslijnen tussen items: 1px `#E2E8F0`

#### Diensten (creme)
- Padding: 100px 0
- 3-kolom grid, gap 28px
- Kaarten: wit, 6px radius, `padding: 36px 32px`
- **Dunne top-border** (3px) per dienst-kleur:
  - Administratief: teal `#0D7377`
  - Financieel: amber `#D97706`
  - Technisch: navy `#2B3544`
- Iconen: **navy kleur** op lichtgrijze achtergrond (`#F1F5F9`), 48px container, 8px radius
- Checklist-items: 13px, `#475569`, navy check-iconen
- Hover: translateY(-6px), schaduw groeit

#### Waarom wij (wit)
- 2-kolom grid: foto links, lijst rechts
- Foto-placeholder: 8px radius, warme gradient, aspect-ratio 4/3
- Navy badge op foto: "17+ jaar ervaring", navy achtergrond, witte tekst, 8px radius
- Rechts: 4 items met **navy nummers** (1-4, font-size 32px, weight 800)
- Check-iconen: navy (niet teal)
- Item titels: 16px, navy, weight 700
- Item tekst: 14px, `#64748B`
- Meer ruimte tussen items: gap 24px

#### Werkwijze (navy)
- 4 stap-kaarten in grid
- Kaarten: `rgba(255,255,255,.06)` achtergrond, 1px witte border (8% opacity), 8px radius
- Stap-nummers: witte cirkels met navy tekst (omgekeerd van B), 44px, font-size 17px, weight 800
- Kaart hover: achtergrond naar `rgba(255,255,255,.1)`, translateY(-4px)
- Subtiel glasmorfisme-effect op kaarten

#### Referenties (creme)
- **1 quote per rij** (single column, max-width 800px, gecentreerd)
- Grotere quote-tekst: 18px, `#475569`, italic
- Aanhalingsteken: **navy** kleur, 100px, Georgia serif, 6% opacity
- Gouden sterren behouden
- Auteur met avatar-cirkel (navy achtergrond, witte initialen)
- Meer padding per kaart: 44px 40px
- Gap tussen kaarten: 20px

#### CTA (teal gradient)
- `linear-gradient(135deg, #0D7377 0%, #064E50 100%)`
- Enige sectie waar teal dominant is — valt extra op door spaarzaam gebruik elders
- H2: 34px, wit, weight 800
- Navy CTA-knop (omgekeerd): `#2B3544` achtergrond, witte tekst
- Secundaire knop: wit outline
- "Reactie binnen 24 uur" in teal-100 kleur

---

## Design Y: "Warm gelaagd"

### Filosofie
Teal als volwaardig accent door het hele design. Meer visuele gelaagdheid via overlappende elementen, offset-vlakken en decoratieve vormen. Warmer en uitnodigender dan X, maar net zo professioneel door betere typografie, spacing en kaart-styling.

### Kleurgebruik
- **Navy** `#2B3544`: structuur (hero-badge tekst, werkwijze-titels, kaart-titels, referenties-achtergrond)
- **Teal** `#0D7377`: accenten overal (nummers, iconen, badges, CTA, highlights, decoratieve elementen)
- **Creme** `#F5F0EB`: hero, diensten, werkwijze (warme basis)
- **Wit** `#FFFFFF`: waarom-wij, stats-card, kaarten

### Sectie-specificaties

#### Hero (creme)
- Teal accent-badge: `#0D7377` achtergrond, witte tekst, 6px radius (strakker dan B's ronde badge)
- H1: 52px, navy, weight 800
- **Teal highlight-streep** onder kernwoord: 10px hoog, teal-100 `#CCFBF1`
- Foto rechts: 12px radius (strakker), warme gradient
- **Decoratieve teal cirkel** achter foto: 200px, `rgba(13,115,119,.08)`, position absolute, -20px rechts/onder
- Trust-indicators onder foto: teal iconen, muted tekst

#### Stats-card (wit, floating met offset)
- Zweeft over hero met `margin-top: -56px`
- **Offset decoratief navy vlak** erachter: `position:absolute`, -8px top, -8px left, navy `#2B3544`, 8px radius, z-index -1
- Box-shadow: `0 12px 48px rgba(43,53,68,.12)` (dieper dan X)
- Border-radius: 10px
- **Teal nummers**: 40px, weight 800
- Scheidslijnen: 1px `#E2E8F0`

#### Diensten (creme)
- Padding: 100px 0
- 3-kolom grid, gap 28px
- Kaarten: wit, 8px radius, `padding: 36px 32px`
- **Dikke bottom-border** (4px) per dienst-kleur:
  - Administratief: teal `#0D7377`
  - Financieel: amber `#D97706`
  - Technisch: navy `#2B3544`
- Iconen: **eigen kleur** per dienst (teal/amber/navy) op lichte achtergrond (teal-100/amber-100/gray-100)
- Icoon-container: 56px, 12px radius
- Hover: translateY(-6px), schaduw groeit, bottom-border wordt 5px

#### Waarom wij (wit)
- 2-kolom grid: foto links, lijst rechts
- Foto-placeholder: 10px radius
- **Teal kader-offset**: decoratief teal vlak (`#0D7377`, 10px radius) dat 10px verschoven achter de foto zit (position relative/absolute)
- Navy badge op foto: "17+ jaar", navy achtergrond, witte tekst
- Rechts: 4 items met **teal nummers** (1-4, font-size 36px, weight 800)
- Teal check-iconen
- Item hover: lichte creme achtergrond-transitie

#### Werkwijze (creme)
- Horizontale tijdlijn
- **Teal verbindingslijn**: 3px, `#0D7377`
- Teal cirkels: 48px (groter dan B), navy nummer-tekst, `box-shadow: 0 0 0 6px var(--creme), 0 0 0 9px var(--teal-100)` (dubbele ring)
- Subtiel teal-100 achtergrondvlak (`#CCFBF1`, 12px radius, 40% opacity) achter de hele tijdlijn als decoratie
- Stap-tekst: 15px titels (navy, weight 700), 13px beschrijving (muted)

#### Referenties (navy)
- **2x2 grid** behouden
- Kaarten: `rgba(255,255,255,.05)` achtergrond, 1px witte border (8% opacity), 8px radius
- Grote **teal** aanhalingstekens: 100px, `rgba(94,234,212,.15)` (teal-300 met opacity)
- Quote-tekst: 16px, `rgba(255,255,255,.8)`, italic
- Gouden sterren
- Auteur: teal avatar-cirkel

#### CTA (teal gradient)
- `linear-gradient(135deg, #0D7377 0%, #064E50 100%)`
- **Decoratieve witte cirkels**: 3-4 cirkels in 4-6% opacity, verschillende grootten (150-350px), position absolute
- H2: 34px, wit, weight 800
- Navy CTA-knop: `#2B3544`
- "Reactie binnen 24 uur" in teal-100

---

## Bestanden

| Bestand | Actie |
|---------|-------|
| `website-mockup-X.html` | Nieuw — Design X |
| `website-mockup-Y.html` | Nieuw — Design Y |
| `website-mockup-A.html` | Bestaand, ongewijzigd |
| `website-mockup-B.html` | Bestaand, ongewijzigd (basis) |

## Verificatie

- [ ] Beide mockups visueel correct in browser (desktop + mobiel)
- [ ] Bedrijfsgegevens: 500+ VvE's, 17+ jaar, Wateringen, geen juridisch beheer
- [ ] Logo: navbar icon-only (`app-icon-128.png`), footer groot icon-only (`logo-sidebar.png`)
- [ ] Warm creme `#F5F0EB` als warme basis (geen koud grijs)
- [ ] Geen twee opeenvolgende secties met dezelfde achtergrond
- [ ] Design X: teal alleen in CTA-knop, CTA-sectie, hover-states, stats top-border
- [ ] Design X: nummers en iconen in navy (niet teal)
- [ ] Design X: referenties 1 per rij
- [ ] Design Y: teal als volwaardig accent overal
- [ ] Design Y: offset-vlakken achter stats-card en foto
- [ ] Design Y: referenties 2x2 grid op navy
- [ ] Typografie opgeschaald (h1 52-54px, sections 34-36px, body 15px)
- [ ] Sectiepading 100-120px
- [ ] Kaarten 6-8px radius (niet 14-16px)
- [ ] Responsive op 900px en 480px breakpoints
- [ ] Scroll-animaties (fade-up) werken
- [ ] Smooth scroll anchor links werken
