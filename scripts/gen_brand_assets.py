"""Genera gli asset PNG/ICO placeholder del brand Aethersy.

Placeholder: l'utente sostituira' logo.svg / favicon.ico con i file definitivi.
Uso: python scripts/gen_brand_assets.py
"""
from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFont

PRIMARY = (110, 65, 226, 255)  # #6e41e2
WHITE = (255, 255, 255, 255)

OUT = pathlib.Path(__file__).resolve().parent.parent / "branding" / "web"


def _font(size: int) -> ImageFont.FreeTypeFont:
    for name in ("arialbd.ttf", "Arial_Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def mark(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=PRIMARY)
    font = _font(int(size * 0.66))
    box = draw.textbbox((0, 0), "A", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.text(
        ((size - w) / 2 - box[0], (size - h) / 2 - box[1]),
        "A",
        font=font,
        fill=WHITE,
    )
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    mark(192).save(OUT / "logo-192.png")
    mark(180).save(OUT / "logo-180.png")
    ico = mark(256)
    ico.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print(f"asset scritti in {OUT}")


if __name__ == "__main__":
    main()
