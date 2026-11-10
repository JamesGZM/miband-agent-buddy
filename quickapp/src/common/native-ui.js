var periods={idle:4,thinking:3.2,working:2.4,attention:3.6,complete:3,error:2.6,sleep:6,offline:5};
function ringSource(name,value) {
  var n=typeof value==='number' && isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):0;
  return '/common/capsule/'+name+'-'+('00'+n).slice(-3)+'.png';
}
function motion(mode,seconds,theme) {
  var prefix=theme==='claude'?'claude-':'';
  if(!periods[mode])mode='idle';
  var breath=(1-Math.cos(seconds*2*Math.PI/periods[mode]))/2;
  var loading=mode==='thinking'||mode==='working';
  var frame=Math.floor(seconds*(mode==='working'?6:3))%24;
  return {ringSource:'/common/capsule/'+prefix+'ring-'+mode+'.png',ringOpacity:.32+.65*breath,
    loadingSource:loading?'/common/capsule/'+prefix+mode+'-'+('0'+frame).slice(-2)+'.png':'/common/capsule/blank.png',
    loadingOpacity:.6+.4*breath,symbolSource:'/common/capsule/'+prefix+(mode==='offline'?'symbols-offline':'symbols')+'.png',
    symbolLeft:mode==='idle'?Math.round(4*(1-Math.cos(seconds*Math.PI))/2):0};
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
module.exports={motion:motion,ringSource:ringSource,gesture:gesture,
  createRingTransition:createRingTransition,ringValue:ringValue,retargetRing:retargetRing,ringMoving:ringMoving};
