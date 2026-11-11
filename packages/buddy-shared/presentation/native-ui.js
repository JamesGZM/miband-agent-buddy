var periods={idle:4,thinking:3.2,working:2.4,attention:3.6,complete:3,error:2.6,sleep:6,offline:5};
var symbolPeriods={idle:2,thinking:1.8,working:1.2,attention:2.4,complete:3,error:1.4,sleep:6};
var BREATH_LEVELS=32, LOADING_FRAMES=96, NUDGE_STEPS=16;
function frameDelay(powerSaving) {return powerSaving===true?200:1000/30;}
function breathLevel(mode,seconds) {
  if(!periods[mode])mode='idle';
  return Math.round((1-Math.cos(seconds*2*Math.PI/periods[mode]))/2*(BREATH_LEVELS-1));
}
function ringSource(name,value) {
  var n=typeof value==='number' && isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):0;
  return '/common/capsule/'+name+'-'+('00'+n).slice(-3)+'.png';
}
function motion(mode,seconds,theme) {
  var prefix=theme==='claude'?'claude-':theme==='deepseek'?'deepseek-':'';
  if(!periods[mode])mode='idle';
  var loading=mode==='thinking'||mode==='working';
  var frame=Math.floor(seconds*(mode==='working'?24:12))%LOADING_FRAMES;
  // Vela repaints image sources reliably; subpixel motion is baked into small frames.
  var level=breathLevel(mode,seconds);
  var nudge=Math.round(NUDGE_STEPS*(1-Math.cos(seconds*2*Math.PI/(symbolPeriods[mode]||2)))/2);
  var symbol=mode==='offline'?'symbols-offline':'symbols-x'+nudge;
  // Active states share identical ring pixels; retain their own breathing phase.
  var ringMode=loading?'idle':mode;
  return {ringSource:'/common/capsule/'+prefix+'ring-'+ringMode+'-b'+level+'.png',ringOpacity:1,
    loadingSource:loading?'/common/capsule/'+prefix+mode+'-'+('0'+frame).slice(-2)+'.png':'/common/capsule/blank.png',
    loadingOpacity:1,symbolSource:'/common/capsule/'+prefix+symbol+'.png',symbolLeft:0};
}
function gesture(dx,dy) {
  if(dx>34 && Math.abs(dx)>Math.abs(dy)*1.2)return 'exit';
  if(Math.abs(dy)>=22 && Math.abs(dy)>Math.abs(dx)*1.15)return dy<0?'monitor':'pet';
  return null;
}
// One bounded transition per resource; retarget from the displayed position.
function createRingTransition() { return {from:0,to:0,at:0,duration:900}; }
function ringValue(state,now) {
  var t=Math.max(0,Math.min(1,(now-state.at)/state.duration));
  var eased=t*t*(3-2*t);
  return state.from+(state.to-state.from)*eased;
}
function retargetRing(state,value,now,snap) {
  value=Math.max(0,Math.min(100,value));
  if(snap){state.from=value;state.to=value;state.at=now-state.duration;return;}
  if(value===state.to)return;
  state.from=ringValue(state,now);state.to=value;state.at=now;
}
function ringMoving(state,now) {return state.from!==state.to && now<state.at+state.duration;}
module.exports={motion:motion,ringSource:ringSource,gesture:gesture,frameDelay:frameDelay,breathLevel:breathLevel,
  createRingTransition:createRingTransition,ringValue:ringValue,retargetRing:retargetRing,ringMoving:ringMoving};
