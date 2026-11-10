"""Share generated Vela artwork with the Mac preview; no alternate mascot renderer."""
from pathlib import Path
import shutil
from PIL import Image
root=Path(__file__).resolve().parents[1]
assets=root/'desktop/ui/assets';assets.mkdir(exist_ok=True)
shutil.copytree(root/'quickapp/src/common/capsule',assets/'capsule',dirs_exist_ok=True)
for theme,prefix in [('chatgpt',''),('claude','claude-')]:
 im=Image.new('RGBA',(490,192),'black')
 for name in [prefix+'ring-idle.png',prefix+'symbols.png']:
  im.alpha_composite(Image.open(assets/'capsule'/name).convert('RGBA').transpose(Image.Transpose.ROTATE_90))
 im.save(assets/(theme+'-preview.png'))
for name in ['native-ui','display']:
 source=(root/'quickapp/src/common'/f'{name}.js').read_text().replace('module.exports=','export default ')
 (assets/f'{name}.mjs').write_text(source)
