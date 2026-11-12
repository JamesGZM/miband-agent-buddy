import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fakeClock} from '../helpers/runtime.mjs';
const require=createRequire(import.meta.url);
const drawing=require('../../packages/buddy-shared/presentation/geometry.js');
const {probeDrawing}=require('../../apps/band/src/common/drawing-support.js');
const {createLifecycle}=require('../../apps/band/src/common/page-lifecycle.js');
const {createPageController}=require('../../apps/band/src/controllers/page-controller.js');

test('native geometry is bounded, reuses glyphs and never requires bitmap assets',()=>{
  for(const theme of ['chatgpt','claude','deepseek']) {
    const cells=drawing.glyph(theme);assert.ok(cells.length>5&&cells.length<50);
    assert.equal(drawing.glyph(theme),cells);
    for(const cell of cells) {
      assert.ok(cell.left>=0&&cell.top>=0&&cell.width>0&&cell.height>0);
      assert.ok(cell.left+cell.width<=490&&cell.top+cell.height<=192);
    }
    const a=drawing.frame({theme,mode:'working',seconds:1}),b=drawing.frame({theme,mode:'working',seconds:2});
    assert.notDeepEqual(a,b);assert.doesNotMatch(JSON.stringify(a),/\.png/);
  }
});

test('capability detection distinguishes unavailable query API from unsupported components',()=>{
  const unknown=probeDrawing({});assert.equal(unknown.queryAvailable,false);assert.equal(unknown.canvas,null);
  const queries=[],caps=probeDrawing({canIUse:name=>{queries.push(name);return name!=='canvas';}});
  assert.equal(caps.div,true);assert.equal(caps.arc,true);assert.equal(caps.canvas,false);
  assert.ok(queries.includes('progress.attr.percent'));
  assert.equal(probeDrawing({canIUse:()=>{throw new Error('synthetic');}}).div,null);
});

test('single page refresh keeps one channel and timer; hide/destroy retire work and report lifecycle',async()=>{
  const clock=fakeClock(),lifecycle=createLifecycle(clock.now),sent=[],requests=[];
  let connections=0;
  const channel={send:options=>sent.push(options.data)};
  const controller=createPageController({now:clock.now,schedule:clock.schedule,cancel:clock.cancel,lifecycle,
    drawingCapabilities:probeDrawing({canIUse:name=>name!=='canvas'}),appVersion:'0.5.5-code.1',
    storage:{get:o=>o.fail(),set:o=>o.success()},application:{terminate(){}},
    brightness:{setKeepScreenOn:o=>{requests.push(o.keepScreenOn);o.success();}},
    interconnect:{instance:()=>{connections++;return channel;}}});
  const page=Object.assign({},controller,controller.private);
  page.onInit();page.onInit();page.onShow();
  const snapshot={v:1,type:'snapshot',session:'probe',seq:1,text:'',value:0,cpu:42,mode:'working',activityHoldMs:15000,idleHoldMs:60000};
  channel.onmessage({data:JSON.stringify(snapshot)});
  for(let i=0;i<25;i++)page.onRefresh();
  assert.equal(connections,1);assert.equal(lifecycle.snapshot().created,1);assert.equal(lifecycle.snapshot().refreshes,25);
  const before=JSON.stringify([page.drawArcs,page.drawCapsules]);await clock.advance(1000);assert.notEqual(JSON.stringify([page.drawArcs,page.drawCapsules]),before);
  channel.onmessage({data:JSON.stringify({...snapshot,seq:2})});
  assert.equal(sent.at(-1).pageLifecycle.live,1);assert.equal(sent.at(-1).pageLifecycle.visible,1);
  assert.equal(sent.at(-1).drawing.capabilities.canvas,false);assert.ok(sent.at(-1).drawing.frames>=10);
  assert.equal(sent.at(-1).appVersion,'0.5.5-code.1');assert.deepEqual(requests,[true]);
  assert.equal(clock.size,3); // render, activity watchdog and brightness refresh
  page.onHide();assert.equal(clock.size,0);assert.equal(lifecycle.snapshot().visible,0);
  const late=channel.onmessage;page.onDestroy();page.onDestroy();
  late({data:JSON.stringify({...snapshot,seq:3})});await clock.advance(60000);
  assert.equal(lifecycle.snapshot().live,0);assert.equal(lifecycle.snapshot().destroyed,1);
  assert.equal(channel.onmessage,null);assert.equal(clock.size,0);
});

test('approved production page owns one controller and has no bitmap component',()=>{
  const prototype=readFileSync(new URL('../../apps/band/src/pages/index/index.ux',import.meta.url),'utf8');
  assert.doesNotMatch(prototype,/<image|\.png|\.jpg|<canvas/);
  assert.match(prototype,/<progress[^>]+type="arc"/);
  for(const file of ['../../apps/band/src/pages/index/index.ux']) {
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(source,/this\._buddyController=createPageController/);assert.doesNotMatch(source,/var controller/);
  }
  const manifest=JSON.parse(readFileSync(new URL('../../apps/band/src/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.router.pages['pages/index'].launchMode,'singleTask');
});

test('snapshot bursts ACK immediately but paint only the latest host plan at the next pet frame',async()=>{
  const clock=fakeClock(),sent=[],channel={send:o=>sent.push(o.data)};
  const controller=createPageController({...clock,render:drawing.createBorderRenderer(),
    storage:{get:o=>o.fail(),set:o=>o.success()},application:{terminate(){}},
    brightness:{setKeepScreenOn:o=>o.success()},interconnect:{instance:()=>channel}});
  const page=Object.assign({},controller,controller.private);
  page.onInit();page.onShow();
  const base={v:1,type:'snapshot',session:'burst',text:'',value:0,cpu:42,mode:'working',
    activityHoldMs:15000,idleHoldMs:60000,activityRing:['#647FFF','#78EDFF']};
  const send=(seq,extra={})=>channel.onmessage({data:JSON.stringify({...base,seq,...extra})});
  send(1);await clock.advance(100);
  const nodes=page.borderBase.slice(),frames=page.diagnostics().frames;
  for(let seq=2;seq<=101;seq++)send(seq,{cpu:seq%100,activityRing:[...base.activityRing]});
  assert.equal(sent.length,101);
  assert.equal(page.diagnostics().frames,frames,'receiving packets must not multiply native paints');
  await clock.advance(100);
  assert.equal(page.diagnostics().frames,frames+1);
  assert.deepEqual(page.borderBase,nodes,'unchanged colors preserve keyed native base widgets');
  for(let seq=102;seq<112;seq++)send(seq,{activityRing:['#647FFF','#78EDFF','#A192FF']});
  send(112,{mode:'attention',activityRing:['#EBA270']});
  assert.equal(sent.at(-1).mode,'attention');assert.equal(sent.at(-1).seq,112);
  assert.equal(page.diagnostics().frames,frames+1);
  await clock.advance(100);
  assert.ok(page.borderBase.every(node=>node.borderStyle.includes('#EBA270')));
  assert.equal(page.diagnostics().frames,frames+2);
  send(113,{page:1});assert.equal(page.pageIndex,1);
  assert.equal(page.diagnostics().frames,frames+3,'page switches remain immediate');
  page.onHide();const hiddenFrames=page.diagnostics().frames;
  for(let seq=114;seq<=130;seq++)send(seq,{page:0});
  await clock.advance(1000);assert.equal(page.diagnostics().frames,hiddenFrames);
  assert.equal(clock.size,0);
  page.onShow();assert.equal(page.diagnostics().frames,hiddenFrames+1);
  page.onDestroy();assert.equal(clock.size,0);
});
