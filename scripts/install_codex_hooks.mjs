import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EVENTS} from '../services/runtime/src/core/codex-state.mjs';
const home=process.env.CODEX_HOME||join(homedir(),'.codex'),path=join(home,'hooks.json');
const script=fileURLToPath(new URL('../mac/codex-hook.mjs',import.meta.url));
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
let root={},existing=false;
try{root=JSON.parse(await readFile(path,'utf8'));existing=true;}catch(e){if(e.code!=='ENOENT')throw e;}
if(!root||typeof root!=='object'||Array.isArray(root))throw Error('Invalid hooks file');
root.hooks??={};
if(typeof root.hooks!=='object'||Array.isArray(root.hooks))throw Error('Invalid hooks object');
for(const event of EVENTS){
 root.hooks[event]??=[];if(!Array.isArray(root.hooks[event]))throw Error('Invalid hook groups');
 const command=`${quote(process.execPath)} ${quote(script)} ${event}`;
 if(root.hooks[event].some(g=>g.hooks?.some(h=>h.command===command)))continue;
 // Synchronous local-only delivery preserves lifecycle order; failure never blocks Codex.
 root.hooks[event].push({hooks:[{type:'command',command,timeout:2}]});
}
await mkdir(home,{recursive:true});
if(existing)await copyFile(path,path+'.buddy-backup-'+Date.now());
await writeFile(path,JSON.stringify(root,null,2)+'\n',{mode:0o600});
console.log(`Installed ${EVENTS.length} event definitions in ${path}; review trust in Codex /hooks or Settings > Hooks.`);
