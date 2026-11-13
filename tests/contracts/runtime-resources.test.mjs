import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('runtime staging retains the live guide and module types while excluding development material', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from runtime_resources import stage_runtime_sources, CODE_DIRECTORIES
with tempfile.TemporaryDirectory(prefix='buddy-resource-fixture-') as temporary:
    project=Path(temporary)/'project'; output=Path(temporary)/'runtime'
    for directory in CODE_DIRECTORIES:
        folder=project/directory; folder.mkdir(parents=True)
        (folder/'module.mjs').write_text('export const fixture = true;')
        (folder/'old-note.md').write_text('Synthetic development note')
        (folder/'module.test.mjs').write_text('Synthetic test code')
        (folder/'.env').write_text('SYNTHETIC_VALUE=fixture')
        for name in ['tests','fixtures','node_modules','__pycache__']:
            (folder/name).mkdir(); (folder/name/'unused.js').write_text('Synthetic unused module')
    (project/'services/runtime/integration-guide.md').write_text('Current offline guide')
    (project/'services/runtime/SKILL.md').write_text('Synthetic retired skill')
    manifest={'name':'fixture','version':'1.0.0','private':True,'type':'module','license':'AGPL-3.0-only',
              'scripts':{'hooks:install':'retired-installer'},'devDependencies':{'fixture':'1'},'description':'Development metadata'}
    (project/'package.json').write_text(json.dumps(manifest))
    (project/'packages/buddy-shared/package.json').write_text(json.dumps({'name':'shared-fixture','type':'commonjs','scripts':{'test':'fixture'}}))
    stage_runtime_sources(project,output)
    files={str(file.relative_to(output)) for file in output.rglob('*') if file.is_file()}
    expected={directory+'/module.mjs' for directory in CODE_DIRECTORIES}
    expected.update(['services/runtime/integration-guide.md','package.json','packages/buddy-shared/package.json'])
    assert files==expected,files
    assert (output/'services/runtime/integration-guide.md').read_text()=='Current offline guide'
    metadata=json.loads((output/'package.json').read_text())
    assert metadata=={key:manifest[key] for key in ['name','version','private','type','license']}
    assert json.loads((output/'packages/buddy-shared/package.json').read_text())=={'name':'shared-fixture','type':'commonjs'}
    for unsafe in ['linked-module.mjs','linked-guide']:
        source=project/'services/runtime/bin'/unsafe
        source.symlink_to(project/'package.json')
        try:
            stage_runtime_sources(project,Path(temporary)/unsafe)
        except ValueError:
            pass
        else:
            raise AssertionError('Linked resource was accepted')
        source.unlink()
`], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('staged production modules resolve without repository fixtures or development scripts', () => {
  const result = spawnSync('python3', ['-c', String.raw`
import json, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0,'scripts')
from runtime_resources import stage_runtime_sources
from build_desktop import stage_runtime_sources as mac_stage
from build_windows import stage_runtime_sources as windows_stage
assert mac_stage is stage_runtime_sources and windows_stage is stage_runtime_sources
with tempfile.TemporaryDirectory(prefix='buddy-production-resources-') as temporary:
    output=Path(temporary)/'runtime'; stage_runtime_sources(Path.cwd(),output)
    script="const protocol=await import(process.argv[1]); if(typeof protocol.default.decodeMessage!=='function')process.exit(1); await import(process.argv[2]);"
    subprocess.run([sys.argv[1],'--input-type=module','-e',script,
        (output/'packages/buddy-shared/protocol/snapshot.js').as_uri(),
        (output/'services/runtime/bin/buddy-runtime.mjs').as_uri()],cwd=output,check=True,timeout=5)
    assert not (output/'packages/buddy-shared/fixtures').exists()
    assert 'scripts' not in json.loads((output/'package.json').read_text())
    assert [str(p.relative_to(output)) for p in output.rglob('*.md')]==['services/runtime/integration-guide.md']
`, process.execPath], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
