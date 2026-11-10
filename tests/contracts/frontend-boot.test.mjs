import test from 'node:test';
import assert from 'node:assert/strict';

test('actual frontend boots, refreshes native state and renders every existing page', async t => {
  const nodes = new Map(), handlers = new Map(), calls = [], frames = [], paints = [], texts = [];
  const ctx = {clearRect() {},fillRect() {},save() {},translate() {},rotate() {},restore() {},fillText(text) {texts.push(text);},drawImage() {paints.push('image');}};
  const node = selector => {
    if (selector === '#band') return {getContext:()=>ctx};
    if (!nodes.has(selector)) nodes.set(selector,{innerHTML:'',textContent:'',classList:{toggle() {}}});
    return nodes.get(selector);
  };
  const state = {loggedIn:true,devices:[{index:0,name:'Fixture Band 9',address:'masked',supported:true}],
    preferences:{appTheme:'claude',appearance:'system',keepScreen:false,background:true,selected:0},
    runtime:{connection:'connected',agent:{state:'thinking'},ack:{appVersion:'0.5.1'},lastAckAt:Date.now(),metrics:{
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
    setTimeout:fn=>{frames.push(fn);return frames.length;},clearTimeout:()=>{},setInterval:()=>2,
  };
  const saved = Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{for (const [key,descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }});
  await import('../../apps/desktop/ui/app.js');
  await Promise.resolve();
  assert.ok(calls.some(([command])=>command==='get_state'));
  assert.ok(node('#content').innerHTML.includes('<canvas'));
  for (const [page,expected] of [['devices','Fixture Band 9'],['account','小米帳號已登入'],['settings','Mac 外觀'],['buddy','<canvas']]) {
    handlers.get('click')({target:{closest:()=>({dataset:{page},disabled:false})}});
    assert.ok(node('#content').innerHTML.includes(expected),page);
  }
  assert.ok(paints.length>0);
  handlers.get('click')({target:{closest:()=>({dataset:{view:'1'},disabled:false})}});
  frames.at(-1)();
  assert.ok(paints.length>3);
  assert.ok(texts.includes('42%'));
  assert.ok(texts.includes('8.0 / 16.0'));
  assert.ok(texts.includes('60.0 / 100.0'));
  assert.ok(texts.includes('TOTAL LOAD'));
  assert.ok(!texts.some(text=>/NaN|Infinity/.test(text)));
});
