#!/usr/bin/env python3
"""
Builds the app icon from the source logo.

    python3 scripts/make-icon.py "Charcoal Overlapping Checkmark Logo.png"

The source art is trimmed to the mark itself, then centred on a rounded-square
tile with the transparent margin macOS expects, and written out as:

    build/icon.png            1024px master (electron-builder fallback)
    build/icon.icns           the packaged app icon
    src/renderer/assets/logo.png   128px tile used in the sidebar
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CANVAS = 1024          # full icon canvas
TILE = 824             # the rounded square inside it (Apple's proportion)
RADIUS = 185           # corner radius of that square
MARK = 0.60            # how much of the tile the logo itself fills
TILE_BG = (255, 255, 255, 255)


def trim(image, threshold=242):
    """Crop away the flat background the artwork sits on."""
    grey = image.convert('L').point(lambda v: 0 if v < threshold else 255)
    box = grey.point(lambda v: 255 - v).getbbox()
    return image.crop(box) if box else image


def drop_background(image, solid=180, clear=240):
    """
    Key out the artwork's light background so it can sit on any tile colour.

    Alpha is derived from luminance: anything at or below `solid` is fully
    opaque, anything at or above `clear` is fully transparent, and the band
    between keeps the edges antialiased. RGB is left alone, so the two
    charcoal tones of the overlap stay distinct.
    """
    luma = image.convert('L')
    span = max(1, clear - solid)
    alpha = luma.point(lambda v: 255 if v <= solid else (0 if v >= clear
                       else round((clear - v) * 255 / span)))
    out = image.copy()
    out.putalpha(alpha)
    return out


def build_tile(source_path):
    art = drop_background(trim(Image.open(source_path).convert('RGBA')))

    tile = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
    mask = Image.new('L', (TILE, TILE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, TILE - 1, TILE - 1], RADIUS, fill=255)
    tile.paste(Image.new('RGBA', (TILE, TILE), TILE_BG), (0, 0), mask)

    target = int(TILE * MARK)
    scale = min(target / art.width, target / art.height)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))),
                     Image.LANCZOS)

    # Optically centred: the checkmark's weight sits low, so lift it slightly.
    x = (TILE - art.width) // 2
    y = (TILE - art.height) // 2 - int(TILE * 0.015)
    tile.paste(art, (x, y), art)
    tile.putalpha(Image.composite(tile.getchannel('A'), Image.new('L', (TILE, TILE), 0), mask))

    icon = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    icon.paste(tile, ((CANVAS - TILE) // 2, (CANVAS - TILE) // 2), tile)
    return icon


def build_tray(source_path):
    """
    macOS menu-bar icon: a flat black silhouette on transparency. Marked as a
    template image, so the system recolours it for light and dark menu bars.
    """
    art = drop_background(trim(Image.open(source_path).convert('RGBA')))
    black = Image.new('RGBA', art.size, (0, 0, 0, 255))
    black.putalpha(art.getchannel('A'))
    return black


def save_tray(art, build, assets):
    targets = [build, assets]   # assets/ ships inside the packaged app
    for size, name in ((18, 'trayTemplate.png'), (36, 'trayTemplate@2x.png')):
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        inner = int(size * 0.82)
        scale = min(inner / art.width, inner / art.height)
        resized = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))),
                             Image.LANCZOS)
        canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
        for target in targets:
            canvas.save(target / name)


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else 'Charcoal Overlapping Checkmark Logo.png')
    if not source.is_absolute():
        source = ROOT / source
    if not source.exists():
        sys.exit(f'Source logo not found: {source}')

    icon = build_tile(source)

    build = ROOT / 'build'
    build.mkdir(exist_ok=True)
    icon.save(build / 'icon.png')

    iconset = build / 'icon.iconset'
    for old in iconset.glob('*.png'):
        old.unlink()
    iconset.mkdir(exist_ok=True)
    for size in (16, 32, 128, 256, 512):
        icon.resize((size, size), Image.LANCZOS).save(iconset / f'icon_{size}x{size}.png')
        icon.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f'icon_{size}x{size}@2x.png')

    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(build / 'icon.icns')],
                   check=True)

    assets = ROOT / 'src' / 'renderer' / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    # Sidebar mark: the tile alone, without the icon's transparent margin.
    icon.crop(((CANVAS - TILE) // 2, (CANVAS - TILE) // 2,
               (CANVAS + TILE) // 2, (CANVAS + TILE) // 2)) \
        .resize((128, 128), Image.LANCZOS).save(assets / 'logo.png')

    save_tray(build_tray(source), build, assets)

    print('build/icon.png, build/icon.icns, build/trayTemplate.png '
          'and src/renderer/assets/logo.png written')


if __name__ == '__main__':
    main()
