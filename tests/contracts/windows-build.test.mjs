import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('Windows package architecture validation rejects incorrect and truncated PE executables', () => {
  const r = spawnSync('python3',['-c',String.raw`
import sys, tempfile
from pathlib import Path
sys.path.insert(0,'scripts')
from build_windows import pe_machine
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory)/'fixture.exe'
 for machine in [0x8664,0xAA64]:
  data=bytearray(134);data[:2]=b'MZ';data[60:64]=(128).to_bytes(4,'little');data[128:132]=b'PE\0\0';data[132:134]=machine.to_bytes(2,'little');p.write_bytes(data)
  assert pe_machine(p)==machine
 for data in [b'',b'MZ',b'not an executable']:
  p.write_bytes(data)
  try: pe_machine(p)
  except ValueError: pass
  else: raise AssertionError('invalid executable accepted')
`],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
});
