"""Encode a synthetic browser recording from readme-preview.html as README artwork."""
import argparse
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ACCENTS = ['#647fff','#78edff','#a192ff','#eba270','#ffbd64','#76cdb8','#8fa2ff','#edaa79',
           '#94b5ff','#77edbd','#728bff','#f3eee5','#f0f4f0','#ffffff','#000000','#4f8fff',
           '#79cfc3','#a6b7fa','#d39be0','#ebd080','#f09caa','#65d9bc','#efb86c','#c795e8',
           '#ee92a5','#8cd8ee','#4d6bfe','#64d6be','#e9b67d','#bd9ae8','#e992b1','#8acdeb']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frames', type=Path, help='Directory containing frames.json and captured frames')
    args = parser.parse_args()
    records = json.loads((args.frames / 'frames.json').read_text())
    if not 2 <= len(records) <= 300:
        raise ValueError('Expected 2–300 frames of the synthetic documentation scene')
    images = []
    for record in records:
        with Image.open(record['path']) as image:
            if image.size != (1600, 1100):
                raise ValueError('Capture the complete 1600×1100 artwork scene')
            images.append(image.convert('RGB').resize((1200, 825), Image.Resampling.LANCZOS))
    # Reserve actual product accents so dark backdrop gradients cannot consume
    # every palette slot and turn the task colors or app icon into gray.
    sheet = Image.new('RGB', (600, 276))
    for slot in range(6):
        index = slot * (len(images) - 1) // 5
        sheet.paste(images[index].resize((200, 138)), ((slot % 3) * 200, (slot // 3) * 138))
    palette = Image.new('P', (1, 1))
    colors = sheet.quantize(colors=256-len(ACCENTS)).getpalette()[:(256-len(ACCENTS))*3]
    for color in ACCENTS:
        colors.extend(bytes.fromhex(color[1:]))
    palette.putpalette(colors)
    encoded = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    durations = [max(20, round((records[index + 1]['at'] - record['at']) / 10) * 10)
                 if index + 1 < len(records) else 100 for index, record in enumerate(records)]
    target = ROOT / 'docs/images/hero.gif'
    encoded[0].save(target, save_all=True, append_images=encoded[1:], duration=durations,
                    loop=0, optimize=True, disposal=1)
    with Image.open(records[0]['path']) as image:
        image.convert('RGB').save(target.with_suffix('.png'), optimize=True)
    with Image.open(target) as image:
        if image.n_frames < 2 or 'transparency' in image.info:
            raise ValueError('Expected opaque animated artwork')
        print(f'{image.n_frames} frames; {sum(durations)} ms; {target.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
