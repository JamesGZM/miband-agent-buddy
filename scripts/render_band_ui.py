"""Small, static PNG layers for native Vela image components (no frame animator)."""
from pathlib import Path
from PIL import Image,ImageDraw
import math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'apps/band/src/common/capsule'
OUT.mkdir(parents=True,exist_ok=True)
S=2

def layer():return Image.new('RGBA',(490*S,192*S))
def points(inset):
 r=96-inset
 p=[(245,inset),(394,inset)]
 p += [(394+r*math.cos(a),96+r*math.sin(a)) for a in [-math.pi/2+i*math.pi/180 for i in range(181)]]
 p += [(96,192-inset)]
 p += [(96+r*math.cos(a),96+r*math.sin(a)) for a in [math.pi/2+i*math.pi/180 for i in range(181)]]
 p += [(245,inset)]
 return p

def ring(im,inset,color,width,start=0,fraction=1):
 p=points(inset);segments=[];length=0
 for a,b in zip(p,p[1:]):
  d=math.dist(a,b);segments.append((length,d,a,b));length+=d
 draw=ImageDraw.Draw(im)
 for lo,hi in [(start,start+fraction)]:
  for wrap in range(2):
   low=max(0,lo-wrap)*length;high=min(1,hi-wrap)*length
   if high<=low:continue
   selected=[]
   for pos,d,a,b in segments:
    if d==0 or pos+d<low or pos>high:continue
    for x in [max(0,(low-pos)/d),min(1,(high-pos)/d)]:selected.append(((a[0]+(b[0]-a[0])*x)*S,(a[1]+(b[1]-a[1])*x)*S))
   if len(selected)>1:
    draw.line(selected,fill=color,width=round(width*S),joint='curve')
    for x,y in [selected[0],selected[-1]]:
     rr=width*S/2;draw.ellipse((x-rr,y-rr,x+rr,y+rr),fill=color)

BREATH_LEVELS=8
def save(im,name,palette=False):
 im=im.resize((490,192),Image.Resampling.LANCZOS).transpose(Image.Transpose.ROTATE_270)
 if palette:im=im.quantize(64,method=Image.Quantize.FASTOCTREE)
 im.save(OUT/name,optimize=True)
# Vela does not reliably repaint bound opacity/offset styles, so motion is baked into frames.
def save_breath(im,name):
 for level in range(BREATH_LEVELS):
  frame=im.copy();alpha=frame.getchannel('A').point(lambda a,k=.32+.65*level/(BREATH_LEVELS-1):round(a*k))
  frame.putalpha(alpha);save(frame,f'{name}-b{level}.png',palette=True)
 save(im,name+'.png')
def save_nudge(im,name):
 for x in range(5):
  frame=layer();frame.alpha_composite(im,(x*S,0));save(frame,f'{name}-x{x}.png')

save(layer(),'blank.png')
base=layer();ring(base,8,'#141D38',7);save(base,'face-track.png')
for mode,color in {'idle':'#728BFF','thinking':'#728BFF','working':'#728BFF','attention':'#FFBD64','complete':'#77EDBD','error':'#FF7766','sleep':'#728BFF','offline':'#7187B0'}.items():
 im=layer();ring(im,8,color,7);save_breath(im,'ring-'+mode)
for mode in ['thinking','working']:
 for frame in range(24):
  im=layer()
  for start in ([frame/24] if mode=='thinking' else [frame/24,(frame/24+.5)%1]):
   fraction=.24 if mode=='thinking' else .16
   ring(im,8,'#94B5FF',7,start,fraction)
   ring(im,8,'#E8F9FF',7,(start+fraction-.025)%1,.025)
  save(im,f'{mode}-{frame:02}.png',palette=True)
for name,color in [('symbols','#A7F3FF'),('symbols-offline','#8298B4')]:
 im=layer();d=ImageDraw.Draw(im)
 vertices=[(118,50),(138,50),(138,60),(150,60),(150,72),(162,72),(162,84),(176,84),(176,104),(162,104),(162,116),(150,116),(150,128),(138,128),(138,140),(118,140),(118,124),(130,124),(130,112),(142,112),(142,100),(154,100),(154,88),(142,88),(142,76),(130,76),(130,64),(118,64)]
 d.polygon([(x*S,y*S)for x,y in vertices],fill=color);d.rectangle((289*S,116*S,381*S-1,136*S-1),fill=color);save(im,name+'.png')
 if name=='symbols':save_nudge(im,name)
background=layer()
for i,(name,color) in enumerate([('disk','#647FFF'),('memory','#A192FF'),('cpu','#78EDFF')]):
 inset=9+i*13;ring(background,inset,'#192126',2.5)
 for percent in range(101):
  im=layer()
  if percent:ring(im,inset,color,6,0,percent/100)
  save(im,f'{name}-{percent:03}.png')
save(background,'resource-tracks.png')
print('Rendered',len(list(OUT.glob('*.png'))),'small PNG layers')
# Original Claude-inspired pixel buddy; geometric source is part of this project.
for mode,color in {'idle':'#EBA270','thinking':'#EBA270','working':'#EBA270','attention':'#FFBD64','complete':'#77EDBD','error':'#FF7766','sleep':'#C58768','offline':'#947F74'}.items():
 im=layer();ring(im,8,color,7);save_breath(im,'claude-ring-'+mode)
for mode in ['thinking','working']:
 for frame in range(24):
  im=layer()
  for start in ([frame/24] if mode=='thinking' else [frame/24,(frame/24+.5)%1]):
   fraction=.24 if mode=='thinking' else .16
   ring(im,8,'#EBA270',7,start,fraction);ring(im,8,'#FFE7CD',7,(start+fraction-.025)%1,.025)
  save(im,f'claude-{mode}-{frame:02}.png',palette=True)
for name,color in [('symbols','#EBA270'),('symbols-offline','#947F74')]:
 im=layer();d=ImageDraw.Draw(im)
 grid=['00100000000100','00110000001100','00011111111000','11111111111111','01111111111110','00111011011100','00111011011100','00111111111100','01111111111110','11001111110011','00011000011000']
 size=9;left=(490-len(grid[0])*size)//2;top=(192-len(grid)*size)//2
 for y,row in enumerate(grid):
  for x,on in enumerate(row):
   if on=='1':d.rectangle(((left+x*size)*S,(top+y*size)*S,(left+(x+1)*size)*S-1,(top+(y+1)*size)*S-1),fill=color)
 save(im,'claude-'+name+'.png')
 if name=='symbols':save_nudge(im,'claude-'+name)
# Original pixel whale for the DeepSeek theme; geometry is drawn here, not a brand asset.
for mode,color in {'idle':'#4D6BFE','thinking':'#4D6BFE','working':'#4D6BFE','attention':'#FFBD64','complete':'#77EDBD','error':'#FF7766','sleep':'#3A52C4','offline':'#6C7A9C'}.items():
 im=layer();ring(im,8,color,7);save_breath(im,'deepseek-ring-'+mode)
for mode in ['thinking','working']:
 for frame in range(24):
  im=layer()
  for start in ([frame/24] if mode=='thinking' else [frame/24,(frame/24+.5)%1]):
   fraction=.24 if mode=='thinking' else .16
   ring(im,8,'#8FA2FF',7,start,fraction);ring(im,8,'#E6EBFF',7,(start+fraction-.025)%1,.025)
  save(im,f'deepseek-{mode}-{frame:02}.png',palette=True)
for name,color in [('symbols','#7E95FF'),('symbols-offline','#6C7A9C')]:
 im=layer();d=ImageDraw.Draw(im)
 grid=['000010100000000000','000001000000110011','000000000000011110','000111111100001100','001111111111001100','011111111111111000','110111111111110000','111111111111110000','011111111111100000','001111111111000000','000011111100000000']
 size=9;left=(490-len(grid[0])*size)//2;top=(192-len(grid)*size)//2
 for y,row in enumerate(grid):
  for x,on in enumerate(row):
   if on=='1':d.rectangle(((left+x*size)*S,(top+y*size)*S,(left+(x+1)*size)*S-1,(top+(y+1)*size)*S-1),fill=color)
 save(im,'deepseek-'+name+'.png')
 if name=='symbols':save_nudge(im,'deepseek-'+name)
# Band application icon is original geometry; desktop branding is prepared separately.
# Full-bleed opaque canvas (macOS masks the squircle). Solid shapes, not hairlines.
icon=Image.new('RGBA',(256,256),(18,20,26,255));d=ImageDraw.Draw(icon)
silver=(232,236,244,255);blue=(74,144,255,255);blue_hi=(130,180,255,255)
d.rounded_rectangle((48,150,208,198),radius=24,fill=silver)
d.rounded_rectangle((58,160,198,188),radius=14,fill=(18,20,26,255))
d.ellipse((148,158,188,198),fill=blue)
d.ellipse((158,166,170,178),fill=blue_hi)
d.polygon([(72,160),(108,174),(72,188),(80,174)],fill=silver)
d.rounded_rectangle((108,170,148,178),radius=4,fill=(120,130,150,255))
icon.save(ROOT/'apps/band/src/common/icon.png')
