// setKeepScreenOn reports request acceptance, not physical display state.
// Refresh conservatively while visible; never wake the app after hide/exit.
var MAX_ACTIVITY_HOLD_MS=require('./generated/protocol').MAX_ACTIVITY_HOLD_MS;
function createKeepScreen(api, clock, schedule, cancel, report) {
  var visible=false, generation=0, timer=null;
  var holdTimer=null, holdUntil=0, wakeId=null, seen=[], activeHold=false;
  function clearHold(){if(holdTimer!==null)cancel(holdTimer);holdTimer=null;holdUntil=0;}
  function expireAfter(ms){
    clearHold();holdUntil=clock()+ms;
    holdTimer=schedule(function(){holdTimer=null;holdUntil=0;activeHold=false;visible=false;request(false);},ms);
  }
  var stats={state:'off',requests:0,successes:0,failures:0,shows:0,hides:0,lastSuccessAt:0};
  function clear(){if(timer!==null)cancel(timer);timer=null;}
  function request(wanted){
    clear();var id=++generation,settled=false;stats.requests+=1;
    if(stats.state!=='on'||!wanted)stats.state='pending';
    function finish(ok,code){
      if(settled||id!==generation)return;settled=true;clear();
      if(ok){stats.successes+=1;stats.lastSuccessAt=clock();stats.state=wanted?'on':'off';}
      else{stats.failures+=1;stats.state='error';}
      report(stats.state,code);
      if(visible&&wanted)timer=schedule(function(){timer=null;request(true);},ok?30000:2000);
    }
    if(wanted)timer=schedule(function(){timer=null;finish(false,'timeout');},5000);
    try{api({keepScreenOn:wanted,success:function(data){
      // Some Vela implementations deliver a failed native status as value=-1
      // through success. The documented payload-free success remains valid.
      var rejected=data&&typeof data.value==='number'&&data.value<0;
      finish(!rejected,rejected?'rejected':undefined);
    },fail:function(data,code){finish(false,code);}});}catch(error){finish(false);}
  }
  return {
    show:function(){clearHold();activeHold=false;visible=true;stats.shows+=1;request(true);},
    hide:function(){clearHold();activeHold=false;visible=false;stats.hides+=1;request(false);},
    hold:function(id,ms){
      if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(id)||typeof ms!=='number'||ms<1000||ms>1800000||ms%1!==0||seen.indexOf(id)>=0)return false;
      seen.push(id);if(seen.length>32)seen.shift();
      wakeId=id;if(!activeHold)expireAfter(ms);visible=true;request(true);
      return true;
    },
    activity:function(ms,idleMs){
      if(typeof ms!=='number'||ms%1!==0||(ms!==0&&(ms<1000||ms>MAX_ACTIVITY_HOLD_MS))||typeof idleMs!=='number'||idleMs%1!==0||idleMs<5000||idleMs>1800000)return false;
      if(ms>0){
        activeHold=true;expireAfter(ms);
        // Renew the deadline without requesting the brightness API for every sample.
        if(!visible){visible=true;request(true);}
      }else if(activeHold){activeHold=false;expireAfter(idleMs);}
      return true;
    },
    display:function(){return {id:wakeId,remainingMs:Math.max(0,holdUntil-clock()),active:activeHold};},
    snapshot:function(){return {visible:visible,state:stats.state,requests:stats.requests,successes:stats.successes,failures:stats.failures,shows:stats.shows,hides:stats.hides,age:stats.lastSuccessAt?Math.max(0,clock()-stats.lastSuccessAt):-1};}
  };
}
module.exports={createKeepScreen:createKeepScreen};
