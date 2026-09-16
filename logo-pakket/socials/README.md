# Socials-pakket — VvE Beheer Collectief

Kant-en-klare logovarianten voor alle socialmediakanalen. Gegenereerd uit de masterbestanden in `logo-pakket/` met `tools/socials-pakket.py`.

## Kleuren
| Kleur | Hex | Gebruik |
|---|---|---|
| Leisteen (navy) | `#2B3544` | Vlak achter het witte logo, of het logo zelf op wit |
| Wit | `#FFFFFF` | Logo op leisteen, of vlak achter het navy logo |

## Varianten per formaat
| Achtervoegsel | Betekenis |
|---|---|
| `-navy-` | Wit logo op leisteen vlak — **standaard**, meest herkenbaar als profielfoto |
| `-wit-` | Leisteen logo op wit vlak — voor lichte tijdlijnen en kanalen met donkere UI |
| `-transparant-navy-` | Leisteen logo op transparant, voor eigen achtergrond of foto (alleen bij banners en posts) |

---

## Instagram
| Bestand | Formaat | Gebruik |
|---|---|---|
| `instagram-profiel-*-320x320.png` | 320×320 | Profielfoto (rond weergegeven) |
| `instagram-post-*-1080x1080.png` | 1080×1080 | Vierkante post |
| `instagram-post-portret-*-1080x1350.png` | 1080×1350 | Portret-post (meeste schermruimte) |
| `instagram-story-*-1080x1920.png` | 1080×1920 | Story / Reel — logo binnen de veilige zone |
| `instagram-highlight-cover-*-1080x1920.png` | 1080×1920 | Highlight-cover, klein beeldmerk |

## Facebook
| Bestand | Formaat | Gebruik |
|---|---|---|
| `facebook-profiel-*-500x500.png` | 500×500 | Profielfoto pagina (rond weergegeven) |
| `facebook-omslag-*-1640x624.png` | 1640×624 | Omslagfoto — logo in het mobielveilige midden |
| `facebook-gedeelde-link-*-1200x630.png` | 1200×630 | Gedeelde link / Open Graph |
| `facebook-evenement-*-1920x1005.png` | 1920×1005 | Evenement-omslag |

## LinkedIn
| Bestand | Formaat | Gebruik |
|---|---|---|
| `linkedin-bedrijfslogo-*-300x300.png` | 300×300 | Logo bedrijfspagina |
| `linkedin-paginabanner-*-1128x191.png` | 1128×191 | Banner bedrijfspagina |
| `linkedin-profielbanner-*-1584x396.png` | 1584×396 | Banner persoonlijk profiel |
| `linkedin-post-*-1200x627.png` | 1200×627 | Post / gedeelde link |

## X (Twitter)
| Bestand | Formaat | Gebruik |
|---|---|---|
| `x-profiel-*-400x400.png` | 400×400 | Profielfoto (rond weergegeven) |
| `x-header-*-1500x500.png` | 1500×500 | Header |
| `x-post-*-1600x900.png` | 1600×900 | Post-afbeelding |

## Snapchat
| Bestand | Formaat | Gebruik |
|---|---|---|
| `snapchat-profiel-*-320x320.png` | 320×320 | Publiek profiel |
| `snapchat-snap-*-1080x1920.png` | 1080×1920 | Snap / advertentie — logo binnen de veilige zone |

## YouTube
| Bestand | Formaat | Gebruik |
|---|---|---|
| `youtube-profiel-*-800x800.png` | 800×800 | Kanaalfoto (rond weergegeven) |
| `youtube-kanaalbanner-*-2560x1440.png` | 2560×1440 | Kanaalbanner — logo in de tv-veilige zone (1546×423) |
| `youtube-thumbnail-*-1280x720.png` | 1280×720 | Videominiatuur |

## TikTok
| Bestand | Formaat | Gebruik |
|---|---|---|
| `tiktok-profiel-*-200x200.png` | 200×200 | Profielfoto (rond weergegeven) |
| `tiktok-video-*-1080x1920.png` | 1080×1920 | Video-achtergrond / eindkaart |

## WhatsApp Business
| Bestand | Formaat | Gebruik |
|---|---|---|
| `whatsapp-profiel-*-640x640.png` | 640×640 | Profielfoto WhatsApp Business |

## Google Bedrijfsprofiel
| Bestand | Formaat | Gebruik |
|---|---|---|
| `google-logo-*-720x720.png` | 720×720 | Logo bedrijfsprofiel |
| `google-omslag-*-1024x576.png` | 1024×576 | Omslagfoto bedrijfsprofiel |

---

## Regels bij gebruik
- Gebruik bij voorkeur de `-navy-` variant als profielfoto: het witte beeldmerk op leisteen blijft ook klein herkenbaar.
- Bij ronde uitsnedes staat het beeldmerk ruim binnen de cirkel; niet zelf bijsnijden.
- Nooit uitrekken of kantelen. Een ander formaat nodig? Voeg de specificatie toe in `tools/socials-pakket.py` en genereer opnieuw.
- Specificaties van platforms wijzigen regelmatig; controleer bij een nieuw kanaal het actuele formaat.

## Opnieuw genereren
```bash
python3 tools/socials-pakket.py
```

---

VvE Beheer Collectief · 085 800 06 05 · info@vvebeheercollectief.nl
