// App-owned counters contain no message content or external identifiers.
function createLifecycle(clock) {
  clock=clock||Date.now;
  var next=0, createdAt=0, pages={}, counters={created:0,destroyed:0,shows:0,hides:0,refreshes:0,errors:0};
  function increment(key){counters[key]=Math.min(1000000,counters[key]+1);}
  return {
    create:function(){if(!createdAt)createdAt=clock();next+=1;pages[next]=false;increment('created');return next;},
    show:function(id){if(pages[id]===undefined)return;pages[id]=true;increment('shows');},
    hide:function(id){if(pages[id]===undefined)return;pages[id]=false;increment('hides');},
    refresh:function(id){if(pages[id]!==undefined)increment('refreshes');},
    destroy:function(id){if(pages[id]===undefined)return;delete pages[id];increment('destroyed');},
    error:function(){increment('errors');},
    snapshot:function(){var result={createdAt:createdAt},live=0,visible=0;for(var key in counters)result[key]=counters[key];for(var id in pages){live+=1;if(pages[id])visible+=1;}result.live=live;result.visible=visible;return result;}
  };
}
module.exports={createLifecycle:createLifecycle};
