import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const groups=[
  'docs/README.md','docs/display.md','docs/development/updates.md',
  'docs/architecture/ADR-015-coalesced-event-wake.md',
  'docs/architecture/ADR-013-nonblocking-hooks.md','docs/architecture/ADR-014-language-documentation.md',
  'docs/architecture/ADR-012-windows-preview.md',
  'README.md','CONTRIBUTING.md','SECURITY.md','SUPPORT.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md',
  'docs/testing.md','docs/development/README.md','docs/development/hooks.md','docs/development/quickapp-ui.md',
  'docs/open-source/RELEASING.md','docs/open-source/licenses/README.md','docs/architecture/README.md',
  'docs/architecture/ADR-001-project-boundaries.md','docs/architecture/ADR-002-user-operation-wake.md',
  'docs/architecture/ADR-003-band-capabilities.md','docs/architecture/ADR-004-local-agent-hooks.md',
  'docs/architecture/ADR-005-active-display.md','docs/architecture/ADR-006-desktop-updates.md',
  'docs/architecture/ADR-007-band-installation-state.md','docs/architecture/ADR-008-animation-and-task-rings.md',
  'docs/architecture/ADR-009-host-activity-display.md',
  'docs/architecture/ADR-010-completion-vibration.md',
  'docs/architecture/ADR-011-brightness-and-battery.md',
];
const localized=(file,locale)=>{
  if(file==='README.md')return locale==='en'?file:`docs/readme/README.${locale}.md`;
  if(file.startsWith('docs/'))return `docs/${locale}/${file.slice(5)}`;
  return locale==='en'?file:`docs/${locale}/${file}`;
};
const read=file=>readFileSync(path.join(root,file),'utf8');
const canonical=new Set(['AGENTS.md','skills/buddy-hooks/SKILL.md']);
const translations=new Map(groups.flatMap(base=>['en','zh-CN','zh-TW'].map(locale=>[localized(base,locale),base])));
const languageLabels=new Set(['English','简体中文','繁體中文']);
function anchors(source) {
  return new Set([...source.matchAll(/^#{1,6} (.+)$/gm)].map(([,title])=>Array.from(title.toLowerCase())
    .filter(char=>/[\p{L}\p{N}\p{M}_\s-]/u.test(char)).map(char=>/\s/.test(char)?'-':char).join(''))
    .concat([...source.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>id)));
}

for(const locale of ['en','zh-CN','zh-TW']) {
  test(`${locale} documentation keeps navigation localized and resolves files/anchors`,()=>{
    for(const base of groups) {
      const file=localized(base,locale),source=read(file);
      for(const [,label,href] of source.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
        if(/^[a-z]+:/i.test(href))continue;
        const [target,fragment]=href.split('#');
        const resolved=target?path.posix.normalize(path.posix.join(path.posix.dirname(file),target)):file;
        assert.ok(existsSync(path.join(root,resolved)),`${file}: missing ${href}`);
        if(languageLabels.has(label))continue;
        if(resolved.endsWith('.md')&&!canonical.has(resolved)) {
          const base=translations.get(resolved);
          if(base)assert.equal(resolved,localized(base,locale),`${file}: language changed via ${href}`);
        }
        if(fragment&&resolved.endsWith('.md'))assert.ok(anchors(read(resolved)).has(decodeURIComponent(fragment)),`${file}: missing #${fragment} in ${resolved}`);
      }
      for(const language of ['en','zh-CN','zh-TW']) {
        if(language===locale)continue;
        const target=path.posix.relative(path.posix.dirname(file),localized(base,language));
        assert.ok(source.includes(`](${target})`),`${file}: missing ${language} language switch`);
      }
    }
  });
}

test('translated guides preserve executable command examples',()=>{
  const commands=source=>[...source.matchAll(/```sh\n([\s\S]*?)```/g)].map(([,body])=>body.trim());
  for(const base of groups)for(const locale of ['zh-CN','zh-TW']) {
    assert.deepEqual(commands(read(localized(base,locale))),commands(read(localized(base,'en'))),`${base}: ${locale} commands drifted`);
  }
});

test('the root has one README and language indexes resolve all guide and image links',()=>{
  assert.deepEqual(readdirSync(root).filter(name=>/^README.*\.md$/.test(name)),['README.md']);
  const walk=directory=>readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(item=>{
    const file=path.posix.join(directory,item.name);
    return item.isDirectory()?walk(file):file.endsWith('.md')?[file]:[];
  });
  const files=['docs/README.md',...['en','zh-CN','zh-TW','readme'].flatMap(locale=>walk('docs/'+locale))];
  for(const file of files) {
    const source=read(file);
    const links=[...source.matchAll(/\]\(([^)\s]+)\)/g)].map(m=>m[1])
      .concat([...source.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]));
    for(const href of links) {
      if(/^(?:[a-z]+:|\/\/)/i.test(href))continue;
      const [target,fragment]=href.split('#');
      const resolved=target?path.posix.normalize(path.posix.join(path.posix.dirname(file),target)):file;
      assert.ok(existsSync(path.join(root,resolved)),`${file}: missing ${href}`);
      if(fragment&&resolved.endsWith('.md'))assert.ok(anchors(read(resolved)).has(decodeURIComponent(fragment)),`${file}: missing ${href}`);
    }
  }
});
