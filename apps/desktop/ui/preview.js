import bandUI from './assets/native-ui.mjs';
import bandDisplay from './assets/display.mjs';
import geometry from './assets/geometry.mjs';
import activityRing from './assets/activity-ring.mjs';

export function startPreview(getState, {
  now = () => performance.now(),
  wallNow = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = timer => clearTimeout(timer),
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
} = {}) {
  const $ = selector => document.querySelector(selector);
  let timer = null, frame = null, stopped = false, lastPaint = -Infinity, needsPaint = false, scheduledCadence = null;
  let animationKey = '', animationAt = now();
  const drawGeometry = geometry.createRenderer();
  const drawBorder = geometry.createBorderRenderer();
  let colorKey = '', taskColors = null;
  const previewRings = {
    cpu: bandUI.createRingTransition(),
    memory: bandUI.createRingTransition(),
    disk: bandUI.createRingTransition(),
  };
  let previewStamp = null;
  function prepareFrame({runtime: r, theme, online, bandPage}, timestamp, mode) {
    const texts = [], values = {};
    const animation = `${theme}:${mode}`;
    if (animation !== animationKey) { animationKey = animation; animationAt = timestamp; }
    const receipt=r.ack?.drawing;
    const frozenPet=receipt?.animationEnabled===false&&bandPage===0;
    const synced=online&&r.ack?.mode===mode&&Number.isFinite(receipt?.elapsedMs)&&receipt.elapsedMs>=0&&wallNow()-(r.lastAckAt||0)<10000;
    const elapsed = synced ? (receipt.elapsedMs+Math.max(0,wallNow()-r.lastAckAt))/1000 : Math.max(0,timestamp-animationAt)/1000;
    const t=frozenPet?0:elapsed;
    if(mode==='complete'&&elapsed>=4)mode='idle';
    if (bandPage === 1) {
      const m =
        online && wallNow() - (r.lastAckAt || 0) < 10000 ? r.metrics : null;
      const stamp = m?.sampledAt || 0;
      if (previewStamp !== stamp) {
        const fields = bandDisplay.fields(m, !m);
        for (const name of ["disk", "memory", "cpu"])
          bandUI.retargetRing(
            previewRings[name],
            fields[name + "Width"],
            timestamp,
            previewStamp === null || !m,
          );
        previewStamp = stamp;
      }
      const entries = [
        ["disk", m?.disk?.percent, "#647fff"],
        ["memory", m?.memory?.percent, "#a192ff"],
        ["cpu", m?.cpu, "#78edff"],
      ];
      const fields=bandDisplay.fields(m,!m);
      entries.forEach(([name, val, color], i) => {
        values[name] = Math.round(bandUI.ringValue(previewRings[name], timestamp));
        const x = 139 + i * 106;
        texts.push({text:name === "memory" ? "MEM" : name.toUpperCase(),x,y:61,color,size:16});
        texts.push({text:val == null ? "—" : Math.round(val) + "%",x,y:96,color:"#f0f4f0",size:38});
        texts.push({text:name==='cpu'?'TOTAL LOAD':fields[name+'Detail']+(name==='memory'?' GiB':' GB'),x,y:131,color:'#b9c5c0',size:14});
      });
    }
    const counts=online?r.agent?.sessionCounts:null;
    const key=`${theme}:${mode}:${counts?.thinking}:${counts?.working}:${counts?.attention}`;
    if(key!==colorKey){colorKey=key;taskColors=activityRing.colors(theme,mode,counts);}
    const rendererName=receipt?.renderer||receipt?.capabilities?.renderer;
    const borderProbe=rendererName==='native-border-probe';
    const renderer=rendererName==='native-border'||borderProbe?drawBorder:drawGeometry;
    const shapes=renderer.native({native:true,page:bandPage,theme,mode,seconds:t,colors:borderProbe?taskColors.slice(0,2):taskColors,stale:!online,values,still:frozenPet});
    if(renderer===drawGeometry&&bandPage===0&&!frozenPet){
      const alpha=.32+.65*bandUI.pose(mode,t).level/31;
      const palette=new Set(taskColors.map(color=>color.toLowerCase()));
      // Native bases are shared across frames; shade only preview-owned copies.
      for(const name of ['capsules','rects','arcs'])shapes[name]=shapes[name].map(shape=>
        !shape.layer&&palette.has(shape.color.toLowerCase())?{...shape,color:geometry.shade(shape.color,alpha)}:shape);
    }
    if(frozenPet){shapes.rects=shapes.rects.filter(shape=>!shape.layer);shapes.arcs=shapes.arcs.filter(shape=>!shape.layer);}
    return {shapes,texts};
  }
  function status(canvas, failed = false) {
    const loading = $("#preview-loading"), error = $("#preview-error");
    if (loading) loading.hidden = canvas.dataset.previewReady === "true" || failed;
    if (error) error.hidden = !failed;
  }
  function paint() {
    if (stopped || document.hidden) return;
    const canvas = $("#band");
    if (!canvas) return;
    const state = getState(), r = state.runtime;
    const mode = state.online ? r.agent?.state || "idle" : r.lastAckAt ? "offline" : "idle";
    const ctx = canvas.getContext("2d");
    if (!ctx) { status(canvas, true); return; }
    // Compute the whole scene before replacing the visible frame.
    const next = prepareFrame(state, now(), mode);
    ctx.clearRect(0, 0, 490, 192);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 490, 192);
    function rectangle(rect,outline=false) {
      if(rect.visible===false)return;
      const inset=outline?rect.stroke/2:0;
      const x=rect.left+inset,y=rect.top+inset,w=rect.width-2*inset,h=rect.height-2*inset;
      const radius=Math.max(0,Math.min(rect.radius-inset,w/2,h/2));
      ctx.fillStyle=rect.color;
      if(!radius&&!outline){ctx.fillRect(x,y,w,h);return;}
      ctx.beginPath();ctx.moveTo(x+radius,y);ctx.lineTo(x+w-radius,y);ctx.arcTo(x+w,y,x+w,y+radius,radius);
      ctx.lineTo(x+w,y+h-radius);ctx.arcTo(x+w,y+h,x+w-radius,y+h,radius);
      ctx.lineTo(x+radius,y+h);ctx.arcTo(x,y+h,x,y+h-radius,radius);
      ctx.lineTo(x,y+radius);ctx.arcTo(x,y,x+radius,y,radius);ctx.closePath();
      if(outline){ctx.strokeStyle=rect.color;ctx.lineWidth=rect.stroke;ctx.stroke();}else ctx.fill();
    }
    if(next.shapes.border){
      const whole={left:4,top:4,width:482,height:184,radius:92,stroke:8};
      function windows(items){
        for(const item of items){
          if(item.visible===false)continue;
          ctx.save();ctx.beginPath();ctx.rect(item.left,item.top,item.width,item.height);ctx.clip();
          rectangle({...whole,color:item.color},true);ctx.restore();
        }
      }
      windows(next.shapes.border.base);
      rectangle({...whole,color:next.shapes.border.breathColor},true);
      windows(next.shapes.border.bodies);windows(next.shapes.border.tips);
    }
    // Paint whole strokes in order: a body arc must not repaint a bright tip
    // merely because that tip currently lies on a straight segment.
    for(let layer=0;layer<=2;layer++){
      for(const capsule of next.shapes.capsules)if((capsule.layer||0)===layer)rectangle(capsule,true);
      for(const rect of next.shapes.rects)if((rect.layer||0)===layer)rectangle(rect);
      for (const arc of next.shapes.arcs) {
        if((arc.layer||0)!==layer||arc.visible===false)continue;
        const percent=arc.percent==null?100:arc.percent;
        ctx.beginPath();ctx.strokeStyle=arc.color;ctx.lineWidth=arc.width;ctx.lineCap='round';
        ctx.arc(arc.left+arc.center,arc.top+arc.center,arc.radius-arc.width/2,(arc.start-90)*Math.PI/180,(arc.start+arc.total*percent/100-90)*Math.PI/180);
        ctx.stroke();
      }
    }
    for(const cell of next.shapes.glyphs||[])rectangle({...cell,left:cell.left+next.shapes.glyphLeft,radius:0,color:next.shapes.glyphColor});
    for (const text of next.texts) {
      ctx.textAlign = "center"; ctx.textBaseline="middle"; ctx.fillStyle = text.color;
      ctx.font = `${text.size}px -apple-system`;
      ctx.fillText(text.text, text.x, text.y);
    }
    canvas.dataset.previewReady = "true";
    status(canvas);
  }
  function cadence() {
    const state=getState(),ack=state.runtime.ack;
    if(state.powerSaving===true)return 100;
    const applied=ack?.drawing?.effectiveFps;
    if(state.online&&ack?.settingsApplied===true&&Number.isInteger(applied)&&applied>=10&&applied<=30&&wallNow()-(state.runtime.lastAckAt||0)<10000)return 1000/applied;
    return bandUI.frameDelay(state.powerSaving,state.buddyFps);
  }
  function clearTick() {
    if (timer !== null) cancel(timer);
    if (frame !== null && cancelFrame) cancelFrame(frame);
    timer = null; frame = null;
  }
  function queue() {
    if (stopped || document.hidden || !$("#band")) return;
    const delay=cadence();
    scheduledCadence=delay;
    if (requestFrame && delay<100) frame = requestFrame(tick);
    else timer = schedule(() => {
      timer = null;
      if (requestFrame) frame = requestFrame(tick);
      else tick();
    }, Math.max(1,delay-Math.max(0,now()-lastPaint)));
  }
  function tick() {
    frame = null;
    if (stopped || document.hidden || !$("#band")) return;
    const timestamp = now(), delay = cadence();
    const elapsed = timestamp - lastPaint;
    if (needsPaint || elapsed >= delay - 0.5 || elapsed < 0) {
      paint(); needsPaint = false;
      lastPaint = elapsed >= delay ? timestamp - (elapsed % delay) : timestamp;
    }
    queue();
  }
  function draw() {
    if (stopped) return;
    if (document.hidden || !$("#band")) { clearTick(); return; }
    paint(); needsPaint = false; lastPaint = now();
    if ((timer !== null || frame !== null) && scheduledCadence === cadence()) return;
    clearTick();
    queue();
  }
  function visibilityChanged() {
    if (document.hidden) clearTick(); else draw();
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  draw();
  return {draw, stop() {
    if (stopped) return;
    stopped = true; clearTick();
    document.removeEventListener?.('visibilitychange', visibilityChanged);
  }};
}
