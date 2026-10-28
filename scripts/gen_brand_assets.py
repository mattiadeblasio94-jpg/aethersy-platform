"""gen_brand_assets.py — Fase 8 (Aethersy)

Genera gli asset di brand dal logo sorgente, su sfondo TRASPARENTE.

Output in `branding/web/`:
  logo-192.png, logo-180.png        simbolo trasparente (favicon/apple-touch)
  logo.svg                          SVG wrapper che incorpora il PNG 192 (trasparente)
  favicon.ico                       multi-size dal simbolo
  brand/logo.png                    simbolo trasparente 512 px
  brand/logo.svg                    SVG wrapper (trasparente)
  brand/full-logo.png               simbolo + wordmark "Aethersy" (Space Grotesk)
  brand/full-logo.svg               SVG wrapper (trasparente)

Perche' SVG wrapper: la Community edition serve i loghi via <img src>, quindi un SVG
con <image> base64 mantiene la trasparenza senza rebuild e senza gradienti piatti.

Palette (brand Aethersy):
  Primary #00D4FF · Secondary #1A0F4A · Accent #FF9F1C
  Glow #4DEEFF    · Background #0A0518

Uso: python scripts/gen_brand_assets.py [percorso_logo]
"""
from __future__ import annotations

import base64
import io
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "branding" / "web"
BRAND = WEB / "brand"

SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(
    r"C:\Users\PC\Desktop\logo aethersy.jpg"
)
FONT = ROOT / ".tmp" / "fonts" / "SpaceGrotesk.ttf"
GLOW = (77, 238, 255)  # #4DEEFF


def load_transparent() -> tuple[Image.Image, int]:
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    lum = a.max(axis=2)
    alpha = np.clip((lum - 26.0) / 34.0, 0.0, 1.0)  # sfondo nero-viola = trasparente
    out = Image.fromarray(np.dstack([a, alpha * 255.0]).astype(np.uint8), "RGBA")
    rows = np.where(np.asarray(out)[:, :, 3].max(axis=1) > 8)[0]
    bands, start, prev = [], rows[0], rows[0]
    for v in rows[1:]:
        if v - prev > 12:
            bands.append((start, prev))
            start = v
        prev = v
    bands.append((start, prev))
    return out, bands[0][1] + 1


def trim(im: Image.Image, pad: int = 10) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop(
        (max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))
    )


def square(im: Image.Image, size: int, margin: float = 0.06) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - 2 * margin))
    scale = min(inner / im.width, inner / im.height)
    resized = im.resize(
        (max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS
    )
    canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
    return canvas


def svg_wrapper(im: Image.Image, out: pathlib.Path) -> None:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    out.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {im.width} {im.height}" width="{im.width}" height="{im.height}" '
        f'role="img" aria-label="Aethersy">'
        f'<image width="{im.width}" height="{im.height}" '
        f'xlink:href="data:image/png;base64,{b64}"/></svg>',
        encoding="utf-8",
    )
    print(f"  {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")


def wordmark(text: str, px: int) -> Image.Image:
    font = ImageFont.truetype(str(FONT), px)
    box = font.getbbox(text)
    im = Image.new("RGBA", (box[2] - box[0] + 8, box[3] - box[1] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((-box[0] + 4, -box[1] + 4), text, font=font, fill=GLOW + (255,))
    return im


def full_logo(symbol: Image.Image, text: str = "Aethersy", h: int = 256) -> Image.Image:
    word = wordmark(text, round(h * 0.56))
    sym_t = symbol.resize((round(symbol.width * h / symbol.height), h), Image.LANCZOS)
    gap = round(h * 0.11)
    canvas = Image.new("RGBA", (sym_t.width + gap + word.width, h), (0, 0, 0, 0))
    canvas.paste(sym_t, (0, 0), sym_t)
    canvas.paste(word, (sym_t.width + gap, (h - word.height) // 2), word)
    return canvas


def main() -> None:
    if not SRC.exists():
        print(f"ERRORE: logo sorgente non trovato: {SRC}", file=sys.stderr)
        raise SystemExit(1)
    if not FONT.exists():
        print(f"ERRORE: font mancante: {FONT}", file=sys.stderr)
        raise SystemExit(1)

    BRAND.mkdir(parents=True, exist_ok=True)
    full, split = load_transparent()
    symbol = trim(full.crop((0, 0, full.width, split)))

    print("==> PNG trasparenti")
    sq512 = square(symbol, 512)
    sq512.save(BRAND / "logo.png")
    square(symbol, 192).save(WEB / "logo-192.png")
    square(symbol, 180).save(WEB / "logo-180.png")
    for p in ("brand/logo.png", "logo-192.png", "logo-180.png"):
        print(f"  branding/web/{p}")

    print("==> Favicon .ico (multi-size)")
    square(symbol, 256).save(
        WEB / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print("  branding/web/favicon.ico")

    print("==> SVG wrapper trasparente per i <link> di index.html")
    svg_wrapper(square(symbol, 128), WEB / "logo.svg")

    print("==> Logo completo (simbolo + wordmark 'Aethersy')")
    fl = full_logo(square(symbol, 256))
    fl.save(BRAND / "full-logo.png")
    print("  branding/web/brand/full-logo.png")

    print("\nFatto.")


if __name__ == "__main__":
    main()
