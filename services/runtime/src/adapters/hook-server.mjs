import { createServer } from "node:http";
export function createHookServer(agent) {
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST" || req.url !== "/api/codex-event") {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.origin || req.headers["x-band-codex"] !== "1") {
      res.writeHead(403).end();
      return;
    }
    req.setTimeout(1500, () => req.destroy());
    let body = "",
      size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) {
          res.writeHead(413).end();
          return;
        }
        body += chunk;
      }
      agent.accept(JSON.parse(body));
      res.writeHead(204).end();
    } catch {
      if (!res.headersSent) res.writeHead(400).end();
    }
  });
}
