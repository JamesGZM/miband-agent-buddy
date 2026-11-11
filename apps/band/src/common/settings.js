// Storage callbacks may arrive after a newer snapshot or after page teardown.
function createSettings(storage,changed,schedule,cancel){
 schedule=schedule||setTimeout;cancel=cancel||clearTimeout;var timeout=null;
 var current={buddyTheme:'chatgpt',settingsRevision:0,keepScreen:false,powerSaving:false},desired=null,generation=0,ready=false,writing=false;
 function valid(v){return v&&['chatgpt','claude','deepseek'].indexOf(v.buddyTheme)>=0&&typeof v.keepScreen==='boolean'&&typeof v.settingsRevision==='number'&&isFinite(v.settingsRevision)&&v.settingsRevision>=0&&v.settingsRevision%1===0&&(v.powerSaving===undefined||typeof v.powerSaving==='boolean');}
 function normalized(v){return {buddyTheme:v.buddyTheme,settingsRevision:v.settingsRevision,keepScreen:v.keepScreen,powerSaving:v.powerSaving===true};}
 function load(){var id=generation;storage.get({key:'buddy-settings',success:function(raw){if(id!==generation)return;try{var v=JSON.parse(raw);if(valid(v))current=normalized(v);}catch(e){}ready=true;changed(current);},fail:function(){if(id!==generation)return;ready=true;changed(current);}});}
 function flush(){
  if(writing||!desired||(ready&&JSON.stringify(desired)===JSON.stringify(current)))return;
  var next=desired;
  var id=++generation;writing=true;
  timeout=schedule(function(){if(id===generation){generation++;writing=false;}timeout=null;},5000);
  storage.set({key:'buddy-settings',value:JSON.stringify(next),success:function(){if(id!==generation)return;cancel(timeout);timeout=null;current=next;ready=true;writing=false;changed(current);flush();},fail:function(){if(id!==generation)return;cancel(timeout);timeout=null;writing=false;}});
 }
 function apply(msg){
  if(msg.buddyTheme==null&&msg.powerSaving===undefined)return;
  // Preserve a pending power choice when an older client omits the additive field.
  var base=desired||current;
  var next={buddyTheme:msg.buddyTheme==null?base.buddyTheme:msg.buddyTheme,settingsRevision:msg.buddyTheme==null?base.settingsRevision:msg.settingsRevision,keepScreen:msg.buddyTheme==null?base.keepScreen:msg.keepScreen,powerSaving:msg.powerSaving===undefined?base.powerSaving:msg.powerSaving};
  if(!valid(next))return;
  desired=next;flush();
 }
 return {load:load,apply:apply,snapshot:function(msg){return {buddyTheme:current.buddyTheme,settingsRevision:current.settingsRevision,powerSaving:current.powerSaving,settingsApplied:ready&&!writing&&msg.buddyTheme===current.buddyTheme&&msg.settingsRevision===current.settingsRevision&&msg.keepScreen===current.keepScreen&&(msg.powerSaving===undefined||msg.powerSaving===current.powerSaving)};},close:function(){generation++;writing=false;if(timeout!==null)cancel(timeout);timeout=null;}};
}
module.exports={createSettings:createSettings};
