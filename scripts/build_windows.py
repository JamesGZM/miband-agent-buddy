"""Build experimental native Windows NSIS installers; no certificate or publication."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / 'apps/desktop'
TARGETS = {'x64': 'x86_64-pc-windows-msvc', 'arm64': 'aarch64-pc-windows-msvc'}


def run(args, **kwargs):
    kwargs.setdefault('cwd', ROOT)
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def copy_tree(source, target):
    shutil.copytree(source, target, ignore=shutil.ignore_patterns('__pycache__', 'node_modules', '.DS_Store'))


def pe_machine(path):
    with Path(path).open('rb') as stream:
        if stream.read(2) != b'MZ':
            raise ValueError('Expected a Windows PE binary')
        stream.seek(0x3c)
        offset = int.from_bytes(stream.read(4), 'little')
        stream.seek(offset)
        if stream.read(4) != b'PE\0\0':
            raise ValueError('Invalid Windows PE header')
        return int.from_bytes(stream.read(2), 'little')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arch', required=True, choices=TARGETS)
    args = parser.parse_args()
    if platform.system() != 'Windows':
        parser.error('Run this builder on Windows with the matching native toolchain')
    target = TARGETS[args.arch]
    host = subprocess.check_output(['rustc', '-vV'], text=True)
    if f'host: {target}' not in host:
        parser.error('Windows builds require the matching native Rust host')
    node = Path(shutil.which('node') or '').resolve()
    node_arch = subprocess.check_output([str(node), '-p', 'process.arch'], text=True).strip()
    if node_arch != args.arch:
        parser.error('Node architecture must match the installer')
    node_license = Path(os.environ.get('BUDDY_NODE_LICENSE', str(node.parent / 'LICENSE')))
    if not node_license.is_file():
        parser.error('Set BUDDY_NODE_LICENSE to the bundled Node distribution LICENSE')
    run([sys.executable, 'scripts/prepare_desktop.py'])
    run(['cargo', 'build', '--locked', '--release', '--target', target, '--manifest-path', 'native/transport/Cargo.toml'])
    output = DESKTOP / 'dist/windows'
    if output.exists():
        shutil.rmtree(output)
    runtime = output / 'runtime'
    (runtime / 'bin').mkdir(parents=True)
    shutil.copy2(node, runtime / 'bin/node.exe')
    for name in ['services/runtime', 'packages/buddy-shared']:
        copy_tree(ROOT / name, runtime / name)
    shutil.copy2(ROOT / 'package.json', runtime / 'package.json')
    native = runtime / 'native/transport/target/debug'
    native.mkdir(parents=True)
    shutil.copy2(ROOT / f'native/transport/target/{target}/release/buddy-transport.exe', native / 'buddy-transport.exe')
    (runtime / 'dist').mkdir()
    for name in ['buddy.debug.rpk', 'buddy-package.json']:
        shutil.copy2(ROOT / 'dist' / name, runtime / 'dist' / name)
    notices = output / 'licenses'
    notices.mkdir()
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copy2(ROOT / name, notices / name)
    shutil.copy2(node_license, notices / 'Node-LICENSE')
    for name in ['LICENSE', 'NOTICE.md']:
        shutil.copy2(DESKTOP / 'src-tauri/src/vendor' / name, notices / ('account-' + name))
    for component in ['core', 'pb', 'bluetooth', 'btclassic-spp']:
        for file in (ROOT / 'native/transport/upstream' / component).iterdir():
            if file.is_file() and file.name.upper().startswith(('LICENSE', 'NOTICE', 'COPYING', 'README')):
                shutil.copy2(file, notices / (component + '-' + file.name))
    run([sys.executable, 'scripts/collect_licenses.py', notices / 'rust', '--target', target])
    config = output / 'bundle.json'
    config.write_text(json.dumps({'bundle': {'active': True, 'targets': ['nsis'],
        'icon': ['icons/icon.ico'], 'resources': {str(runtime) + '/': 'runtime/', str(notices) + '/': 'licenses/'},
        'windows': {'nsis': {'installMode': 'currentUser'}}}}), encoding='utf-8')
    # The locked build-tools package supplies the CLI. No signing identities or
    # certificates are passed to either Windows build or installer generation.
    cli = ROOT / 'scripts/windows/node_modules/@tauri-apps/cli/tauri.js'
    run([node, cli, 'build', '--ci', '--target', target, '--bundles', 'nsis', '--no-sign', '--config', config, '--', '--locked'], cwd=DESKTOP)
    executable = DESKTOP / f'src-tauri/target/{target}/release/miband-agent-buddy.exe'
    expected = 0xAA64 if args.arch == 'arm64' else 0x8664
    for binary in [executable, runtime / 'bin/node.exe', native / 'buddy-transport.exe']:
        if pe_machine(binary) != expected:
            raise SystemExit('Bundled executable architecture mismatch')
    installers = list((DESKTOP / f'src-tauri/target/{target}/release/bundle/nsis').glob('*.exe'))
    if len(installers) != 1:
        raise SystemExit('Expected exactly one NSIS installer')
    destination = ROOT / f'dist/MiBand-Agent-Buddy-windows-{args.arch}-setup.exe'
    shutil.copy2(installers[0], destination)
    destination.with_suffix('.exe.sha256').write_text(hashlib.sha256(destination.read_bytes()).hexdigest() + '  ' + destination.name + '\n')
    print(destination)


if __name__ == '__main__':
    main()
