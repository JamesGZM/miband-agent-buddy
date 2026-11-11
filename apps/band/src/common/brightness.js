// Native calls are serialized and bounded; a success callback alone is not a readback.
function createBrightness(api, remembered, schedule, cancel) {
  var visible=false,closed=false,busy=false,configured=false,generation=0,timer=null;
  var selected=null,saving=false,automatic=null,applied=null,status='pending',reason=null;
  var mode=null,originalMode=null,baseline=null,baselineRead=false,overridden=false,observed=null,manualApplied=false,readable=false;
  function valid(value){return typeof value==='number'&&isFinite(value)&&value%1===0&&value>=0&&value<=255;}
  function stop(){generation++;busy=false;if(timer!==null)cancel(timer);timer=null;}
  function fail(code){status='error';reason=code;applied=null;}
  function call(method,options,success){
    var id=++generation;busy=true;status='pending';reason=null;
    function finish(ok,data){
      if(id!==generation||closed)return;
      generation++;cancel(timer);timer=null;busy=false;
      if(!ok){fail(method+'_failed');return;}
      success(data);
    }
    timer=schedule(function(){if(id===generation){generation++;busy=false;timer=null;fail(method+'_timeout');}},3000);
    options.success=function(data){finish(true,data);};options.fail=function(){finish(false);};
    try{api[method](options);}catch(error){finish(false);}
  }
  function flush(){
    if(closed||!visible||busy||!configured)return;
    if(mode===null){
      call('getMode',{},function(data){
        if(!data||(data.mode!==0&&data.mode!==1)){fail('invalid_mode');return;}
        mode=data.mode;if(originalMode===null)originalMode=mode;flush();
      });return;
    }
    if(!baselineRead){
      call('getValue',{},function(data){
        if(!data||!valid(data.value)){fail('invalid_value');return;}
        baselineRead=true;baseline=observed=data.value;readable=baseline>0;
        // A zero from an unverified firmware getter must not become a saved default.
        if(selected===null&&mode===0&&baseline>0){selected=baseline;applied=baseline;remembered(baseline);}
        flush();
      });return;
    }
    var controlling=saving||selected!==null||automatic!==null;
    if(!controlling&&!overridden){status='unchanged';applied=null;return;}
    var target=saving?25:(selected===null?baseline:selected);
    var targetMode=saving?0:(automatic===null?originalMode:(automatic?1:0));
    if(mode===1&&targetMode===1){applied=null;status=controlling?'applied':'unchanged';return;}
    if(applied===target&&mode===targetMode){status=controlling?'applied':'unchanged';return;}
    function verifyValue(){
      call('getValue',{},function(data){
        observed=data&&valid(data.value)?data.value:null;
        if(observed!==target){fail('readback_mismatch');return;}
        if(target===0&&!readable){fail('unverified_zero');return;}
        readable=true;applied=target;overridden=controlling;status=controlling?'applied':'unchanged';flush();
      });
    }
    function writeValue(){
      overridden=true;call('setValue',{value:target},function(){verifyValue();});
    }
    if(mode!==targetMode||(targetMode===0&&controlling&&!manualApplied)){
      call('setMode',{mode:targetMode},function(){
        call('getMode',{},function(data){
          if(!data||data.mode!==targetMode){fail('mode_readback_mismatch');return;}
          mode=data.mode;manualApplied=targetMode===0&&controlling;overridden=controlling;
          if(targetMode===1){applied=null;status=controlling?'applied':'unchanged';flush();}
          else if(selected===null){baselineRead=false;flush();}
          else writeValue();
        });
      });
    }else writeValue();
  }
  return {
    configure:function(value,powerSaving,auto){configured=true;selected=valid(value)?value:null;saving=powerSaving===true;automatic=typeof auto==='boolean'?auto:null;flush();},
    show:function(value){var wasVisible=visible;visible=value===true;if(!visible){stop();applied=null;manualApplied=false;}else{if(!wasVisible)mode=null;flush();}},
    snapshot:function(){return {value:applied,target:saving?25:selected,status:status,reason:reason,mode:mode,originalMode:originalMode,observed:observed};},
    close:function(){closed=true;visible=false;stop();}
  };
}
module.exports={createBrightness:createBrightness};
