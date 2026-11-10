var protocol = require('../common/generated/protocol');
var display = require('../common/generated/display');
var ui = require('../common/generated/native-ui');
var keepScreenModule = require('../common/keep-screen');
var settingsModule = require('../common/settings');

function createPageController(deps) {
  var brightness=deps.brightness, interconnect=deps.interconnect, application=deps.application, storage=deps.storage;
  var clock=deps.now || Date.now, schedule=deps.schedule || setTimeout, cancel=deps.cancel || clearTimeout;
  var keepScreen=deps.keepScreen || keepScreenModule;
  var alive=false;
  var settingsController=null, buddyTheme='chatgpt', keepWanted=false;
  var keepController = null;
  var channel = null, timer = null, exitTimer = null, lastMessage = null;
  var receivedAt = 0, visible = false, lastTapAt = -1000;
  var activeMode = 'idle', modeAt = 0, exiting = false, metricsStamp = '';
  var rings = null, snapMetrics = true, lastRingPaint = 0;
  return {
    private: {
      pageIndex: 0, received: 0, keepResult: 'pending', errorText: '', gestureCount: 0,
      ringSource: '/common/capsule/ring-idle-b0.png', ringOpacity: 1,
      loadingSource: '/common/capsule/blank.png', loadingOpacity: 1,
      symbolSource: '/common/capsule/symbols.png', symbolLeft: 0,
      diskRing: '/common/capsule/disk-000.png', memoryRing: '/common/capsule/memory-000.png', cpuRing: '/common/capsule/cpu-000.png',
      cpuText: '—', memoryText: '—', diskText: '—', memoryDetail: '—', diskDetail: '—', cpuWidth: 0, memoryWidth: 0, diskWidth: 0
    },
    onInit() {
      var self = this;
      alive=true;
      keepController=keepScreen.createKeepScreen(function(options){brightness.setKeepScreenOn(options);},clock,schedule,cancel,function(state,code){if(!alive)return;self.keepResult=state;if(state==='error')self.errorText='KEEP error '+code;});
      buddyTheme='chatgpt';keepWanted=false;
      settingsController=settingsModule.createSettings(storage,function(value){buddyTheme=value.buddyTheme;var changed=keepWanted!==value.keepScreen;keepWanted=value.keepScreen;if(visible&&changed){if(keepWanted)keepController.show();else keepController.hide();}self.tick();},schedule,cancel);
      settingsController.load();
      lastMessage=null; receivedAt=0; activeMode='idle'; modeAt=clock(); exiting=false; metricsStamp='';
      this.pageIndex=0;lastTapAt=-1000;
      rings={cpu:ui.createRingTransition(),memory:ui.createRingTransition(),disk:ui.createRingTransition()};snapMetrics=true;
      try {
        channel=interconnect.instance();
        channel.onmessage=function(event) {
          if(!alive || exiting)return;
          var msg;
          try { msg=protocol.acceptMessage(event.data,lastMessage); } catch(error) { self.errorText='Invalid message'; return; }
          if(!msg)return;
          settingsController.apply(msg);
          if(msg.page!=null&&msg.page!==self.pageIndex){self.pageIndex=msg.page;snapMetrics=true;metricsStamp='';}
          if(visible&&msg.wakeId)keepController.hold(msg.wakeId,msg.wakeHoldMs);
          lastMessage=msg; receivedAt=clock(); self.received+=1;
          if((msg.mode||'idle')!==activeMode){activeMode=msg.mode||'idle';modeAt=receivedAt;}
          self.tick();
          var ack=protocol.makeAck(msg,self.keepResult,self.received);
          ack.appVersion='0.5.3';ack.capabilities={maxWakeHoldMs:1800000,themes:['chatgpt','claude','deepseek'],page:true};ack.wakeDisplay=keepController.display();var settingsAck=settingsController.snapshot(msg);for(var settingKey in settingsAck)ack[settingKey]=settingsAck[settingKey];ack.keepDiagnostics=keepController.snapshot();ack.page=self.pageIndex;ack.memory=!!msg.memory;ack.disk=!!msg.disk;
          ack.character=buddyTheme==='claude'?'claude':'codex';ack.mode=activeMode;ack.gestures=self.gestureCount;ack.exitReady=true;
          if(msg.command==='exit')exitTimer=schedule(function(){self.exitApp();},500);
          channel.send({data:ack,success:function(){if(!alive)return;self.errorText='';if(msg.command==='exit')self.exitApp();},fail:function(data,code){if(!alive)return;self.errorText='ACK error '+code;if(msg.command==='exit')self.exitApp();}});
        };
        channel.onerror=function(event){if(!alive)return;self.errorText='LINK error '+event.code;};
      }catch(error){this.errorText='Interconnect unavailable';}
    },
    onShow() {
      visible=true;snapMetrics=true;metricsStamp='';if(keepController&&keepWanted)keepController.show();this.tick();
    },
    onHide(){this.releaseKeep();},
    onBackPress(){this.releaseKeep();return false;},
    onDestroy(){alive=false;this.releaseKeep();if(settingsController)settingsController.close();if(channel){channel.onmessage=null;channel.onerror=null;}channel=null;},
    exitApp(){
      if(exiting)return;
      exiting=true;this.releaseKeep();
      try{application.terminate();}catch(error){exiting=false;this.errorText='Exit unavailable';}
    },
    togglePage(){
      var now=clock();
      if(!visible||exiting||(now>=lastTapAt&&now-lastTapAt<250))return;
      lastTapAt=now;
      this.act(this.pageIndex===0?'monitor':'pet');
    },
    act(action){
      if(!action||exiting)return;
      this.gestureCount+=1;
      if(action==='exit'){this.exitApp();return;}
      var nextPage=action==='monitor'?1:0;
      if(nextPage!==this.pageIndex){snapMetrics=true;metricsStamp='';}
      this.pageIndex=nextPage;this.tick();
    },
    releaseKeep(){
      visible=false;
      if(timer)cancel(timer);timer=null;
      if(exitTimer)cancel(exitTimer);exitTimer=null;
      if(keepController)keepController.hide();
    },
    tick(){
      if(timer)cancel(timer);timer=null;
      if(!visible||exiting)return;
      var now=clock(),stale=!receivedAt||now-receivedAt>=10000||now<receivedAt;
      var delay=200, name;
      if(this.pageIndex===1){
        var forcePaint=snapMetrics;
        var stamp=(lastMessage?lastMessage.session+':'+lastMessage.seq:'none')+':'+stale;
        if(stamp!==metricsStamp){
          metricsStamp=stamp;
          var fields=display.fields(lastMessage,stale);
          for(var key in fields)if(this[key]!==fields[key])this[key]=fields[key];
          for(name in rings){
            // Unknown data clears immediately instead of animating toward a fake zero.
            var missing=fields[name+'Text']==='—';
            ui.retargetRing(rings[name],fields[name+'Width'],now,snapMetrics||missing);
          }
          snapMetrics=false;
        }
        var moving=false, paint=forcePaint||now-lastRingPaint>=80||now<lastRingPaint;
        for(name in rings){
          var src=ui.ringSource(name,ui.ringValue(rings[name],now));
          if((paint||stale)&&this[name+'Ring']!==src)this[name+'Ring']=src;
          if(!paint&&!stale&&this[name+'Ring']!==src)moving=true;
          if(ui.ringMoving(rings[name],now))moving=true;
        }
        if(paint)lastRingPaint=now;
        // Static resource pages only wake for incoming data or the stale deadline.
        delay=moving?Math.max(1,80-(now-lastRingPaint)):(!stale?Math.max(1,10000-(now-receivedAt)):0);
      }else{
        var mode=stale&&lastMessage?'offline':activeMode;
        if(mode==='complete'&&now-modeAt>=4000)mode='idle';
        var motion=ui.motion(mode,Math.max(0,(now-modeAt)/1000),buddyTheme);
        for(name in motion)if(this[name]!==motion[name])this[name]=motion[name];
      }
      if(delay){var self=this;timer=schedule(function(){timer=null;if(alive&&visible&&!exiting)self.tick();},delay);}
    }
  };

}
module.exports={createPageController:createPageController};
