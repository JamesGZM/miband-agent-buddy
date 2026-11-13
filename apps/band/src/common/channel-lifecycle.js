// Vela owns connection establishment. Keep one ACK, never a delivery queue.
function createChannelLifecycle(channel, now, schedule, cancel) {
  var alive=true, latest=null, serial=0, query=0, deadline=null, replay=false, established=false;
  var evidence={state:'unknown',opens:0,closes:0,errors:0,sendFailures:0,replays:0,readyChecks:0,readySupported:typeof channel.getReadyState==='function'};
  function code(value){return typeof value==='number'&&isFinite(value)&&value%1===0&&value>=0&&value<=65535?value:null;}
  function failure(reason,value){
    if(!evidence.firstReason){evidence.firstReason=reason;evidence.firstAt=now();evidence.firstCode=code(value);}
  }
  function snapshot(){var result={};for(var key in evidence)result[key]=evidence[key];return result;}
  function retireCheck(){query++;cancel(deadline);deadline=null;}
  function check(){
    if(!alive||!evidence.readySupported||deadline!==null)return;
    var token=++query;evidence.readyChecks++;
    deadline=schedule(function(){if(!alive||token!==query)return;deadline=null;query++;if(established)failure('ready_timeout');},1000);
    function finish(){if(!alive||token!==query)return false;cancel(deadline);deadline=null;query++;return true;}
    try{channel.getReadyState({success:function(data){
      if(!finish())return;
      if(data&&data.status===1){evidence.state='open';established=true;}
      else if(data&&data.status===2){evidence.state='closed';if(established)failure('ready_closed',1006);}
    },fail:function(data,value){if(finish()&&established)failure('ready_failed',value);}});}catch(error){if(finish()&&established)failure('ready_failed');}
  }
  function send(ack,success,fail){
    if(!alive)return;
    established=true;
    latest={ack:ack,success:success,fail:fail};
    var token=++serial;
    ack.channelLifecycle=snapshot();
    try{channel.send({data:ack,success:function(){if(!alive||token!==serial)return;if(success)success();},fail:function(data,value){
      if(!alive||token!==serial)return;replay=true;evidence.sendFailures++;failure('send_failed',value);if(fail)fail(null,code(value));
    }});}catch(error){if(alive&&token===serial){replay=true;evidence.sendFailures++;failure('send_failed');if(fail)fail(null,null);}}
  }
  channel.onopen=function(event){
    if(!alive)return;
    var wasOpen=evidence.state==='open';retireCheck();
    established=true;evidence.state='open';evidence.opens++;evidence.openedAt=now();evidence.reconnected=!!(event&&event.isReconnected);
    // Duplicate open callbacks cannot amplify sends; a close/error rearms once.
    if(!wasOpen&&replay&&latest){replay=false;evidence.replays++;send(latest.ack,latest.success,latest.fail);}
    check();
  };
  channel.onclose=function(event){if(!alive)return;serial++;retireCheck();replay=true;evidence.state='closed';evidence.closes++;evidence.closedAt=now();failure('closed',event&&event.code);};
  channel.onerror=function(event){if(!alive)return;serial++;retireCheck();replay=true;evidence.state='unknown';evidence.errors++;failure('error',event&&event.code);};
  check();
  return {send:send,snapshot:snapshot,close:function(){
    if(!alive)return;alive=false;serial++;query++;cancel(deadline);deadline=null;latest=null;
    channel.onopen=null;channel.onclose=null;channel.onerror=null;
  }};
}
module.exports={createChannelLifecycle:createChannelLifecycle};
