# Logo-pakket — VvE Beheer Collectief

Logo: twee handen die elkaar vasthouden onder een dak.

## Brandkleur
| Kleur | Hex | Gebruik |
|-------|-----|---------|
| Donker navy | `#2B3544` | Logo primaire kleur, tekst |
| Wit | `#FFFFFF` | Logo op donkere achtergrond |

---

## Bestanden

### Volledige logo (icoon + tekst)
| Bestand | Gebruik |
|---------|--------|
| `logo-volledig-donker.png` | Master — donker op transparant (4090x2022) |
| `logo-volledig-wit.png` | Master — wit op transparant (4090x2022) |

### Icoon (handen + dak, zonder tekst)
| Bestand | Gebruik |
|---------|--------|
| `icoon-donker.png` | Hoge resolutie icoon, donker (1509x1597) |
| `icoon-wit.png` | Hoge resolutie icoon, wit (1509x1597) |

### App-iconen (vierkant, afgeronde hoeken, witte achtergrond)
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `app-icon-512.png` | 512x512 | PWA manifest, splashscreen |
| `app-icon-192.png` | 192x192 | PWA manifest |
| `app-icon-180.png` | 180x180 | Backup voor iOS |
| `app-icon-128.png` | 128x128 | Chrome Web Store |
| `app-icon-64.png` | 64x64 | Klein icoon |

### Maskable iconen (Android adaptive icons)
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `maskable-512.png` | 512x512 | PWA manifest (purpose: maskable) |
| `maskable-192.png` | 192x192 | PWA manifest (purpose: maskable) |

### Favicons (browser-tab)
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `favicon.ico` | 16/32/48 | Universele favicon |
| `favicon-48x48.png` | 48x48 | Grote favicon |
| `favicon-32x32.png` | 32x32 | Standaard favicon |
| `favicon-16x16.png` | 16x16 | Kleine favicon |

### Apple
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `apple-touch-icon.png` | 180x180 | iOS homescreen |

### Social media / Open Graph
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `og-image-1200x630.png` | 1200x630 | WhatsApp, Facebook, LinkedIn (wit) |
| `og-image-donker-1200x630.png` | 1200x630 | Idem, donkere variant |

### Platform-specifiek
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `mstile-150x150.png` | 150x150 | Windows Start-tegel |
| `badge-96.png` | 96x96 | Push notification badge (wit) |

### Banners (e-mail handtekening, website header)
| Bestand | Formaat | Gebruik |
|---------|---------|--------|
| `banner-wit-800x200.png` | 800x200 | Lichte achtergrond |
| `banner-donker-800x200.png` | 800x200 | Donkere achtergrond |

---

## Gebruik in HTML

```html
<!-- Favicon -->
<link rel="icon" type="image/x-icon" href="logo-pakket/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="logo-pakket/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="logo-pakket/favicon-16x16.png">

<!-- Apple -->
<link rel="apple-touch-icon" href="logo-pakket/apple-touch-icon.png">

<!-- Open Graph (social sharing) -->
<meta property="og:image" content="https://vvebeheercollectief.github.io/Collectief-Dashboard/logo-pakket/og-image-1200x630.png">

<!-- Windows -->
<meta name="msapplication-TileImage" content="logo-pakket/mstile-150x150.png">
```

## PWA manifest.json icons
```json
{
  "icons": [
    { "src": "logo-pakket/app-icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "logo-pakket/app-icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "logo-pakket/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "logo-pakket/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
