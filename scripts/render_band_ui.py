"""Generate desktop thumbnails; retire the obsolete bitmap animation outputs."""
from pathlib import Path
import json
import shutil
import subprocess
from PIL import Image, ImageDraw
from prepare_band_icon import prepare_icon
ROOT = Path(__file__).resolve().parents[1]


def render_thumbnails():
    assets = ROOT / 'apps/desktop/ui/assets'
    assets.mkdir(parents=True, exist_ok=True)
    source = "const g=require('./packages/buddy-shared/presentation/geometry.js');console.log(JSON.stringify(['chatgpt','claude','deepseek'].map(theme=>({theme,frame:g.frame({theme,mode:'idle',seconds:0,still:true})}))));"
    scenes = json.loads(subprocess.check_output(['node', '-e', source], cwd=ROOT, text=True))
    scale = 4
    for scene in scenes:
        image = Image.new('RGB', (490*scale, 192*scale), 'black')
        draw = ImageDraw.Draw(image)
        for rect in scene['frame']['rects']:
            x, y, w, h = [rect[k]*scale for k in ['left', 'top', 'width', 'height']]
            radius = min(rect['radius']*scale, w/2, h/2)
            draw.rounded_rectangle((x, y, x+w-1, y+h-1), radius=radius, fill=rect['color'])
        for arc in scene['frame']['arcs']:
            x, y = arc['left']+arc['center'], arc['top']+arc['center']
            r = arc['radius']+arc['width']/2
            draw.arc(tuple(v*scale for v in (x-r, y-r, x+r, y+r)), start=arc['start']-90,
                     end=arc['start']+arc['total']-90, fill=arc['color'], width=round(arc['width']*scale))
        image.resize((490, 192), Image.Resampling.LANCZOS).save(assets/(scene['theme']+'-preview.png'))


def retire_frames():
    for relative in ['apps/band/src/common/capsule', 'apps/desktop/ui/assets/capsule']:
        path = ROOT / relative
        if path.is_symlink():
            raise RuntimeError('Refusing to remove symlink: '+relative)
        if path.exists():
            count = len(list(path.glob('*.png')))
            shutil.rmtree(path)
            print('Removed', count, 'obsolete generated frames from', relative)


if __name__ == '__main__':
    render_thumbnails()
    prepare_icon()
    retire_frames()
