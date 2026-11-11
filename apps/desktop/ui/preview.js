import bandUI from './assets/native-ui.mjs';
import bandDisplay from './assets/display.mjs';

export function startPreview(getState) {
  const $ = selector => document.querySelector(selector);
  let timer, stopped = false;
  const previewRings = {
    cpu: bandUI.createRingTransition(),
    memory: bandUI.createRingTransition(),
    disk: bandUI.createRingTransition(),
  };
  let previewStamp = null;
  const images = new Map();
  function image(path) {
    if (!images.has(path)) {
      const im = new Image();
      im.onload = draw;
      im.src = "assets/capsule/" + path;
      images.set(path, im);
    }
    return images.get(path);
  }
  function draw() {
    if (stopped) return;
    const {runtime: r, theme, online, bandPage} = getState();
    const canvas = $("#band");
    if (canvas) {
      const ctx = canvas.getContext("2d"),
        t = performance.now() / 1000,
        mode = online ? r.agent?.state || "idle" : "idle";
      ctx.clearRect(0, 0, 490, 192);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 490, 192);
      function layer(name, alpha = 1, offset = 0) {
        const im = image(name);
        if (!im.complete || !im.naturalWidth) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(offset, 192);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(im, 0, 0, 192, 490);
        ctx.restore();
      }
      if (bandPage === 0) {
        const motion = bandUI.motion(mode, t, theme);
        layer("face-track.png");
        layer(motion.ringSource.split("/").pop(), motion.ringOpacity);
        layer(motion.loadingSource.split("/").pop(), motion.loadingOpacity);
        layer(motion.symbolSource.split("/").pop(), 1, motion.symbolLeft);
        ctx.textAlign = "center";
        ctx.fillStyle = "#b9c5c0";
        ctx.font = "14px -apple-system";
        ctx.fillText(bandDisplay.activityLabel(r.agent?.sessionCounts, !online), 245, 174);
      } else {
        layer("resource-tracks.png");
        const m =
          online && Date.now() - (r.lastAckAt || 0) < 10000 ? r.metrics : null;
        const stamp = m?.sampledAt || 0;
        if (previewStamp !== stamp) {
          const fields = bandDisplay.fields(m, !m);
          for (const name of ["disk", "memory", "cpu"])
            bandUI.retargetRing(
              previewRings[name],
              fields[name + "Width"],
              performance.now(),
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
                bandUI.ringValue(previewRings[name], performance.now()),
              )
              .split("/")
              .pop(),
          );
          ctx.textAlign = "center";
          ctx.fillStyle = color;
          ctx.font = "15px -apple-system";
          ctx.fillText(
            name === "memory" ? "MEM" : name.toUpperCase(),
            139 + i * 106,
            76,
          );
          ctx.fillStyle = "#f0f4f0";
          ctx.font = "32px -apple-system";
          ctx.fillText(
            val == null ? "—" : Math.round(val) + "%",
            139 + i * 106,
            114,
          );
          ctx.fillStyle = "#b9c5c0";
          ctx.font = "11px -apple-system";
          const metric = m?.[name];
          ctx.fillText(
            name === "cpu"
              ? "TOTAL LOAD"
              : metric
                ? `${(metric.usedBytes / (name === "memory" ? 1073741824 : 1e9)).toFixed(1)} / ${(metric.totalBytes / (name === "memory" ? 1073741824 : 1e9)).toFixed(1)}`
                : "—",
            139 + i * 106,
            139,
          );
        });
      }
    }
  }
  function tick() {
    draw();
    timer = setTimeout(tick, document.hidden ? 1000 : 100);
  }
  tick();
  return {draw, stop() {stopped = true; clearTimeout(timer);}};
}
