export const EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd'];
const modes={SessionStart:'idle',UserPromptSubmit:'thinking',PreToolUse:'working',PostToolUse:'thinking',PermissionRequest:'attention',Stop:'complete',Interrupt:'idle',SessionEnd:'idle'};
export function createCodexState({now=Date.now,onEvent=()=>{}}={}){
 const sessions=new Map();let lastEventAt=null,eventCount=0;
 function accept(event){
  const at=now();
  if(!event||!EVENTS.includes(event.event)||!/^\w{64}$/.test(event.session)||!Number.isSafeInteger(event.at)||Math.abs(at-event.at)>30000)throw new Error('Invalid Codex event');
  const old=sessions.get(event.session);
  if(old&&(event.at<old.at||(event.at===old.at&&old.seen.includes(event.event))))return;
  if(!old&&sessions.size>=128)sessions.delete(sessions.keys().next().value);
  sessions.set(event.session,{at:event.at,mode:modes[event.event],event:event.event,seen:old?.at===event.at?[...old.seen,event.event]:[event.event]});lastEventAt=at;eventCount++;onEvent(event,old);
 }
 function status(){
  const at=now();let selected=null;
  const rank={attention:4,working:3,thinking:2,complete:1,idle:0};
  for(const [id,item] of sessions){
   if(at-item.at>15*60*1000&&!['thinking','working','attention'].includes(item.mode)){sessions.delete(id);continue;}
   const mode=item.mode==='complete'&&at-item.at>4000?'idle':item.mode;
   if(!selected||rank[mode]>rank[selected.state]||(rank[mode]===rank[selected.state]&&item.at>selected.at))selected={state:mode,at:item.at,event:item.event,stale:at-item.at>15*60*1000};
  }
  return {connected:lastEventAt!==null,state:selected?.state??'idle',source:'codex-hooks',stale:selected?.stale??false,lastEventAt,eventCount,activeSessions:[...sessions.values()].filter(s=>['thinking','working','attention'].includes(s.mode)).length};
 }
 return {accept,status};
}
