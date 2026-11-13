export const EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Stop','Interrupt','SessionEnd'];
const modes={SessionStart:'idle',UserPromptSubmit:'thinking',PreToolUse:'working',PostToolUse:'thinking',PermissionRequest:'attention',Stop:'complete',Interrupt:'idle',SessionEnd:'idle'};
const staleAfter=15*60*1000;
const terminal=new Set(['Stop','Interrupt','SessionEnd']);
export function createCodexState({now=Date.now,onEvent=()=>{}}={}){
 const sessions=new Map();let lastEventAt=null,eventCount=0;
 function accept(event){
  const at=now();
  if(!event||!EVENTS.includes(event.event)||!/^\w{64}$/.test(event.session)||!Number.isSafeInteger(event.at)||Math.abs(at-event.at)>30000)throw new Error('Invalid Codex event');
  const old=sessions.get(event.session);
  const ordered=Number.isSafeInteger(event.revision)&&event.revision>0;
  if(old&&(ordered ? event.revision<=(old.revision||0) : (event.at<old.at||(event.at===old.at&&(old.seen.includes(event.event)||terminal.has(old.event)&&!terminal.has(event.event))))))return;
  if(!old&&sessions.size>=128&&ordered)return false;
  if(!old&&sessions.size>=128)sessions.delete(sessions.keys().next().value);
  sessions.set(event.session,{at:event.at,mode:modes[event.event],event:event.event,revision:ordered?event.revision:undefined,seen:!ordered&&old?.at===event.at?[...old.seen,event.event]:[event.event]});lastEventAt=at;eventCount++;onEvent(event,old);
 }
 function status(){
  const at=now();let selected=null;
  const rank={attention:4,working:3,thinking:2,complete:1,idle:0};
  for(const [id,item] of sessions){
   if(at-item.at>staleAfter&&!['thinking','working','attention'].includes(item.mode)){sessions.delete(id);continue;}
   const mode=item.mode==='complete'&&at-item.at>4000?'idle':item.mode;
   if(!selected||rank[mode]>rank[selected.state]||(rank[mode]===rank[selected.state]&&item.at>selected.at))selected={state:mode,at:item.at,event:item.event,stale:at-item.at>staleAfter};
  }
  const sessionCounts={thinking:0,working:0,attention:0};
  let freshActiveSessions=0,staleSessions=0;
  for(const item of sessions.values())if(Object.hasOwn(sessionCounts,item.mode)){
   sessionCounts[item.mode]++;
   if(at-item.at>staleAfter)staleSessions++;else freshActiveSessions++;
  }
  return {connected:lastEventAt!==null,state:selected?.state??'idle',source:'buddy-activity',scope:'aggregate',stale:staleSessions>0,lastEventAt,eventCount,activeSessions:freshActiveSessions+staleSessions,freshActiveSessions,staleSessions,sessionCounts};
 }
 function reset(){sessions.clear();}
 return {accept,status,reset};
}
