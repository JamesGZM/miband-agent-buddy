var protocol = require('../common/generated/protocol');
var display = require('../common/generated/display');
var ui = require('../common/generated/native-ui');
var geometry = require('../common/generated/geometry');
var activityRing = require('../common/generated/activity-ring');
var keepScreenModule = require('../common/keep-screen');
var settingsModule = require('../common/settings');
var completionModule = require('../common/completion-notice');

// Keep observed arrays and their existing items alive across animation ticks.
function patchShapes(target,source) {
  for(var i=0;i<source.length;i++){
    var next=source[i],item=target[i];
    if(!item||item.id!==next.id){
      var found=-1;
      for(var j=i+1;j<target.length;j++)if(target[j].id===next.id){found=j;break;}
      if(found>=0){item=target.splice(found,1)[0];target.splice(i,0,item);}
      else{target.splice(i,0,next);continue;}
    }
    for(var key in next)if(item[key]!==next[key])item[key]=next[key];
  }
  if(target.length>source.length)target.splice(source.length,target.length-source.length);
}
function createPageController(deps) {
  var brightness=deps.brightness, interconnect=deps.interconnect, application=deps.application, storage=deps.storage;
  var clock=deps.now || Date.now, schedule=deps.schedule || setTimeout, cancel=deps.cancel || clearTimeout;
  var keepScreen=deps.keepScreen || keepScreenModule;
  var lifecycle=deps.lifecycle, pageId=null, drawing=deps.render||geometry.createRenderer(), renderFrames=0,lastGlyph=null,lastResourceKey=null;
  var alive=false;
  var settingsController=null, buddyTheme='chatgpt', keepWanted=false, powerSaving=false,buddyFps=10;
  var keepController = null;
  var channel = null, timer = null, exitTimer = null, lastMessage = null;
  var receivedAt = 0, visible = false, lastTapAt = -1000;
  var activeMode = 'idle', modeAt = 0, exiting = false, metricsStamp = '';
  var rings = null, snapMetrics = true, lastRingPaint = 0;
  var ringMessage=null,ringTheme=null,ringColors=null;
  var notifier=null,screenBrightness=null,brightnessWake=null;
  var internal={received:0,keepResult:'pending',errorText:'',gestureCount:0,cpuProgress:0,memoryProgress:0,diskProgress:0};
  return {
    private: {
      pageIndex: 0,
      drawRects:[],drawArcs:[],drawCapsules:[],glyphRects:[],glyphColor:"#000000",glyphLeft:0,
      cpuText: '—', memoryText: '—', diskText: '—', memoryDetail: '—', diskDetail: '—'
    },
    diagnostics:function(){var copy={frames:renderFrames};for(var key in internal)copy[key]=internal[key];return copy;},
    onInit() {
      var self = this;
      if(alive)return;
      alive=true;
      if(lifecycle)pageId=lifecycle.create();
      keepController=keepScreen.createKeepScreen(function(options){brightness.setKeepScreenOn(options);},clock,schedule,cancel,function(state,code){if(!alive)return;internal.keepResult=state;if(state==='error')internal.errorText='KEEP error '+code;});
      buddyTheme='chatgpt';keepWanted=false;powerSaving=false;
      if(deps.vibrator&&typeof deps.vibrator.vibrate==='function'){
        notifier=completionModule.createCompletionNotice(storage,deps.vibrator,clock,schedule,cancel);notifier.load();
      }
      if(typeof brightness.getValue==='function'&&typeof brightness.setValue==='function'&&typeof brightness.getMode==='function'&&typeof brightness.setMode==='function')screenBrightness=require('../common/brightness').createBrightness(brightness,function(value){settingsController.rememberBrightness(value);},schedule,cancel);
      settingsController=settingsModule.createSettings(storage,function(value){buddyTheme=value.buddyTheme;powerSaving=value.powerSaving===true;buddyFps=value.buddyFps;if(screenBrightness)screenBrightness.configure(value.bandBrightness,value.powerSaving,value.bandAutoBrightness);var changed=keepWanted!==value.keepScreen;keepWanted=value.keepScreen;if(visible&&changed){if(keepWanted)keepController.show();else keepController.hide();}if(notifier){notifier.setMode(value.completionVibrationMode);notifier.enable(value.completionVibration);if(lastMessage)notifier.apply(lastMessage,settingsController.snapshot(lastMessage).settingsApplied);}self.tick();},schedule,cancel);
      settingsController.load();
      lastMessage=null; receivedAt=0; activeMode='idle'; modeAt=clock(); exiting=false; metricsStamp='';
      this.pageIndex=0;lastTapAt=-1000;
      rings={cpu:ui.createRingTransition(),memory:ui.createRingTransition(),disk:ui.createRingTransition()};snapMetrics=true;
      try {
        channel=interconnect.instance();
        channel.onmessage=function(event) {
          if(!alive || exiting)return;
          var msg;
          try { msg=protocol.acceptMessage(event.data,lastMessage); } catch(error) { internal.errorText='Invalid message'; return; }
          if(!msg)return;
          settingsController.apply(msg);
          if(msg.page!=null&&msg.page!==self.pageIndex){self.pageIndex=msg.page;snapMetrics=true;metricsStamp='';}
          if(visible&&msg.wakeId)keepController.hold(msg.wakeId,msg.wakeHoldMs);
          if(visible&&msg.activityHoldMs!=null)keepController.activity(msg.activityHoldMs,msg.idleHoldMs);
          lastMessage=msg; receivedAt=clock(); internal.received+=1;
          if((msg.mode||'idle')!==activeMode){activeMode=msg.mode||'idle';modeAt=receivedAt;}
          self.tick();
          var ack=protocol.makeAck(msg,internal.keepResult,internal.received);
          ack.appVersion=deps.appVersion||'0.5.5';ack.capabilities={maxWakeHoldMs:1800000,themes:['chatgpt','claude','deepseek'],page:true,activityHold:true,activityRing:true,powerSaving:true,buddyFps:true};ack.wakeDisplay=keepController.display();var settingsAck=settingsController.snapshot(msg);for(var settingKey in settingsAck)ack[settingKey]=settingsAck[settingKey];ack.keepDiagnostics=keepController.snapshot();ack.page=self.pageIndex;ack.memory=!!msg.memory;ack.disk=!!msg.disk;
          if(screenBrightness){if(msg.wakeId&&msg.wakeId!==brightnessWake&&settingsAck.settingsApplied){brightnessWake=msg.wakeId;screenBrightness.configure(settingsAck.bandBrightness,settingsAck.powerSaving,settingsAck.bandAutoBrightness);}ack.capabilities.bandBrightness=true;ack.capabilities.bandAutoBrightness=true;ack.brightness=screenBrightness.snapshot();}
          if(notifier){ack.capabilities.completionVibration=true;ack.capabilities.completionVibrationModes=['short','long'];notifier.setMode(settingsAck.completionVibrationMode);notifier.enable(msg.completionVibration===false?false:settingsAck.completionVibration);notifier.apply(msg,settingsAck.settingsApplied);var receipt=notifier.receipt(msg);if(receipt)ack.completion=receipt;}
          ack.character=buddyTheme==='claude'?'claude':'codex';ack.mode=activeMode;ack.gestures=internal.gestureCount;ack.exitReady=true;
          if(lifecycle)ack.pageLifecycle=lifecycle.snapshot();
          if(deps.drawingCapabilities)ack.drawing={capabilities:deps.drawingCapabilities,frames:renderFrames,effectiveFps:ui.effectiveFps(powerSaving,buddyFps),elapsedMs:Math.max(0,clock()-modeAt)};
          if(msg.command==='exit')exitTimer=schedule(function(){self.exitApp();},500);
          channel.send({data:ack,success:function(){if(!alive)return;internal.errorText='';if(msg.command==='exit')self.exitApp();},fail:function(data,code){if(!alive)return;internal.errorText='ACK error '+code;if(msg.command==='exit')self.exitApp();}});
        };
        channel.onerror=function(event){if(!alive)return;internal.errorText='LINK error '+event.code;};
      }catch(error){internal.errorText='Interconnect unavailable';}
    },
    onShow() {
      if(!alive||exiting)return;
      if(lifecycle)lifecycle.show(pageId);
      visible=true;if(screenBrightness)screenBrightness.show(true);lastResourceKey=null;snapMetrics=true;metricsStamp='';if(keepController&&keepWanted)keepController.show();this.tick();
      if(notifier)notifier.show(true);
    },
    onRefresh(){if(!alive||exiting)return;if(lifecycle)lifecycle.refresh(pageId);this.tick();},
    onHide(){if(lifecycle)lifecycle.hide(pageId);this.releaseKeep();},
    onBackPress(){this.releaseKeep();return false;},
    onDestroy(){if(!alive)return;alive=false;if(lifecycle)lifecycle.destroy(pageId);this.releaseKeep();if(settingsController)settingsController.close();if(notifier)notifier.close();if(screenBrightness)screenBrightness.close();if(channel){channel.onmessage=null;channel.onerror=null;}channel=null;},
    exitApp(){
      if(exiting)return;
      exiting=true;this.releaseKeep();
      try{application.terminate();}catch(error){exiting=false;internal.errorText='Exit unavailable';}
    },
    togglePage(){
      var now=clock();
      if(!visible||exiting||(now>=lastTapAt&&now-lastTapAt<250))return;
      lastTapAt=now;
      this.act(this.pageIndex===0?'monitor':'pet');
    },
    act(action){
      if(!action||exiting)return;
      internal.gestureCount+=1;
      if(action==='exit'){this.exitApp();return;}
      var nextPage=action==='monitor'?1:0;
      if(nextPage!==this.pageIndex){snapMetrics=true;metricsStamp='';}
      this.pageIndex=nextPage;this.tick();
    },
    releaseKeep(){
      visible=false;
      if(screenBrightness)screenBrightness.show(false);
      if(notifier)notifier.show(false);
      if(timer)cancel(timer);timer=null;
      if(exitTimer)cancel(exitTimer);exitTimer=null;
      if(keepController)keepController.hide();
    },
    tick(){
      if(timer)cancel(timer);timer=null;
      if(!visible||exiting)return;
      var now=clock(),stale=!receivedAt||now-receivedAt>=10000||now<receivedAt;
      var cadence=ui.bandFrameDelay(powerSaving,buddyFps),delay=cadence, name;
      var paint=true,values={};
      if(this.pageIndex===1){
        var forcePaint=snapMetrics;
        var stamp=(lastMessage?lastMessage.session+':'+lastMessage.seq:'none')+':'+stale;
        if(stamp!==metricsStamp){
          metricsStamp=stamp;
          var fields=display.fields(lastMessage,stale);
          for(var key in fields)if(key.indexOf('Width')<0&&this[key]!==fields[key])this[key]=fields[key];
          for(name in rings){
            // Unknown data clears immediately instead of animating toward a fake zero.
            var missing=fields[name+'Text']==='—';
            ui.retargetRing(rings[name],fields[name+'Width'],now,snapMetrics||missing);
          }
          snapMetrics=false;
        }
        var moving=false;paint=forcePaint||now-lastRingPaint>=cadence||now<lastRingPaint;
        for(name in rings){
          var value=Math.round(ui.ringValue(rings[name],now));
          if((paint||stale)&&internal[name+'Progress']!==value)internal[name+'Progress']=value;
          if(!paint&&!stale&&internal[name+'Progress']!==value)moving=true;
          values[name]=internal[name+'Progress'];
          if(ui.ringMoving(rings[name],now))moving=true;
        }
        if(paint)lastRingPaint=now;
        // Static resource pages only wake for incoming data or the stale deadline.
        delay=moving?Math.max(1,cadence-(now-lastRingPaint)):(!stale?Math.max(1,10000-(now-receivedAt)):0);
      }
      var resourceKey=this.pageIndex===1?values.disk+':'+values.memory+':'+values.cpu:null;
      if((paint||stale)&&(this.pageIndex!==1||resourceKey!==lastResourceKey)){
        lastResourceKey=resourceKey;
        var mode=stale&&lastMessage?'offline':activeMode;
        if(mode==='complete'&&now-modeAt>=4000)mode='idle';
        if(ringMessage!==lastMessage||ringTheme!==buddyTheme){
          ringMessage=lastMessage;ringTheme=buddyTheme;
          ringColors=lastMessage&&lastMessage.activityRing||activityRing.colors(buddyTheme,activeMode,lastMessage&&lastMessage.sessionCounts);
        }
        var frame=geometry.portrait(drawing({native:true,page:this.pageIndex,message:lastMessage,values:values,colors:mode===activeMode?ringColors:null,
          stale:stale,mode:mode,theme:buddyTheme,seconds:Math.max(0,(now-modeAt)/1000),powerSaving:powerSaving}));
        patchShapes(this.drawRects,frame.rects);patchShapes(this.drawArcs,frame.arcs);patchShapes(this.drawCapsules,frame.capsules||[]);
        if(lastGlyph!==frame.glyphs){lastGlyph=frame.glyphs;this.glyphRects=frame.glyphs||[];}
        if(this.glyphColor!==frame.glyphColor)this.glyphColor=frame.glyphColor;
        if(this.glyphLeft!==frame.glyphLeft)this.glyphLeft=frame.glyphLeft;
        renderFrames=Math.min(1000000,renderFrames+1);
      }
      if(delay){
        // Rendering is part of the frame budget, including multi-color rings.
        delay=Math.max(1,delay-Math.max(0,clock()-now));
        var self=this;timer=schedule(function(){timer=null;if(alive&&visible&&!exiting)self.tick();},delay);
      }
    }
  };

}
module.exports={createPageController:createPageController};
