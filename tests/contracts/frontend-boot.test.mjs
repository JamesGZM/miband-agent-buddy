import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('actual frontend boots, refreshes native state and renders every existing page', async t => {
  const nodes = new Map(), handlers = new Map(), calls = [], frames = [], timers = [], paints = [], texts = [], intervals = [], copies = [];
  const ctx = {beginPath(){},moveTo(){},lineTo(){},arcTo(){},closePath(){},arc(){},stroke(){},fill(){},clearRect() {},fillRect() {paints.push('geometry');},save() {},translate() {},rotate() {},restore() {},fillText(text) {texts.push(text);},drawImage() {paints.push('image');}};
  let currentCanvas = null;
  const canvas = () => ({dataset:{},getContext:()=>ctx,getAttribute:()=> '手環畫面預覽',setAttribute(){},replaceWith(existing){currentCanvas=existing;}});
  const node = selector => {
    if (selector === '#band') return nodes.get('#content')?.innerHTML.includes('<canvas') ? currentCanvas ||= canvas() : null;
    if (!nodes.has(selector)) {
      const element={innerHTML:'',textContent:'',className:'',dataset:{},classList:{toggle() {}}};
      if(selector==='#content') {
        let html='';
        Object.defineProperty(element,'innerHTML',{configurable:true,get:()=>html,set:value=>{html=value;currentCanvas=value.includes('<canvas')?canvas():null;}});
      }
      nodes.set(selector,element);
    }
    return nodes.get(selector);
  };
  const state = {loggedIn:true,devices:[{index:0,name:'Fixture Band 9',address:'masked',supported:true}],
    preferences:{appTheme:'claude',appearance:'system',keepScreen:false,background:true,selected:0,language:'zh-Hant',buddyTheme:'claude'},
    runtime:{connection:'connected',agent:{state:'thinking'},ack:{appVersion:'0.5.2',page:0,buddyTheme:'chatgpt',settingsApplied:true},lastAckAt:Date.now(),metrics:{
      sampledAt:Date.now(),cpu:42,memory:{usedBytes:8*2**30,totalBytes:16*2**30,percent:50},
      disk:{usedBytes:60e9,totalBytes:100e9,percent:60},
    }},autostart:false,
    integration:{application:{name:'MiBand Agent Buddy',id:'io.github.jamesgzm.miband-agent-buddy'},guide:'Complete offline guide fixture'}};
  const initialAck = state.runtime.ack;
  delete state.runtime.ack;
  let failInitialState;
  const firstState = new Promise((resolve, reject) => {failInitialState = reject;});
  let firstRead = true;
  let nextStateRead = null, nextAction = null, failAction = false;
  const globals = {
    navigator: {languages: ['zh-Hant'], clipboard: {writeText: async text => {copies.push(text);}}},
    document:{querySelector:node,documentElement:{dataset:{}},activeElement:null,hidden:false,
      addEventListener:(event,fn)=>handlers.set(event,fn)},
    window:{addEventListener() {}},
    __TAURI__:{core:{invoke:async (command,args)=>{
      calls.push([command,args]);
      if (command === 'get_state' && firstRead) {firstRead = false; await firstState;}
      if (command === 'get_state' && nextStateRead) {
        const snapshot = structuredClone(state), waiting = nextStateRead;
        nextStateRead = null;
        await waiting;
        return snapshot;
      }
      if (command === 'action' && nextAction) {
        const waiting = nextAction;
        nextAction = null;
        await waiting;
      }
      if (command === 'action' && failAction) {failAction = false; throw new Error('fixture save failed');}
      if (command === 'action' && args.operation === 'wake_hold') state.preferences.wakeHoldSeconds = args.value;
      if (command === 'action' && args.operation === 'preferences') Object.assign(state.preferences, args.value);
      if (command === 'action' && args.operation === 'activity_keep_awake') state.preferences.activityKeepAwake = args.value;
      if (command === 'action' && args.operation === 'completion_vibration') state.preferences.completionVibration = args.value;
      if (command === 'action' && args.operation === 'completion_vibration_mode') state.preferences.completionVibrationMode = args.value;
      if (command === 'action' && args.operation === 'band_auto_brightness') state.preferences.bandAutoBrightness = args.value;
      if (command === 'action' && args.operation === 'band_brightness') state.preferences.bandBrightness = args.value;
      if (command === 'action' && args.operation === 'buddy_fps') state.preferences.buddyFps = args.value;
      if (command === 'action' && args.operation === 'power_saving') state.preferences.powerSaving = args.value;
      if (command === 'action' && args.operation === 'pause') {
        state.runtime.paused = args.value;
        state.preferences.syncEnabled = !args.value;
      }
      if (command === 'action' && args.operation === 'reset_activity')
        state.runtime.operation = {id:'reset-fixture',kind:'reset_activity',status:'done'};
      return command === 'action' ? null : structuredClone(state);
    }}},
    matchMedia:()=>({matches:false,addEventListener() {}}),
    Image:class {constructor() {this.complete=true;this.naturalWidth=192;}},
    setTimeout:(fn,delay)=>{frames.push(fn);timers.push({fn,delay});return frames.length;},clearTimeout:()=>{},setInterval:fn=>{intervals.push(fn);return 2;},
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
  assert.ok(!node('#content').innerHTML.includes('<canvas'), 'do not render default Buddy before hydration');
  assert.equal(globalThis.document.documentElement.dataset.loading,'true');
  failInitialState(new Error('fixture service unavailable'));
  await settle();
  assert.match(node('#startup').innerHTML,/data-action="retry"/);
  assert.ok(!node('#content').innerHTML.includes('<canvas'));
  click({action:'retry'});
  await settle();
  assert.ok(calls.some(([command])=>command==='get_state'));
  assert.ok(node('#content').innerHTML.includes('<canvas'));
  assert.equal(globalThis.document.documentElement.dataset.loading,'false');
  assert.match(node('#content').innerHTML,/theme-card selected" data-theme-choice="claude"/);
  assert.ok(paints.length > 0, 'paint preview in the same turn as the first real render');
  state.runtime.device={battery:19,charging:true};await refresh();
  assert.match(node('#device-summary').innerHTML,/充電中/);
  assert.match(node('#notice').textContent,/低於 20%/);
  state.runtime.device={battery:20,charging:false};await refresh();
  assert.doesNotMatch(node('#device-summary').innerHTML,/充電中/);
  assert.doesNotMatch(node('#notice').textContent,/低於 20%/);
  const startupCanvas=node('#band');
  state.runtime.ack = initialAck;
  await refresh();
  assert.equal(node('#band'),startupCanvas,'keep the painted canvas when the first device ACK updates the layout');
  assert.match(node('#content').innerHTML,/theme-card selected" data-theme-choice="claude"/,'an older ACK must not override the saved device theme');
  state.preferences.buddyTheme='chatgpt';
  await refresh();
  assert.match(node('#content').innerHTML,/theme-card selected" data-theme-choice="chatgpt"/);
  state.runtime.device={at:1,battery:80};
  await refresh();
  assert.equal(node('#band'),startupCanvas,'device status polling must not discard the preview bitmap');
  const paintCount = paints.length;
  await refresh();
  assert.equal(paints.length,paintCount,'unchanged polling must not rebuild or repaint the preview');
  for (const [page,expected] of [['devices','Fixture Band 9'],['account','小米帳號已登入'],['settings','主題'],['buddy','<canvas']]) {
    click({page});
    assert.ok(node('#content').innerHTML.includes(expected),page);
  }
  click({page: 'hooks'});
  assert.match(node('#content').innerHTML, /等待第一個事件/);
  click({copyIntegration: 'request'});
  await settle();
  assert.match(copies.at(-1), /使用者全域的持續自動狀態回報/);
  assert.match(copies.at(-1), /選擇支援的自動觸發機制/);
  assert.equal(node('#toast').textContent, '已複製，可貼到要接入的 AI 工具');
  assert.ok(copies.at(-1).endsWith(state.integration.guide));
  assert.doesNotMatch(copies.at(-1),/https?:\/\/|\/Applications\/|\.app\b/i);
  state.runtime.agent = {state: 'attention', eventCount: 3, lastEventAt: Date.now(), activeSessions: 3, sessionCounts: {thinking: 1, working: 1, attention: 1}};
  await refresh();
  assert.match(node('#content').innerHTML, /已收到活動事件/);
  click({page: 'buddy'});
  assert.doesNotMatch(node('#content').innerHTML, /開始使用 Buddy/);
  assert.match(node('#activity').textContent, /3 個任務/);
  assert.equal(node('#session-summary').textContent, '1 執行 · 1 思考 · 1 等待確認');
  state.runtime.agent.state = 'thinking';
  await refresh();
  state.runtime.agent.staleSessions = 1;
  await refresh();
  assert.match(node('#session-summary').textContent, /1 個任務狀態待確認/);
  state.runtime.agent.staleSessions = 0;
  const content = node('#content').innerHTML;
  for (const decoration of ['⌘','⌁','◌','✓','eyebrow','OPEN SOURCE']) assert.ok(!content.includes(decoration),decoration);
  assert.ok(paints.length>0);

  // Switching the preview page while connected asks the band to follow.
  click({view:'1'});
  frames.at(-1)();
  assert.ok(paints.length>3);
  assert.ok(texts.includes('42%'));
  assert.ok(texts.includes('8.0/16 GiB'));
  assert.ok(texts.includes('60/100 GB'));
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
  state.runtime.ack.page = 0;
  await refresh();
  assert.ok(node('#content').innerHTML.includes('套用中…'));
  state.runtime.operation = {id:'op-1',kind:'theme',status:'done'};
  state.runtime.ack.buddyTheme = 'claude';
  await refresh();
  assert.equal(node('#toast').textContent,'主題已套用到手環');
  assert.match(node('#content').innerHTML, /data-view="0" class="active/, 'settled operation reconciles a page already reported by an interim ACK');
  assert.match(node('#toast').className,/visible success/);
  assert.doesNotMatch(node('#content').innerHTML,/class="button primary loading"/);
  assert.equal(node('#preview-loading').hidden,true);
  timers.filter(timer=>timer.delay===3000).at(-1).fn();
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
  const savedAck = state.runtime.ack;
  state.runtime.connection = 'standby';
  await refresh();
  assert.match(node('#device-summary').innerHTML,/Buddy 暫未回應/);
  assert.doesNotMatch(node('#device-summary').innerHTML,/休眠/);
  assert.equal(node('#screen-badge').textContent,'亮屏狀態待確認');
  state.runtime.connection = 'waiting'; state.runtime.ack = null;
  await refresh();
  assert.equal(node('#activity').textContent,'等待 Buddy 回應');
  state.runtime.connection = 'connected'; state.runtime.ack = savedAck;
  await refresh();
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
  assert.match(html,/data-theme-choice="deepseek"[\s\S]*僅預覽/);
  assert.doesNotMatch(html, /更新 Buddy|安裝 Buddy|版本過舊/);
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
  assert.match(html, /class="storage-meter" max="1000000000" value="600000000"/);
  assert.doesNotMatch(html, /style="width:/, 'CSP blocks inline styles in the native webview');
  state.runtime.device.storageFree = 1000e6;
  await refresh();
  assert.match(node('#content').innerHTML, /class="storage-meter" max="1000000000" value="0"/);
  state.runtime.device.storageFree = 0;
  await refresh();
  assert.match(node('#content').innerHTML, /class="storage-meter" max="1000000000" value="1000000000"/);
  state.runtime.device.storageFree = 1100e6;
  await refresh();
  assert.doesNotMatch(node('#content').innerHTML, /class="storage-meter"/);
  state.runtime.device.storageFree = 400e6;
  await refresh();
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
    ['60','success','已儲存為 1 分鐘，較長的亮屏時間會增加手環耗電'],
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
    if (value === '60') {
      click({page:'buddy'});
      assert.equal(node('#hold-duration').textContent,'1 分鐘');
      click({page:'settings'});
    }
  }
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='wake_hold').map(([,args])=>args.value),[20,60,300]);

  // A saved hold appears immediately; legacy caps are separate from the saved preference.
  click({page:'buddy'});
  assert.equal(node('#hold-duration').textContent,'5 分鐘');
  delete state.runtime.ack.capabilities;
  await refresh();
  assert.equal(node('#hold-duration').textContent,'5 分鐘');
  assert.doesNotMatch(node('#content').innerHTML,/此版本的 Buddy|更新 Buddy/);
  click({page:'devices'});
  assert.match(node('#content').innerHTML,/此版本的 Buddy 最多亮屏 30 秒/);
  // Inventory can arrive before a new-session ACK. Unknown capabilities must not
  // be presented as a confirmed legacy limit, even when an installed version is known.
  const previousAck = state.runtime.ack, previousBuddy = state.runtime.buddy;
  state.runtime.ack = null;
  state.runtime.connection = 'waiting';
  state.runtime.buddy = {status:'current',installed:true,installedVersion:'0.5.4',installedVersionCode:16};
  await refresh();
  assert.doesNotMatch(node('#content').innerHTML,/此版本的 Buddy 最多亮屏|更新 Buddy 可使用設定時長/);
  state.runtime.ack = {...previousAck,capabilities:{maxWakeHoldMs:1800000}};
  state.runtime.connection = 'connected';
  await refresh();
  assert.doesNotMatch(node('#content').innerHTML,/此版本的 Buddy 最多亮屏|更新 Buddy 可使用設定時長/);
  state.runtime.ack = previousAck;
  state.runtime.buddy = previousBuddy;
  await refresh();
  assert.match(node('#content').innerHTML,/此版本的 Buddy 最多亮屏 30 秒/);
  click({page:'buddy'});
  state.runtime.connection = 'disconnected';
  await refresh();
  assert.equal(node('#hold-duration').textContent,'5 分鐘');
  state.runtime.connection = 'connected';
  state.runtime.ack.capabilities = {maxWakeHoldMs:1800000,themes:['chatgpt','claude','deepseek'],page:true};
  await refresh();

  // Opt-in active holding is separate from sync; old preferences leave it unchecked.
  click({page:'settings'});
  assert.match(node('#content').innerHTML, /id="activity-keep-awake" class="switch" type="checkbox" aria-label="任務期間保持亮屏" >/);
  assert.doesNotMatch(node('#content').innerHTML,/id="completion-vibration"[^>]* checked/);
  const settingsGroups=[...node('#content').innerHTML.matchAll(/<section class="group"><h2>([^<]+)<\/h2>/g)].map(match=>match[1]);
  assert.deepEqual(settingsGroups,['外觀','執行與同步','手環顯示','任務通知','關於']);
  assert.match(node('#content').innerHTML,/<select id="completion-vibration-mode"[^>]*><option value="short" selected>短震<\/option><option value="long" >長震<\/option><\/select>/);
  assert.doesNotMatch(node('#content').innerHTML,/<select id="completion-vibration-mode"[^>]*disabled/);
  handlers.get('change')({target:{id:'completion-vibration',checked:true}});await settle();
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='completion_vibration').at(-1),['action',{operation:'completion_vibration',value:true}]);
  assert.match(node('#content').innerHTML,/id="completion-vibration"[^>]* checked/);
  handlers.get('change')({target:{id:'completion-vibration-mode',value:'long'}});await settle();
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='completion_vibration_mode').at(-1),['action',{operation:'completion_vibration_mode',value:'long'}]);
  assert.match(node('#content').innerHTML,/<option value="long" selected>長震/);
  handlers.get('change')({target:{id:'completion-vibration',checked:false}});await settle();
  assert.doesNotMatch(node('#content').innerHTML,/id="completion-vibration"[^>]* checked/);
  assert.match(node('#content').innerHTML, /每次事件或手動喚醒後/);
  handlers.get('change')({target:{id:'activity-keep-awake',checked:true}});
  await settle();
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='activity_keep_awake').at(-1),['action',{operation:'activity_keep_awake',value:true}]);
  assert.match(node('#content').innerHTML, /id="activity-keep-awake"[^>]* checked/);
  assert.match(node('#content').innerHTML, /全部任務結束後開始倒數/);
  assert.doesNotMatch(node('#content').innerHTML, /更新 Buddy|安裝 Buddy|版本過舊/);
  assert.match(node('#content').innerHTML, /id="activity-sync"[^>]* checked/);
  assert.doesNotMatch(node('#content').innerHTML, /data-action="pause"/);
  handlers.get('change')({target:{id:'activity-sync',checked:false}});
  await settle();
  assert.equal(state.runtime.paused, true);
  assert.doesNotMatch(node('#content').innerHTML, /id="activity-sync"[^>]* checked/);
  handlers.get('change')({target:{id:'activity-sync',checked:true}});
  await settle();
  assert.equal(state.runtime.paused, false);
  assert.doesNotMatch(node('#content').innerHTML,/<select id="buddy-fps"/);
  for(const invalid of ['', '9','31','12.5','NaN']){node('#buddy-fps').value=invalid;const before=calls.length;click({action:'buddy_fps'});await settle();assert.equal(calls.length,before);}
  assert.match(node('#content').innerHTML,/id="buddy-fps"/);
  node('#buddy-fps').value='27';click({action:'buddy_fps'});await settle();
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='buddy_fps').at(-1),['action',{operation:'buddy_fps',value:27}]);
  assert.match(node('#content').innerHTML,/id="buddy-fps"[^>]*type="number"[^>]*min="10" max="30"[^>]*value="27"/);
  assert.match(node('#content').innerHTML,/id="band-brightness"[^>]*type="range"[^>]*min="0" max="255"/);
  const brightnessCalls=calls.length;
  handlers.get('input')({target:{id:'band-brightness',value:'173'}});
  assert.equal(node('#brightness-value').textContent,'173');assert.equal(calls.length,brightnessCalls);
  handlers.get('change')({target:{id:'band-brightness',value:'173'}});await settle();
  assert.deepEqual(calls.filter(([command,args])=>command==='action'&&args.operation==='band_brightness').at(-1),['action',{operation:'band_brightness',value:173}]);
  assert.equal(state.preferences.bandBrightness,173);
  handlers.get('change')({target:{id:'band-auto-brightness',checked:true}});await settle();
  assert.equal(state.preferences.bandAutoBrightness,true);
  assert.match(node('#content').innerHTML,/id="band-brightness"[^>]*disabled/);
  const manualCalls=calls.length;handlers.get('change')({target:{id:'band-brightness',value:'80'}});await settle();assert.equal(calls.length,manualCalls);
  assert.doesNotMatch(node('#content').innerHTML, /id="power-saving"[^>]* checked/);
  handlers.get('change')({target:{id:'power-saving',checked:true}});
  await settle();
  assert.equal(state.preferences.powerSaving, true);
  assert.match(node('#content').innerHTML,/id="buddy-fps"[^>]* disabled/);
  assert.equal(state.preferences.buddyFps,27);
  assert.equal(state.preferences.bandBrightness,173);
  assert.match(node('#content').innerHTML,/id="band-brightness"[^>]*value="25"[^>]*disabled/);
  assert.match(node('#content').innerHTML,/id="buddy-fps"[^>]*value="10"[^>]*disabled/);
  assert.match(node('#content').innerHTML, /id="power-saving"[^>]* checked/);
  handlers.get('change')({target:{id:'power-saving',checked:false}});
  await settle();

  assert.equal(state.preferences.bandAutoBrightness,true);
  assert.match(node('#content').innerHTML,/id="band-auto-brightness"[^>]*checked/);
  handlers.get('change')({target:{id:'band-auto-brightness',checked:false}});await settle();
  assert.equal(state.preferences.bandAutoBrightness,false);
  assert.doesNotMatch(node('#content').innerHTML,/id="band-brightness"[^>]*disabled/);

  // Keep the user's choice while saving, and discard a poll started before that choice.
  let releaseRead, releaseAction;
  nextStateRead = new Promise(resolve => {releaseRead = resolve;});
  nextAction = new Promise(resolve => {releaseAction = resolve;});
  const oldPoll = intervals[0]();
  handlers.get('change')({target:{id:'power-saving',checked:true}});
  assert.match(node('#content').innerHTML, /id="power-saving"[^>]* checked disabled aria-busy="true"/);
  assert.match(node('#content').innerHTML, /control-status[^>]*>.*喚醒手環中…/);
  releaseAction();
  await settle();
  assert.match(node('#content').innerHTML, /id="power-saving"[^>]* checked/);
  releaseRead();
  await oldPoll;
  await settle();
  assert.match(node('#content').innerHTML, /id="power-saving"[^>]* checked/);
  state.runtime.operation = {id:'power-fixture',kind:'power_saving',status:'waking'};
  await refresh();
  assert.match(node('#content').innerHTML, /id="power-saving"[^>]* checked disabled aria-busy="true"/);
  assert.match(node('#operation-status').innerHTML, /喚醒手環中…/);
  state.runtime.operation.status = 'applying';
  await refresh();
  assert.match(node('#content').innerHTML, /control-status[^>]*>.*套用中…/);
  state.runtime.operation.status = 'done';
  await refresh();
  assert.equal(node('#toast').textContent, '省電設定已套用到手環');
  assert.doesNotMatch(node('#content').innerHTML, /id="power-saving"[^>]* disabled/);
  failAction = true;
  handlers.get('change')({target:{id:'power-saving',checked:false}});
  assert.doesNotMatch(node('#content').innerHTML, /id="power-saving"[^>]* checked/);
  await settle();
  assert.match(node('#content').innerHTML, /id="power-saving"[^>]* checked/);
  assert.match(node('#toast').textContent, /fixture save failed/);
  delete state.runtime.operation;

  // Manual Buddy actions stay available with automatic activity sync off.
  state.runtime.paused = true;
  state.preferences.syncEnabled = false;
  await refresh();
  click({page:'buddy'});
  assert.match(node('#content').innerHTML, /class="screen" data-action="wake"[^>]*(?<!disabled)>/);
  click({action:'wake'});
  assert.match(node('#operation-status').innerHTML, /喚醒手環中…/);
  await settle();
  state.runtime.paused = false;
  state.preferences.syncEnabled = true;
  await refresh();

  // Management appears only on Band; an absent app has an explicit install action.
  state.runtime.buddy = {status:'not_installed',installed:false,availableVersion:'0.5.4'};
  state.runtime.error = '手環尚未安裝 Buddy，請前往手環頁安裝';
  await refresh();
  assert.doesNotMatch(node('#notice').textContent, /未安裝/);
  click({page:'devices'});
  assert.match(node('#content').innerHTML, /尚未安裝/);
  assert.match(node('#content').innerHTML, /data-action="install"[^>]*>安裝 Buddy/);
  click({action:'check_buddy'});
  await settle();
  assert.ok(calls.some(([command,args])=>command==='action'&&args.operation==='check_buddy'));
  state.runtime.buddy = {status:'current',installed:true,installedVersion:'0.5.4',availableVersion:'0.5.4'};
  delete state.runtime.error;
  await refresh();
  assert.match(node('#content').innerHTML, /已是最新版/);
  assert.doesNotMatch(node('#content').innerHTML, />安裝 Buddy</);
  state.runtime.connection = 'installing';
  await refresh();
  assert.match(node('#content').innerHTML, /class="button primary loading" data-action="install"[^>]*disabled>.*安裝中…/);
  assert.doesNotMatch(node('#content').innerHTML, /開始使用 Buddy/);
  state.runtime.connection = 'connected';
  await refresh();

  // App updater is in About and maps downloading/verified packages to distinct actions.
  state.appVersion = '0.5.0';
  state.desktopUpdate = {status:'available',latestVersion:'0.6.0',releaseUrl:'https://github.com/JamesGZM/miband-agent-buddy/releases/tag/v0.6.0'};
  await refresh();
  click({page:'settings'});
  assert.match(node('#content').innerHTML, /0\.5\.0/);
  assert.match(node('#content').innerHTML, /data-action="open_project"/);
  assert.match(node('#content').innerHTML, /<a class="project-link" href="https:\/\/github.com\/JamesGZM\/miband-agent-buddy"[^>]*>MiBand Agent Buddy<\/a>/);
  let preventedLinkNavigation = false;
  handlers.get('click')({target:{closest:()=>({tagName:'A',dataset:{action:'open_project'}})},preventDefault:()=>{preventedLinkNavigation=true;}});
  await settle();
  assert.equal(preventedLinkNavigation, true, 'native link must not navigate the application webview');
  assert.ok(calls.some(([command,args])=>command==='action' && args.operation==='open_project'));
  assert.match(node('#content').innerHTML, /class="update-dot"/);
  assert.doesNotMatch(node('#content').innerHTML, /row-label">App 更新|row-label">開源專案|data-action="download_update"/);
  click({action:'update_details'});
  assert.match(node('#content').innerHTML, /data-action="download_update"/);
  assert.doesNotMatch(node('#content').innerHTML, /data-action="install_update"/);
  state.desktopUpdate = {status:'ready',latestVersion:'0.6.0',canInstall:true};
  await refresh();
  assert.match(node('#content').innerHTML, /data-action="install_update"[^>]*>安裝並重新啟動/);
  click({page:'buddy'});

  // Login captures the chosen region before rebuilding the form for its spinner.
  state.loggedIn = false;
  await refresh();
  click({page:'account'});
  let loginHtml = node('#content').innerHTML;
  Object.defineProperty(node('#content'), 'innerHTML', {configurable:true,
    get:()=>loginHtml,
    set:value=>{loginHtml=value; if (value.includes('id="region"')) node('#region').value='cn';},
  });
  node('#region').value = 'sg';
  click({action:'login'});
  await settle();
  assert.deepEqual(calls.filter(([command])=>command==='open_login').at(-1), ['open_login',{region:'sg'}]);
  Object.defineProperty(node('#content'), 'innerHTML', {value:loginHtml,writable:true,configurable:true});
  state.loggedIn = true;
  await refresh();
  click({page:'buddy'});

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

  // Failed background appearance saves restore both the model and CSS palette.
  click({page:'settings'});
  node('#app-theme').value = 'deepseek';
  node('#appearance').value = 'system';
  node('#language').value = 'zh-Hant';
  node('#background').checked = true;
  failAction = true;
  handlers.get('change')({target:{id:'app-theme'}});
  assert.equal(globalThis.document.documentElement.dataset.theme, 'deepseek');
  await settle();
  assert.equal(globalThis.document.documentElement.dataset.theme, 'claude');
  assert.match(node('#content').innerHTML, /value="claude" selected/);
  click({page:'buddy'});

  // A focused field defers layout without consuming the changed state.
  globalThis.document.activeElement = {tagName:'INPUT'};
  state.runtime.connection = 'standby';
  await refresh();
  assert.doesNotMatch(node('#device-summary').innerHTML,/手環休眠中/);
  globalThis.document.activeElement = null;
  await refresh();
  assert.match(node('#device-summary').innerHTML,/Buddy 暫未回應/);

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
  click({action:'reset_activity'});
  await settle();
  assert.deepEqual(calls.filter(([command,args]) => command === 'action' && args.operation === 'reset_activity').at(-1), ['action', {operation:'reset_activity',value:null}]);
  assert.equal(node('#toast').textContent, '任务显示已重置');
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
