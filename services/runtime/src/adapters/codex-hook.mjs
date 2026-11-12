// Never return a hook decision or expose prompts/tool arguments to the monitor.
import {createHash} from 'node:crypto';
import {EVENTS} from '../core/codex-state.mjs';
import {deliverHook} from './hook-delivery.mjs';
export function sanitizeHook(data,event,at=Date.now()){
 if(!EVENTS.includes(event)||data.hook_event_name!==event||typeof data.session_id!=='string'||!data.session_id||data.session_id.length>512)throw Error('Invalid hook');
 return {event,session:createHash('sha256').update(data.session_id).digest('hex'),at};
}
export async function forwardHook(data,event,{endpoint='http://127.0.0.1:10731/api/codex-event',at=Date.now()}={}){
 await deliverHook(sanitizeHook(data,event,at),{endpoint});
}
