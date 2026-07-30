#!/usr/bin/env python3
"""Cut the EULER logo out of the letterhead artwork for use in the app header.

The logo sits in the blue header band as black marks on light blue. Rather than
keeping that blue, this converts darkness into alpha, so the result is a clean
black logo on transparency that sits correctly on the app's white header.

    python tools/extract_logo.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "letterhead.jpg"
TARGET = ROOT / "assets" / "logo.png"

# Pixels at or above this luminance are treated as pure background. It has to sit
# below the band's blue (luminance ~195) as well as the white panel, or the blue
# leaks through as a grey haze behind the logo.
BACKGROUND_LEVEL = 150
# Pixels at or below this luminance are treated as solid ink.
INK_LEVEL = 60


def main():
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size

    # The header band occupies the top right of the artwork; the logo is the only
    # thing in it. Search that quadrant for ink rather than hard-coding a crop.
    band = source.crop((width // 2, 0, width, height // 8))
    grey = band.convert("L")

    mask = grey.point(lambda v: 255 if v < BACKGROUND_LEVEL else 0)
    box = mask.getbbox()
    if not box:
        raise SystemExit("No logo found in the header band of the letterhead.")

    pad = 4
    left = max(box[0] - pad, 0)
    top = max(box[1] - pad, 0)
    right = min(box[2] + pad, band.size[0])
    bottom = min(box[3] + pad, band.size[1])
    logo = grey.crop((left, top, right, bottom))

    # Ramp luminance into coverage so the glyph edges stay antialiased.
    span = BACKGROUND_LEVEL - INK_LEVEL
    alpha = logo.point(lambda v: 255 if v <= INK_LEVEL
                       else 0 if v >= BACKGROUND_LEVEL
                       else round((BACKGROUND_LEVEL - v) / span * 255))
    black = Image.new("L", logo.size, 0)
    Image.merge("RGBA", (black, black, black, alpha)).save(TARGET, optimize=True)

    print(f"Wrote {TARGET.relative_to(ROOT)} ({logo.size[0]} x {logo.size[1]}px, "
          f"{TARGET.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
