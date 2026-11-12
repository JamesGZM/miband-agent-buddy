"""Collect the resolved target's Rust dependency notices without network access."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'docs/open-source/licenses'
LEGAL = ('LICENSE', 'LICENCE', 'COPYING', 'COPYRIGHT', 'NOTICE', 'UNLICENSE')
SKIP = {'.git', 'target', 'node_modules', '__pycache__'}


def regular_files(root):
    for directory, children, names in os.walk(root, followlinks=False):
        children[:] = sorted(n for n in children if n not in SKIP and not (Path(directory) / n).is_symlink())
        for name in sorted(names):
            path = Path(directory) / name
            if path.is_file() and not path.is_symlink():
                yield path


def license_files(root, declared=None):
    result = set()
    if declared:
        path = (root / declared).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            raise ValueError('License path escapes or is missing from its package')
        result.add(path)
    for path in regular_files(root):
        relative = path.relative_to(root)
        legal_name = path.name.upper().startswith(LEGAL) and path.suffix.lower() not in ('.rs', '.py', '.js', '.c', '.h')
        if legal_name or any(p.lower() in ('licenses', 'licences') for p in relative.parts[:-1]):
            result.add(path)
    return sorted(result)


def normal_packages(metadata):
    nodes = {node['id']: node for node in metadata['resolve']['nodes']}
    root = metadata['resolve']['root']
    pending, selected = [root], set()
    while pending:
        current = pending.pop()
        if current in selected:
            continue
        selected.add(current)
        pending.extend(dep['pkg'] for dep in nodes[current]['deps']
                       if any(kind['kind'] is None for kind in dep['dep_kinds']))
    return [p for p in metadata['packages'] if p['id'] in selected and p['id'] != root]


def source_archive(root, destination, package_name):
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in regular_files(root):
            relative = file.relative_to(root)
            # Cargo cache markers are not part of the original source distribution.
            if relative.name in ('.cargo-ok', '.cargo-checksum.json'):
                continue
            info = zipfile.ZipInfo(str(Path(package_name) / relative), (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (file.stat().st_mode & 0xffff) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, file.read_bytes())


def collect(packages, output, overrides, data_root=DATA):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for package in sorted(packages, key=lambda p: (p['name'], p['version'])):
        name = package['name'] + '-' + package['version']
        if not re.fullmatch(r'[A-Za-z0-9_.+\-]+', name) or package['name'] == 'vivo-msgpack':
            raise ValueError('Unsupported distribution dependency: ' + name)
        root = Path(package['manifest_path']).parent
        original = license_files(root, package.get('license_file'))
        target = output / name
        target.mkdir()
        files = []
        for file in original:
            relative = file.relative_to(root)
            dest = target / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, dest)
            files.append(str(relative))
        record = {key: package.get(key) for key in ('name', 'version', 'license', 'authors', 'repository')}
        if not original:
            receipt = overrides.get(name)
            if not receipt or receipt['license'] != package.get('license'):
                raise ValueError('Missing reviewed license text: ' + name)
            vcs_path = root / '.cargo_vcs_info.json'
            vcs = json.loads(vcs_path.read_text()) if vcs_path.is_file() else {}
            if receipt.get('revision') != vcs.get('git', {}).get('sha1'):
                raise ValueError('License receipt revision mismatch: ' + name)
            for item in receipt['files']:
                source = data_root / item['path']
                content = source.read_bytes()
                if hashlib.sha256(content).hexdigest() != item['sha256']:
                    raise ValueError('License receipt checksum mismatch: ' + name)
                shutil.copyfile(source, target / source.name)
                files.append(source.name)
            record['supplement'] = receipt
        # Preserve publisher metadata and any README attribution, including for
        # crates whose upstream repository only links to the standard license.
        for file in root.iterdir():
            if file.is_file() and not file.is_symlink() and (file.name.startswith('README') or file.name in ('Cargo.toml', 'Cargo.toml.orig', '.cargo_vcs_info.json')):
                shutil.copyfile(file, target / file.name)
        if not original or 'MPL' in (package.get('license') or '') or package.get('source') is None:
            archive = name + '-source.zip'
            source_archive(root, target / archive, name)
            record['sourceArchive'] = archive
        record['licenseFiles'] = files
        (target / 'attribution.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
        records.append(record)
    (output / 'index.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    (output / 'README.txt').write_text(
        'Resolved Rust dependencies for this target build. Each directory contains original notices,\n'
        'publisher metadata and attribution. Reviewed supplemental texts have pinned sources and hashes.\n'
        'Packages with omitted license files, MPL terms, or local upstream adaptations also include\n'
        'their corresponding package source. Original notices remain unchanged. Build-only tools are\n'
        'not shipped here. This inventory records upstream terms; it grants no additional rights.\n')
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--target')
    args = parser.parse_args()
    host = args.target
    if not host:
        info = subprocess.check_output(['rustc', '-vV'], text=True)
        host = next(line.split(': ', 1)[1] for line in info.splitlines() if line.startswith('host: '))
    packages = {}
    for manifest in ['apps/desktop/src-tauri/Cargo.toml', 'native/transport/Cargo.toml']:
        metadata = json.loads(subprocess.check_output([
            'cargo', 'metadata', '--locked', '--offline', '--filter-platform', host,
            '--format-version', '1', '--manifest-path', str(ROOT / manifest)], text=True))
        for package in normal_packages(metadata):
            packages[package['id']] = package
    overrides = json.loads((DATA / 'receipts.json').read_text())
    records = collect(list(packages.values()), args.output, overrides)
    print('Collected notices for', len(records), 'resolved Rust packages')


if __name__ == '__main__':
    main()
