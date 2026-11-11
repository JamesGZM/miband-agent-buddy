import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('release notes select one version and resolve links from the release page', () => {
  const result = spawnSync('python3', ['-c', `
import sys
sys.path.insert(0, 'scripts')
from release_notes import release_notes
changelog = '# Changelog\\n\\n## [0.6.0] - 2026-11-11\\nNew [guide](docs/testing.md).\\n\\n## [0.5.0] - 2026-10-01\\nOlder change.\\n'
notes = release_notes(changelog, 'v0.6.0')
assert 'Older change' not in notes
assert 'https://github.com/JamesGZM/miband-agent-buddy/blob/v0.6.0/docs/testing.md' in notes
for tag in ['v0.7.0', 'v0.6.0-beta', 'v00.6.0', '../main']:
    try:
        release_notes(changelog, tag)
    except ValueError:
        pass
    else:
        raise AssertionError(tag)
`], {cwd: new URL('../..', import.meta.url), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});
