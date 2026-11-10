"""Build only Buddy and its shared Mac preview artwork; never install anything."""
import hashlib,json,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    subprocess.run(['python3','tools/render_band_ui.py'],cwd=ROOT,check=True)
    subprocess.run(['python3','tools/prepare_desktop.py'],cwd=ROOT,check=True)
    subprocess.run(['npm','run','build'],cwd=ROOT/'quickapp',check=True)
    manifest=json.loads((ROOT/'quickapp/src/manifest.json').read_text())
    source=ROOT/'quickapp/dist'/(manifest['package']+'.debug.'+manifest['versionName']+'.rpk')
    target=ROOT/'dist/buddy.debug.rpk';target.parent.mkdir(exist_ok=True);shutil.copy2(source,target)
    (target.parent/'SHA256SUMS').write_text(hashlib.sha256(target.read_bytes()).hexdigest()+'  buddy.debug.rpk\n')
    print('Built Buddy '+manifest['versionName'])
if __name__=='__main__':main()
