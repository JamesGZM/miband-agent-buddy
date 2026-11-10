import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('actual frontend boots, refreshes native state and renders every existing page', async t => {
  const nodes = new Map(), handlers = new Map(), calls = [], frames = [], paints = [], texts = [], intervals = [];
  const ctx = {clearRect() {},fillRect() {},save() {},translate() {},rotate() {},restore() {},fillText(text) {texts.push(text);},drawImage() {paints.push('image');}};
  const node = selector => {
    if (selector === '#band') return {getContext:()=>ctx};
    if (!nodes.has(selector)) nodes.set(selector,{innerHTML:'',textContent:'',className:'',dataset:{},classList:{toggle() {}}});
    return nodes.get(selector);
  };
  const state = {loggedIn:true,devices:[{index:0,name:'Fixture Band 9',address:'masked',supported:true}],
    preferences:{appTheme:'claude',appearance:'system',keepScreen:false,background:true,selected:0,language:'zh-Hant'},
    runtime:{connection:'connected',agent:{state:'thinking'},ack:{appVersion:'0.5.2',page:0,buddyTheme:'chatgpt',settingsApplied:true},lastAckAt:Date.now(),metrics:{
      sampledAt:Date.now(),cpu:42,memory:{usedBytes:8*2**30,totalBytes:16*2**30,percent:50},
      disk:{usedBytes:60e9,totalBytes:100e9,percent:60},
    }},autostart:false};
  const globals = {
    document:{querySelector:node,documentElement:{dataset:{}},activeElement:null,hidden:false,
      addEventListener:(event,fn)=>handlers.set(event,fn)},
    window:{addEventListener() {}},
    __TAURI__:{core:{invoke:async (command,args)=>{calls.push([command,args]);return structuredClone(state);}}},
    matchMedia:()=>({matches:false,addEventListener() {}}),
    Image:class {constructor() {this.complete=true;this.naturalWidth=192;}},
    setTimeout:fn=>{frames.push(fn);return frames.length;},clearTimeout:()=>{},setInterval:fn=>{intervals.push(fn);return 2;},
  };
  const saved = Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{for (const [key,descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const click = dataset => handlers.get('click')({target:{closest:()=>({dataset,disabled:false})}});
  const refresh = async () => {await intervals[0](); await settle();};
  await import('../../apps/desktop/ui/app.js');
  await settle();
  assert.ok(calls.some(([command])=>command==='get_state'));
  assert.ok(node('#content').innerHTML.includes('<canvas'));
  for (const [page,expected] of [['devices','Fixture Band 9'],['account','小米帳號已登入'],['settings','主題'],['buddy','<canvas']]) {
    click({page});
    assert.ok(node('#content').innerHTML.includes(expected),page);
  }
  const content = node('#content').innerHTML;
  for (const decoration of ['⌘','⌁','◌','✓','eyebrow','OPEN SOURCE']) assert.ok(!content.includes(decoration),decoration);
  assert.ok(paints.length>0);

  // Switching the preview page while connected asks the band to follow.
  click({view:'1'});
  frames.at(-1)();
  assert.ok(paints.length>3);
  assert.ok(texts.includes('42%'));
  assert.ok(texts.includes('8.0 / 16.0'));
  assert.ok(texts.includes('60.0 / 100.0'));
  assert.ok(texts.includes('TOTAL LOAD'));
  assert.ok(!texts.some(text=>/NaN|Infinity/.test(text)));
  await settle();
  assert.deepEqual(calls.find(([command,args])=>command==='action'&&args.operation==='page'),['action',{operation:'page',value:1}]);

  // A band operation keeps its button grey with progress until the worker settles it.
  state.runtime.ack.page = 1;
  state.runtime.operation = {id:'op-1',kind:'theme',status:'waking'};
  click({themeChoice:'claude'});
  click({action:'theme',value:''});
  await settle();
  assert.deepEqual(calls.find(([command,args])=>command==='action'&&args.operation==='theme'),['action',{operation:'theme',value:'claude'}]);
  assert.match(node('#content').innerHTML,/class="button primary loading" data-action="theme"[^>]*disabled>.*喚醒手環中…/);
  assert.match(node('#content').innerHTML,/class="screen" data-action="wake"[^>]*disabled/);
  state.runtime.operation = {id:'op-1',kind:'theme',status:'applying'};
  await refresh();
  assert.ok(node('#content').innerHTML.includes('套用中…'));
  state.runtime.operation = {id:'op-1',kind:'theme',status:'done'};
  state.runtime.ack.buddyTheme = 'claude';
  await refresh();
  assert.equal(node('#toast').textContent,'主題已套用到手環');
  assert.match(node('#toast').className,/visible success/);
  assert.ok(!node('#content').innerHTML.includes('loading'));
  frames.at(-1)();
  assert.equal(node('#toast').className,'toast');

  // Failures use the same slot with a readable reason; the band's own page wins back.
  state.runtime.operation = {id:'op-2',kind:'page',status:'failed',code:'timeout'};
  state.runtime.ack.page = 0;
  await refresh();
  assert.equal(node('#toast').textContent,'手環沒有回應，請確認手環在附近');
  assert.match(node('#toast').className,/visible error/);
  assert.match(node('#content').innerHTML,/data-view="0" class="active/);
  const toasts = node('#toast').textContent;
  await refresh();
  assert.equal(node('#toast').textContent,toasts);

  // Status and screen chips sit on the preview card, outside the capsule; clicking the capsule wakes the band.
  delete state.runtime.operation;
  state.runtime.ack.keepScreen = 'on';
  state.runtime.ack.wakeDisplay = {id:'wake-1',remainingMs:20000};
  state.runtime.lastAckAt = Date.now();
  await refresh();
  let html = node('#content').innerHTML;
  assert.match(html,/preview-panel[\s\S]*id="buddy-dot"[\s\S]*class="screen"/);
  assert.match(html,/preview-panel[\s\S]*id="screen-badge"[\s\S]*class="screen"/);
  assert.doesNotMatch(html,/class="screen"[\s\S]*id="buddy-dot"/);
  assert.doesNotMatch(html,/class="screen"[\s\S]*id="screen-badge"/);
  assert.match(node('#screen-badge').textContent,/^亮屏 (19|20) 秒$/);
  assert.match(node('#screen-badge').className,/ on/);
  assert.match(node('#buddy-dot').className,/busy/);
  assert.match(html,/class="hero-meta"[\s\S]*20 秒/);
  state.runtime.ack.keepScreen = 'off';
  state.runtime.agent.state = 'attention';
  await refresh();
  assert.equal(node('#screen-badge').textContent,'息屏');
  assert.match(node('#screen-badge').className,/ off/);
  assert.match(node('#buddy-dot').className,/alert/);
  assert.ok(!node('#content').innerHTML.includes('手環螢幕'));
  click({action:'wake'});
  assert.ok(node('#content').innerHTML.includes('喚醒手環中…'));
  await settle();
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='wake').at(-1),['action',{operation:'wake',value:null}]);

  // Theme strip: apply sits in the section head; unsupported themes stay blocked until Buddy advertises them.
  html = node('#content').innerHTML;
  assert.match(html,/class="section-head"[\s\S]*class="section-sub"[\s\S]*只影響手環畫面/);
  assert.match(html,/class="section-head"[\s\S]*data-action="theme"/);
  assert.ok(html.includes('class="theme-strip"'));
  assert.doesNotMatch(html,/theme-strip[\s\S]*class="footnote"/);
  assert.deepEqual([...html.matchAll(/data-theme-choice="(\w+)"/g)].map(m=>m[1]),['chatgpt','claude','deepseek']);
  assert.match(html,/data-theme-choice="deepseek"[\s\S]*需要更新 Buddy/);
  click({themeChoice:'deepseek'});
  assert.match(node('#content').innerHTML,/data-action="theme"\s+disabled/);
  state.runtime.ack.capabilities = {maxWakeHoldMs:1800000,themes:['chatgpt','claude','deepseek'],page:true};
  await refresh();
  html = node('#content').innerHTML;
  assert.ok(!html.includes('需要更新 Buddy'));
  assert.doesNotMatch(html,/data-action="theme"\s+disabled/);

  // Battery is shown on the band page card and in the sidebar summary only.
  state.runtime.battery = 76;
  state.runtime.device = {battery:76,charging:true,firmware:'3.0.0',model:'fixture-model',storageTotal:1000e6,storageFree:400e6,at:Date.now()-1000};
  await refresh();
  assert.match(node('#device-summary').innerHTML,/class="battery[^"]*" title="電量 76%"/);
  assert.equal(node('#connection').innerHTML,'');
  for (const page of ['buddy','account','settings']) {
    click({page});
    assert.ok(!node('#content').innerHTML.includes('76%'),page);
  }
  click({page:'devices'});
  html = node('#content').innerHTML;
  assert.match(html,/電量<\/span><span class="tile-value">76%/);
  for (const text of ['充電中','3.0.0','fixture-model','600 MB / 1.0 GB','0.5.2']) assert.ok(html.includes(text),text);
  assert.match(html,/class="icon-button[^"]*"[^>]*data-action="refresh_device"/);
  click({action:'refresh_device'});
  assert.match(node('#content').innerHTML,/icon-button spinning/);
  await settle();
  assert.ok(calls.some(([command,args])=>command==='action'&&args.operation==='refresh_device'));
  assert.match(node('#content').innerHTML,/icon-button spinning/);
  // A later device snapshot clears the spinner; a 10-second silence times out with a toast.
  state.runtime.device = {...state.runtime.device, at:Date.now()+1};
  await refresh();
  assert.doesNotMatch(node('#content').innerHTML,/spinning/);
  state.runtime.device = {...state.runtime.device, at:Date.now()-20000};
  click({action:'refresh_device'});
  await settle();
  const now = Date.now;
  Date.now = () => now() + 10000;
  try { await refresh(); } finally { Date.now = now; }
  assert.equal(node('#toast').textContent,'手環沒有回應，請確認手環在附近');
  assert.doesNotMatch(node('#content').innerHTML,/spinning/);

  // Wake hold: saved in seconds with a battery hint above 30 seconds; invalid input is never sent.
  click({page:'settings'});
  assert.ok(node('#content').innerHTML.includes('id="wake-hold"'));
  for (const [value,kind,text] of [
    ['20','success','亮屏時長已儲存為 20 秒'],
    ['300','success','已儲存為 5 分鐘，較長的亮屏時間會增加手環耗電'],
    ['3','error','請輸入 5 到 1800 之間的整數秒數'],
    ['12.5','error','請輸入 5 到 1800 之間的整數秒數'],
    ['1801','error','請輸入 5 到 1800 之間的整數秒數'],
  ]) {
    node('#wake-hold').value = value;
    click({action:'wake_hold'});
    await settle();
    assert.equal(node('#toast').textContent,text,value);
    assert.match(node('#toast').className,new RegExp(kind));
  }
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='wake_hold').map(([,args])=>args.value),[20,300]);
  state.preferences.wakeHoldSeconds = 300;
  await refresh();

  // Buddy page shows the saved hold; legacy bands without capabilities stay capped at 30s while linked.
  click({page:'buddy'});
  assert.equal(node('#hold-duration').textContent,'5 分鐘');
  delete state.runtime.ack.capabilities;
  await refresh();
  assert.equal(node('#hold-duration').textContent,'30 秒');
  state.runtime.connection = 'disconnected';
  await refresh();
  assert.equal(node('#hold-duration').textContent,'5 分鐘');
  state.runtime.connection = 'connected';
  state.runtime.ack.capabilities = {maxWakeHoldMs:1800000,themes:['chatgpt','claude','deepseek'],page:true};
  await refresh();

  // Last sync is a clock time, never a relative "seconds ago" counter.
  assert.match(node('#last-sync').textContent,/^\d{2}:\d{2}:\d{2}$/);
  assert.ok(!node('#content').innerHTML.includes('秒前'));

  // Mac theme switches the full palette, not just an accent chip.
  assert.equal(globalThis.document.documentElement.dataset.theme,'claude');
  state.preferences.appTheme='chatgpt';
  await refresh();
  assert.equal(globalThis.document.documentElement.dataset.theme,'chatgpt');
  state.preferences.appTheme='deepseek';
  await refresh();
  assert.equal(globalThis.document.documentElement.dataset.theme,'deepseek');
  state.preferences.appTheme='claude';
  await refresh();

  // Switching language re-renders every label, including backend messages from the shared catalog.
  state.preferences.language = 'en';
  state.runtime.error = '請先連線手環';
  delete state.runtime.operation;
  await refresh();
  assert.equal(globalThis.document.documentElement.lang,'en');
  assert.match(node('#navigation').innerHTML,/Settings/);
  assert.equal(node('#notice').textContent,'Connect the band first');
  assert.ok(node('#content').innerHTML.includes('Band theme'));
  assert.ok(!/[\u4e00-\u9fff]/.test(node('#content').innerHTML.split('简体中文').join('').split('繁體中文').join('')));
  state.preferences.language = 'zh-Hans';
  await refresh();
  assert.ok(node('#content').innerHTML.includes('手环主题'));
  click({page:'settings'});
  assert.match(node('#content').innerHTML,/<select id="language">[\s\S]*value="zh-Hans" selected/);
});

test('narrow windows collapse the sidebar into an icon rail', () => {
  const css = readFileSync(new URL('../../apps/desktop/ui/style.css', import.meta.url), 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width: 800px)'));
  assert.ok(narrow.length < css.length);
  assert.match(narrow,/aside \{\s+width: 64px;/);
  assert.match(narrow,/\.nav-label[\s\S]*display: none;/);
  assert.match(narrow,/\.nav:hover::after \{\s+content: attr\(data-label\);/);
  const conf = JSON.parse(readFileSync(new URL('../../apps/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const window = conf.app.windows[0];
  assert.deepEqual([window.titleBarStyle, window.hiddenTitle, window.minWidth], ['Overlay', true, 720]);
  // The default window must open with the full sidebar, not the narrow rail.
  assert.ok(window.width > 800);
});
