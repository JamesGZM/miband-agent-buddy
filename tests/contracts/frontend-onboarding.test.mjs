import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function boot(scenario) {
  const script = `
    const scenario = ${JSON.stringify(scenario)};
    const nodes = new Map(), handlers = new Map(), intervals = [], calls = [];
    const ctx = {clearRect(){},fillRect(){},save(){},translate(){},rotate(){},restore(){},fillText(){},drawImage(){}};
    let currentCanvas;
    const canvas = () => ({dataset:{},getContext:()=>ctx,getAttribute:()=>'',setAttribute(){},replaceWith(old){currentCanvas=old;}});
    const node = selector => {
      if(selector === '#band') return nodes.get('#content')?.innerHTML.includes('<canvas') ? currentCanvas ||= canvas() : null;
      if(!nodes.has(selector)) {
        const element = {innerHTML:'',textContent:'',dataset:{},classList:{toggle(){}}};
        if(selector === '#content') {
          let html='';
          Object.defineProperty(element,'innerHTML',{get:()=>html,set:value=>{html=value;currentCanvas=value.includes('<canvas')?canvas():null;if(value.includes('id="region"'))node('#region').value='cn';}});
        }
        nodes.set(selector,element);
      }
      return nodes.get(selector);
    };
    const device = {index:0,name:'Fixture Band 9',address:'masked',supported:true};
    const state = {loggedIn:scenario!=='new',devices:scenario==='new'?[]:[device],
      preferences:{appTheme:'claude',appearance:'system',background:true,selected:scenario==='new'?null:0,language:'zh-Hant',buddyTheme:'claude'},
      runtime:{connection:'connecting',agent:{eventCount:0}},autostart:false};
    if(scenario==='known-missing')state.runtime.buddy={installed:false,status:'not_installed'};
    const globals = {
      navigator:{languages:['zh-Hant']},
      document:{querySelector:node,documentElement:{dataset:{}},activeElement:null,hidden:false,addEventListener:(key,fn)=>handlers.set(key,fn)},
      window:{addEventListener(){}},matchMedia:()=>({matches:false,addEventListener(){}}),
      Image:class{constructor(){this.complete=true;this.naturalWidth=192;}},
      setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{intervals.push(fn);return 1;},
      __TAURI__:{core:{invoke:async(command,args)=>{calls.push([command,args]);return command==='get_state'?structuredClone(state):null;}}},
    };
    for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    const settle=()=>new Promise(resolve=>setImmediate(resolve));
    const click=dataset=>handlers.get('click')({target:{closest:()=>({dataset,disabled:false})}});
    const refresh=async()=>{await intervals[0]();await settle();};
    const snapshot=()=>({title:node('#title').textContent,html:node('#content').innerHTML});
    await import(${JSON.stringify(new URL('../../apps/desktop/ui/app.js', import.meta.url).href)});
    await settle();
    const result={initial:snapshot()};
    if(scenario==='new') {
      node('#region').value='sg';click({action:'login'});await settle();
      result.login=calls.find(([command])=>command==='open_login');
      state.loggedIn=true;state.devices=[device];state.region='sg';await refresh();result.devices=snapshot();
      state.preferences.selected=0;await refresh();result.connecting=snapshot();
      state.runtime.connection='connected';state.runtime.ack={appVersion:'0.5.5',buddyTheme:'claude',settingsApplied:true};
      state.runtime.buddy={installed:true,status:'current',installedVersion:'0.5.5',availableVersion:'0.5.5'};
      await refresh();result.ready=snapshot();
      click({page:'buddy'});click({page:'devices'});result.afterChoice=snapshot();
    } else if(scenario==='returning'||scenario==='navigated') {
      if(scenario==='navigated')click({page:'settings'});
      state.runtime.connection='standby';await refresh();result.waiting=snapshot();
      state.runtime.buddy={installed:false,status:'not_installed',availableVersion:'0.5.5'};
      await refresh();result.missing=snapshot();
    }
    process.stdout.write(JSON.stringify(result));
  `;
  const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
}

test('fresh native startup guides login, pairing and installation before optional AI setup',()=>{
  const result=boot('new');
  assert.equal(result.initial.title,'歡迎使用 Buddy');
  assert.match(result.initial.html,/id="region"/);
  assert.match(result.initial.html,/data-action="login"/);
  assert.doesNotMatch(result.initial.html,/<canvas|setup-list/);
  assert.deepEqual(result.login,['open_login',{region:'sg'}]);
  assert.equal(result.devices.title,'手環');
  assert.ok(result.devices.html.indexOf('首次連線與配對')<result.devices.html.indexOf('data-action="connect"'));
  assert.doesNotMatch(result.connecting.html,/開始使用 Buddy|setup-list/);
  assert.match(result.ready.html,/Buddy 已就緒/);
  assert.match(result.ready.html,/data-page="hooks"/);
  assert.match(result.ready.html,/data-page="buddy"/);
  assert.doesNotMatch(result.afterChoice.html,/Buddy 已就緒/,'the optional setup prompt is dismissed after choosing a destination');
});

test('returning users retain Buddy during reconnect and resume setup only on confirmed absence',()=>{
  const result=boot('returning');
  assert.equal(result.initial.title,'Buddy');assert.match(result.initial.html,/<canvas/);
  assert.equal(result.waiting.title,'Buddy');assert.doesNotMatch(result.waiting.html,/setup-list|開始使用 Buddy/);
  assert.equal(result.missing.title,'手環');assert.match(result.missing.html,/data-action="install"/);
  assert.equal(boot('known-missing').initial.title,'手環');
  assert.equal(boot('navigated').missing.title,'設定','late inventory must not navigate away from the user-selected page');
});
