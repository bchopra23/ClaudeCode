#!/usr/bin/env python3
"""Pull the company seal out of the stamp PDF Euler supplied.

The seal is stored the way vector editors export a flat-colour cutout: a 1x1
DeviceRGB image holding just the ink colour, stretched over the page, with the
actual artwork carried in a full resolution soft mask. So the ink colour is read
straight from that single pixel rather than sampled and guessed at, and the mask
becomes the alpha channel.

    python tools/extract_stamp.py assets/Euler_Motors_Stamp_source.pdf
"""

import io
import sys
from pathlib import Path

import pypdf
from PIL import Image

from pngutil import save_flat_colour_png

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "assets" / "stamp.png"

# The seal prints 38mm wide, so 520px is a little over 340dpi — past what the
# page can show. The source is nearly twice that, and since a copy of this image
# is embedded in every letter generated, the excess is worth trimming: a
# 500-letter batch carries it 500 times.
MAX_WIDTH = 520

# The artwork is one flat colour, so the only real data is the alpha channel.
# Storing it as an indexed PNG whose palette is that colour at ALPHA_LEVELS
# different opacities drops the file from ~264KB to ~48KB. 64 steps is more than
# enough to keep the edges smooth.
ALPHA_LEVELS = 64


def main(source):
    page = pypdf.PdfReader(source).pages[0]
    xobjects = page.get("/Resources", {}).get("/XObject") or {}
    if len(xobjects) != 1:
        sys.exit(f"Expected exactly one image on the stamp page, found {len(xobjects)}.")
    image = next(iter(xobjects.values())).get_object()

    mask_ref = image.get("/SMask")
    if mask_ref is None:
        sys.exit("The stamp image has no soft mask; nothing to turn into transparency.")
    mask = Image.open(io.BytesIO(mask_ref.get_object().get_data())).convert("L")

    ink = tuple(image.get_data())
    if len(ink) != 3:
        sys.exit(f"Expected a single RGB ink pixel, got {len(ink)} bytes.")

    box = mask.getbbox()
    if not box:
        sys.exit("The stamp mask is empty.")
    mask = mask.crop(box)

    mask = save_flat_colour_png(mask, ink, TARGET, max_width=MAX_WIDTH, levels=ALPHA_LEVELS)

    print(f"Wrote {TARGET.relative_to(ROOT)} ({mask.width} x {mask.height}px, "
          f"ink #{ink[0]:02X}{ink[1]:02X}{ink[2]:02X}, {ALPHA_LEVELS} alpha levels, "
          f"{TARGET.stat().st_size:,} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
