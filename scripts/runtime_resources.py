"""Stage only owned runtime modules and the current offline integration guide."""
from pathlib import Path
import json
import shutil

CODE_DIRECTORIES = (
    'services/runtime/bin',
    'services/runtime/src',
    'packages/buddy-shared/protocol',
    'packages/buddy-shared/presentation',
)
EXCLUDED_DIRECTORIES = {'node_modules', '__pycache__', 'tests', '__tests__', 'fixtures', 'docs'}
MANIFEST_FIELDS = ('name', 'version', 'private', 'type', 'engines', 'license')


def code_only(directory, names):
    ignored = []
    for name in names:
        path = Path(directory) / name
        if name.startswith('.') or name in EXCLUDED_DIRECTORIES:
            ignored.append(name)
        elif path.is_symlink():
            raise ValueError('Runtime source must not contain linked resources')
        elif path.is_file() and (path.suffix not in ('.js', '.mjs')
                                 or name.endswith(('.test.js', '.test.mjs', '.spec.js', '.spec.mjs'))):
            ignored.append(name)
    return ignored


def write_manifest(source, target):
    data = json.loads(source.read_text(encoding='utf-8'))
    if data.get('type') not in ('module', 'commonjs'):
        raise ValueError('Runtime package must declare its module type')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({key: data[key] for key in MANIFEST_FIELDS if key in data},
                                 indent=2) + '\n', encoding='utf-8')


def stage_runtime_sources(project, runtime):
    project, runtime = Path(project), Path(runtime)
    for name in CODE_DIRECTORIES:
        source = project / name
        if source.is_symlink():
            raise ValueError('Runtime source directory must not be a link')
        shutil.copytree(source, runtime / name, ignore=code_only)
    guide = project / 'services/runtime/integration-guide.md'
    if guide.is_symlink():
        raise ValueError('Integration guide must not be a link')
    shutil.copy2(guide, runtime / 'services/runtime/integration-guide.md')
    write_manifest(project / 'package.json', runtime / 'package.json')
    write_manifest(project / 'packages/buddy-shared/package.json',
                   runtime / 'packages/buddy-shared/package.json')
