import {request} from 'node:http';

// Private transport to the already-running runtime, never directly to the band.
export function submitActivity(value, {port = 10731, timeoutMs = 300} = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const req = request({hostname: '127.0.0.1', port, path: '/internal/buddy-activity', method: 'POST',
      agent: false, headers: {'Content-Type': 'application/json', 'X-Buddy-Local': '1'}}, res => {
      let body = '', bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8192) {finish({accepted: false, code: 'unavailable'}); req.destroy();}
        else body += chunk;
      });
      res.on('end', () => {
        try {finish(res.statusCode === 200 ? JSON.parse(body) : {accepted: false, code: 'rejected'});}
        catch {finish({accepted: false, code: 'unavailable'});}
      });
      res.on('error', () => finish({accepted: false, code: 'unavailable'}));
    });
    const timer = setTimeout(() => {finish({accepted: false, code: 'unavailable'}); req.destroy();}, timeoutMs);
    req.on('error', () => finish({accepted: false, code: 'unavailable'}));
    req.end(JSON.stringify(value));
  });
}
