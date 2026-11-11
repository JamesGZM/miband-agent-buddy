import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogs, sources} from '../../apps/desktop/ui/locales.js';
import {t, setLanguage, resolveLanguage, formatTime} from '../../apps/desktop/ui/i18n.js';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
// `小米裝置` is a device-name fallback shown as data, not a message.
const literals = (text, pattern) => [...text.matchAll(pattern)].map(m => m[1]).filter(v => /[\u4e00-\u9fff]/.test(v));

test('every UI string and backend message has Simplified Chinese and English translations', () => {
  const app = ['app', 'integrations', 'onboarding'].map(name => read(`apps/desktop/ui/${name}.js`)).join('\n');
  const keys = new Set([
    ...literals(app, /\bt\("((?:[^"\\]|\\.)*)"/g),
    ...literals(app, /^\s+\w+: "([^"]+)",$/gm),
    ...literals(app, /\["\w+", "([^"]+)"\]/g).filter(v => !['简体中文', '繁體中文'].includes(v)),
    ...literals(app, /(?:title|detail|kind): "([^"]+)"/g),
  ]);
  const backend = [
    read('services/runtime/src/core/runtime.mjs'),
    ...['services', 'commands', 'runtime', 'login', 'account', 'vault', 'persistence'].map(name =>
      read(`apps/desktop/src-tauri/src/${name}.rs`).split('#[cfg(test)]')[0]),
  ];
  for (const text of backend) for (const key of literals(text, /"((?:[^"\\]|\\.)*)"/g)) if (key !== '小米裝置') keys.add(key);
  assert.ok(keys.size > 150);
  for (const key of keys) {
    assert.ok(sources.includes(key), `missing catalog entry: ${key}`);
    for (const language of ['zh-Hans', 'en']) assert.ok(catalogs[language][key], `${language}: ${key}`);
  }
  for (const key of sources) assert.doesNotMatch(catalogs.en[key], /[\u4e00-\u9fff]/, key);
  assert.equal(new Set(sources).size, sources.length);
});

test('language resolution, interpolation and absolute sync times', () => {
  assert.equal(resolveLanguage('system', ['zh-Hans-CN']), 'zh-Hans');
  assert.equal(resolveLanguage('system', ['zh-HK']), 'zh-Hant');
  assert.equal(resolveLanguage('system', ['fr-FR']), 'en');
  assert.equal(resolveLanguage('zh-Hant', ['en-US']), 'zh-Hant');
  setLanguage('en');
  assert.equal(t('傳送中 {n}%', {n: 42}), 'Sending 42%');
  assert.equal(t('unknown message'), 'unknown message');
  const now = new Date(2026, 10, 10, 19, 16, 5).getTime();
  assert.equal(formatTime(now, now), '19:16:05');
  assert.match(formatTime(now - 86400000, now), /11\/9.*19:16:05/);
  setLanguage('zh-Hans');
  assert.equal(t('手環主題'), '手环主题');
  assert.equal(formatTime(now, now), '19:16:05');
  setLanguage('zh-Hant');
});
