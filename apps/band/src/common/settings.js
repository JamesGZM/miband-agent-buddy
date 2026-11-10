// Storage callbacks may arrive after a newer snapshot or after page teardown.
function createSettings(storage,changed,schedule,cancel){
 schedule=schedule||setTimeout;cancel=cancel||clearTimeout;var timeout=null;
 var current={buddyTheme:'chatgpt',settingsRevision:0,keepScreen:false},generation=0,ready=false,writing=false;
 function valid(v){return v&&['chatgpt','claude'].indexOf(v.buddyTheme)>=0&&typeof v.keepScreen==='boolean'&&typeof v.settingsRevision==='number'&&isFinite(v.settingsRevision)&&v.settingsRevision>=0&&v.settingsRevision%1===0;}
 function load(){var id=generation;storage.get({key:'buddy-settings',success:function(raw){if(id!==generation)return;try{var v=JSON.parse(raw);if(valid(v))current=v;}catch(e){}ready=true;changed(current);},fail:function(){if(id!==generation)return;ready=true;changed(current);}});}
 function apply(msg){
  if(msg.buddyTheme==null)return;
  var next={buddyTheme:msg.buddyTheme,settingsRevision:msg.settingsRevision,keepScreen:msg.keepScreen};
  if(!valid(next))return;
  if(ready&&JSON.stringify(next)===JSON.stringify(current))return;
  if(writing)return;
  var id=++generation;writing=true;
  timeout=schedule(function(){if(id===generation){generation++;writing=false;}timeout=null;},5000);
  storage.set({key:'buddy-settings',value:JSON.stringify(next),success:function(){if(id!==generation)return;cancel(timeout);timeout=null;current=next;ready=true;writing=false;changed(current);},fail:function(){if(id!==generation)return;cancel(timeout);timeout=null;writing=false;}});
 }
 return {load:load,apply:apply,snapshot:function(msg){return {buddyTheme:current.buddyTheme,settingsRevision:current.settingsRevision,settingsApplied:ready&&!writing&&msg.buddyTheme===current.buddyTheme&&msg.settingsRevision===current.settingsRevision&&msg.keepScreen===current.keepScreen};},close:function(){generation++;writing=false;if(timeout!==null)cancel(timeout);timeout=null;}};
}
module.exports={createSettings:createSettings};
