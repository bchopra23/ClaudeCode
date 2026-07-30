#!/usr/bin/env python3
"""Rebuild the supplied letterhead artwork at true A4 proportions.

The letterhead Euler supplied is Letter-shaped (1240 x 1604 px, ratio 0.773).
Its source PDF centres it on an A4 page at 595 x 770 pt, which leaves a white
band above and below the blue border. Scaling it to fill A4 would stretch the
artwork by 9% vertically and visibly distort the logo.

Instead this stretches only the middle of the image. Between the header band and
the footer band every row is identical -- flat blue border, white panel, flat
blue border -- so growing that section adds height without touching a single
pixel of the logo or the footer address block.

    python tools/make_a4_letterhead.py
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "letterhead.jpg"
TARGET = ROOT / "assets" / "letterhead_a4.jpg"

A4_RATIO = 210 / 297

# Rows outside [160, 1440] carry the logo and the footer block. Slicing a little
# inside that margin keeps both untouched while leaving plenty of uniform rows.
TOP_SLICE = 200
BOTTOM_SLICE = 1400

# Colour distance at which two pixels count as different when checking uniformity.
TOLERANCE = 18


def assert_uniform(image, top, bottom):
    """Every row in the stretched band must match, or stretching would smear art."""
    pixels = image.load()
    width = image.size[0]
    reference = [pixels[x, top] for x in range(width)]
    for y in range(top, bottom):
        for x in range(width):
            a, b = pixels[x, y], reference[x]
            if abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) > TOLERANCE:
                sys.exit(
                    f"Row {y} differs from row {top} at x={x} ({a} vs {b}). "
                    "The stretch band is not uniform; adjust TOP_SLICE/BOTTOM_SLICE."
                )


def measure(image):
    """Locate the white panel and the two blue bands, in pixels."""
    pixels = image.load()
    width, height = image.size
    white = lambda p: p[0] > 245 and p[1] > 245 and p[2] > 245

    mid = height // 2
    columns = [x for x in range(width) if white(pixels[x, mid])]
    left, right = columns[0], columns[-1] + 1

    # Header band: on the right-hand side, the first row that is white.
    probe = right - 40
    header = next(y for y in range(height) if white(pixels[probe, y]))
    # Footer band: on the left-hand side, the last row that is white.
    probe = left + 40
    footer = max(y for y in range(height) if white(pixels[probe, y])) + 1

    return {"left": left, "right": right, "header": header, "footer": footer}


def main():
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size
    assert_uniform(source, TOP_SLICE, BOTTOM_SLICE)

    target_height = round(width / A4_RATIO)
    middle_height = target_height - TOP_SLICE - (height - BOTTOM_SLICE)
    if middle_height <= 0:
        sys.exit("Target page is shorter than the artwork that must stay unscaled.")

    out = Image.new("RGB", (width, target_height))
    out.paste(source.crop((0, 0, width, TOP_SLICE)), (0, 0))
    middle = source.crop((0, TOP_SLICE, width, BOTTOM_SLICE))
    out.paste(middle.resize((width, middle_height), Image.NEAREST), (0, TOP_SLICE))
    out.paste(source.crop((0, BOTTOM_SLICE, width, height)), (0, TOP_SLICE + middle_height))

    out.save(TARGET, quality=92, subsampling=0, optimize=True)

    box = measure(out)
    to_mm_x = lambda px: px / width * 210
    to_mm_y = lambda px: px / target_height * 297
    print(f"Wrote {TARGET.relative_to(ROOT)} ({width} x {target_height}px, {TARGET.stat().st_size:,} bytes)")
    print("Geometry for src/index.html, in mm on a full-bleed A4 page:")
    print(f"  white panel left   {to_mm_x(box['left']):6.2f}")
    print(f"  white panel right  {to_mm_x(box['right']):6.2f}")
    print(f"  header band bottom {to_mm_y(box['header']):6.2f}   <- SAFE.top")
    print(f"  footer band top    {to_mm_y(box['footer']):6.2f}   <- SAFE.bottom")


if __name__ == "__main__":
    main()
