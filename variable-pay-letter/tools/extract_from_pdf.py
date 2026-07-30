#!/usr/bin/env python3
"""Pull the letterhead artwork and the signature out of the supplied PDF.

Euler provided a two page PDF: page 1 is the blank letterhead, page 2 is Priyanka
Singh's signature. Both are embedded images. This writes them to assets/ so the
whole pipeline can be rerun from the original file.

The signature arrives as JPEG 2000 with the strokes carried entirely in the alpha
channel and the colour channels black, so it is rewritten as a plain RGBA PNG,
cropped to the ink, ready to sit over the letter.

    python tools/extract_from_pdf.py assets/Euler_Motors_Letterhead_source.pdf

Then regenerate the derived assets:

    python tools/make_a4_letterhead.py
    python tools/extract_logo.py
"""

import io
import sys
from pathlib import Path

import pypdf
from PIL import Image

from pngutil import save_flat_colour_png

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

LETTERHEAD_PAGE = 0
SIGNATURE_PAGE = 1

# The signature prints 40mm wide, so 480px is a shade over 300dpi.
SIGNATURE_MAX_WIDTH = 480
SIGNATURE_ALPHA_LEVELS = 64


def only_image(page, label):
    images = list(page.images)
    if len(images) != 1:
        sys.exit(f"Expected exactly one image on the {label} page, found {len(images)}.")
    return Image.open(io.BytesIO(images[0].data))


def main(source):
    reader = pypdf.PdfReader(source)
    if len(reader.pages) < 2:
        sys.exit(f"Expected at least 2 pages in {source}, found {len(reader.pages)}.")

    letterhead = only_image(reader.pages[LETTERHEAD_PAGE], "letterhead").convert("RGB")
    target = ASSETS / "letterhead.jpg"
    letterhead.save(target, quality=94, subsampling=0, optimize=True)
    print(f"Wrote {target.relative_to(ROOT)} ({letterhead.width} x {letterhead.height}px)")

    signature = only_image(reader.pages[SIGNATURE_PAGE], "signature")
    if signature.mode != "RGBA":
        signature = signature.convert("RGBA")
    alpha = signature.split()[3]
    box = alpha.getbbox()
    if not box:
        sys.exit("The signature page has no visible ink.")
    alpha = alpha.crop(box)

    # Ink is black; alpha carries the stroke coverage and its antialiasing.
    target = ASSETS / "signature.png"
    alpha = save_flat_colour_png(alpha, (0, 0, 0), target,
                                 max_width=SIGNATURE_MAX_WIDTH,
                                 levels=SIGNATURE_ALPHA_LEVELS)
    print(f"Wrote {target.relative_to(ROOT)} ({alpha.width} x {alpha.height}px, "
          f"{target.stat().st_size:,} bytes)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
