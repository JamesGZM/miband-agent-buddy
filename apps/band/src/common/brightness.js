// One bounded native request at a time; animation never touches screen brightness.
function createBrightness(api, remembered, schedule, cancel) {
  var visible=false,closed=false,busy=false,configured=false,generation=0,timer=null;
  var selected=null,saving=false,applied=null,status='pending';
  function valid(value){return typeof value==='number'&&isFinite(value)&&value%1===0&&value>=0&&value<=255;}
  function stop(){generation++;busy=false;if(timer!==null)cancel(timer);timer=null;}
  function flush(){
    if(closed||!visible||busy||!configured)return;
    var target=saving?25:selected;
    if(selected!==null&&applied===target){status='applied';return;}
    var reading=selected===null,id=++generation;busy=true;status='pending';
    function done(ok,value){
      if(id!==generation||closed)return;
      cancel(timer);timer=null;busy=false;
      if(!ok||(reading&&!valid(value))){status='error';return;}
      status='applied';
      if(reading){applied=value;if(selected===null){selected=value;remembered(value);}}
      else applied=target;
      flush();
    }
    timer=schedule(function(){if(id===generation){generation++;busy=false;timer=null;status='error';}},3000);
    try{
      if(reading)api.getValue({success:function(data){done(true,data&&data.value);},fail:function(){done(false);}});
      else api.setValue({value:target,success:function(){done(true);},fail:function(){done(false);}});
    }catch(error){done(false);}
  }
  return {
    configure:function(value,powerSaving){configured=true;selected=valid(value)?value:null;saving=powerSaving===true;flush();},
    show:function(value){visible=value===true;if(!visible){stop();applied=null;}else flush();},
    snapshot:function(){return {value:applied,target:saving?25:selected,status:status};},
    close:function(){closed=true;visible=false;stop();}
  };
}
module.exports={createBrightness:createBrightness};
