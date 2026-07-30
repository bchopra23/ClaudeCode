#!/usr/bin/env python3
"""Inline every dependency into one self-contained HTML file.

The result runs from a double-click with no server, no network and no install,
which is the whole point: it gets handed to whoever in HR needs to issue letters.

    python tools/build.py
"""

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "index.html"
OUT = ROOT / "dist" / "Variable_Pay_Letter_Generator.html"

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def b64(path):
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_uri(path):
    return f"data:{MIME[path.suffix.lower()]};base64,{b64(path)}"


def require_asset(*names):
    for name in names:
        path = ROOT / "assets" / name
        if path.exists():
            return path
    sys.exit(f"Missing required asset: expected one of {names} in assets/")


def substitute(html, token, value):
    """Replace a token exactly once, loudly failing if the source drifted."""
    if html.count(token) != 1:
        sys.exit(f"Expected exactly one {token} in {SRC.name}, found {html.count(token)}")
    return html.replace(token, value)


def main():
    html = SRC.read_text(encoding="utf-8")

    employees = json.loads((ROOT / "data" / "employees.json").read_text(encoding="utf-8"))
    # Compact separators keep the payload small; the file is read by code, not people.
    html = substitute(html, '"__EMPLOYEES__"', json.dumps(employees, ensure_ascii=False, separators=(",", ":")))

    fonts = {
        "normal": b64(ROOT / "vendor" / "fonts" / "Poppins-Regular.ttf"),
        "semibold": b64(ROOT / "vendor" / "fonts" / "Poppins-SemiBold.ttf"),
        "bold": b64(ROOT / "vendor" / "fonts" / "Poppins-Bold.ttf"),
    }
    html = substitute(html, '"__FONTS__"', json.dumps(fonts, separators=(",", ":")))

    # Prefer the A4 rebuild; assets/letterhead.jpg is the Letter-shaped original.
    letterhead = require_asset("letterhead_a4.jpg", "letterhead.jpg", "letterhead.png")
    html = substitute(html, '"__LETTERHEAD__"', json.dumps(data_uri(letterhead)))
    print(f"Letterhead: assets/{letterhead.name} ({letterhead.stat().st_size:,} bytes)")

    signature = require_asset("signature.png", "signature.jpg", "signature.jpeg")
    html = substitute(html, '"__SIGNATURE__"', json.dumps(data_uri(signature)))
    print(f"Signature:  assets/{signature.name} ({signature.stat().st_size:,} bytes)")

    # Sits in an HTML src attribute, so the quotes json.dumps adds are the ones
    # the attribute needs. Same token shape as the rest, no special casing.
    logo = require_asset("logo.png", "logo.jpg")
    html = substitute(html, '"__LOGO__"', json.dumps(data_uri(logo)))
    print(f"Logo:       assets/{logo.name} ({logo.stat().st_size:,} bytes)")

    for token, name in (
        ("/*__JSPDF__*/", "jspdf.umd.min.js"),
        # The worker must be inlined ahead of pdf.min.js: that registers
        # window.pdfjsWorker, letting PDF.js parse on the main thread. Spawning a
        # real Worker is not an option, since browsers refuse to create one from
        # a file:// page, and this app is meant to be opened by double-clicking.
        ("/*__PDFJS_WORKER__*/", "pdf.worker.min.js"),
        ("/*__PDFJS__*/", "pdf.min.js"),
    ):
        source = (ROOT / "vendor" / name).read_text(encoding="utf-8")
        # A literal </script> inside the payload would close the wrapping tag early.
        html = substitute(html, token, source.replace("</script", "<\\/script"))

    # The source carries a dev-only banner; the built file should not.
    html = re.sub(r"\s*<!--BUILD:STRIP-->.*?<!--/BUILD:STRIP-->", "", html, flags=re.S)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB, {len(employees)} employees)")


if __name__ == "__main__":
    main()
