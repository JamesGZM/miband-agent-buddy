import {pathToFileURL} from 'node:url';
import {sanitizeHook} from '../src/adapters/codex-hook.mjs';
import {dispatchHook} from '../src/adapters/hook-delivery.mjs';
export {sanitizeHook,forwardHook} from '../src/adapters/codex-hook.mjs';
export async function runHook({input=process.stdin,event=process.argv[2],dispatch=dispatchHook,at=Date.now()}={}){
 const watchdog=setTimeout(()=>process.exit(0),150);
 try{
  let body='',bytes=0;for await(const chunk of input){bytes+=Buffer.byteLength(chunk);if(bytes>2*1024*1024)throw Error('Input too large');body+=chunk;}
  dispatch(sanitizeHook(JSON.parse(body),event,at));
 }catch{}finally{clearTimeout(watchdog);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await runHook();
