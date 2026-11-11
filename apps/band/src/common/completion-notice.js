// Persist before requesting vibration: a lost ACK must not repeat a notification.
function createCompletionNotice(storage,vibrator,now,schedule,cancel) {
  var alive=true,ready=false,failed=false,enabled=false,visible=false,lastId='';
  var waiting=null,writing=false,generation=0,ioTimer=null,pulseTimer=null,pulses=0;
  var vibrationMode='short';
  function stopPulses(){if(pulseTimer!==null)cancel(pulseTimer);pulseTimer=null;pulses=0;}
  function pulse(){
    pulseTimer=null;
    if(!alive||!enabled||!visible){pulses=0;return;}
    if(!pulses)return;
    pulses--;
    try{vibrator.vibrate({mode:vibrationMode});}catch(error){failed=true;pulses=0;return;}
    pulseTimer=schedule(pulse,vibrationMode==='long'?2000:600);
  }
  function ioFailure(id){if(!alive||id!==generation)return;generation++;failed=true;writing=false;ioTimer=null;stopPulses();}
  function flush(){
    if(!alive||!ready||failed||writing||!enabled||!visible||!waiting)return;
    var next=waiting;
    if(next.id===lastId||now()<next.at||now()-next.at>=60000){waiting=null;return;}
    writing=true;var id=++generation;
    ioTimer=schedule(function(){ioFailure(id);},5000);
    storage.set({key:'buddy-completion',value:next.id,success:function(){
      if(!alive||id!==generation)return;
      cancel(ioTimer);ioTimer=null;lastId=next.id;writing=false;
      if(waiting&&waiting.id===next.id)waiting=null;
      if(enabled&&visible&&now()>=next.at&&now()-next.at<60000){
        pulses=Math.min(128,pulses+next.count);
        if(pulseTimer===null)pulse();
      }
      flush();
    },fail:function(){if(!alive||id!==generation)return;if(ioTimer!==null)cancel(ioTimer);ioFailure(id);}});
  }
  return {
    load:function(){
      var id=++generation;
      ioTimer=schedule(function(){ioFailure(id);},5000);
      storage.get({key:'buddy-completion',default:'',success:function(raw){
        if(!alive||id!==generation)return;
        cancel(ioTimer);ioTimer=null;
        if(typeof raw!=='string'||(raw&&!/^[a-zA-Z0-9-]{1,64}$/.test(raw))){failed=true;return;}
        lastId=raw;ready=true;flush();
      },fail:function(){if(!alive||id!==generation)return;if(ioTimer!==null)cancel(ioTimer);ioFailure(id);}});
    },
    enable:function(value){enabled=value===true;if(!enabled){waiting=null;stopPulses();}else flush();},
    setMode:function(value){vibrationMode=value==='long'?'long':'short';},
    show:function(value){visible=value===true;if(!visible)stopPulses();else flush();},
    apply:function(msg,applied){
      if(!alive||!msg)return;
      if(msg.completionVibration===false){enabled=false;waiting=null;stopPulses();return;}
      if(!msg.completion)return;
      if(!enabled||msg.completionVibration!==true||!applied)return;
      if(msg.completion.id===lastId)return;
      if(!waiting||waiting.id!==msg.completion.id)waiting={id:msg.completion.id,count:msg.completion.count,at:now()};
      flush();
    },
    receipt:function(msg){
      if(!msg.completion)return null;
      return {id:msg.completion.id,status:failed?'error':lastId===msg.completion.id?'accepted':'pending'};
    },
    close:function(){alive=false;generation++;if(ioTimer!==null)cancel(ioTimer);ioTimer=null;stopPulses();waiting=null;},
  };
}
module.exports={createCompletionNotice:createCompletionNotice};
