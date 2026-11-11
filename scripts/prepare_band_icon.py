"""Produce the band launcher's static icon from the approved application master."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def prepare_icon(target=None):
    target = target or ROOT / 'apps/band/src/common/icon.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(ROOT / 'apps/desktop/artwork/app-icon.png').convert('RGBA')
    image = image.resize((160, 160), Image.Resampling.LANCZOS)
    background = Image.new('RGBA', (192, 192), (0, 0, 0, 255))
    background.alpha_composite(image, (16, 16))
    background.convert('RGB').save(target, optimize=True)


if __name__ == '__main__':
    prepare_icon()
