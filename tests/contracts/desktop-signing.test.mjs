import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('local builds require an existing selected certificate; CI never reads or creates one',()=>{
  const result=spawnSync('python3',['-c',String.raw`
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'scripts')
import build_desktop as build
identity = ('A' * 40, 'Apple Development: Synthetic Fixture')
def no_keychain():
    raise AssertionError('CI must not access the keychain')
assert build.signing_identity('ci', environ={}, discover=no_keychain) == '-'
assert build.signing_identity('local', environ={}, discover=lambda: [identity]) == identity[0]
assert build.signing_identity('local', requested=identity[1], environ={}, discover=lambda: [identity]) == identity[0]
for mode, requested, env, identities in [
    ('local', None, {}, []),
    ('local', None, {}, [identity, ('B' * 40, 'Other fixture')]),
    ('local', 'missing', {}, [identity]),
    ('local', '-', {}, [identity]),
    ('local', None, {'GITHUB_ACTIONS':'true'}, [identity]),
    ('ci', identity[0], {}, []),
    ('ci', None, {'BUDDY_SIGNING_IDENTITY':identity[0]}, []),
]:
    try:
        build.signing_identity(mode, requested, env, lambda: identities)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid signing mode silently accepted')
with patch.object(build.subprocess, 'check_output', return_value='  1) ' + identity[0] + ' "' + identity[1] + '"\n  2) ' + 'B' * 40 + ' "Developer ID Installer: Fixture"\n  3) ' + 'C' * 40 + ' "Revoked Fixture" (CSSMERR_TP_CERT_REVOKED)\n'):
    assert build.local_signing_identities() == [identity]
for signer in [identity[0], '-']:
    commands=[]
    build.sign_bundle(Path('/synthetic/Buddy.app'), signer, commands.append)
    signing=commands[:-1]
    assert len(signing)==4 and all(c[c.index('--sign')+1]==signer for c in signing)
    ids=[c[c.index('--identifier')+1] for c in signing]
    assert ids==[build.BUNDLE_ID+'.node',build.BUNDLE_ID+'.transport',build.BUNDLE_ID,build.BUNDLE_ID]
    assert all('--timestamp=none' in c and '--deep' not in c for c in signing)
    assert commands[-1]==['codesign','--verify','--deep','--strict','/synthetic/Buddy.app']
`],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
