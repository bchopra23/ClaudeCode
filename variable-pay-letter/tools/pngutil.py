"""Shared image helper for the flat-colour overlays.

Both the signature and the company seal are a single ink colour whose only real
information is the alpha channel. Stored as ordinary RGBA PNGs they are far
larger than they need to be, and since a copy of each is embedded in every letter
generated, that cost is paid once per letter in a bulk run.

Storing them as indexed PNGs whose palette is that one colour repeated at a range
of opacities cuts them by roughly 3-5x with no visible change.
"""

from PIL import Image


def save_flat_colour_png(mask, ink, target, max_width=None, levels=64):
    """Write an indexed PNG of `ink` shaded by `mask` (an 8-bit alpha channel).

    Args:
        mask: PIL "L" image holding stroke coverage.
        ink: (r, g, b) of the single colour in the artwork.
        target: pathlib.Path to write.
        max_width: downscale to this width first, if the mask is wider.
        levels: number of distinct opacities to keep, up to 256.

    Returns the mask actually written, so callers can report its size.
    """
    if not 2 <= levels <= 256:
        raise ValueError("levels must be between 2 and 256")

    if max_width and mask.width > max_width:
        height = round(mask.height * max_width / mask.width)
        mask = mask.resize((max_width, height), Image.LANCZOS)

    step = 256 // levels
    indexed = Image.new("P", mask.size)
    indexed.putdata(bytes(min(value // step, levels - 1) for value in mask.tobytes()))
    indexed.putpalette(list(ink) * levels + [0, 0, 0] * (256 - levels))

    # Index 0 is fully transparent; the rest ramp up to opaque.
    alphas = [0] + [min(255, i * step + step - 1) for i in range(1, levels)]
    indexed.save(target, optimize=True, transparency=bytes(alphas + [0] * (256 - levels)))
    return mask
