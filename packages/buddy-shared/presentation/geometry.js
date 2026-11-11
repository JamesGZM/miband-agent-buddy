// The approved 490x192 Buddy layout, expressed as platform-independent geometry.
var ui=require('./native-ui');
var activity=require('./activity-ring');
var grids={
  claude:['00100000000100','00110000001100','00011111111000','11111111111111','01111111111110','00111011011100','00111011011100','00111111111100','01111111111110','11001111110011','00011000011000'],
  deepseek:['000010100000000000','000001000000110011','000000000000011110','000111111100001100','001111111111001100','011111111111111000','110111111111110000','111111111111110000','011111111111100000','001111111111000000','000011111100000000']
};
var terminal=[[118,50],[138,50],[138,60],[150,60],[150,72],[162,72],[162,84],[176,84],[176,104],[162,104],[162,116],[150,116],[150,128],[138,128],[138,140],[118,140],[118,124],[130,124],[130,112],[142,112],[142,100],[154,100],[154,88],[142,88],[142,76],[130,76],[130,64],[118,64]];
var glyphCache={};
function glyph(theme) {
  theme=theme==='claude'||theme==='deepseek'?theme:'chatgpt';
  if(glyphCache[theme])return glyphCache[theme];
  var rects=[],grid=grids[theme],x,y;
  function add(left,top,width,height){rects.push({id:rects.length,left:left,top:top,width:width,height:height});}
  if(grid){
    var left=Math.floor((490-grid[0].length*9)/2),top=Math.floor((192-grid.length*9)/2);
    for(y=0;y<grid.length;y++)for(x=0;x<grid[y].length;){
      if(grid[y].charAt(x)!=='1'){x++;continue;}
      var start=x;while(x<grid[y].length&&grid[y].charAt(x)==='1')x++;
      add(left+start*9,top+y*9,(x-start)*9,9);
    }
  }else{
    // Merge identical scanlines of the original orthogonal terminal polygon.
    for(y=50;y<140;y++){
      var hits=[];
      for(var i=0;i<terminal.length;i++){
        var a=terminal[i],b=terminal[(i+1)%terminal.length];
        if(a[0]===b[0]&&y+.5>=Math.min(a[1],b[1])&&y+.5<Math.max(a[1],b[1]))hits.push(a[0]);
      }
      hits.sort(function(a,b){return a-b;});
      for(x=0;x<hits.length;x+=2){
        var previous=rects[rects.length-1],width=hits[x+1]-hits[x];
        if(previous&&previous.left===hits[x]&&previous.width===width&&previous.top+previous.height===y)previous.height++;
        else add(hits[x],y,width,1);
      }
    }
    add(289,116,92,20);
  }
  glyphCache[theme]=rects;return rects;
}
function shade(color,alpha) {
  var value='#';
  for(var i=1;i<7;i+=2){var byte=Math.round(parseInt(color.substr(i,2),16)*alpha).toString(16);value+=byte.length===1?'0'+byte:byte;}
  return value;
}
function ring(frame,inset,width,color,start,fraction) {
  start=((start||0)%1+1)%1;fraction=Math.max(0,Math.min(1,fraction==null?1:fraction));
  var native=!!frame.capsules;
  if(native){width=Math.round(width);inset=Math.round(inset-width/2)+width/2;}
  var group=frame.capsules?'ring'+(frame.rings++):null;
  if(!fraction)return;
  // A complete capsule needs one native border, not five independent strokes.
  if(frame.capsules&&start===0&&fraction===1){
    var edge=inset-width/2,height=192-2*edge;
    frame.capsules.push({id:group,left:edge,top:edge,width:490-2*edge,height:height,radius:height/2,stroke:width,color:color});return;
  }
  var radius=96-inset,arcLength=Math.PI*radius,total=596+2*arcLength;
  var parts=[{length:149,x:245,y:inset,dx:1},{length:arcLength,cx:394,angle:0},
    {length:298,x:394,y:192-inset,dx:-1},{length:arcLength,cx:96,angle:180},{length:149,x:96,y:inset,dx:1}];
  for(var wrap=0;wrap<2;wrap++){
    var low=Math.max(0,start-wrap)*total,high=Math.min(1,start+fraction-wrap)*total,pos=0;
    if(high<=low)continue;
    for(var i=0;i<parts.length;i++){
      var part=parts[i],lo=Math.max(low,pos),hi=Math.min(high,pos+part.length);
      if(hi>lo){
        if(part.cx!=null){
          // LVGL draws inward from an outer radius; canvas uses a centerline.
          var outerRadius=radius+width/2,center=native?Math.ceil(outerRadius)+1:outerRadius+1;
          frame.arcs.push({id:group?group+':'+i:frame.arcs.length,left:part.cx-center,top:96-center,size:center*2,center:center,radius:native?outerRadius:radius,
            start:part.angle+(lo-pos)/radius*180/Math.PI,total:(hi-lo)/radius*180/Math.PI,width:width,color:color});
        }else{
          var a=part.x+(lo-pos)*part.dx,b=part.x+(hi-pos)*part.dx;
          var left=Math.min(a,b)-width/2,right=Math.max(a,b)+width/2;
          if(native){left=Math.round(left);right=Math.round(right);}
          frame.rects.push({id:group?group+':'+i:frame.rects.length,left:left,top:part.y-width/2,width:Math.max(native?1:0,right-left),height:width,radius:width/2,color:color});
        }
      }
      pos+=part.length;
    }
  }
}
// Each quantized loading pose touches at most one straight and one semicircle.
// Reuse those widgets across junctions instead of replacing them.
function highlight(frame,color,start,fraction,key) {
  if(!frame.capsules){ring(frame,8,7,color,start,fraction);return;}
  var rectAt=frame.rects.length,arcAt=frame.arcs.length;
  ring(frame,8,7,color,start,fraction);
  var rect=frame.rects[rectAt],arc=frame.arcs[arcAt];
  if(rect){
    // Wrapping at the path origin splits the same top straight into two pieces.
    for(var i=rectAt+1;i<frame.rects.length;i++){
      var next=frame.rects[i],left=Math.min(rect.left,next.left);
      rect.width=Math.max(rect.left+rect.width,next.left+next.width)-left;rect.left=left;
    }
    frame.rects.length=rectAt+1;rect.visible=true;
  }else{
    rect={left:245,top:4,width:1,height:7,radius:3.5,color:color,visible:false};frame.rects.push(rect);
  }
  if(arc)arc.visible=true;
  else{arc={left:302,top:4,size:184,center:92,radius:91,start:0,total:1,width:7,color:color,visible:false};frame.arcs.push(arc);}
  rect.id=key;arc.id=key;
}
function petRing(result,palette,color,count,alpha,level,cache) {
  if(!cache){
    ring(result,8,7,'#141D38');
    for(var slot=0;slot<count;slot++)ring(result,8,7,shade(slot?palette[slot]:color,alpha),slot/count,1/count);
    return;
  }
  var i,shape,changed=!cache.palette||cache.palette.length!==palette.length||cache.capsules!==!!result.capsules;
  if(!changed)for(i=0;i<palette.length;i++)if(cache.palette[i]!==palette[i]){changed=true;break;}
  if(changed){
    // One current ring layout and at most33 small color rows, never frame images.
    cache.palette=palette.slice();cache.capsules=!!result.capsules;cache.colors=[];
    var base={rects:[],arcs:[]};
    if(result.capsules){base.capsules=[];base.rings=0;}
    ring(base,8,7,'#141D38');
    for(var tone=0;tone<count;tone++){
      var rectAt=base.rects.length,arcAt=base.arcs.length,capsuleAt=base.capsules?base.capsules.length:0;
      ring(base,8,7,tone?palette[tone]:color,tone/count,1/count);
      for(i=rectAt;i<base.rects.length;i++)base.rects[i].tone=tone;
      for(i=arcAt;i<base.arcs.length;i++)base.arcs[i].tone=tone;
      if(base.capsules)for(i=capsuleAt;i<base.capsules.length;i++)base.capsules[i].tone=tone;
    }
    cache.base=base;
  }
  var colors=cache.colors[level];
  if(!colors){
    colors=[];for(i=0;i<count;i++)colors.push(shade(i?palette[i]:color,alpha));cache.colors[level]=colors;
  }
  // portrait() projects fresh scene objects; keep the cached logical paths intact.
  for(i=0;i<cache.base.rects.length;i++){
    shape=cache.base.rects[i];result.rects.push({id:shape.id,left:shape.left,top:shape.top,width:shape.width,height:shape.height,
      radius:shape.radius,color:shape.tone==null?shape.color:colors[shape.tone]});
  }
  for(i=0;i<cache.base.arcs.length;i++){
    shape=cache.base.arcs[i];result.arcs.push({id:shape.id,left:shape.left,top:shape.top,size:shape.size,center:shape.center,radius:shape.radius,
      start:shape.start,total:shape.total,width:shape.width,color:shape.tone==null?shape.color:colors[shape.tone]});
  }
  if(result.capsules)for(i=0;i<cache.base.capsules.length;i++){
    shape=cache.base.capsules[i];result.capsules.push({id:shape.id,left:shape.left,top:shape.top,width:shape.width,height:shape.height,
      radius:shape.radius,stroke:shape.stroke,color:shape.tone==null?shape.color:colors[shape.tone]});
  }
  if(result.capsules)result.rings=cache.base.rings;
}
// Resource topology stays fixed: only lengths, visibility and arc percentages change.
function nativeResources(result,values) {
  var names=['disk','memory','cpu'],colors=['#647FFF','#A192FF','#78EDFF'];
  for(var lane=0;lane<3;lane++){
    var inset=9+lane*13,width=6,radius=96-inset,arcLength=Math.PI*radius;
    var value=values&&values[names[lane]],fraction=typeof value==='number'&&isFinite(value)?Math.max(0,Math.min(100,value))/100:0;
    var remaining=fraction*(596+2*arcLength),key='resource:'+names[lane],color=colors[lane];
    // An even track width shares the exact centerline with the six-pixel fill.
    ring(result,inset,2,'#192126');
    var parts=[{length:149,x:245,y:inset,dx:1},{length:arcLength,cx:394,angle:0},
      {length:298,x:394,y:192-inset,dx:-1},{length:arcLength,cx:96,angle:180},{length:149,x:96,y:inset,dx:1}];
    var headX=245,headY=inset,headOnLine=true;
    for(var partIndex=0;partIndex<parts.length;partIndex++){
      var part=parts[partIndex],used=Math.max(0,Math.min(part.length,remaining));
      if(part.cx!=null){
        var outer=radius+width/2,center=outer+1;
        result.arcs.push({id:key+':'+partIndex,left:part.cx-center,top:96-center,size:center*2,center:center,radius:outer,
          start:part.angle,total:180,width:width,color:color,layerColor:'rgba(0,0,0,0)',percent:used/part.length*100,visible:used>0});
        if(used>0)headOnLine=false;
      }else{
        var end=part.x+used*part.dx,left=Math.round(Math.min(part.x,end)),right=Math.round(Math.max(part.x,end));
        result.rects.push({id:key+':'+partIndex,left:left,top:part.y-width/2,width:Math.max(1,right-left),height:width,radius:0,color:color,visible:used>0});
        if(used>0){headX=end;headY=part.y;headOnLine=true;}
      }
      remaining-=used;
    }
    result.rects.push({id:key+':start',left:242,top:inset-width/2,width:width,height:width,radius:width/2,color:color,visible:fraction>0});
    result.rects.push({id:key+':head',left:Math.round(headX-width/2),top:headY-width/2,width:width,height:width,radius:width/2,color:color,visible:fraction>0&&headOnLine});
  }
  return result;
}
function frame(state,cache) {
  var result={rects:[],arcs:[]},theme=state.theme==='claude'||state.theme==='deepseek'?state.theme:'chatgpt';
  if(state.native){result.capsules=[];result.rings=0;result.glyphs=null;result.glyphTheme=theme;result.glyphColor='#000000';result.glyphLeft=0;}
  if(state.page===1&&state.native)return nativeResources(result,state.values);
  if(state.page===1){
    var names=['disk','memory','cpu'],colors=['#647FFF','#A192FF','#78EDFF'];
    for(var index=0;index<3;index++){
      var inset=9+index*13,value=state.values&&state.values[names[index]];
      ring(result,inset,2.5,'#192126');
      if(typeof value==='number'&&isFinite(value))ring(result,inset,6,colors[index],0,Math.max(0,Math.min(100,value))/100);
    }
    return result;
  }
  var mode=state.mode||'idle',pose=ui.pose(mode,state.seconds||0),alpha=state.still?1:.32+.65*pose.level/31;
  var palette=state.colors||activity.colors(theme,mode,state.stale?null:state.counts);
  petRing(result,palette,palette[0],palette.length,alpha,state.still?32:pose.level,cache);
  if(pose.loading){
    var light=theme==='claude'?'#EBA270':theme==='deepseek'?'#8FA2FF':'#94B5FF';
    var tip=theme==='claude'?'#FFE7CD':theme==='deepseek'?'#E6EBFF':'#E8F9FF';
    for(var n=0;n<pose.highlights;n++){
      var start=(pose.start+n*.5)%1;
      highlight(result,light,start,pose.fraction,'highlight:'+n+':body');highlight(result,tip,(start+pose.fraction-.025)%1,.025,'highlight:'+n+':tip');
    }
  }
  var symbol=theme==='claude'?'#EBA270':theme==='deepseek'?'#7E95FF':'#A7F3FF';
  if(mode==='offline')symbol=theme==='claude'?'#947F74':theme==='deepseek'?'#6C7A9C':'#8298B4';
  var cells=glyph(theme),offset=state.still?0:pose.offset;
  if(state.native){result.glyphs=cells;result.glyphColor=symbol;result.glyphLeft=offset;return result;}
  for(var j=0;j<cells.length;j++){
    var cell=cells[j];result.rects.push({id:result.rects.length,left:cell.left+offset,top:cell.top,width:cell.width,height:cell.height,radius:0,color:symbol});
  }
  return result;
}
var portraitGlyphCache={};
function portraitRect(rect) {
  var left=rect.left,top=rect.top,width=rect.width,height=rect.height;
  rect.left=192-top-height;rect.top=left;rect.width=height;rect.height=width;
  return rect;
}
// Project the logical landscape scene before binding native widgets. No rotated drawing layer.
function portrait(scene) {
  var i;
  for(i=0;i<scene.rects.length;i++)portraitRect(scene.rects[i]);
  for(i=0;i<scene.capsules.length;i++)portraitRect(scene.capsules[i]);
  for(i=0;i<scene.arcs.length;i++){
    var arc=scene.arcs[i],left=arc.left;
    arc.left=192-arc.top-arc.size;arc.top=left;arc.start=(arc.start+90)%360;
  }
  if(scene.glyphs){
    var theme=scene.glyphTheme==='claude'||scene.glyphTheme==='deepseek'?scene.glyphTheme:'chatgpt';
    if(!portraitGlyphCache[theme]){
      var cells=scene.glyphs,copy=[];
      for(i=0;i<cells.length;i++){
        var cell=cells[i];copy.push(portraitRect({id:cell.id,left:cell.left,top:cell.top,width:cell.width,height:cell.height}));
      }
      portraitGlyphCache[theme]=copy;
    }
    scene.glyphs=portraitGlyphCache[theme];
  }
  return scene;
}
function createRenderer() {
  var cache={};
  return function(state){return frame(state,cache);};
}
module.exports={portrait:portrait,frame:frame,createRenderer:createRenderer,ring:ring,glyph:glyph,shade:shade};
