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
// Submit a complete pose through one style binding, rather than invalidating
// native layout once for each intermediate coordinate and angle.
function shapeStyle(shape,kind) {
  var style='left:'+shape.left+'px;top:'+shape.top+'px;';
  if(kind==='arcs')return style+'width:'+shape.size+'px;height:'+shape.size+'px;center-x:'+shape.center+'px;center-y:'+shape.center+'px;radius:'+shape.radius+'px;start-angle:'+shape.start+'deg;total-angle:'+shape.total+'deg;stroke-width:'+shape.width+'px;color:'+shape.color+';layer-color:'+(shape.layerColor||shape.color)+';';
  style+='width:'+shape.width+'px;height:'+shape.height+'px;border-radius:'+shape.radius+'px;';
  return kind==='capsules'?style+'border-width:'+shape.stroke+'px;border-color:'+shape.color+';':style+'background-color:'+shape.color+';';
}
function windowBinding(shape,id) {
  return {id:id||shape.id,visible:shape.visible!==false,
    style:'left:'+shape.left+'px;top:'+shape.top+'px;width:'+shape.width+'px;height:'+shape.height+'px;',
    borderStyle:'left:'+(4-shape.left)+'px;top:'+(4-shape.top)+'px;border-color:'+shape.color+';'};
}
function createPageController(deps) {
  var animatePet=deps.animatePet!==false;
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
  var baseStyles={},baseSources={},baseGeneration=0,glyphBounds={left:0,top:0,width:1,height:1};
  var boundsProbe=deps.boundsProbe||null,baseTargets={},movingTargets={},boundsKey='';
  var lastBorderBase=null,borderGeneration=0;
  function movingProbe(kind){
    return movingTargets[kind]?{id:movingTargets[kind].id,kind:kind,expected:function(){return movingTargets[kind].expected;}}:null;
  }
  function bindFrame(page,frame,pet) {
    var border=frame.border;
    if(border){
      if(lastBorderBase!==border.base){
        lastBorderBase=border.base;borderGeneration++;
        patchShapes(page.borderBase,border.base.map(function(shape){return windowBinding(shape,'border:'+borderGeneration+':'+shape.id);}));
      }
      patchShapes(page.borderBodies,border.bodies.map(function(shape){return windowBinding(shape);}));
      patchShapes(page.borderTips,border.tips.map(function(shape){return windowBinding(shape);}));
      if(page.breathColor!==border.breathColor)page.breathColor=border.breathColor;
    }else if(lastBorderBase){
      lastBorderBase=null;patchShapes(page.borderBase,[]);patchShapes(page.borderBodies,[]);patchShapes(page.borderTips,[]);
    }
    var kinds=['rects','arcs','capsules'],changedAny=false;
    for(var k=0;k<kinds.length;k++){
      var kind=kinds[k],suffix=kind.charAt(0).toUpperCase()+kind.slice(1),source=frame[kind]||[],base=[],moving=[],tips=[];
      for(var i=0;i<source.length;i++){
        var shape=source[i];
        if(pet&&String(shape.id).indexOf('highlight:')!==0)base.push(shape);
        else{
          var elementId='buddy-live-'+kind+'-'+String(shape.id).replace(/:/g,'-');
          var group=shape.layer===2?tips:moving;
          group.push({id:shape.id,elementId:elementId,style:shapeStyle(shape,kind),visible:shape.visible!==false,percent:shape.percent==null?100:shape.percent});
          if(group===moving&&moving.length===1)movingTargets[kind]={id:elementId,expected:{left:shape.left,top:shape.top,width:kind==='arcs'?shape.size:shape.width,height:kind==='arcs'?shape.size:shape.height}};
        }
      }
      if(!moving.length)movingTargets[kind]=null;
      patchShapes(page['draw'+suffix],moving);
      if(kind!=='capsules')patchShapes(page['tip'+suffix],tips);
      var refs=baseSources[kind],same=!!refs&&refs.length===base.length;
      if(same)for(i=0;i<base.length;i++)if(refs[i]!==base[i]){same=false;break;}
      if(same)continue;
      baseSources[kind]=base;
      base=base.map(function(shape){return {key:shape.id,style:shapeStyle(shape,kind),expected:{left:shape.left,top:shape.top,width:kind==='arcs'?shape.size:shape.width,height:kind==='arcs'?shape.size:shape.height}};});
      var old=baseStyles[kind],changed=!old||old.length!==base.length;
      if(!changed)for(i=0;i<base.length;i++)if(old[i].key!==base[i].key||old[i].style!==base[i].style){changed=true;break;}
      if(changed){
        baseStyles[kind]=base;baseGeneration++;changedAny=true;
        var items=[];
        for(i=0;i<base.length;i++)items.push({id:baseGeneration+':'+base[i].key,elementId:'buddy-base-'+kind+'-'+baseGeneration+'-'+i,style:base[i].style});
        baseTargets[kind]=items.length?{id:items[0].elementId,kind:kind,expected:base[0].expected}:null;
        // Static bindings need a new native node only when the palette changes.
        var target=page['base'+suffix];target.splice.apply(target,[0,target.length].concat(items));
      }
    }
    if(boundsProbe){
      var targets=[];
      if(pet){
        if(border)targets.push({id:'buddy-border-breath',kind:'capsules',expected:{left:4,top:4,width:184,height:482}});
        var rectTarget=baseTargets.rects||movingProbe('rects'),arcTarget=baseTargets.arcs||movingProbe('arcs');
        if(rectTarget)targets.push(rectTarget);
        if(arcTarget)targets.push(arcTarget);
        if(baseTargets.capsules)targets.push(baseTargets.capsules);
        if(targets.length<3)targets.unshift({id:'buddy-stage',kind:'stage',expected:{left:0,top:0,width:192,height:490}});
      }
      var key=targets.map(function(target){return target.id;}).join('|');
      if(changedAny||key!==boundsKey){boundsKey=key;boundsProbe.update(targets);}
    }
  }
  var notifier=null,screenBrightness=null,brightnessWake=null;
  var internal={received:0,keepResult:'pending',errorText:'',gestureCount:0,cpuProgress:0,memoryProgress:0,diskProgress:0};
  return {
    private: {
      pageIndex: 0,
      borderBase:[],borderBodies:[],borderTips:[],breathColor:'rgba(0,0,0,0)',
      drawRects:[],drawArcs:[],drawCapsules:[],tipRects:[],tipArcs:[],baseRects:[],baseArcs:[],baseCapsules:[],glyphRects:[],glyphColor:"#000000",glyphStyle:"left:0px;top:0px;width:1px;height:1px;",
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
          ack.appVersion=deps.appVersion||'0.5.5';ack.capabilities={maxWakeHoldMs:1800000,maxActivityHoldMs:protocol.MAX_ACTIVITY_HOLD_MS,themes:['chatgpt','claude','deepseek'],page:true,activityHold:true,activityRing:true,powerSaving:true,buddyFps:true};ack.wakeDisplay=keepController.display();var settingsAck=settingsController.snapshot(msg);for(var settingKey in settingsAck)ack[settingKey]=settingsAck[settingKey];ack.keepDiagnostics=keepController.snapshot();ack.page=self.pageIndex;ack.memory=!!msg.memory;ack.disk=!!msg.disk;
          if(screenBrightness){if(msg.wakeId&&msg.wakeId!==brightnessWake&&settingsAck.settingsApplied){brightnessWake=msg.wakeId;screenBrightness.configure(settingsAck.bandBrightness,settingsAck.powerSaving,settingsAck.bandAutoBrightness);}ack.capabilities.bandBrightness=true;ack.capabilities.bandAutoBrightness=true;ack.brightness=screenBrightness.snapshot();}
          if(notifier){ack.capabilities.completionVibration=true;ack.capabilities.completionVibrationModes=['short','long'];notifier.setMode(settingsAck.completionVibrationMode);notifier.enable(msg.completionVibration===false?false:settingsAck.completionVibration);notifier.apply(msg,settingsAck.settingsApplied);var receipt=notifier.receipt(msg);if(receipt)ack.completion=receipt;}
          ack.character=buddyTheme==='claude'?'claude':'codex';ack.mode=activeMode;ack.gestures=internal.gestureCount;ack.exitReady=true;
          if(lifecycle)ack.pageLifecycle=lifecycle.snapshot();
          if(deps.drawingCapabilities){ack.drawing={capabilities:deps.drawingCapabilities,frames:renderFrames,effectiveFps:ui.effectiveFps(powerSaving,buddyFps),animationEnabled:animatePet,elapsedMs:Math.max(0,clock()-modeAt)};if(boundsProbe)ack.drawing.bounds=boundsProbe.snapshot();}
          if(msg.command==='exit')exitTimer=schedule(function(){self.exitApp();},500);
          channel.send({data:ack,success:function(){if(!alive)return;internal.errorText='';if(msg.command==='exit')self.exitApp();},fail:function(data,code){if(!alive)return;internal.errorText='ACK error '+code;if(msg.command==='exit')self.exitApp();}});
        };
        channel.onerror=function(event){if(!alive)return;internal.errorText='LINK error '+event.code;};
      }catch(error){internal.errorText='Interconnect unavailable';}
    },
    onShow() {
      if(!alive||exiting)return;
      if(lifecycle)lifecycle.show(pageId);
      if(boundsProbe)boundsProbe.show(true);
      visible=true;if(screenBrightness)screenBrightness.show(true);lastResourceKey=null;snapMetrics=true;metricsStamp='';if(keepController&&keepWanted)keepController.show();this.tick();
      if(notifier)notifier.show(true);
    },
    onRefresh(){if(!alive||exiting)return;if(lifecycle)lifecycle.refresh(pageId);this.tick();},
    onHide(){if(lifecycle)lifecycle.hide(pageId);this.releaseKeep();},
    onBackPress(){this.releaseKeep();return false;},
    onDestroy(){if(!alive)return;alive=false;lastGlyph=null;lastBorderBase=null;baseStyles={};baseSources={};baseTargets={};movingTargets={};boundsKey='';if(boundsProbe)boundsProbe.close();if(lifecycle)lifecycle.destroy(pageId);this.releaseKeep();if(settingsController)settingsController.close();if(notifier)notifier.close();if(screenBrightness)screenBrightness.close();if(channel){channel.onmessage=null;channel.onerror=null;}channel=null;},
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
      if(boundsProbe)boundsProbe.show(false);
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
      if(this.pageIndex===0&&!animatePet){
        delay=stale?0:Math.max(1,10000-(now-receivedAt));
        var completeRemaining=activeMode==='complete'?4000-Math.max(0,now-modeAt):0;
        if(completeRemaining>0)delay=delay?Math.min(delay,completeRemaining):completeRemaining;
      }
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
        var input={native:true,page:this.pageIndex,message:lastMessage,values:values,colors:mode===activeMode?ringColors:null,
          stale:stale,mode:mode,theme:buddyTheme,seconds:!animatePet&&this.pageIndex===0?0:Math.max(0,(now-modeAt)/1000),still:!animatePet&&this.pageIndex===0,powerSaving:powerSaving};
        var frame=drawing.portrait?drawing.portrait(input):geometry.portrait(drawing(input));
        bindFrame(this,frame,this.pageIndex===0);
        if(lastGlyph!==frame.glyphs){
          lastGlyph=frame.glyphs;
          // Keep framework observers out of the shared immutable glyph cache.
          var ownedGlyphs=[],cells=frame.glyphs||[],left=192,top=490,right=0,bottom=0;
          for(var cell=0;cell<cells.length;cell++){
            var source=cells[cell];left=Math.min(left,source.left);top=Math.min(top,source.top);
            right=Math.max(right,source.left+source.width);bottom=Math.max(bottom,source.top+source.height);
          }
          glyphBounds=cells.length?{left:left,top:top,width:right-left,height:bottom-top}:{left:0,top:0,width:1,height:1};
          for(cell=0;cell<cells.length;cell++){
            source=cells[cell];ownedGlyphs.push({id:source.id,left:source.left-glyphBounds.left,top:source.top-glyphBounds.top,width:source.width,height:source.height});
          }
          patchShapes(this.glyphRects,ownedGlyphs);
        }
        if(this.glyphColor!==frame.glyphColor)this.glyphColor=frame.glyphColor;
        // Moving a screen-sized transparent stack invalidates the outer ring too.
        var glyphStyle='left:'+glyphBounds.left+'px;top:'+(glyphBounds.top+(frame.glyphLeft||0))+'px;width:'+glyphBounds.width+'px;height:'+glyphBounds.height+'px;';
        if(this.glyphStyle!==glyphStyle)this.glyphStyle=glyphStyle;
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
