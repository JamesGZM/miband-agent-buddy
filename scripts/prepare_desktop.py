"""Prepare desktop icons and three static Buddy theme thumbnails."""
from pathlib import Path
from PIL import Image,ImageDraw
from prepare_shared import prepare
prepare()
root=Path(__file__).resolve().parents[1]
assets=root/'apps/desktop/ui/assets';assets.mkdir(exist_ok=True)
from render_band_ui import render_thumbnails
render_thumbnails()
icons=root/'apps/desktop/src-tauri/icons';icons.mkdir(parents=True,exist_ok=True)
with Image.open(root/'apps/desktop/artwork/app-icon.png') as source:
 icon=source.convert('RGBA')
icon.resize((1024,1024),Image.Resampling.LANCZOS).save(icons/'icon.png')
icon.save(icons/'icon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
icon.resize((64,64),Image.Resampling.LANCZOS).save(assets/'app-icon.png')
# Template artwork uses alpha only: macOS supplies the light/dark menu-bar color.
scale=4
tray=Image.new('RGBA',(32*scale,32*scale),(0,0,0,0));td=ImageDraw.Draw(tray)
td.rounded_rectangle(tuple(v*scale for v in (3,8,27,28)),radius=6*scale,outline='black',width=2*scale)
# Knock out the frame behind the sparkle so both shapes retain a clear silhouette.
td.ellipse(tuple(v*scale for v in (18.5,-1.5,33.5,13.5)),fill=(0,0,0,0))
for x in (10,18):
 td.rounded_rectangle((x*scale,14*scale,(x+3)*scale,22*scale),radius=1.5*scale,fill='black')
# A clear gap keeps the AI sparkle legible against the terminal frame at 16 px.
sparkle=[(26,1),(27.6,4.4),(31,6),(27.6,7.6),(26,11),(24.4,7.6),(21,6),(24.4,4.4)]
td.polygon([(x*scale,y*scale) for x,y in sparkle],fill='black')
tray.resize((32,32),Image.Resampling.LANCZOS).save(icons/'tray-template.png')
