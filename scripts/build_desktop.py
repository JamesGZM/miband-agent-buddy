"""Build a relocatable macOS app; never install it or publish a release."""
from pathlib import Path
import argparse
import json
import os
import plistlib
import shutil
import subprocess
from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
DESKTOP = PROJECT / 'apps/desktop'
APP_NAME = 'MiBand Agent Buddy.app'


def run(args, **kwargs):
    return subprocess.run(args, check=True, cwd=PROJECT, **kwargs)


def system_libraries(binary):
    result = subprocess.check_output(['otool', '-L', str(binary)], text=True)
    for line in result.splitlines()[1:]:
        library = line.strip().split(' (', 1)[0]
        if not library.startswith(('/System/Library/', '/usr/lib/')):
            raise SystemExit(f'Non-portable library in {binary.name}: {library}')


def copy_tree(source, target):
    shutil.copytree(source, target, ignore=shutil.ignore_patterns('__pycache__', 'node_modules', '.DS_Store'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', action='store_true')
    args = parser.parse_args()
    node = Path(shutil.which('node') or '')
    if not node.is_file():
        raise SystemExit('Node 22+ is required')
    node = node.resolve()
    if int(subprocess.check_output([str(node), '-p', 'process.versions.node.split(".")[0]'], text=True)) < 22:
        raise SystemExit('Node 22+ is required')
    node_license = Path(os.environ.get('BUDDY_NODE_LICENSE', str(node.parent.parent / 'LICENSE')))
    if not node_license.is_file():
        raise SystemExit('Use an official Node distribution, or set BUDDY_NODE_LICENSE to its LICENSE file')
    profile = 'release' if args.release else 'debug'
    flags = ['--release'] if args.release else []
    run(['python3', 'scripts/prepare_desktop.py'])
    run(['cargo', 'build', '--locked', '--manifest-path', 'native/transport/Cargo.toml', *flags])
    run(['cargo', 'build', '--locked', '--manifest-path', 'apps/desktop/src-tauri/Cargo.toml', *flags], env={**os.environ, 'BUDDY_NODE': str(node)})
    executable = DESKTOP / f'src-tauri/target/{profile}/miband-agent-buddy'
    transport = PROJECT / f'native/transport/target/{profile}/buddy-transport'
    for binary in [node, executable, transport]:
        system_libraries(binary)
    for resource in ['dist/buddy.debug.rpk', 'dist/buddy-package.json']:
        if not (PROJECT / resource).is_file():
            raise SystemExit('Run npm run build before build:desktop to prepare the Buddy package')
    destination = DESKTOP / 'dist' / APP_NAME
    # This directory is a generated output; rebuild without stale resource files.
    if destination.exists():
        shutil.rmtree(destination)
    contents = destination / 'Contents'
    (contents / 'MacOS').mkdir(parents=True)
    resources = contents / 'Resources'
    runtime = resources / 'runtime'
    (runtime / 'bin').mkdir(parents=True)
    Image.open(DESKTOP / 'src-tauri/icons/icon.png').save(resources / 'Buddy.icns', format='ICNS')
    shutil.copy2(executable, contents / 'MacOS/miband-agent-buddy')
    shutil.copy2(node, runtime / 'bin/node')
    copy_tree(PROJECT / 'services/runtime', runtime / 'services/runtime')
    copy_tree(PROJECT / 'packages/buddy-shared', runtime / 'packages/buddy-shared')
    (runtime / 'native/transport/target/debug').mkdir(parents=True)
    shutil.copy2(transport, runtime / 'native/transport/target/debug/buddy-transport')
    (runtime / 'dist').mkdir()
    for name in ['buddy.debug.rpk', 'buddy-package.json']:
        shutil.copy2(PROJECT / 'dist' / name, runtime / 'dist' / name)
    # Package-level type semantics must match the checkout for the shared CJS files.
    shutil.copy2(PROJECT / 'package.json', runtime / 'package.json')
    notices = resources / 'licenses'
    notices.mkdir()
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copy2(PROJECT / name, notices / name)
    shutil.copy2(node_license, notices / 'Node-LICENSE')
    for name in ['LICENSE', 'NOTICE.md']:
        shutil.copy2(DESKTOP / 'src-tauri/src/vendor' / name, notices / ('account-' + name))
    for component in ['core', 'pb', 'bluetooth', 'btclassic-spp']:
        source = PROJECT / 'native/transport/upstream' / component
        for file in source.iterdir():
            if file.is_file() and file.name.upper().startswith(('LICENSE', 'NOTICE', 'COPYING', 'README')):
                shutil.copy2(file, notices / (component + '-' + file.name))
    run(['python3', 'scripts/collect_licenses.py', str(notices / 'rust')])
    version = json.loads((PROJECT / 'package.json').read_text())['version']
    cargo_version = subprocess.check_output(['cargo', 'pkgid', '--manifest-path', str(DESKTOP / 'src-tauri/Cargo.toml')], text=True).strip().rsplit('@', 1)[-1]
    if cargo_version != version:
        raise SystemExit('package.json and desktop Cargo.toml versions must match')
    tauri_version = json.loads((DESKTOP / 'src-tauri/tauri.conf.json').read_text())['version']
    if tauri_version != version:
        raise SystemExit('package.json and Tauri versions must match')
    (contents / 'Info.plist').write_bytes(plistlib.dumps({
        'CFBundleExecutable': 'miband-agent-buddy',
        'CFBundleIdentifier': 'io.github.jamesgzm.miband-agent-buddy',
        'CFBundleName': 'MiBand Agent Buddy', 'CFBundleDisplayName': 'MiBand Agent Buddy',
        'CFBundlePackageType': 'APPL', 'CFBundleIconFile': 'Buddy.icns',
        'CFBundleShortVersionString': version, 'CFBundleVersion': version,
        'LSMinimumSystemVersion': '11.0', 'NSHighResolutionCapable': True,
        'NSBluetoothAlwaysUsageDescription': 'Connect to your Xiaomi Smart Band to synchronize Buddy and install its updates.',
    }))
    for binary in [runtime / 'bin/node', runtime / 'native/transport/target/debug/buddy-transport', contents / 'MacOS/miband-agent-buddy']:
        run(['codesign', '--force', '--sign', '-', str(binary)])
    run(['codesign', '--force', '--sign', '-', str(destination)])
    run(['codesign', '--verify', '--deep', '--strict', str(destination)])
    print(destination)


if __name__ == '__main__':
    main()
