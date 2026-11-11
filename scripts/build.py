"""Build only Buddy and its shared Mac preview artwork; never install anything."""
import hashlib,json,shutil,subprocess,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    subprocess.run(['python3','scripts/prepare_shared.py'],cwd=ROOT,check=True)
    subprocess.run(['python3','scripts/render_band_ui.py'],cwd=ROOT,check=True)
    subprocess.run(['python3','scripts/prepare_desktop.py'],cwd=ROOT,check=True)
    subprocess.run(['npm','run','build'],cwd=ROOT/'apps/band',check=True)
    manifest=json.loads((ROOT/'apps/band/src/manifest.json').read_text())
    source=ROOT/'apps/band/dist'/(manifest['package']+'.debug.'+manifest['versionName']+'.rpk')
    with zipfile.ZipFile(source) as archive:
        images=[name for name in archive.namelist() if name.lower().endswith(('.png','.jpg','.jpeg','.webp','.gif','.svg'))]
        if images!=['common/icon.png']:raise RuntimeError('Unexpected band image assets: '+repr(images))
    target=ROOT/'dist/buddy.debug.rpk';target.parent.mkdir(exist_ok=True);shutil.copy2(source,target)
    digest=hashlib.sha256(target.read_bytes()).hexdigest()
    (target.parent/'SHA256SUMS').write_text(digest+'  buddy.debug.rpk\n')
    (target.parent/'buddy-package.json').write_text(json.dumps({'versionName':manifest['versionName'],'versionCode':manifest['versionCode'],'sha256':digest})+'\n')
    print('Built Buddy '+manifest['versionName'])
if __name__=='__main__':main()
