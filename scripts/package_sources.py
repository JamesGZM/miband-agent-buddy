"""Archive reviewed project and resolved dependency sources for a desktop release."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import platform
import subprocess
import tarfile
from collect_licenses import normal_packages, regular_files

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = {'.git', '.agent', '.agents', '.legacy', '.codex', '.aws', '.cursor', '.codegraph', '.venv', 'node_modules', 'target', '__pycache__'}


def tracked_files(root):
    output = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z'])
    for entry in output.split(b'\0'):
        if not entry:
            continue
        relative = Path(entry.decode('utf-8'))
        if relative.is_absolute() or '..' in relative.parts or any(part in FORBIDDEN for part in relative.parts):
            raise ValueError('Refusing private/local path in source inventory')
        if relative.name == '.env' or relative.name.startswith('.env.') or relative.suffix in ('.pem', '.key', '.p12'):
            raise ValueError('Refusing credentials-like path in source inventory')
        source = root / relative
        if source.is_symlink() or not source.is_file():
            raise ValueError('Source inventory requires regular files')
        yield source, relative


def add_file(archive, source, name):
    info = archive.gettarinfo(str(source), arcname=str(name))
    info.uid = info.gid = 0
    info.uname = info.gname = ''
    info.mtime = 0
    with source.open('rb') as stream:
        archive.addfile(info, stream)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    # A source archive describes the reviewed commit, never an uncommitted mix.
    subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=ROOT, check=True)
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    arch = {'arm64': 'arm64', 'aarch64': 'arm64', 'x86_64': 'x64', 'amd64': 'x64'}.get(platform.machine().lower())
    if not arch:
        raise SystemExit('Only x64 and ARM64 release sources are supported')
    host = next(line.split(': ', 1)[1] for line in subprocess.check_output(['rustc', '-vV'], text=True).splitlines() if line.startswith('host: '))
    packages = {}
    for manifest in ['apps/desktop/src-tauri/Cargo.toml', 'native/transport/Cargo.toml']:
        metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--offline', '--filter-platform', host, '--format-version', '1', '--manifest-path', str(ROOT / manifest)], text=True))
        for package in normal_packages(metadata):
            if package['name'] == 'vivo-msgpack':
                raise SystemExit('Unlicensed dependency must not be redistributed')
            if package.get('source'):
                packages[package['id']] = package
    target = args.output or ROOT / 'dist' / f'MiBand-Agent-Buddy-source-{arch}.tar.gz'
    target.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(target, 'w:gz') as archive:
        for source, relative in tracked_files(ROOT):
            add_file(archive, source, Path('project') / relative)
        # Preserve the actual patched files, plus their original license/notice.
        for component in ['core', 'pb', 'bluetooth', 'btclassic-spp']:
            upstream = ROOT / 'native/transport/upstream' / component
            for source, relative in tracked_files(upstream):
                add_file(archive, source, Path('project/native/transport/upstream') / component / relative)
        records = []
        for package in sorted(packages.values(), key=lambda p: (p['name'], p['version'])):
            directory = Path(package['manifest_path']).parent
            name = package['name'] + '-' + package['version']
            for source in regular_files(directory):
                if source.name in ('.cargo-ok', '.cargo-checksum.json'):
                    continue
                add_file(archive, source, Path('rust-dependencies') / name / source.relative_to(directory))
            records.append({key: package.get(key) for key in ['name', 'version', 'source', 'license', 'repository']})
        node = ROOT / ('apps/desktop/dist/windows/runtime/bin/node.exe' if platform.system() == 'Windows' else 'apps/desktop/dist/MiBand Agent Buddy.app/Contents/Resources/runtime/bin/node')
        node_version = subprocess.check_output([str(node), '--version'], text=True).strip()
        description = {
            'revision': revision, 'target': host, 'rustDependencies': records,
            'nodeSource': f'https://nodejs.org/dist/{node_version}/node-{node_version}.tar.gz',
            'instructions': 'Project source includes applied upstream patches and locked build manifests. rust-dependencies contains the resolved linked Rust package sources; build-only dependencies remain pinned by Cargo.lock. Node is an unmodified separately executed runtime; its source URL and complete LICENSE are supplied in the app bundle.',
        }
        content = (json.dumps(description, indent=2) + '\n').encode()
        info = tarfile.TarInfo('SOURCE-INFO.json'); info.size = len(content); info.mtime = 0
        archive.addfile(info, io.BytesIO(content))
    checksum = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_name(target.name + '.sha256').write_text(checksum + '  ' + target.name + '\n')
    print(target)


if __name__ == '__main__':
    main()
