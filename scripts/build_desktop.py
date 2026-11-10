"""Build the source-checkout macOS app. No installation or service changes."""
from pathlib import Path
import os,plistlib,shutil,subprocess
from PIL import Image
project=Path(__file__).resolve().parents[1]
root=project/'apps/desktop'
node=shutil.which('node')
if not node:raise SystemExit('Node 22+ is required')
subprocess.run(['python3','scripts/prepare_desktop.py'],cwd=project,check=True)
subprocess.run(['cargo','build','--locked','--manifest-path',str(project/'native/transport/Cargo.toml')],check=True)
subprocess.run(['cargo','build','--locked','--manifest-path',str(root/'src-tauri/Cargo.toml')],check=True,env={**os.environ,'BUDDY_NODE':node})
app=root/'dist/MiBand Agent Buddy.app/Contents'
(app/'MacOS').mkdir(parents=True,exist_ok=True)
(app/'Resources').mkdir(exist_ok=True)
Image.open(root/'src-tauri/icons/icon.png').save(app/'Resources/Buddy.icns',format='ICNS')
shutil.copy2(root/'src-tauri/target/debug/miband-agent-buddy',app/'MacOS/miband-agent-buddy')
(app/'Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable':'miband-agent-buddy','CFBundleIdentifier':'io.github.jamesgzm.miband-agent-buddy','CFBundleName':'MiBand Agent Buddy','CFBundleDisplayName':'MiBand Agent Buddy','CFBundlePackageType':'APPL','CFBundleIconFile':'Buddy.icns','CFBundleShortVersionString':'0.5.0','CFBundleVersion':'1','NSHighResolutionCapable':True,'NSBluetoothAlwaysUsageDescription':'Connect to your Xiaomi Smart Band to synchronize Buddy and install its updates.'}))
print(app.parent)
