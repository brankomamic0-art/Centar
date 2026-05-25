"""
Konvertira sve JPG/JPEG slike u WebP format.
- Resamplira na max širinu/visinu (zadano: 1400px)
- Sprema WebP pored originala (ili u zaseban folder)
- Ispisuje uštedinu u veličini za svaku sliku

Upotreba:
    py convert_to_webp.py                  # konvertira sve JPG u projektu
    py convert_to_webp.py neuro/           # samo jedan folder
    py convert_to_webp.py --max-size 1200  # custom max dimenzija
    py convert_to_webp.py --quality 82     # custom WebP kvaliteta (0-100)
    py convert_to_webp.py --dry-run        # samo prikaži što bi se radilo
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow nije instaliran. Instaliraj ga s:\n    py -m pip install Pillow")
    sys.exit(1)


def convert(src: Path, max_size: int, quality: int, dry_run: bool) -> tuple[int, int]:
    """Konvertira jednu sliku. Vraća (original_bytes, webp_bytes)."""
    dst = src.with_suffix(".webp")

    orig_bytes = src.stat().st_size

    if dry_run:
        print(f"  [dry-run] {src.relative_to(ROOT)}  ->  {dst.name}")
        return orig_bytes, orig_bytes

    with Image.open(src) as img:
        img = img.convert("RGB")
        if img.width > max_size or img.height > max_size:
            img.thumbnail((max_size, max_size), Image.LANCZOS)
        img.save(dst, "WEBP", quality=quality, method=6)

    webp_bytes = dst.stat().st_size
    saved_pct = (1 - webp_bytes / orig_bytes) * 100
    orig_kb = orig_bytes / 1024
    webp_kb = webp_bytes / 1024
    arrow = "OK" if saved_pct > 0 else "!!"
    print(f"  {arrow} {src.name:<45} {orig_kb:>7.0f} KB  ->  {webp_kb:>6.0f} KB  ({saved_pct:+.0f}%)")
    return orig_bytes, webp_bytes


def main():
    parser = argparse.ArgumentParser(description="JPG → WebP batch konverter")
    parser.add_argument("folder", nargs="?", default=".", help="Folder za pretraživanje (zadano: .)")
    parser.add_argument("--max-size", type=int, default=1400, help="Max širina/visina u px (zadano: 1400)")
    parser.add_argument("--quality", type=int, default=82, help="WebP kvaliteta 0-100 (zadano: 82)")
    parser.add_argument("--dry-run", action="store_true", help="Samo prikaži što bi se radilo, bez konverzije")
    args = parser.parse_args()

    global ROOT
    ROOT = Path(args.folder).resolve()

    if not ROOT.exists():
        print(f"Greška: folder '{ROOT}' ne postoji.")
        sys.exit(1)

    images = sorted(ROOT.rglob("*.jpg")) + sorted(ROOT.rglob("*.jpeg"))
    # Preskoči već konvertirane (ako postoji .webp s istim imenom)
    images = [p for p in images if not p.with_suffix(".webp").exists()]

    if not images:
        print("Nema JPG slika za konverziju (ili su sve već konvertirane).")
        return

    print(f"\nKonverzija {len(images)} slika  |  max {args.max_size}px  |  kvaliteta {args.quality}\n")

    total_orig = total_webp = 0
    for img_path in images:
        orig, webp = convert(img_path, args.max_size, args.quality, args.dry_run)
        total_orig += orig
        total_webp += webp

    if not args.dry_run:
        saved_total = (1 - total_webp / total_orig) * 100
        print(f"\n{'-'*60}")
        print(f"  Ukupno:  {total_orig/1024/1024:.1f} MB  →  {total_webp/1024/1024:.1f} MB  ({saved_total:+.0f}%)")
        print(f"\nOriginalne JPG slike su ostavljene netaknute.")
        print(f"Kada provjeriš da WebP slike izgledaju dobro, možeš obrisati JPG-ove.")


if __name__ == "__main__":
    main()
