import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const ring = require('../../packages/buddy-shared/presentation/activity-ring.js');
const counts = total => ({thinking: total, working: 0, attention: 0});

test('concurrent sessions add distinct ring colors while preserving the selected theme', () => {
  for (const theme of ['chatgpt','claude','deepseek']) {
    assert.equal(new Set(ring.palettes[theme]).size, ring.maxColors);
    for (let total=2; total<=ring.maxColors; total++) {
      for (const mode of ['thinking','working','attention']) {
        for (let level=0; level<32; level++) {
          const source = ring.source(counts(total), false, theme, mode, level);
          assert.match(source, new RegExp(`activity-${theme}-${mode === 'attention' ? 'attention' : 'active'}-${total}-b${level}\\.png$`));
          assert.ok(existsSync(new URL('../../apps/band/src'+source, import.meta.url)), source);
        }
      }
    }
  }
  const mixed = {thinking: 1, working: 2, attention: 1};
  assert.equal(ring.count(mixed, false), 4);
  assert.equal(ring.source(mixed, false, 'claude', 'attention', 16), ring.source(counts(4), false, 'claude', 'attention', 16));
});

test('single sessions, inactive states, stale and malformed counts preserve the original ring', () => {
  for (const input of [null, {}, counts(0), counts(1), counts(-1), counts(129), counts(1.5), counts(NaN), {thinking:1,working:0}]) {
    assert.equal(ring.source(input, false, 'chatgpt', 'thinking', 31), '');
  }
  for (const mode of ['idle','complete','error','sleep','offline',undefined,'../bad']) {
    assert.equal(ring.source(counts(4), false, 'chatgpt', mode, 31), '');
  }
  assert.equal(ring.source(counts(4), true, 'claude', 'thinking', 31), '');
  assert.equal(ring.source(counts(128), false, 'deepseek', 'working', 12), ring.source(counts(6), false, 'deepseek', 'working', 12));
  assert.equal(ring.source(counts(2), false, '../bad', 'thinking', 31), ring.source(counts(2), false, 'chatgpt', 'thinking', 31));
  for (const level of [undefined,NaN,-1,'bad']) assert.match(ring.source(counts(2), false, 'chatgpt', 'thinking', level), /-b0\.png$/);
  assert.match(ring.source(counts(2), false, 'chatgpt', 'thinking', 40), /-b31\.png$/);
});

test('pet template keeps one main ring with no additional activity layer or text badge', () => {
  const template = readFileSync(new URL('../../apps/band/src/pages/index/index.ux', import.meta.url), 'utf8').split('</template>')[0];
  assert.match(template, /ringSource[\s\S]*loadingSource[\s\S]*symbolSource/);
  assert.equal((template.match(/src="\{\{ ringSource \}\}"/g) || []).length, 1);
  assert.doesNotMatch(template, /activitySource|activityLabel|activity-count|activity-label|ACTIVE|WAIT/);
});

test('multicolor rings retain every generated breathing step', () => {
  for (const theme of ['chatgpt','claude','deepseek']) {
    for (const mode of ['thinking','attention']) {
      for (const total of [2,4,6]) {
        const frames = new Set();
        for (let level=0; level<32; level++) {
          const source = ring.source(counts(total), false, theme, mode, level);
          const bytes = readFileSync(new URL('../../apps/band/src'+source, import.meta.url));
          frames.add(createHash('sha256').update(bytes).digest('hex'));
        }
        assert.equal(frames.size, 32, `${theme}/${mode}/${total} retains distinct breathing frames`);
      }
    }
  }
});

test('band and preview use the same canonical ring selection and palette', async () => {
  const band = require('../../apps/band/src/common/generated/activity-ring.js');
  const browser = (await import('../../apps/desktop/ui/assets/activity-ring.mjs')).default;
  for (const consumer of [band, browser]) {
    assert.deepEqual(consumer.palettes, ring.palettes);
    for (const total of [0,1,3,6,128,129]) {
      for (const stale of [true,false]) {
        for (const mode of ['thinking','working','attention','idle']) {
          for (const level of [0,12,31]) assert.equal(consumer.source(counts(total), stale, 'claude', mode, level), ring.source(counts(total), stale, 'claude', mode, level));
        }
      }
    }
  }
});
