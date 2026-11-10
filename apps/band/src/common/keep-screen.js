// setKeepScreenOn reports request acceptance, not physical display state.
// Refresh conservatively while visible; never wake the app after hide/exit.
function createKeepScreen(api, clock, schedule, cancel, report) {
  var visible=false, generation=0, timer=null;
  var holdTimer=null, holdUntil=0, wakeId=null, seen=[];
  function clearHold(){if(holdTimer!==null)cancel(holdTimer);holdTimer=null;holdUntil=0;}
  var stats={state:'off',requests:0,successes:0,failures:0,shows:0,hides:0,lastSuccessAt:0};
  function clear(){if(timer!==null)cancel(timer);timer=null;}
  function request(wanted){
    clear();var id=++generation,settled=false;stats.requests+=1;
    if(!stats.lastSuccessAt||!wanted)stats.state='pending';
    function finish(ok,code){
      if(settled||id!==generation)return;settled=true;clear();
      if(ok){stats.successes+=1;stats.lastSuccessAt=clock();stats.state=wanted?'on':'off';}
      else{stats.failures+=1;stats.state='error';}
      report(stats.state,code);
      if(visible&&wanted)timer=schedule(function(){timer=null;request(true);},30000);
    }
    if(wanted)timer=schedule(function(){timer=null;finish(false,'timeout');},5000);
    try{api({keepScreenOn:wanted,success:function(){finish(true);},fail:function(data,code){finish(false,code);}});}catch(error){finish(false);}
  }
  return {
    show:function(){clearHold();visible=true;stats.shows+=1;request(true);},
    hide:function(){clearHold();visible=false;stats.hides+=1;request(false);},
    hold:function(id,ms){
      if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(id)||typeof ms!=='number'||ms<1000||ms>30000||ms%1!==0||seen.indexOf(id)>=0)return false;
      seen.push(id);if(seen.length>32)seen.shift();
      clearHold();wakeId=id;holdUntil=clock()+ms;visible=true;request(true);
      holdTimer=schedule(function(){holdTimer=null;holdUntil=0;visible=false;request(false);},ms);
      return true;
    },
    display:function(){return {id:wakeId,remainingMs:Math.max(0,holdUntil-clock())};},
    snapshot:function(){return {visible:visible,state:stats.state,requests:stats.requests,successes:stats.successes,failures:stats.failures,shows:stats.shows,hides:stats.hides,age:stats.lastSuccessAt?Math.max(0,clock()-stats.lastSuccessAt):-1};}
  };
}
module.exports={createKeepScreen:createKeepScreen};
