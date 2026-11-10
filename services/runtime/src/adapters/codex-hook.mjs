// Never return a hook decision or expose prompts/tool arguments to the monitor.
import {createHash} from 'node:crypto';
import {EVENTS} from '../core/codex-state.mjs';
export function sanitizeHook(data,event,at=Date.now()){
 if(!EVENTS.includes(event)||data.hook_event_name!==event||typeof data.session_id!=='string'||!data.session_id||data.session_id.length>512)throw Error('Invalid hook');
 return {event,session:createHash('sha256').update(data.session_id).digest('hex'),at};
}
export async function forwardHook(data,event,{endpoint='http://127.0.0.1:10731/api/codex-event',at=Date.now()}={}){
 const url=new URL(endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Local endpoint required');
 const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(600),headers:{'Content-Type':'application/json','X-Band-Codex':'1'},body:JSON.stringify(sanitizeHook(data,event,at))});
 if(!response.ok)throw Error('Monitor unavailable');
}
