import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('release source inventory excludes untracked files and rejects private paths and symlinks', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import io, sys, tarfile, tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'scripts')
import package_sources as source
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / 'source.rs').write_text('synthetic public source')
    (root / 'private.txt').write_text('synthetic untracked file')
    with patch.object(source.subprocess, 'check_output', return_value=b'source.rs\0'):
        files = list(source.tracked_files(root))
        assert [str(relative) for _, relative in files] == ['source.rs']
    for entry in [b'.agent/memory.md\0', b'.env\0', b'key.pem\0', b'../outside\0', b'/outside\0']:
        with patch.object(source.subprocess, 'check_output', return_value=entry):
            try:
                list(source.tracked_files(root))
                raise AssertionError('private or escaping path accepted')
            except ValueError:
                pass
    (root / 'link.rs').symlink_to(root / 'source.rs')
    with patch.object(source.subprocess, 'check_output', return_value=b'link.rs\0'):
        try:
            list(source.tracked_files(root))
            raise AssertionError('symlink accepted')
        except ValueError:
            pass
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w') as archive:
        source.add_file(archive, root / 'source.rs', Path('project/source.rs'))
    buffer.seek(0)
    with tarfile.open(fileobj=buffer) as archive:
        item = archive.getmember('project/source.rs')
        assert item.uid == item.gid == item.mtime == 0
        assert archive.extractfile(item).read() == b'synthetic public source'
`], {cwd: new URL('../../', import.meta.url), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
