import bandUI from './assets/native-ui.mjs';
import bandDisplay from './assets/display.mjs';
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
  let timer = null, frame = null, stopped = false, lastPaint = -Infinity, needsPaint = false, scheduledPowerSaving = false;
  let animationKey = '', animationAt = now();
  let pendingFrame = null;
  const previewRings = {
    cpu: bandUI.createRingTransition(),
    memory: bandUI.createRingTransition(),
    disk: bandUI.createRingTransition(),
  };
  let previewStamp = null;
  const images = new Map();
  const failedImages = new WeakSet();
  const MAX_IMAGES = 192;
  function image(path) {
    if (images.has(path)) {
      const cached = images.get(path);
      images.delete(path); images.set(path, cached);
      return cached;
    }
    if (!images.has(path)) {
      const im = new Image();
      im.onload = () => { needsPaint = true; };
      im.onerror = () => { failedImages.add(im); needsPaint = true; };
      im.src = "assets/capsule/" + path;
      images.set(path, im);
      if (images.size > MAX_IMAGES) {
        const oldest = images.keys().next().value;
        images.get(oldest).onload = null;
        images.get(oldest).onerror = null;
        images.delete(oldest);
      }
    }
    return images.get(path);
  }
  function prepareFrame({runtime: r, theme, online, bandPage}, timestamp, mode, key) {
    const layers = [], texts = [];
    const frame = {key, layers, texts};
    const animation = `${theme}:${mode}`;
    if (animation !== animationKey) { animationKey = animation; animationAt = timestamp; }
    const t = Math.max(0, timestamp - animationAt) / 1000;
    function layer(name, alpha = 1, offset = 0) {
      layers.push({image:image(name), alpha, offset});
    }
    if (bandPage === 0) {
      const motion = bandUI.motion(mode, t, theme);
      layer("face-track.png");
      const ringSource = activityRing.source(r.agent?.sessionCounts, !online, theme, mode, bandUI.breathLevel(mode, t)) || motion.ringSource;
      layer(ringSource.split("/").pop(), motion.ringOpacity);
      layer(motion.loadingSource.split("/").pop(), motion.loadingOpacity);
      layer(motion.symbolSource.split("/").pop(), 1, motion.symbolLeft);
    } else {
      layer("resource-tracks.png");
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
      entries.forEach(([name, val, color], i) => {
        layer(
          bandUI
            .ringSource(
              name,
              bandUI.ringValue(previewRings[name], timestamp),
            )
            .split("/")
            .pop(),
        );
        const x = 139 + i * 106;
        texts.push({text:name === "memory" ? "MEM" : name.toUpperCase(),x,y:76,color,size:15});
        texts.push({text:val == null ? "—" : Math.round(val) + "%",x,y:114,color:"#f0f4f0",size:32});
        const metric = m?.[name];
        texts.push({text:name === "cpu"
            ? "TOTAL LOAD"
            : metric
              ? `${(metric.usedBytes / (name === "memory" ? 1073741824 : 1e9)).toFixed(1)} / ${(metric.totalBytes / (name === "memory" ? 1073741824 : 1e9)).toFixed(1)}`
              : "—",x,y:139,color:"#b9c5c0",size:11});
      });
    }
    return frame;
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
    const mode = state.online ? r.agent?.state || "idle" : "idle";
    const key = JSON.stringify([state.bandPage,state.theme,mode,state.online,r.agent?.sessionCounts]);
    // Hold one complete frame while its assets load; advancing every tick would
    // continually clear the screen or chase images that are not decoded yet.
    if (!pendingFrame || pendingFrame.key !== key)
      pendingFrame = prepareFrame(state, now(), mode, key);
    if (pendingFrame.layers.some(layer => failedImages.has(layer.image))) {
      status(canvas, true); pendingFrame = null; return;
    }
    status(canvas);
    if (pendingFrame.layers.some(layer => !layer.image.complete || !layer.image.naturalWidth)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) { status(canvas, true); return; }
    ctx.clearRect(0, 0, 490, 192);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 490, 192);
    for (const layer of pendingFrame.layers) {
      ctx.save(); ctx.globalAlpha = layer.alpha;
      ctx.translate(layer.offset, 192); ctx.rotate(-Math.PI / 2);
      ctx.drawImage(layer.image, 0, 0, 192, 490); ctx.restore();
    }
    for (const text of pendingFrame.texts) {
      ctx.textAlign = "center"; ctx.fillStyle = text.color;
      ctx.font = `${text.size}px -apple-system`;
      ctx.fillText(text.text, text.x, text.y);
    }
    pendingFrame = null;
    canvas.dataset.previewReady = "true";
    status(canvas);
  }
  function clearTick() {
    if (timer !== null) cancel(timer);
    if (frame !== null && cancelFrame) cancelFrame(frame);
    timer = null; frame = null;
  }
  function queue() {
    if (stopped || document.hidden || !$("#band")) return;
    const lowPower = getState().powerSaving === true;
    scheduledPowerSaving = lowPower;
    if (requestFrame && !lowPower) frame = requestFrame(tick);
    else timer = schedule(() => {
      timer = null;
      if (requestFrame) frame = requestFrame(tick);
      else tick();
    }, bandUI.frameDelay(lowPower));
  }
  function tick() {
    frame = null;
    if (stopped || document.hidden || !$("#band")) return;
    const timestamp = now(), cadence = bandUI.frameDelay(getState().powerSaving);
    const elapsed = timestamp - lastPaint;
    if (needsPaint || elapsed >= cadence - 0.5 || elapsed < 0) {
      paint(); needsPaint = false;
      lastPaint = elapsed >= cadence ? timestamp - (elapsed % cadence) : timestamp;
    }
    queue();
  }
  function draw() {
    if (stopped) return;
    if (document.hidden || !$("#band")) { clearTick(); return; }
    paint(); needsPaint = false; lastPaint = now();
    if ((timer !== null || frame !== null) && scheduledPowerSaving === (getState().powerSaving === true)) return;
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
    for (const im of images.values()) { im.onload = null; im.onerror = null; }
    pendingFrame = null;
    images.clear();
  }};
}
