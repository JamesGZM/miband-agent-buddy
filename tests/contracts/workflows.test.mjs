import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const readWorkflow = name => readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');

test('ordinary source checks cannot package or publish application artifacts', () => {
  const workflow = readWorkflow('check.yml');
  assert.match(workflow, /^  push:/m);
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write|npm run build|gh release|upload-artifact/);
  for (const command of ['scripts/render_band_ui.py', 'scripts/prepare_desktop.py', 'npm test', 'npm run check:architecture']) {
    assert.ok(workflow.includes(command), command);
  }
});

test('only published releases package artifacts and never distribute the checkout-bound app', () => {
  const workflow = readWorkflow('release.yml');
  assert.match(workflow, /^  release:\n    types: \[published\]$/m);
  assert.doesNotMatch(workflow, /^  (push|pull_request|workflow_dispatch|schedule):/m);
  assert.match(workflow, /runs-on: macos-/);
  for (const command of ['npm run build', 'npm run build:desktop', 'npm test', 'npm run check:architecture']) {
    assert.ok(workflow.includes(command), command);
  }
  const upload = workflow.split('\n').find(line => line.includes('gh release upload'));
  assert.ok(upload);
  assert.match(upload, /dist\/buddy\.debug\.rpk dist\/SHA256SUMS/);
  assert.doesNotMatch(upload, /\.app|\.zip|\.dmg|\*/);
  assert.ok(upload.includes('"$RELEASE_TAG"'));
  assert.ok(!upload.includes('${{'));
});
