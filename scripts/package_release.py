"""Package the built, relocatable app. Does not create tags or publish remotely."""
from pathlib import Path
import hashlib
import json
import platform
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'apps/desktop/dist/MiBand Agent Buddy.app'


def create_dmg(app, target):
    with tempfile.TemporaryDirectory(prefix='buddy-dmg-') as temporary:
        stage = Path(temporary) / 'contents'
        stage.mkdir()
        subprocess.run(['ditto', str(app), str(stage / app.name)], check=True)
        (stage / 'Applications').symlink_to('/Applications', target_is_directory=True)
        subprocess.run(['hdiutil', 'create', '-volname', 'MiBand Agent Buddy',
                        '-srcfolder', str(stage), '-fs', 'HFS+', '-format', 'UDZO',
                        '-ov', str(target)], check=True)
    subprocess.run(['hdiutil', 'verify', str(target)], check=True)


def main():
    arch = {'arm64': 'arm64', 'x86_64': 'x64'}.get(platform.machine())
    if not arch:
        raise SystemExit('Only macOS arm64 and x64 releases are supported')
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(APP)], check=True)
    # The unresolved MsgPack dependency must never enter the shipped native binary.
    tree = subprocess.check_output(['cargo', 'tree', '--locked', '--manifest-path', str(ROOT / 'native/transport/Cargo.toml'), '--edges', 'normal'], text=True)
    if 'vivo-msgpack' in tree:
        raise SystemExit('Vivo MsgPack is still in the distribution dependency graph')
    target = ROOT / 'dist' / f'MiBand-Agent-Buddy-macos-{arch}.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(APP.rglob('*')):
            if file.is_symlink():
                raise SystemExit(f'Unexpected symlink in release: {file.relative_to(APP)}')
            if file.is_file():
                archive.write(file, file.relative_to(APP.parent))
    if target.stat().st_size > 300 * 1024 * 1024:
        raise SystemExit('Release exceeds the updater download limit')
    (ROOT / 'dist' / f'SHA256SUMS-{arch}').write_text(hashlib.sha256(target.read_bytes()).hexdigest() + '  ' + target.name + '\n')
    dmg = target.with_suffix('.dmg')
    create_dmg(APP, dmg)
    dmg.with_name(dmg.name + '.sha256').write_text(hashlib.sha256(dmg.read_bytes()).hexdigest() + '  ' + dmg.name + '\n')
    files = [ROOT / 'dist/buddy.debug.rpk', ROOT / 'dist/buddy-package.json']
    (ROOT / 'dist/SHA256SUMS-buddy').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in files))
    print(target)
    print(dmg)


if __name__ == '__main__':
    main()
