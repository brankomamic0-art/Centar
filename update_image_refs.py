"""
1. Zamjenjuje .jpg/.jpeg reference s .webp u svim HTML fajlovima
2. Brise originalne JPG/JPEG fajlove (samo ako postoji .webp verzija)
"""

import sys
from pathlib import Path

ROOT = Path(__file__).parent

HTML_FILES = list(ROOT.rglob("*.html"))

REPLACEMENTS = [
    ('.jpg"',          '.webp"'),
    (".jpg'",          ".webp'"),
    ('.jpeg"',         '.webp"'),
    (".jpeg'",         ".webp'"),
    ('type="image/jpeg"', 'type="image/webp"'),
    # CSS background-image url()
    ('.jpg)',           '.webp)'),
    ('.jpeg)',          '.webp)'),
]

# Ove stringove NE mijenjamo (placeholderi, komentari u admin panelu)
SKIP_LINES_CONTAINING = [
    'placeholder=',
]


def update_html(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    changed = 0

    new_lines = []
    for line in lines:
        if any(skip in line for skip in SKIP_LINES_CONTAINING):
            new_lines.append(line)
            continue
        new_line = line
        for old, new in REPLACEMENTS:
            new_line = new_line.replace(old, new)
        if new_line != line:
            changed += 1
        new_lines.append(new_line)

    if changed:
        path.write_text("".join(new_lines), encoding="utf-8")
        print(f"  Updated {changed:2d} line(s): {path.relative_to(ROOT)}")
    return changed


def delete_originals():
    patterns = list(ROOT.rglob("*.jpg")) + list(ROOT.rglob("*.jpeg"))
    deleted = []
    skipped = []
    for jpg in patterns:
        webp = jpg.with_suffix(".webp")
        if webp.exists():
            jpg.unlink()
            deleted.append(jpg)
        else:
            skipped.append(jpg)
    return deleted, skipped


def main():
    print(f"\n=== Korak 1: Update HTML referenci ===\n")
    total = 0
    for html in sorted(HTML_FILES):
        total += update_html(html)
    print(f"\n  Ukupno promijenjenih linija: {total}")

    print(f"\n=== Korak 2: Brisanje originalnih JPG/JPEG fajlova ===\n")
    deleted, skipped = delete_originals()
    for p in deleted:
        print(f"  Obrisano: {p.relative_to(ROOT)}")
    if skipped:
        print(f"\n  Preskoceno (nema .webp verzije):")
        for p in skipped:
            print(f"    {p.relative_to(ROOT)}")
    print(f"\n  Obrisano {len(deleted)} fajlova, preskoceno {len(skipped)}.")
    print(f"\nGotovo.")


if __name__ == "__main__":
    main()
