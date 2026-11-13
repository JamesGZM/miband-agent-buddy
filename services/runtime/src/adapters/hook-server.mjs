import { createServer } from "node:http";
import {sanitizeActivity} from './activity-contract.mjs';
export function createHookServer(agent) {
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const activity = req.url === '/internal/buddy-activity';
    if (req.method !== "POST" || (!activity && req.url !== "/api/codex-event")) {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.origin || req.headers[activity ? 'x-buddy-local' : 'x-band-codex'] !== "1") {
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
      const value = JSON.parse(body);
      if (activity) {
        let result;
        if (value?.operation === 'status' && Object.keys(value).length === 1) {
          const status = agent.status();
          result = {available: true, ...status};
        } else if (value?.operation === 'report' && Object.keys(value).length === 2) {
          result = agent.report(sanitizeActivity(value.activity));
        } else throw Error('Invalid operation');
        res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(result));
      } else {
        agent.accept({event: value.event, session: value.session, at: value.at});
        res.writeHead(204).end();
      }
    } catch {
      if (!res.headersSent) res.writeHead(400).end();
    }
  });
}
