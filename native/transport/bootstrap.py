"""Fetch pinned upstream sources and apply isolated compatibility/correctness patches."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
for repo in json.loads((root / 'upstream-lock.json').read_text()):
    dest = root / 'upstream' / repo['directory']
    if not dest.exists():
        dest.mkdir(parents=True)
        subprocess.run(['git', 'init', str(dest)], check=True)
        subprocess.run(['git', '-C', str(dest), 'remote', 'add', 'origin', repo['url']], check=True)
        subprocess.run(['git', '-C', str(dest), 'fetch', '--depth', '1', 'origin', repo['commit']], check=True)
        subprocess.run(['git', '-C', str(dest), 'checkout', '--detach', repo['commit']], check=True)
    actual = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != repo['commit']:
        raise SystemExit(f"Unexpected upstream version: {repo['directory']}; no reset performed")
core = root / 'upstream/core'
base = ['git', '-C', str(core), 'apply']
for filename in ('core-no-network.patch', 'core-without-vivo.patch', 'core-sar-ack-reuse.patch'):
    patch = root / filename
    if subprocess.run(base + ['--reverse', '--check', str(patch)], capture_output=True).returncode != 0:
        subprocess.run(base + ['--check', str(patch)], check=True)
        subprocess.run(base + [str(patch)], check=True)
print('Pinned sources and recorded patches ready')
