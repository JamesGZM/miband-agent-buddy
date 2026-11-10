"""Small, static PNG layers for native Vela image components (no frame animator)."""
from pathlib import Path
from PIL import Image,ImageDraw
import math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'quickapp/src/common/capsule'
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

def save(im,name):
 im=im.resize((490,192),Image.Resampling.LANCZOS).transpose(Image.Transpose.ROTATE_270)
 im.save(OUT/name,optimize=True)

save(layer(),'blank.png')
base=layer();ring(base,8,'#141D38',7);save(base,'face-track.png')
for mode,color in {'idle':'#728BFF','thinking':'#728BFF','working':'#728BFF','attention':'#FFBD64','complete':'#77EDBD','error':'#FF7766','sleep':'#728BFF','offline':'#7187B0'}.items():
 im=layer();ring(im,8,color,7);save(im,'ring-'+mode+'.png')
for mode in ['thinking','working']:
 for frame in range(24):
  im=layer()
  for start in ([frame/24] if mode=='thinking' else [frame/24,(frame/24+.5)%1]):
   fraction=.24 if mode=='thinking' else .16
   ring(im,8,'#94B5FF',7,start,fraction)
   ring(im,8,'#E8F9FF',7,(start+fraction-.025)%1,.025)
  save(im,f'{mode}-{frame:02}.png')
for name,color in [('symbols','#A7F3FF'),('symbols-offline','#8298B4')]:
 im=layer();d=ImageDraw.Draw(im)
 vertices=[(118,50),(138,50),(138,60),(150,60),(150,72),(162,72),(162,84),(176,84),(176,104),(162,104),(162,116),(150,116),(150,128),(138,128),(138,140),(118,140),(118,124),(130,124),(130,112),(142,112),(142,100),(154,100),(154,88),(142,88),(142,76),(130,76),(130,64),(118,64)]
 d.polygon([(x*S,y*S)for x,y in vertices],fill=color);d.rectangle((289*S,116*S,381*S-1,136*S-1),fill=color);save(im,name+'.png')
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
 im=layer();ring(im,8,color,7);save(im,'claude-ring-'+mode+'.png')
for mode in ['thinking','working']:
 for frame in range(24):
  im=layer()
  for start in ([frame/24] if mode=='thinking' else [frame/24,(frame/24+.5)%1]):
   fraction=.24 if mode=='thinking' else .16
   ring(im,8,'#EBA270',7,start,fraction);ring(im,8,'#FFE7CD',7,(start+fraction-.025)%1,.025)
  save(im,f'claude-{mode}-{frame:02}.png')
for name,color in [('symbols','#EBA270'),('symbols-offline','#947F74')]:
 im=layer();d=ImageDraw.Draw(im)
 grid=['00100000000100','00110000001100','00011111111000','11111111111111','01111111111110','00111011011100','00111011011100','00111111111100','01111111111110','11001111110011','00011000011000']
 size=9;left=(490-len(grid[0])*size)//2;top=(192-len(grid)*size)//2
 for y,row in enumerate(grid):
  for x,on in enumerate(row):
   if on=='1':d.rectangle(((left+x*size)*S,(top+y*size)*S,(left+(x+1)*size)*S-1,(top+(y+1)*size)*S-1),fill=color)
 save(im,'claude-'+name+'.png')
# Application icon is original geometry; it is not a third-party brand asset.
icon=Image.new('RGBA',(256,256),(0,0,0,0));d=ImageDraw.Draw(icon)
d.rounded_rectangle((8,8,248,248),radius=52,fill='#272522')
d.line([(57,80),(103,126),(57,172)],fill='#EBA270',width=19,joint='curve')
d.rectangle((137,156,201,174),fill='#EBA270')
icon.save(ROOT/'quickapp/src/common/icon.png')
(ROOT/'desktop/src-tauri/icons').mkdir(parents=True,exist_ok=True)
icon.save(ROOT/'desktop/src-tauri/icons/icon.png')
