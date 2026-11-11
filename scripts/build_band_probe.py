"""Build the normal code-drawn Buddy UI with a local version; never publish."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
from prepare_band_icon import prepare_icon

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activate', action='store_true')
    parser.add_argument('--revision', type=int, default=1)
    args = parser.parse_args()
    if not 1 <= args.revision <= 10000:
        parser.error('--revision must be between 1 and 10000')
    subprocess.run(['python3', 'scripts/prepare_shared.py'], cwd=ROOT, check=True)
    output = ROOT / 'dist/band-code-probe'
    output.mkdir(parents=True, exist_ok=True)
    # aiot-toolkit's absolute glob excludes every path beneath a "dist" folder.
    with tempfile.TemporaryDirectory(prefix='buddy-code-probe-') as directory:
        project = Path(directory)
        shutil.copytree(ROOT / 'apps/band/src', project / 'src', ignore=shutil.ignore_patterns('capsule', 'pets', '*.png'))
        shutil.copy2(ROOT / 'apps/band/package.json', project / 'package.json')
        (project / 'node_modules').symlink_to(ROOT / 'apps/band/node_modules', target_is_directory=True)
        manifest = json.loads((project / 'src/manifest.json').read_text())
        manifest['versionName'] += f'-code.{args.revision}'
        manifest['versionCode'] += args.revision
        (project / 'src/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        prepare_icon(project / 'src/common/icon.png')
        subprocess.run(['npm', 'run', 'build'], cwd=project, check=True)
        package = project / 'dist' / f"{manifest['package']}.debug.{manifest['versionName']}.rpk"
        if not package.is_file():
            raise SystemExit('Toolkit returned without producing the local Buddy package')
        with zipfile.ZipFile(package) as archive:
            images = [name for name in archive.namelist() if name.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'))]
            if len(images) != 1 or not images[0].endswith('common/icon.png'):
                raise SystemExit(f'Unexpected local image resources: {images}')
        target = output / 'buddy.debug.rpk'
        shutil.copy2(package, target)
        metadata = {'versionName': manifest['versionName'], 'versionCode': manifest['versionCode'],
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
        (output / 'buddy-package.json').write_text(json.dumps(metadata) + '\n')
    if args.activate:
        backup = Path(tempfile.mkdtemp(prefix='band-probe-backup-', dir=ROOT / 'dist'))
        for name in ['buddy.debug.rpk', 'buddy-package.json', 'SHA256SUMS']:
            current = ROOT / 'dist' / name
            if current.exists():
                shutil.copy2(current, backup / name)
        for name in ['buddy.debug.rpk', 'buddy-package.json']:
            shutil.copy2(output / name, ROOT / 'dist' / name)
        (ROOT / 'dist/SHA256SUMS').write_text(metadata['sha256'] + '  buddy.debug.rpk\n')
        print('Previous package retained at', backup)
    print('Built local Buddy', metadata['versionName'], target.stat().st_size, 'bytes; launcher icon is the only image')


if __name__ == '__main__':
    main()
