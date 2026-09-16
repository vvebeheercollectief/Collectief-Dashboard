#!/usr/bin/env python3
"""Genereert het socials-pakket van VvE Beheer Collectief.

Bron: logo-pakket/logo-volledig-{donker,wit}.png en logo-pakket/icoon-{donker,wit}.png
Doel: logo-pakket/socials/<platform>/

Gebruik: python3 tools/socials-pakket.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / "logo-pakket"
DOEL = BRON / "socials"

NAVY = (43, 53, 68, 255)      # #2B3544
WIT = (255, 255, 255, 255)

MASTERS = {
    "logo_wit": BRON / "logo-volledig-wit.png",
    "logo_navy": BRON / "logo-volledig-donker.png",
    "icoon_wit": BRON / "icoon-wit.png",
    "icoon_navy": BRON / "icoon-donker.png",
}


def trim(im):
    """Snijdt transparante randen weg zodat plaatsing exact klopt."""
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


_cache = {}


def master(naam):
    if naam not in _cache:
        _cache[naam] = trim(Image.open(MASTERS[naam]).convert("RGBA"))
    return _cache[naam]


def plaats(canvas_w, canvas_h, bg, mark, safe_w, safe_h, offset_y=0):
    """Zet het beeldmerk gecentreerd binnen de veilige zone op een effen vlak."""
    doek = Image.new("RGBA", (canvas_w, canvas_h), bg)
    schaal = min(safe_w / mark.width, safe_h / mark.height)
    breedte = max(1, round(mark.width * schaal))
    hoogte = max(1, round(mark.height * schaal))
    geschaald = mark.resize((breedte, hoogte), Image.LANCZOS)
    x = (canvas_w - breedte) // 2
    y = (canvas_h - hoogte) // 2 + offset_y
    doek.alpha_composite(geschaald, (x, y))
    return doek


# (map, bestandsnaam, breedte, hoogte, soort, veilige-verhouding b, veilige-verhouding h, offset_y, omschrijving)
# soort: "icoon" = beeldmerk zonder tekst, "logo" = icoon + tekst
SPECS = [
    # Instagram
    ("instagram", "instagram-profiel", 320, 320, "icoon", 0.58, 0.58, 0, "Profielfoto (rond weergegeven)"),
    ("instagram", "instagram-post", 1080, 1080, "logo", 0.70, 0.45, 0, "Vierkante post"),
    ("instagram", "instagram-post-portret", 1080, 1350, "logo", 0.70, 0.40, 0, "Portret-post"),
    ("instagram", "instagram-story", 1080, 1920, "logo", 0.72, 0.28, -50, "Story / Reel (veilige zone)"),
    ("instagram", "instagram-highlight-cover", 1080, 1920, "icoon", 0.30, 0.18, 0, "Highlight-cover"),
    # Facebook
    ("facebook", "facebook-profiel", 500, 500, "icoon", 0.58, 0.58, 0, "Profielfoto pagina (rond weergegeven)"),
    ("facebook", "facebook-omslag", 1640, 624, "logo", 0.45, 0.55, 0, "Omslagfoto pagina (mobielveilig midden)"),
    ("facebook", "facebook-gedeelde-link", 1200, 630, "logo", 0.66, 0.45, 0, "Gedeelde link / Open Graph"),
    ("facebook", "facebook-evenement", 1920, 1005, "logo", 0.60, 0.40, 0, "Evenement-omslag"),
    # LinkedIn
    ("linkedin", "linkedin-bedrijfslogo", 300, 300, "icoon", 0.62, 0.62, 0, "Bedrijfslogo pagina"),
    ("linkedin", "linkedin-paginabanner", 1128, 191, "logo", 0.38, 0.60, 0, "Banner bedrijfspagina"),
    ("linkedin", "linkedin-profielbanner", 1584, 396, "logo", 0.40, 0.50, 0, "Banner persoonlijk profiel"),
    ("linkedin", "linkedin-post", 1200, 627, "logo", 0.66, 0.45, 0, "Post / gedeelde link"),
    # X (Twitter)
    ("x-twitter", "x-profiel", 400, 400, "icoon", 0.58, 0.58, 0, "Profielfoto (rond weergegeven)"),
    ("x-twitter", "x-header", 1500, 500, "logo", 0.45, 0.50, 0, "Headerafbeelding"),
    ("x-twitter", "x-post", 1600, 900, "logo", 0.60, 0.42, 0, "Post-afbeelding"),
    # Snapchat
    ("snapchat", "snapchat-profiel", 320, 320, "icoon", 0.58, 0.58, 0, "Publiek profiel / Bitmoji-vervanger"),
    ("snapchat", "snapchat-snap", 1080, 1920, "logo", 0.72, 0.26, -60, "Snap / advertentie (veilige zone)"),
    # YouTube
    ("youtube", "youtube-profiel", 800, 800, "icoon", 0.58, 0.58, 0, "Kanaalfoto (rond weergegeven)"),
    ("youtube", "youtube-kanaalbanner", 2560, 1440, "logo", 0.36, 0.20, 0, "Kanaalbanner (logo in tv-veilige zone)"),
    ("youtube", "youtube-thumbnail", 1280, 720, "logo", 0.62, 0.42, 0, "Videominiatuur"),
    # TikTok
    ("tiktok", "tiktok-profiel", 200, 200, "icoon", 0.58, 0.58, 0, "Profielfoto (rond weergegeven)"),
    ("tiktok", "tiktok-video", 1080, 1920, "logo", 0.72, 0.26, -60, "Video-achtergrond (veilige zone)"),
    # WhatsApp Business
    ("whatsapp", "whatsapp-profiel", 640, 640, "icoon", 0.58, 0.58, 0, "Profielfoto WhatsApp Business"),
    # Google Bedrijfsprofiel
    ("google-bedrijfsprofiel", "google-logo", 720, 720, "icoon", 0.58, 0.58, 0, "Logo bedrijfsprofiel"),
    ("google-bedrijfsprofiel", "google-omslag", 1024, 576, "logo", 0.62, 0.42, 0, "Omslagfoto bedrijfsprofiel"),
]

VARIANTEN = [
    ("navy", NAVY, "wit"),    # witte markering op navy vlak
    ("wit", WIT, "navy"),     # navy markering op wit vlak
]



PLATFORMS = {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "linkedin": "LinkedIn",
    "x-twitter": "X (Twitter)",
    "snapchat": "Snapchat",
    "youtube": "YouTube",
    "tiktok": "TikTok",
    "whatsapp": "WhatsApp Business",
    "google-bedrijfsprofiel": "Google Bedrijfsprofiel",
}


def schrijf_overzicht(aantal):
    """Contactsheet zodat iedereen in een oogopslag het juiste bestand pakt."""
    secties = []
    for map_naam, titel in PLATFORMS.items():
        kaarten = []
        for map_n, bestand, w, h, soort, sw, sh, offset, oms in SPECS:
            if map_n != map_naam:
                continue
            for achtergrond_naam, _bg, _mk in VARIANTEN:
                naam = f"{bestand}-{achtergrond_naam}-{w}x{h}.png"
                klasse = "dark" if achtergrond_naam == "navy" else "light"
                kaarten.append(
                    f'''      <div class="card">
        <div class="card-preview {klasse}"><img src="{map_naam}/{naam}" alt="{naam}"></div>
        <div class="card-info"><div class="name">{naam}</div><div class="desc">{oms} — {w}x{h}</div></div>
      </div>'''
                )
        secties.append(
            f'''  <div class="section">
    <h2>{titel}</h2>
    <div class="grid">
{chr(10).join(kaarten)}
    </div>
  </div>'''
        )

    html = f'''<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Socials-pakket — VvE Beheer Collectief</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #2B3544; }}
  .header {{ background: #2B3544; color: white; padding: 40px 20px; text-align: center; }}
  .header h1 {{ font-size: 28px; margin-bottom: 8px; }}
  .header p {{ opacity: 0.7; font-size: 15px; }}
  .container {{ max-width: 1100px; margin: 0 auto; padding: 30px 20px; }}
  .section {{ margin-bottom: 40px; }}
  .section h2 {{ font-size: 20px; margin-bottom: 16px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }}
  .card {{ background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }}
  .card-preview {{ display: flex; align-items: center; justify-content: center; min-height: 180px; padding: 20px; }}
  .card-preview.light {{ background: #ffffff; }}
  .card-preview.dark {{ background: #2B3544; }}
  .card-preview img {{ max-width: 100%; max-height: 160px; object-fit: contain; }}
  .card-info {{ padding: 12px 16px; border-top: 1px solid #f0f0f0; }}
  .card-info .name {{ font-size: 12px; font-weight: 600; font-family: 'SF Mono', monospace; word-break: break-all; }}
  .card-info .desc {{ font-size: 12px; color: #888; margin-top: 2px; }}
  .footer {{ text-align: center; font-size: 13px; color: #888; padding: 20px 0 40px; }}
</style>
</head>
<body>

<div class="header">
  <h1>Socials-pakket</h1>
  <p>VvE Beheer Collectief — {aantal} bestanden</p>
</div>

<div class="container">
{chr(10).join(secties)}
  <div class="footer">085 800 06 05 &middot; info@vvebeheercollectief.nl</div>
</div>

</body>
</html>
'''
    (DOEL / "overzicht.html").write_text(html, encoding="utf-8")


def main():
    gemaakt = []
    for map_naam, bestand, w, h, soort, sw, sh, offset, _oms in SPECS:
        uit = DOEL / map_naam
        uit.mkdir(parents=True, exist_ok=True)
        for achtergrond_naam, bg, mark_kleur in VARIANTEN:
            mark = master(f"{soort}_{mark_kleur}")
            beeld = plaats(w, h, bg, mark, round(w * sw), round(h * sh), offset)
            pad = uit / f"{bestand}-{achtergrond_naam}-{w}x{h}.png"
            beeld.convert("RGB").save(pad, "PNG", optimize=True)
            gemaakt.append(pad.relative_to(ROOT))
        # transparante variant van het volledige logo, voor eigen achtergronden
        if soort == "logo":
            mark = master("logo_navy")
            beeld = plaats(w, h, (0, 0, 0, 0), mark, round(w * sw), round(h * sh), offset)
            pad = uit / f"{bestand}-transparant-navy-{w}x{h}.png"
            beeld.save(pad, "PNG", optimize=True)
            gemaakt.append(pad.relative_to(ROOT))

    schrijf_overzicht(len(gemaakt))
    for p in gemaakt:
        print(p)
    print(f"\n{len(gemaakt)} bestanden in {DOEL.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
