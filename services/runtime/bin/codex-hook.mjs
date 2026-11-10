import {pathToFileURL} from 'node:url';
import {forwardHook} from '../src/adapters/codex-hook.mjs';
export {sanitizeHook,forwardHook} from '../src/adapters/codex-hook.mjs';
export async function runHook(){
 const watchdog=setTimeout(()=>process.exit(0),1200);
 try{
  let input='',bytes=0;for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('Input too large');input+=chunk;}
  await forwardHook(JSON.parse(input),process.argv[2]);
 }catch{}finally{clearTimeout(watchdog);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await runHook();
