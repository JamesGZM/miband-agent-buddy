"""Share generated Vela artwork with the Mac preview; no alternate mascot renderer."""
from pathlib import Path
import shutil
from PIL import Image
from prepare_shared import prepare
prepare()
root=Path(__file__).resolve().parents[1]
assets=root/'apps/desktop/ui/assets';assets.mkdir(exist_ok=True)
shutil.copytree(root/'apps/band/src/common/capsule',assets/'capsule',dirs_exist_ok=True)
for theme,prefix in [('chatgpt',''),('claude','claude-')]:
 im=Image.new('RGBA',(490,192),'black')
 for name in [prefix+'ring-idle.png',prefix+'symbols.png']:
  im.alpha_composite(Image.open(assets/'capsule'/name).convert('RGBA').transpose(Image.Transpose.ROTATE_90))
 im.save(assets/(theme+'-preview.png'))
