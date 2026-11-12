function probeDrawing(application) {
  var result={renderer:'native-geometry',queryAvailable:typeof application.canIUse==='function'};
  var queries={div:'div',arc:'progress',percent:'progress.attr.percent',radius:'progress.style.radius',position:'div.style.left',canvas:'canvas'};
  for(var key in queries){result[key]=null;if(result.queryAvailable)try{result[key]=application.canIUse(queries[key])===true;}catch(error){result[key]=null;}}
  return result;
}
// Probe only after layout settles, never from the animation loop. The resolver
// belongs to the page and is released on close, along with every owned timer.
function createBoundsProbe(resolve,schedule,cancel) {
  function copyRect(rect){return {left:rect.left,top:rect.top,width:rect.width,height:rect.height};}
  var closed=false,shown=false,generation=0,timer=null,deadline=null,result=[],targets=[];
  function retire(){generation++;if(timer!==null)cancel(timer);if(deadline!==null)cancel(deadline);timer=null;deadline=null;}
  function start(){
    if(closed||!shown||!targets.length)return;
    var token=generation;
    timer=schedule(function(){
      timer=null;if(closed||!shown||generation!==token)return;
      var pending=targets.length;
      result=targets.map(function(target){return {kind:target.kind,status:'pending',expected:copyRect(typeof target.expected==='function'?target.expected():target.expected)};});
      function finish(index,status,actual){
        if(closed||!shown||generation!==token||result[index].status!=='pending')return;
        result[index].status=status;if(actual)result[index].actual=actual;
        pending--;if(!pending&&deadline!==null){cancel(deadline);deadline=null;}
      }
      deadline=schedule(function(){deadline=null;for(var i=0;i<result.length;i++)finish(i,'timeout');},1000);
      targets.forEach(function(target,index){
        try{
          var element=resolve(target.id);
          if(!element||typeof element.getBoundingClientRect!=='function'){finish(index,'unavailable');return;}
          element.getBoundingClientRect({success:function(value){
            var actual={},keys=['left','top','width','height'];
            for(var i=0;i<keys.length;i++){
              var key=keys[i],n=value&&value[key];
              if(typeof n!=='number'||!isFinite(n)||Math.abs(n)>2000||(i>1&&n<0)){finish(index,'invalid');return;}
              actual[key]=n;
            }
            finish(index,'ok',actual);
          },fail:function(){finish(index,'error');}});
        }catch(error){finish(index,'error');}
      });
    },200);
  }
  return {
    show:function(value){if(closed)return;retire();shown=value===true;if(shown)start();},
    update:function(value){if(closed)return;retire();targets=value.slice(0,3);result=[];start();},
    snapshot:function(){return result.map(function(row){var copy={kind:row.kind,status:row.status,expected:copyRect(row.expected)};if(row.actual)copy.actual=copyRect(row.actual);return copy;});},
    close:function(){if(closed)return;retire();closed=true;shown=false;targets=[];result=[];resolve=null;}
  };
}
module.exports={probeDrawing:probeDrawing,createBoundsProbe:createBoundsProbe};
