"""Require both Mac and Windows architectures and valid checksums before publishing."""
from pathlib import Path
import argparse
import hashlib


def verify(directory):
    directory = Path(directory)
    checksums = {}
    for arch in ['arm64', 'x64']:
        checksums[f'SHA256SUMS-{arch}'] = f'MiBand-Agent-Buddy-macos-{arch}.zip'
        dmg = f'MiBand-Agent-Buddy-macos-{arch}.dmg'
        checksums[dmg + '.sha256'] = dmg
        installer = f'MiBand-Agent-Buddy-windows-{arch}-setup.exe'
        checksums[installer + '.sha256'] = installer
        for platform in ['', 'windows-']:
            source = f'MiBand-Agent-Buddy-source-{platform}{arch}.tar.gz'
            checksums[source + '.sha256'] = source
    expected = set(checksums) | set(checksums.values())
    if not directory.is_dir() or {p.name for p in directory.iterdir()} != expected:
        raise ValueError('Expected all 20 Mac/Windows installer, source and checksum files')
    for name in expected:
        path = directory / name
        if path.is_symlink() or not path.is_file() or not path.stat().st_size:
            raise ValueError('Release assets must be nonempty regular files: ' + name)
    for checksum, asset in checksums.items():
        fields = (directory / checksum).read_text().split()
        if len(fields) != 2 or fields[1] != asset:
            raise ValueError('Invalid checksum record: ' + checksum)
        digest = hashlib.sha256()
        with (directory / asset).open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        if fields[0] != digest.hexdigest():
            raise ValueError('Checksum mismatch: ' + asset)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    try:
        verify(args.directory)
    except ValueError as error:
        parser.exit(1, str(error) + '\n')
    print('Verified all 20 release assets for Mac and Windows x64/ARM64')
